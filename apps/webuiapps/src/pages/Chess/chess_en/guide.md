# Chess Data Guide

## Folder Structure

```
/
└── state.json          # Current game state
```

## File Definitions

### State File `/state.json`

Stores the complete state of the current game, including board layout, current turn, castling rights, en passant target, move history, and game status.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| board | (Piece \| null)[][] | Yes | 8x8 board, index [0][0] is a8 (top-left, black's back rank), [7][7] is h1 (bottom-right, white's back rank) |
| currentTurn | string | Yes | Current turn: `"w"` white / `"b"` black |
| castlingRights | CastlingRights | Yes | Castling rights |
| enPassantTarget | [number, number] \| null | Yes | En passant target square ([row, col]), null if none |
| halfMoveClock | number | Yes | Half-move counter (for 50-move draw rule) |
| moveHistory | MoveRecord[] | Yes | Array of move history records |
| gameStatus | string | Yes | Game status: `"playing"` / `"check"` / `"checkmate"` / `"stalemate"` / `"draw"` |
| winner | string \| null | Yes | Winner: `"w"` / `"b"` / null |
| gameId | string | Yes | Unique game identifier |
| lastMove | object \| null | Yes | Last move with `from: [row, col]` and `to: [row, col]`, null if none |
| isAgentThinking | boolean | Yes | Whether the Agent is currently thinking. When true, the frontend locks the board and prevents user interaction |

#### Piece Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | string | Yes | Piece type: `"K"` King / `"Q"` Queen / `"R"` Rook / `"B"` Bishop / `"N"` Knight / `"P"` Pawn |
| color | string | Yes | Piece color: `"w"` white / `"b"` black |

#### CastlingRights Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| wK | boolean | Yes | White kingside castling right |
| wQ | boolean | Yes | White queenside castling right |
| bK | boolean | Yes | Black kingside castling right |
| bQ | boolean | Yes | Black queenside castling right |

#### MoveRecord Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| from | [number, number] | Yes | Source position [row, col] |
| to | [number, number] | Yes | Target position [row, col] |
| piece | Piece | Yes | The piece that moved |
| captured | Piece \| null | Yes | The captured piece (null if none) |
| promotion | string \| null | Yes | Promotion piece type (e.g., `"Q"`), null if none |
| castling | string \| null | Yes | Castling type: `"K"` kingside / `"Q"` queenside / null |
| enPassant | boolean | Yes | Whether this was an en passant capture |

Example:

```json
{
  "board": [
    [{"type":"R","color":"b"}, {"type":"N","color":"b"}, {"type":"B","color":"b"}, {"type":"Q","color":"b"}, {"type":"K","color":"b"}, {"type":"B","color":"b"}, {"type":"N","color":"b"}, {"type":"R","color":"b"}],
    [{"type":"P","color":"b"}, {"type":"P","color":"b"}, {"type":"P","color":"b"}, {"type":"P","color":"b"}, null, {"type":"P","color":"b"}, {"type":"P","color":"b"}, {"type":"P","color":"b"}],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, {"type":"P","color":"b"}, null, null, null],
    [null, null, null, null, {"type":"P","color":"w"}, null, null, null],
    [null, null, null, null, null, null, null, null],
    [{"type":"P","color":"w"}, {"type":"P","color":"w"}, {"type":"P","color":"w"}, {"type":"P","color":"w"}, null, {"type":"P","color":"w"}, {"type":"P","color":"w"}, {"type":"P","color":"w"}],
    [{"type":"R","color":"w"}, {"type":"N","color":"w"}, {"type":"B","color":"w"}, {"type":"Q","color":"w"}, {"type":"K","color":"w"}, {"type":"B","color":"w"}, {"type":"N","color":"w"}, {"type":"R","color":"w"}]
  ],
  "currentTurn": "b",
  "castlingRights": {"wK": true, "wQ": true, "bK": true, "bQ": true},
  "enPassantTarget": null,
  "halfMoveClock": 0,
  "moveHistory": [
    {"from": [6,4], "to": [4,4], "piece": {"type":"P","color":"w"}, "captured": null, "promotion": null, "castling": null, "enPassant": false},
    {"from": [1,4], "to": [3,4], "piece": {"type":"P","color":"b"}, "captured": null, "promotion": null, "castling": null, "enPassant": false}
  ],
  "gameStatus": "playing",
  "winner": null,
  "gameId": "1706000000000-abc123def",
  "lastMove": {"from": [1,4], "to": [3,4]},
  "isAgentThinking": false
}
```

## Data Synchronization

### Turn-Based Interaction Model

This application uses a **strict turn-based** model:
- The user plays white, the Agent plays black
- After the user moves, the board locks (`isAgentThinking = true`), waiting for the Agent to respond
- After the Agent moves, the board unlocks (`isAgentThinking = false`), and it's the user's turn
- When the game ends (checkmate/stalemate/draw), turns no longer switch

### Agent Operations (Agent → Frontend)

The Agent directly modifies `/state.json` on the cloud, applying its move to the board, then dispatches an Action to notify the frontend to sync:

- **AGENT_MOVE**: The Agent made a move. The Agent updates the board in state.json, sets `currentTurn` to `"w"`, sets `isAgentThinking` to `false`, and updates move history and game status. The frontend executes `initFromCloud()` to read the latest state and refresh the UI.
- **SYNC_STATE**: The Agent modified state.json (e.g., adjusting game state). The frontend executes `initFromCloud()` to read the latest state and refresh the UI.
- **NEW_GAME**: The Agent wrote a new game's state.json. The frontend executes `initFromCloud()` to read and refresh the UI.

### User Operations (Frontend → Agent)

- **USER_MOVE**: After the user makes a move on the board, the frontend updates the local state (`currentTurn` to `"b"`, `isAgentThinking` to `true`) and syncs to the cloud, then reports the `USER_MOVE` Action (with from, to coordinates and gameId).
- **NEW_GAME**: After the user clicks "New Game", the frontend generates a new game and syncs to the cloud, then reports the `NEW_GAME` Action (with gameId).

### Startup Recovery

On startup, the frontend calls `initFromCloud()` to fetch `/state.json` from the cloud. If the file does not exist, an initial game is automatically generated and written to the cloud.

### Coordinate System

Board coordinates use `[row, col]` format:
- `[0, 0]` = a8 (top-left, black's back rank)
- `[0, 7]` = h8 (top-right)
- `[7, 0]` = a1 (bottom-left, white's back rank)
- `[7, 7]` = h1 (bottom-right)

Standard algebraic notation mapping: `file = 'a' + col`, `rank = 8 - row`
