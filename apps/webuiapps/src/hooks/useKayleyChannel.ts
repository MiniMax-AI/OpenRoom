/**
 * useKayleyChannel — WebSocket bridge to the Kayley Claude brain.
 *
 * Connects to ws://localhost:5180 (the existing websocket-channel MCP server).
 * Handles text input, voice input (STT via Whisper), and TTS audio playback.
 * Protocol is identical to the Kayley dashboard — lift-and-shift from
 * apps/dashboard/src/main.js.
 *
 * Usage:
 *   const kayley = useKayleyChannel()
 *   // Send text
 *   kayley.sendText('Hello Kayley')
 *   // Start/stop mic
 *   await kayley.startVoice()
 *   kayley.stopVoice()
 *   // Confirm STT draft before sending
 *   kayley.confirmDraft()   // or kayley.dismissDraft()
 *   // Listen for responses
 *   useEffect(() => { if (kayley.latestMessage) ... }, [kayley.latestMessage])
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { logger } from '@/lib/logger'
import { resolveAppAction, loadActionsFromMeta } from '@/lib/appRegistry'
import { dispatchAgentAction } from '@/lib/vibeContainerMock'
import { seedMetaFiles } from '@/lib/seedMeta'
import { registerKayleyWsSender } from '@/lib/kayleyWsBridge'

const KAYLEY_WS_URL =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_KAYLEY_WS_URL ?? 'ws://localhost:5180'
const TTS_SAMPLE_RATE = 24000  // voice engine outputs 24kHz PCM
const MIC_SAMPLE_RATE = 16000  // Whisper STT expects 16kHz PCM
const TTS_BUFFER_DELAY_MS = 600  // ms to buffer before starting playback
const RECONNECT_DELAY_MS = 3000

export interface KayleyMessage {
  text: string
  timestamp: number
}

export interface UseKayleyChannelResult {
  /** True when the WebSocket connection to ws://localhost:5180 is open */
  connected: boolean
  /** True while mic is actively recording */
  isRecording: boolean
  /** Whisper transcription awaiting user confirmation; null when no draft pending */
  sttDraft: string | null
  /** True while TTS audio is playing */
  isTtsActive: boolean
  /** Send a text message to Kayley */
  sendText: (text: string) => void
  /** Request mic access and start sending audio chunks for STT */
  startVoice: () => Promise<void>
  /** Stop mic recording and send stop_voice to trigger STT processing */
  stopVoice: () => void
  /** Accept the STT draft and send it as a text message */
  confirmDraft: () => void
  /** Discard the STT draft without sending */
  dismissDraft: () => void
  /** Most recently received Kayley response message (changes on each new reply) */
  latestMessage: KayleyMessage | null
}

