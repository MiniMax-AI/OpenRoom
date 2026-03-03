# 日记 数据指南

## 文件夹结构

```
/
├── entries/                # 日记条目数据目录
│   ├── {entryId}.json     # 单条日记文件
│   └── ...
└── state.json             # 应用状态文件
```

## 文件定义

### 日记目录 `/entries/`

存储所有日记条目数据。每条日记独立保存为一个 JSON 文件，文件名为日记 ID。

- 启动时前端从该目录读取所有文件以渲染日历和日记内容
- Agent 创建日记时直接写入新文件
- 用户创建或编辑日记时前端创建/更新文件并同步到云端
- 每个日期最多一条日记，通过日历导航按日期浏览

#### 日记文件 `{entryId}.json`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 日记唯一标识，与文件名一致（不含 `.json` 后缀） |
| date | string | 是 | 日期，格式 YYYY-MM-DD（如 `2026-02-12`），每天最多一条 |
| title | string | 是 | 日记标题，可为空字符串 |
| content | string | 是 | 日记内容，支持 Markdown 和特殊标记语法，可为空字符串 |
| mood | string | 否 | 心情标签：`happy` / `sad` / `neutral` / `excited` / `tired` / `anxious` / `hopeful` / `angry` |
| weather | string | 否 | 天气标签：`sunny` / `cloudy` / `rainy` / `snowy` / `windy` / `foggy` |
| createdAt | integer | 是 | 创建时间戳（毫秒） |
| updatedAt | integer | 是 | 最后更新时间戳（毫秒） |

示例：

```json
{
  "id": "1706000000000-a1b2c3d4e",
  "date": "2026-02-12",
  "title": "周末散步记",
  "content": "今天天气很好，在公园散步了一个小时。\n\n看到湖边的柳树开始发芽了，{{strike}}冬天还没结束{{/strike}} 春天要来了。",
  "mood": "happy",
  "weather": "sunny",
  "createdAt": 1706000000000,
  "updatedAt": 1706003600000
}
```

#### 特殊内容标记

日记内容支持以下手绘效果标记，在预览模式下会渲染为 SVG 动画装饰：

| 标记 | 效果 | 说明 |
|------|------|------|
| `{{strike}}文字{{/strike}}` | 手绘删除线 | 红色波浪线划过文字 |
| `{{scribble}}文字{{/scribble}}` | 涂鸦划掉 | 双重深色删除线 |
| `{{messy}}文字{{/messy}}` | 凌乱涂黑 | 锯齿形涂鸦遮盖文字 |

### 状态文件 `/state.json`

存储应用运行时状态，用于启动时恢复现场。前端在选中日期变更时自动保存并同步到云端。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| selectedDate | string \| null | 是 | 当前选中的日期（YYYY-MM-DD），无选中时为 null |

示例：

```json
{
  "selectedDate": "2026-02-12"
}
```

## 数据同步说明

### Agent 操作（Agent → 前端）

Agent 负责在云端完成文件的写入/修改/删除，完成后通过下发 Action 通知前端同步刷新。
前端收到 Action 后仅从云端读取最新数据，不再进行本地文件创建。

**Agent 创建日记**:

1. Agent 在云端写入文件 `/entries/{id}.json`（内容为完整的日记 JSON，必须包含 `date` 字段）
2. Agent 下发 `CREATE_ENTRY` Action，params 携带 `filePath`（如 `/entries/{id}.json`）
3. 前端收到 Action 后从云端读取该文件，更新本地文件树和日历，自动导航到该日期

**Agent 更新日记**:

1. Agent 在云端修改日记文件（更新标题、内容、心情、天气等）
2. Agent 下发 `UPDATE_ENTRY` Action，params 携带 `filePath`
3. 前端收到 Action 后从云端重新读取该文件，替换本地数据并刷新 UI

**Agent 删除日记**:

1. Agent 在云端删除日记文件
2. Agent 下发 `DELETE_ENTRY` Action，params 携带 `entryId`
3. 前端收到 Action 后从本地文件树移除该日记并刷新 UI

**Agent 选中日记**:

1. Agent 下发 `SELECT_ENTRY` Action，params 携带 `entryId`
2. 前端在日历中定位到该日记对应的日期并展示内容

**Agent 导航到日期**:

1. Agent 下发 `SELECT_DATE` Action，params 携带 `date`（YYYY-MM-DD）
2. 前端日历导航到该日期并展示对应日记（若存在）

### 用户操作（前端 → 云端）

用户在前端的操作由前端代码自行处理，流程为：本地操作 → 同步到云端 → 上报 Action。

**用户创建日记**:

1. 用户在日历上选择一个日期，点击"写一篇"按钮
2. 前端生成日记数据（包含 `date` 字段），写入本地文件系统 `/entries/{id}.json`
3. 前端同步文件到云端
4. 前端上报 `CREATE_ENTRY` Action

**用户编辑日记**:

1. 用户在编辑器中修改标题或内容（切换到编辑模式）
2. 前端防抖 800ms 后触发保存，更新本地文件并同步到云端
3. 前端上报 `UPDATE_ENTRY` Action

**用户设置心情/天气**:

1. 用户点击心情或天气图标，从下拉菜单中选择
2. 前端立即保存并同步到云端
3. 前端上报 `UPDATE_ENTRY` Action（包含 mood 或 weather 字段）

**用户删除日记**:

1. 用户点击删除按钮
2. 前端从本地文件系统移除 `/entries/{id}.json` 并同步删除到云端
3. 日历上该日期的标记消失
4. 前端上报 `DELETE_ENTRY` Action

### 启动恢复

1. 前端调用 `initFromCloud()` 拉取所有文件
2. 读取 `/entries/` 目录下所有日记文件，为每条日记建立日期索引
3. 读取 `/state.json` 恢复上次选中的日期，日历定位到该月份
4. 若无保存状态，默认选中今天
