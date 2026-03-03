# Gomoku Data Guide

## Directory Structure

```text
apps/gomoku/data/
├── history/
│   ├── {id}.json
│   └── ...
└── state.json
```

## File Definitions

### Game Records `/history/`

Collection of game history records, one JSON file per game. File name is `{id}.json`, automatically written by the App when a game ends.

#### Game Record File `{id}.json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique game identifier |
| players | array | Yes | Two-element array of player info, each with name, color, role |
| moves | array | Yes | Array of move records in chronological order |
| result | object \| null | No | Game result, null if game is not finished |
| startedAt | number | Yes | Game start timestamp (milliseconds) |
| endedAt | number \| null | Yes | Game end timestamp (milliseconds), null if not finished |

#### Player Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Player name, e.g. "You", "Agent" |
| color | string | Yes | Stone color, `"black"` or `"white"` |
| role | string | Yes | Role type, `"human"` or `"agent"` |

#### Move Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| position | object | Yes | Placement position with `row` (0-14) and `col` (0-14) |
| color | string | Yes | Stone color, `"black"` or `"white"` |
| moveNumber | number | Yes | Move number (starting from 1) |
| timestamp | number | Yes | Move timestamp (milliseconds) |

#### Result Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| winner | string \| null | Yes | Winning color, null for draws |
| winLine | object \| null | Yes | Five-in-a-row position info, null for surrender or draw |
| reason | string | Yes | End reason: `"five-in-a-row"` \| `"surrender"` \| `"draw"` |

```json
{
  "id": "1707350400000abc",
  "players": [
    { "name": "You", "color": "black", "role": "human" },
    { "name": "Agent", "color": "white", "role": "agent" }
  ],
  "moves": [
    { "position": { "row": 7, "col": 7 }, "color": "black", "moveNumber": 1, "timestamp": 1707350400000 },
    { "position": { "row": 7, "col": 8 }, "color": "white", "moveNumber": 2, "timestamp": 1707350401000 }
  ],
  "result": {
    "winner": "black",
    "winLine": {
      "positions": [
        { "row": 7, "col": 3 }, { "row": 7, "col": 4 }, { "row": 7, "col": 5 },
        { "row": 7, "col": 6 }, { "row": 7, "col": 7 }
      ],
      "color": "black"
    },
    "reason": "five-in-a-row"
  },
  "startedAt": 1707350400000,
  "endedAt": 1707350500000
}
```

### State File `/state.json`

Application statistics file, recording historical game statistics.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| currentGameId | string \| null | null | ID of the most recent game |
| totalGames | number | 0 | Total number of games played |
| stats | object | - | Statistics data (see below) |

#### Stats Object

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| blackWins | number | 0 | Number of black wins |
| whiteWins | number | 0 | Number of white wins |
| draws | number | 0 | Number of draws |

```json
{
  "currentGameId": "1707350400000abc",
  "totalGames": 5,
  "stats": {
    "blackWins": 3,
    "whiteWins": 1,
    "draws": 1
  }
}
```

## Data Synchronization

### Auto-save on Game End

1. When a game ends (five-in-a-row, surrender, or draw), App writes the game record to `/history/{id}.json`
2. App updates statistics in `/state.json`
3. App calls `reportAction` to report the game result

### Agent Operations (Agent → Frontend)

1. Agent uses `PLACE_STONE` Action to place stones during its turn
2. Agent can manage cloud game records via `CREATE_GAME`/`UPDATE_GAME`/`DELETE_GAME`
3. After sending an Action, the frontend syncs latest data from cloud and refreshes UI

### Startup Recovery

1. App starts, reports `DOM_READY` lifecycle
2. Reads `state.json` from NAS to restore statistics
3. UI rendering complete, reports `LOADED` lifecycle
4. App enters ready state (color selection screen), begins accepting Agent Actions
