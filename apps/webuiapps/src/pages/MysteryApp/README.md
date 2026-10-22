# MysteryApp

Cooperative murder mystery game for Steven and Kayley. One of them killed Marcus Vale at the gala — find out who.

## How It Works

The app connects to a local Game Master (GM) subprocess running on `ws://localhost:5182`. The GM holds the locked truth (killer, motive, weapon, time). Neither Steven nor Kayley knows the answer — it was rolled by a third-party AI shuffler and sealed before the game starts.

```
MysteryApp (OpenRoom)
       │
       │  WebSocket  ws://localhost:5182
       ▼
GM subprocess  (gm-server.mjs)
       │
       │  claude --print (Haiku)
       ▼
Narrative responses  →  back to MysteryApp chat panel
```

## Starting the GM

From the `Kayley_Cowork` directory:

```bash
pm2 start .claude/skills/mystery-gm/scripts/gm-server.mjs --name kayley-mystery-gm
```

Confirm it's up:

```bash
pm2 logs kayley-mystery-gm --lines 10 --nostream
# Expected: [gm-server] Listening on ws://localhost:5182
```

The MysteryApp will show a connected indicator once the WebSocket handshake completes.

## Prerequisites

The LOCKED scenario file must exist before starting the GM:

```
C:\Users\gates\Personal\Kayley_Cowork\.claude\skills\mystery-gm\scenarios\marcus-vale-gala-LOCKED.json
```

If it's missing:
- **Real game:** Follow the shuffler steps in `CHEAT-SHEET.md` → paste the skeleton into ChatGPT/Gemini → save the output as the LOCKED file
- **Testing:** Tell Kayley "shuffle the mystery for testing" — she'll generate a test LOCKED file in under a minute

## Game Flow

1. Open the MysteryApp in OpenRoom
2. The crime scene renders with 5 suspects and 4 locations
3. Click a suspect's action (Interrogate, Search, etc.) — the GM narrates the response
4. OR tell Kayley what you want to do — she calls vibe_action and the same GM responds
5. Collect evidence, interrogate suspects, compare notes
6. Click **Make Accusation** when you think you know who did it
7. The GM judges your accusation against the locked truth and reads the solution narrative

## Skill Source

GM logic, shuffler prompt, and scenario files live in:

```
C:\Users\gates\Personal\Kayley_Cowork\.claude\skills\mystery-gm\
```

See that folder's `README.md` for full architecture notes.
