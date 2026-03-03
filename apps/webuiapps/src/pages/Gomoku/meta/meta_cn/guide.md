# 五子棋 数据指南

## 文件夹结构

```text
apps/gomoku/data/
├── history/
│   ├── {id}.json
│   └── ...
└── state.json
```

## 文件定义

### 对局记录 `/history/`

对局历史记录集合，每局游戏一个 JSON 文件。文件名为 `{id}.json`，由 App 在对局结束时自动写入。

#### 对局记录文件 `{id}.json`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 对局唯一标识 |
| players | array | 是 | 两位玩家信息数组，每项包含 name、color、role |
| moves | array | 是 | 落子记录数组，按时间顺序排列 |
| result | object \| null | 否 | 对局结果，对局未结束时为 null |
| startedAt | number | 是 | 对局开始时间戳（毫秒） |
| endedAt | number \| null | 是 | 对局结束时间戳（毫秒），未结束时为 null |

#### Player 对象

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 玩家名称，如 "You"、"Agent" |
| color | string | 是 | 棋子颜色，`"black"` 或 `"white"` |
| role | string | 是 | 角色类型，`"human"` 或 `"agent"` |

#### Move 对象

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| position | object | 是 | 落子位置，包含 `row`（0-14）和 `col`（0-14） |
| color | string | 是 | 落子颜色，`"black"` 或 `"white"` |
| moveNumber | number | 是 | 第几手（从 1 开始） |
| timestamp | number | 是 | 落子时间戳（毫秒） |

#### Result 对象

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| winner | string \| null | 是 | 获胜方颜色，平局时为 null |
| winLine | object \| null | 是 | 五连珠位置信息，认输或平局时为 null |
| reason | string | 是 | 结束原因：`"five-in-a-row"` \| `"surrender"` \| `"draw"` |

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

### 状态文件 `/state.json`

应用统计数据文件，记录历史对局统计信息。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| currentGameId | string \| null | null | 最近一局的 ID |
| totalGames | number | 0 | 总对局数 |
| stats | object | - | 统计数据（见下表） |

#### Stats 对象

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| blackWins | number | 0 | 黑棋获胜次数 |
| whiteWins | number | 0 | 白棋获胜次数 |
| draws | number | 0 | 平局次数 |

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

## 数据同步说明

### 对局结束自动保存

1. 对局结束时（五连珠、认输、平局），App 将对局记录写入 `/history/{id}.json`
2. App 更新 `/state.json` 中的统计数据
3. App 调用 `reportAction` 上报对局结果

### Agent 操作（Agent → 前端）

1. Agent 通过 `PLACE_STONE` Action 在自己回合落子
2. Agent 可通过 `CREATE_GAME`/`UPDATE_GAME`/`DELETE_GAME` 管理云端对局记录
3. 下发 Action 后，前端从云端同步最新数据并刷新 UI

### 启动恢复

1. App 启动，上报 `DOM_READY` 生命周期
2. 从 NAS 读取 `state.json` 恢复统计数据
3. UI 渲染完成，上报 `LOADED` 生命周期
4. App 进入就绪状态（颜色选择界面），开始接收 Agent Action
