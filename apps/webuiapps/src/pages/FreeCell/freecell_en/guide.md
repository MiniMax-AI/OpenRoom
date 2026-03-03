# FreeCell Data Guide

## Folder Structure

```
/
└── state.json          # Current game state
```

## File Definitions

### State File `/state.json`

Stores the complete state of the current game, including 8 tableau columns, 4 free cells, 4 foundation piles, move count, and game status.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| columns | Card[][] | Yes | 8 tableau columns, each is a Card array, indexed 0-7 |
| freeCells | (Card \| null)[] | Yes | 4 free cells, null indicates an empty slot |
| foundations | Record<Suit, Card[]> | Yes | 4 foundation piles, grouped by suit (hearts/diamonds/clubs/spades), stacked in order from A to K |
| moveCount | number | Yes | Current move count |
| gameStatus | string | Yes | Game status: `"playing"` or `"won"` |
| gameId | string | Yes | Unique game identifier |

#### Card Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| suit | string | Yes | Suit: `"hearts"` / `"diamonds"` / `"clubs"` / `"spades"` |
| rank | number | Yes | Rank: 1=A, 2-10, 11=J, 12=Q, 13=K |

Example:

```json
{
  "columns": [
    [{"suit":"spades","rank":13}, {"suit":"hearts","rank":5}, {"suit":"clubs","rank":3}],
    [{"suit":"diamonds","rank":7}, {"suit":"spades","rank":6}],
    [],
    ...
  ],
  "freeCells": [{"suit":"hearts","rank":2}, null, null, null],
  "foundations": {
    "hearts": [{"suit":"hearts","rank":1}],
    "diamonds": [],
    "clubs": [],
    "spades": []
  },
  "moveCount": 12,
  "gameStatus": "playing",
  "gameId": "1706000000000-abc123def"
}
```

## Data Synchronization

### Agent Operations (Agent → Frontend)

The Agent can directly write to `/state.json` to set any valid game state, then dispatch the following Actions to notify the frontend to sync:

- **SYNC_STATE**: The Agent has modified state.json (e.g., making moves on behalf of the user). The frontend executes `initFromCloud()` to read the latest state and refresh the UI.
- **NEW_GAME**: The Agent has written a new game's state.json. The frontend executes `initFromCloud()` to read and refresh the UI.

### User Operations (Frontend → Agent)

- **MOVE_CARD**: After the user moves one or more cards on the board, the frontend updates the local state, syncs to the cloud, and reports the `MOVE_CARD` Action (with gameId and moveCount).
- **NEW_GAME**: After the user clicks the "New Game" button, the frontend generates a new game and syncs to the cloud, then reports the `NEW_GAME` Action (with gameId).

### Startup Recovery

On startup, the frontend calls `initFromCloud()` to fetch `/state.json` from the cloud. If the file does not exist, a new game is automatically generated and written to the cloud.
