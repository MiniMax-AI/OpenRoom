# 空当接龙 数据指南

## 文件夹结构

```
/
└── state.json          # 当前牌局状态
```

## 文件定义

### 状态文件 `/state.json`

存储当前牌局的完整状态，包括 8 列牌阵、4 个可用单元格、4 个基础牌堆、步数和游戏状态。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| columns | Card[][] | 是 | 8 列牌阵，每列为 Card 数组，索引 0-7 |
| freeCells | (Card \| null)[] | 是 | 4 个可用单元格，null 表示空位 |
| foundations | Record<Suit, Card[]> | 是 | 4 个基础牌堆，按花色分组（hearts/diamonds/clubs/spades），从 A 到 K 顺序堆叠 |
| moveCount | number | 是 | 当前步数 |
| gameStatus | string | 是 | 游戏状态：`"playing"` 或 `"won"` |
| gameId | string | 是 | 牌局唯一标识 |

#### Card 结构

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| suit | string | 是 | 花色：`"hearts"` / `"diamonds"` / `"clubs"` / `"spades"` |
| rank | number | 是 | 点数：1=A, 2-10, 11=J, 12=Q, 13=K |

示例：

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

## 数据同步说明

### Agent 操作（Agent -> 前端）

Agent 可以直接写入 `/state.json` 来设置任意合法牌局状态，然后下发以下 Action 通知前端同步：

- **SYNC_STATE**：Agent 修改了 state.json（如代替用户走棋），前端收到后执行 `initFromCloud()` 读取最新状态并刷新 UI。
- **NEW_GAME**：Agent 写入了一局新游戏的 state.json，前端收到后执行 `initFromCloud()` 读取并刷新 UI。

### 用户操作（前端 -> Agent）

- **MOVE_CARD**：用户在界面上移动一张或多张牌后，前端更新本地状态并同步到云端，然后上报 `MOVE_CARD` Action（附带 gameId 和 moveCount）。
- **NEW_GAME**：用户点击"新游戏"按钮后，前端生成新牌局并同步到云端，然后上报 `NEW_GAME` Action（附带 gameId）。

### 启动恢复

前端启动时调用 `initFromCloud()` 从云端拉取 `/state.json`。若文件不存在，自动生成一局新游戏并写入云端。
