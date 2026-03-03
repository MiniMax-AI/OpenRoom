# 国际象棋 数据指南

## 文件夹结构

```
/
└── state.json          # 当前棋局状态
```

## 文件定义

### 状态文件 `/state.json`

存储当前棋局的完整状态，包括棋盘布局、当前回合、易位权限、过路兵目标、走法历史和游戏状态。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| board | (Piece \| null)[][] | 是 | 8x8 棋盘，索引 [0][0] 为 a8（黑方底线左上角），[7][7] 为 h1（白方底线右下角） |
| currentTurn | string | 是 | 当前回合：`"w"` 白方 / `"b"` 黑方 |
| castlingRights | CastlingRights | 是 | 易位权限 |
| enPassantTarget | [number, number] \| null | 是 | 可执行过路兵的目标格（[row, col]），无则为 null |
| halfMoveClock | number | 是 | 半步计数器（用于 50 步和棋规则） |
| moveHistory | MoveRecord[] | 是 | 走法历史记录数组 |
| gameStatus | string | 是 | 游戏状态：`"playing"` / `"check"` / `"checkmate"` / `"stalemate"` / `"draw"` |
| winner | string \| null | 是 | 胜方：`"w"` / `"b"` / null |
| gameId | string | 是 | 棋局唯一标识 |
| lastMove | object \| null | 是 | 上一步走法，包含 `from: [row, col]` 和 `to: [row, col]`，无则为 null |
| isAgentThinking | boolean | 是 | Agent 是否正在思考中。为 true 时前端锁定棋盘，禁止用户操作 |

#### Piece 结构

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | 棋子类型：`"K"` 王 / `"Q"` 后 / `"R"` 车 / `"B"` 象 / `"N"` 马 / `"P"` 兵 |
| color | string | 是 | 棋子颜色：`"w"` 白 / `"b"` 黑 |

#### CastlingRights 结构

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| wK | boolean | 是 | 白方王翼（短）易位权限 |
| wQ | boolean | 是 | 白方后翼（长）易位权限 |
| bK | boolean | 是 | 黑方王翼（短）易位权限 |
| bQ | boolean | 是 | 黑方后翼（长）易位权限 |

#### MoveRecord 结构

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| from | [number, number] | 是 | 起始位置 [row, col] |
| to | [number, number] | 是 | 目标位置 [row, col] |
| piece | Piece | 是 | 移动的棋子 |
| captured | Piece \| null | 是 | 被吃掉的棋子（无则 null） |
| promotion | string \| null | 是 | 升变棋子类型（如 `"Q"`），无则 null |
| castling | string \| null | 是 | 易位类型：`"K"` 王翼 / `"Q"` 后翼 / null |
| enPassant | boolean | 是 | 是否为过路兵吃子 |

示例：

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

## 数据同步说明

### 回合制交互模型

本应用采用**严格回合制**：
- 用户执白，Agent 执黑
- 用户走棋后，棋盘锁定（`isAgentThinking = true`），等待 Agent 响应
- Agent 走棋后，棋盘解锁（`isAgentThinking = false`），轮到用户操作
- 游戏结束（将杀/逼和/和棋）时不再切换回合

### Agent 操作（Agent → 前端）

Agent 在云端直接修改 `/state.json`，将自己的走法应用到棋盘上，然后下发 Action 通知前端同步：

- **AGENT_MOVE**：Agent 走了一步棋。Agent 在 state.json 中更新棋盘、将 `currentTurn` 改为 `"w"`、将 `isAgentThinking` 设为 `false`，并更新走法历史和游戏状态。前端收到后执行 `initFromCloud()` 读取最新状态并刷新 UI。
- **SYNC_STATE**：Agent 修改了 state.json（如调整棋局状态），前端收到后执行 `initFromCloud()` 读取最新状态并刷新 UI。
- **NEW_GAME**：Agent 写入了一局新游戏的 state.json，前端收到后执行 `initFromCloud()` 读取并刷新 UI。

### 用户操作（前端 → Agent）

- **USER_MOVE**：用户在界面上走了一步棋后，前端更新本地状态（`currentTurn` 改为 `"b"`、`isAgentThinking` 设为 `true`）并同步到云端，然后上报 `USER_MOVE` Action（附带 from、to 坐标和 gameId）。
- **NEW_GAME**：用户点击"新游戏"按钮后，前端生成新棋局并同步到云端，然后上报 `NEW_GAME` Action（附带 gameId）。

### 启动恢复

前端启动时调用 `initFromCloud()` 从云端拉取 `/state.json`。若文件不存在，自动生成初始棋局并写入云端。

### 坐标系统

棋盘坐标使用 `[row, col]` 格式：
- `[0, 0]` = a8（左上角，黑方底线）
- `[0, 7]` = h8（右上角）
- `[7, 0]` = a1（左下角，白方底线）
- `[7, 7]` = h1（右下角）

标准代数坐标映射：`file = 'a' + col`，`rank = 8 - row`
