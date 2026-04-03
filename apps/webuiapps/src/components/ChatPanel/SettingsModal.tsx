/**
 * SettingsModal — LLM + Image Generation configuration
 *
 * Extracted from ChatPanel for maintainability.
 */

import React, { useState, useEffect } from 'react';
import { Pencil, List } from 'lucide-react';
import { PROVIDER_MODELS, getDefaultProviderConfig, type LLMProvider } from '@/lib/llmModels';
import type { LLMConfig, LLMConfigUpdate } from '@/lib/llmModels';
import {
  getDefaultImageGenConfig,
  type ImageGenConfig,
  type ImageGenConfigUpdate,
  type ImageGenProvider,
} from '@/lib/imageGenClient';
import styles from './index.module.scss';

interface SettingsModalProps {
  config: LLMConfig | null;
  imageGenConfig: ImageGenConfig | null;
  onSave: (
    _config: LLMConfigUpdate,
    _igConfig: ImageGenConfigUpdate | null,
  ) => Promise<void> | void;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  config,
  imageGenConfig,
  onSave,
  onClose,
}) => {
  // LLM settings
  const [provider, setProvider] = useState<LLMProvider>(config?.provider || 'minimax');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [baseUrl, setBaseUrl] = useState(
    config?.baseUrl || getDefaultProviderConfig('minimax').baseUrl,
  );
  const [model, setModel] = useState(config?.model || getDefaultProviderConfig('minimax').model);
  const [customHeaders, setCustomHeaders] = useState(config?.customHeaders || '');
  const [manualModelMode, setManualModelMode] = useState(false);

  const isPresetModel = PROVIDER_MODELS[provider]?.includes(model) ?? false;
  const showDropdown = !manualModelMode && isPresetModel;

  // Image gen settings
  const [igProvider, setIgProvider] = useState<ImageGenProvider>(
    imageGenConfig?.provider || 'gemini',
  );
  const [igApiKey, setIgApiKey] = useState('');
  const [igApiKeyDirty, setIgApiKeyDirty] = useState(false);
  const [igBaseUrl, setIgBaseUrl] = useState(
    imageGenConfig?.baseUrl || getDefaultImageGenConfig('gemini').baseUrl,
  );
  const [igModel, setIgModel] = useState(
    imageGenConfig?.model || getDefaultImageGenConfig('gemini').model,
  );
  const [igCustomHeaders, setIgCustomHeaders] = useState(imageGenConfig?.customHeaders || '');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Track whether the user has edited any field locally — prevents useEffect from clobbering in-progress edits
  const hasLocalEditsRef = useRef(false);

  // Sync local state when parent props change — but only before first local edit
  useEffect(() => {
    if (!config) return;
    if (hasLocalEditsRef.current) return;
    setProvider(config.provider);
    setApiKey('');
    setApiKeyDirty(false);
    setBaseUrl(config.baseUrl || getDefaultProviderConfig(config.provider).baseUrl);
    setModel(config.model || getDefaultProviderConfig(config.provider).model);
    setCustomHeaders(config.customHeaders || '');
    setManualModelMode(false);
  }, [config]);

  useEffect(() => {
    if (!imageGenConfig) return;
    if (hasLocalEditsRef.current) return;
    setIgProvider(imageGenConfig.provider);
    setIgApiKey('');
    setIgApiKeyDirty(false);
    setIgBaseUrl(
      imageGenConfig.baseUrl || getDefaultImageGenConfig(imageGenConfig.provider).baseUrl,
    );
    setIgModel(imageGenConfig.model || getDefaultImageGenConfig(imageGenConfig.provider).model);
    setIgCustomHeaders(imageGenConfig.customHeaders || '');
  }, [imageGenConfig]);

  const handleProviderChange = (p: LLMProvider) => {
    setProvider(p);
    const defaults = getDefaultProviderConfig(p);
    setBaseUrl(defaults.baseUrl);
    setModel(defaults.model);
    setManualModelMode(false);
  };

  const handleModelChange = (newModel: string) => {
    setModel(newModel);
    setManualModelMode(false);
  };

  const handleIgProviderChange = (p: ImageGenProvider) => {
    setIgProvider(p);
    const defaults = getDefaultImageGenConfig(p);
    setIgBaseUrl(defaults.baseUrl);
    setIgModel(defaults.model);
  };

  const llmApiKeyPlaceholder = config?.hasApiKey
    ? 'Server key configured (enter to replace)'
    : 'Optional for local servers';
  const imageApiKeyPlaceholder = imageGenConfig?.hasApiKey
    ? 'Server key configured (enter to replace)'
    : 'API Key...';

  const buildImageGenConfig = (): ImageGenConfigUpdate => ({
    provider: igProvider,
    baseUrl: igBaseUrl,
    model: igModel,
    customHeaders: igCustomHeaders,
    ...(igApiKeyDirty ? { apiKey: igApiKey } : {}),
  });

  return (
    <div className={styles.overlay} data-testid="settings-overlay">
      <div className={styles.settingsModal} data-testid="settings-modal">
        <div className={styles.settingsTitle}>LLM Settings</div>

        <div className={styles.field}>
          <label className={styles.label}>Provider</label>
          <select
            className={styles.select}
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="deepseek">DeepSeek</option>
            <option value="llama.cpp">llama.cpp</option>
            <option value="minimax">MiniMax</option>
            <option value="z.ai">Z.ai</option>
            <option value="kimi">Kimi</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>API Key</label>
          <input
            className={styles.fieldInput}
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKeyDirty(true);
              setApiKey(e.target.value);
            }}
            placeholder={llmApiKeyPlaceholder}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Base URL</label>
          <input
            className={styles.fieldInput}
            value={baseUrl}
            onChange={(e) => {
              hasLocalEditsRef.current = true;
              setBaseUrl(e.target.value);
            }}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Model</label>
          <div className={styles.modelSelectorWrapper}>
            {showDropdown ? (
              <>
                <select
                  className={styles.select}
                  value={model}
                  onChange={(e) => handleModelChange(e.target.value)}
                >
                  {PROVIDER_MODELS[provider]?.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setManualModelMode(true)}
                  className={styles.manualToggleBtn}
                  title="Enter custom model name"
                >
                  <Pencil size={14} />
                </button>
              </>
            ) : (
              <>
                <input
                  className={styles.fieldInput}
                  value={model}
                  onChange={(e) => {
                    hasLocalEditsRef.current = true;
                    setModel(e.target.value);
                  }}
                  placeholder="e.g. gpt-4-turbo"
                />
                {isPresetModel && (
                  <button
                    type="button"
                    onClick={() => setManualModelMode(false)}
                    className={styles.manualToggleBtn}
                    title="Back to model list"
                  >
                    <List size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Custom Headers (one per line, Key: Value)</label>
          <textarea
            className={styles.fieldInput}
            value={customHeaders}
            onChange={(e) => {
              hasLocalEditsRef.current = true;
              setCustomHeaders(e.target.value);
            }}
            placeholder={'X-Custom-Header: value\nAnother-Header: value'}
            rows={3}
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
          />
        </div>

        <div className={styles.settingsDivider} />
        <div className={styles.settingsTitle}>Image Generation</div>

        <div className={styles.field}>
          <label className={styles.label}>Provider</label>
          <select
            className={styles.select}
            value={igProvider}
            onChange={(e) => handleIgProviderChange(e.target.value as ImageGenProvider)}
          >
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>API Key</label>
          <input
            className={styles.fieldInput}
            type="password"
            value={igApiKey}
            onChange={(e) => {
              setIgApiKeyDirty(true);
              setIgApiKey(e.target.value);
            }}
            placeholder={imageApiKeyPlaceholder}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Base URL</label>
          <input
            className={styles.fieldInput}
            value={igBaseUrl}
            onChange={(e) => {
              hasLocalEditsRef.current = true;
              setIgBaseUrl(e.target.value);
            }}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Model</label>
          <input
            className={styles.fieldInput}
            value={igModel}
            onChange={(e) => {
              hasLocalEditsRef.current = true;
              setIgModel(e.target.value);
            }}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Custom Headers</label>
          <textarea
            className={styles.fieldInput}
            value={igCustomHeaders}
            onChange={(e) => {
              hasLocalEditsRef.current = true;
              setIgCustomHeaders(e.target.value);
            }}
            placeholder={'X-Custom-Header: value'}
            rows={2}
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
          />
        </div>

        <div className={styles.settingsActions}>
          {saveError && (
            <div style={{ color: '#ff6b6b', fontSize: '12px', marginRight: 'auto' }}>
              {saveError}
            </div>
          )}
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            className={styles.saveBtn}
            disabled={saving}
            onClick={async () => {
              setSaveError(null);
              setSaving(true);
              const llmCfg: LLMConfigUpdate = {
                provider,
                baseUrl,
                model,
                customHeaders,
              };
              if (apiKeyDirty) {
                llmCfg.apiKey = apiKey;
              }
              const nextImageGenConfig = buildImageGenConfig();
              const igCfg: ImageGenConfigUpdate | null = imageGenConfig
                ? nextImageGenConfig
                : igApiKey.trim()
                  ? { ...nextImageGenConfig, apiKey: igApiKey }
                  : null;
              try {
                await onSave(llmCfg, igCfg);
              } catch (err) {
                setSaveError(err instanceof Error ? err.message : String(err));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
