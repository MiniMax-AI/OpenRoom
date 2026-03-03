# Email 数据指南

## 重要：邮箱归属说明

本邮箱是**用户（User）的邮箱**，所有邮件的视角以用户为主。`folder` 字段的设置必须基于用户视角：

- **`inbox`**：用户收到的邮件。Character 发送给用户的邮件应放在 `inbox`，因为对用户来说这是一封收到的邮件。
- **`sent`**：用户发出的邮件。只有用户主动发送的邮件才应放在 `sent`。
- **`drafts`**：用户的草稿。
- **`trash`**：用户删除的邮件。

> **常见错误**：Character 向用户发送邮件时，不应将 `folder` 设为 `sent`。虽然这封邮件是 Character "发送"的，但对于用户来说这是一封**收到的邮件**，应设为 `inbox`。

## 文件夹结构

```
/
├── emails/                 # 邮件数据目录
│   ├── {emailId}.json     # 单封邮件文件
│   └── ...
└── state.json             # 应用状态文件
```

## 文件定义

### 邮件目录 `/emails/`

存储所有邮件数据。每封邮件独立保存为一个 JSON 文件，文件名为邮件 ID。

- 启动时前端从该目录读取所有文件以渲染邮件列表
- Agent 写邮件时直接写入新文件
- 用户本地只能查看邮件，不能撰写、回复或发送
- 邮件按 `timestamp` 字段降序排列展示

#### 邮件文件 `{emailId}.json`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 邮件唯一标识，与文件名一致（不含 `.json` 后缀） |
| from | object | 是 | 发件人信息 |
| from.name | string | 是 | 发件人姓名 |
| from.address | string | 是 | 发件人邮箱地址 |
| to | array | 是 | 收件人列表，每项为 EmailAddress 对象 |
| cc | array | 是 | 抄送列表，每项为 EmailAddress 对象，可为空数组 |
| subject | string | 是 | 邮件主题 |
| content | string | 是 | 邮件正文内容 |
| timestamp | integer | 是 | 发送/接收时间戳（毫秒） |
| isRead | boolean | 是 | 是否已读 |
| isStarred | boolean | 是 | 是否已加星标 |
| folder | string | 是 | 所属文件夹，可选值：`inbox`、`sent`、`drafts`、`trash` |

**EmailAddress 对象结构：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 姓名 |
| address | string | 是 | 邮箱地址 |

示例：

```json
{
  "id": "1706000000000-a1b2c3d4e",
  "from": {
    "name": "张三",
    "address": "zhangsan@example.com"
  },
  "to": [
    {
      "name": "李四",
      "address": "lisi@example.com"
    }
  ],
  "cc": [],
  "subject": "关于项目进度的讨论",
  "content": "你好，李四：\n\n关于当前项目的进度，我想和你沟通一下。\n\n目前第一阶段已经完成，我们可以开始第二阶段的工作了。\n\n请问你这周有空安排一次会议吗？\n\n祝好，\n张三",
  "timestamp": 1706000000000,
  "isRead": false,
  "isStarred": false,
  "folder": "inbox"
}
```

### 状态文件 `/state.json`

存储应用运行时状态，用于启动时恢复现场。前端在状态变更时自动保存并同步到云端。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| selectedEmailId | string\|null | 否 | 当前选中的邮件 ID，未选中时为 null |
| currentFolder | string | 是 | 当前所在文件夹，可选值：`inbox`、`sent`、`drafts`、`trash` |

示例：

```json
{
  "selectedEmailId": null,
  "currentFolder": "inbox"
}
```

## 数据同步说明

### Agent 操作（Agent → 前端）

Agent 负责在云端完成邮件文件的写入/删除，完成后通过下发 Action 通知前端同步刷新。
前端收到 Action 后仅从云端读取最新数据，不再进行本地文件创建。

**Agent 写邮件**:

1. Agent 在云端写入邮件文件 `/emails/{id}.json`（内容为完整的邮件 JSON）
2. Agent 下发 `COMPOSE_EMAIL` Action，params 携带 `filePath`（如 `/emails/{id}.json`）
3. 前端收到 Action 后从云端读取该文件，更新本地文件树和 UI

**Agent 删除邮件**:

1. Agent 在云端删除邮件文件
2. Agent 下发 `DELETE_EMAIL` Action，params 携带 `emailId`
3. 前端收到 Action 后从本地文件树移除该邮件并刷新 UI

**Agent 标记已读**:

1. Agent 在云端更新邮件文件（`isRead` 设为 `true`）
2. Agent 下发 `MARK_READ` Action，params 携带 `emailId`
3. 前端收到 Action 后从云端重新读取该邮件文件并刷新 UI

### 用户操作（前端 → 云端）

用户在前端的操作为只读模式，不能撰写、回复或发送邮件。用户可执行的操作流程如下：

**用户阅读邮件**:

1. 用户点击邮件查看详情
2. 前端自动标记邮件为已读，更新本地文件系统
3. 前端同步到云端
4. 前端上报 `READ_EMAIL` Action

**用户加星/取消星标**:

1. 用户点击星标按钮
2. 前端更新本地文件系统
3. 前端同步到云端
4. 前端上报 `STAR_EMAIL` 或 `UNSTAR_EMAIL` Action

**用户删除邮件**:

1. 用户点击删除按钮
2. 前端从本地文件系统移除
3. 前端同步到云端（删除云端文件）
4. 前端上报 `DELETE_EMAIL` Action

### 启动恢复

1. 前端调用 `initFromCloud()` 拉取所有文件
2. 读取 `/emails/` 目录下所有邮件文件，按时间排序后渲染
3. 读取 `/state.json` 恢复当前文件夹和选中邮件状态