export function useKayleyChannel(): UseKayleyChannelResult {
  const [connected, setConnected] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [sttDraft, setSttDraft] = useState<string | null>(null)
  const [isTtsActive, setIsTtsActive] = useState(false)
  const [latestMessage, setLatestMessage] = useState<KayleyMessage | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const kayleyBridgeUnregisterRef = useRef<(() => void) | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isRecordingRef = useRef(false)

  // ── TTS playback state ──────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef(0)
  const pendingChunksRef = useRef<Float32Array<ArrayBuffer>[]>([])
  const hasStartedPlayingRef = useRef(false)
  const bufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Mic capture state ───────────────────────────────────────
  const micStreamRef = useRef<MediaStream | null>(null)
  const micContextRef = useRef<AudioContext | null>(null)
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null)

  // ── TTS Audio Playback (lifted from dashboard/src/main.js) ──

  function initAudioPlayback() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext({ sampleRate: TTS_SAMPLE_RATE })
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch((err: unknown) => {
        logger.warn('[KayleyChannel] AudioContext resume failed', err)
      })
    }
  }

  function resetPlayback() {
    hasStartedPlayingRef.current = false
    pendingChunksRef.current = []
    nextPlayTimeRef.current = 0
    if (bufferTimerRef.current) {
      clearTimeout(bufferTimerRef.current)
      bufferTimerRef.current = null
    }
  }

  function decodeAudioChunk(base64Data: string): Float32Array<ArrayBuffer> {
    const raw = atob(base64Data)
    const bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    const int16 = new Int16Array(bytes.buffer)
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768
    return float32
  }

  function scheduleChunk(float32: Float32Array<ArrayBuffer>) {
    const ctx = audioCtxRef.current
    if (!ctx || float32.length === 0) return

    const buffer = ctx.createBuffer(1, float32.length, TTS_SAMPLE_RATE)
    buffer.copyToChannel(float32, 0)
    const source = ctx.createBufferSource()
    source.buffer = buffer

    // High-pass filter to remove boomy low-end from TTS model
    const hpf = ctx.createBiquadFilter()
    hpf.type = 'highpass'
    hpf.frequency.value = 120
    hpf.Q.value = 0.7
    source.connect(hpf)
    hpf.connect(ctx.destination)

    const now = ctx.currentTime
    const startAt = Math.max(now, nextPlayTimeRef.current)
    source.start(startAt)
    nextPlayTimeRef.current = startAt + buffer.duration

    source.onended = () => {
      if (ctx.currentTime >= nextPlayTimeRef.current - 0.05) {
        setIsTtsActive(false)
      }
    }
  }

  function flushPendingChunks() {
    bufferTimerRef.current = null
    if (pendingChunksRef.current.length === 0) return
    hasStartedPlayingRef.current = true
    const chunks = pendingChunksRef.current.splice(0)
    for (const chunk of chunks) scheduleChunk(chunk)
  }

  function queueAudio(base64Data: string) {
    initAudioPlayback()
    const float32 = decodeAudioChunk(base64Data)
    if (float32.length === 0) return

    setIsTtsActive(true)
    if (hasStartedPlayingRef.current) {
      scheduleChunk(float32)
    } else {
      pendingChunksRef.current.push(float32)
      if (!bufferTimerRef.current) {
        bufferTimerRef.current = setTimeout(flushPendingChunks, TTS_BUFFER_DELAY_MS)
      }
    }
  }

  // ── WebSocket Connection ────────────────────────────────────

  const connectWs = useCallback(() => {
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) return

    let ws: WebSocket
    try {
      ws = new WebSocket(KAYLEY_WS_URL)
    } catch (err: unknown) {
      logger.warn('[KayleyChannel] WebSocket construction failed:', err)
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = setTimeout(connectWs, RECONNECT_DELAY_MS)
      return
    }
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      logger.info('[KayleyChannel] Connected to Kayley brain at', KAYLEY_WS_URL)
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      kayleyBridgeUnregisterRef.current?.()
      kayleyBridgeUnregisterRef.current = registerKayleyWsSender((payload) => {
        const open = wsRef.current
        if (open && open.readyState === WebSocket.OPEN) {
          open.send(JSON.stringify(payload))
        }
      })
    }

    ws.onclose = () => {
      kayleyBridgeUnregisterRef.current?.()
      kayleyBridgeUnregisterRef.current = null
      setConnected(false)
      setIsRecording(false)
      isRecordingRef.current = false
      logger.info('[KayleyChannel] Disconnected — reconnecting in', RECONNECT_DELAY_MS, 'ms')
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = setTimeout(connectWs, RECONNECT_DELAY_MS)
    }

    ws.onerror = (event) => {
      logger.warn('[KayleyChannel] WebSocket error — close will follow', event)
    }

    ws.onmessage = (event) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(event.data as string)
      } catch (err) {
        logger.warn('[KayleyChannel] malformed ws message', {
          error: (err as Error).message,
          raw: typeof event.data === 'string' ? event.data.slice(0, 100) : '<binary>',
        })
        return
      }

      // Kayley's text response
      if (msg.type === 'message' && typeof msg.text === 'string') {
        setLatestMessage({ text: msg.text, timestamp: Date.now() })
      }

      // TTS audio chunk from voice engine
      if (msg.type === 'audio' && typeof msg.data === 'string') {
        queueAudio(msg.data)
      }

      // Whisper STT result — show draft for confirmation
      if (msg.type === 'stt_draft' && typeof msg.text === 'string') {
        setSttDraft(msg.text)
      }

      // TTS stream ended (audio chunks may still be playing out)
      if (msg.type === 'tts_done') {
        logger.info('[KayleyChannel] TTS stream done — draining audio buffer')
      }

      // Phase 2E — Vibe action dispatch from Kayley's brain.
      // Server sends { type: 'vibe_action', id, app_name, action_type, params }
      // We run it through OpenRoom's native dispatch layer and echo the result.
      if (
        msg.type === 'vibe_action' &&
        typeof msg.id === 'string' &&
        typeof msg.app_name === 'string' &&
        typeof msg.action_type === 'string'
      ) {
        const id = msg.id
        const appName = msg.app_name
        const actionType = msg.action_type
        const rawParams = msg.params
        const params: Record<string, string> =
          rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)
            ? Object.fromEntries(
                Object.entries(rawParams as Record<string, unknown>).map(([k, v]) => [
                  k,
                  typeof v === 'string' ? v : JSON.stringify(v),
                ]),
              )
            : {}

        // Fire-and-forget: the dispatch is async, the echo sends when done.
        dispatchVibeAction(id, appName, actionType, params)
      }
    }
  }, [])  // stable — no deps from component scope

  // ── Vibe Action Dispatch (Phase 2E) ──────────────────────────
  //
  // Runs Kayley's vibe_action tool call through OpenRoom's native
  // dispatchAgentAction, then sends the result string back to the channel.
  // Errors are caught and echoed as 'error: …' so Kayley always gets a
  // response within the server's 15s timeout window.

  async function dispatchVibeAction(
    id: string,
    appName: string,
    actionType: string,
    params: Record<string, string>,
  ): Promise<void> {
    const ws = wsRef.current
    const send = (result: string) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'vibe_action_result', id, result }))
      } else {
        logger.warn('[KayleyChannel] vibe_action_result dropped — ws not open', { id, result })
      }
    }

    try {
      // Ensure per-app metadata is loaded for future non-OS actions. For OS
      // actions (SET_WALLPAPER etc.) resolveAppAction works without it, but
      // doing it here keeps the code forward-compatible and cheap (idempotent).
      await seedMetaFiles()
      await loadActionsFromMeta()

      const resolved = resolveAppAction(appName, actionType)
      if (typeof resolved === 'string') {
        // resolveAppAction returns an error string for unknown apps.
        logger.warn('[KayleyChannel] vibe_action resolve failed', { id, appName, actionType, err: resolved })
        send(resolved)
        return
      }

      const result = await dispatchAgentAction({
        app_id: resolved.appId,
        action_type: resolved.actionType,
        params,
      })
      logger.info('[KayleyChannel] vibe_action dispatched', { id, appName, actionType, result })
      send(result)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn('[KayleyChannel] vibe_action dispatch threw', { id, appName, actionType, error: message })
      send(`error: ${message}`)
    }
  }

  useEffect(() => {
    connectWs()
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (bufferTimerRef.current) {
        clearTimeout(bufferTimerRef.current)
        bufferTimerRef.current = null
      }
      // Stop mic tracks so browser's recording LED turns off
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop())
        micStreamRef.current = null
      }
      if (micProcessorRef.current) {
        try { micProcessorRef.current.disconnect() } catch { /* already disconnected */ }
        micProcessorRef.current = null
      }
      // Close AudioContexts — browsers cap ~6 per tab
      if (micContextRef.current) {
        micContextRef.current.close().catch((err: unknown) => {
          logger.warn('[KayleyChannel] mic AudioContext close error on unmount:', err)
        })
        micContextRef.current = null
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch((err: unknown) => {
          logger.warn('[KayleyChannel] TTS AudioContext close error on unmount:', err)
        })
        audioCtxRef.current = null
      }
      wsRef.current?.close()
    }
  }, [connectWs])

  // ── Text Sending ────────────────────────────────────────────

  const sendText = useCallback((text: string) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      logger.warn('[KayleyChannel] sendText called but WebSocket is not open')
      return
    }
    // Prime the TTS AudioContext inside this user-gesture call so the first
    // TTS response isn't blocked by Chrome/Safari autoplay policies.
    // initAudioPlayback() is idempotent (guards on audioCtxRef + state).
    initAudioPlayback()
    resetPlayback()
    ws.send(JSON.stringify({
      type: 'text',
      text,
      mid: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }))
  }, [])

  // ── Voice Input (lifted from dashboard/src/main.js) ─────────

  const startVoice = useCallback(async () => {
    if (isRecordingRef.current) return
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      logger.warn('[KayleyChannel] startVoice called but WebSocket is not open')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      micStreamRef.current = stream

      const ctx = new AudioContext({ sampleRate: MIC_SAMPLE_RATE })
      // Firefox (and some other browsers) don't always honor the requested
      // sample rate — log the actual achieved rate for debugging.
      logger.info('[KayleyChannel] mic AudioContext sampleRate:', ctx.sampleRate)
      micContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)

      // ScriptProcessorNode: float32 PCM → int16 PCM → base64 → websocket
      // (deprecated but broadly supported; AudioWorklet migration is future work)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      micProcessorRef.current = processor

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        const wsNow = wsRef.current
        if (!isRecordingRef.current || !wsNow || wsNow.readyState !== WebSocket.OPEN) return

        const float32 = e.inputBuffer.getChannelData(0)
        const int16 = new Int16Array(float32.length)
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32768)))
        }
        const bytes = new Uint8Array(int16.buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        wsNow.send(JSON.stringify({ type: 'audio', data: btoa(binary) }))
      }

      source.connect(processor)
      processor.connect(ctx.destination)

      ws.send(JSON.stringify({ type: 'start_voice' }))
      initAudioPlayback()
      isRecordingRef.current = true
      setIsRecording(true)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('[KayleyChannel] Mic access failed:', message)
    }
  }, [])

  const stopVoice = useCallback(() => {
    if (!isRecordingRef.current) return

    isRecordingRef.current = false
    setIsRecording(false)

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop())
      micStreamRef.current = null
    }
    if (micProcessorRef.current) {
      micProcessorRef.current.disconnect()
      micProcessorRef.current = null
    }
    if (micContextRef.current) {
      micContextRef.current.close().catch((err: unknown) => {
        // Non-fatal — AudioContext was already cleaned up or never started
        logger.warn('[KayleyChannel] AudioContext close error (non-fatal):', err)
      })
      micContextRef.current = null
    }

    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop_voice' }))
    }
  }, [])

  // ── STT Draft Confirmation ───────────────────────────────────

  const confirmDraft = useCallback(() => {
    if (!sttDraft) return
    sendText(sttDraft)
    setSttDraft(null)
  }, [sttDraft, sendText])

  const dismissDraft = useCallback(() => {
    setSttDraft(null)
  }, [])

  return {
    connected,
    isRecording,
    sttDraft,
    isTtsActive,
    sendText,
    startVoice,
    stopVoice,
    confirmDraft,
    dismissDraft,
    latestMessage,
  }
}
