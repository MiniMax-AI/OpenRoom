# Twitter 数据指南

## 文件夹结构

```
/
├── posts/                  # 帖子数据目录
│   ├── {postId}.json      # 单条帖子文件
│   └── ...
└── state.json             # 应用状态文件
```

## 文件定义

### 帖子目录 `/posts/`

存储所有帖子数据。每条帖子独立保存为一个 JSON 文件，文件名为帖子 ID。

- 启动时前端从该目录读取所有文件以渲染帖子列表
- Agent 创建帖子时直接写入新文件
- 用户创建帖子时前端创建文件并同步到云端
- 帖子按 `timestamp` 字段降序排列展示

#### 帖子文件 `{postId}.json`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 帖子唯一标识，与文件名一致（不含 `.json` 后缀） |
| author | object | 是 | 作者信息 |
| author.name | string | 是 | 作者昵称 |
| author.username | string | 是 | 作者用户名（`@xxx` 格式） |
| author.avatar | string | 是 | 作者头像 URL，可为空字符串 |
| content | string | 是 | 帖子内容，最长 280 字符 |
| timestamp | integer | 是 | 发布时间戳（毫秒） |
| likes | integer | 是 | 点赞数，最小值为 0 |
| isLiked | boolean | 是 | 当前用户是否已点赞 |
| comments | array | 是 | 评论列表，每项为 Comment 对象 |

**Comment 对象结构：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 评论唯一标识 |
| author | object | 是 | 评论作者信息 |
| author.name | string | 是 | 作者昵称 |
| author.username | string | 是 | 作者用户名（`@xxx` 格式） |
| author.avatar | string | 是 | 作者头像 URL，可为空字符串 |
| content | string | 是 | 评论内容，最长 280 字符 |
| timestamp | integer | 是 | 评论时间戳（毫秒） |

### 状态文件 `/state.json`

存储应用运行时状态，用于启动时恢复现场。前端在状态变更时自动保存并同步到云端。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| draftContent | string | 否 | 当前发帖输入框中的草稿内容 |
| currentUser | object | 是 | 当前登录用户信息 |
| currentUser.name | string | 是 | 用户昵称 |
| currentUser.username | string | 是 | 用户名（`@xxx` 格式） |
| currentUser.avatar | string | 是 | 头像 URL，可为空字符串 |

示例：

```json
{
  "draftContent": "正在编辑的草稿...",
  "currentUser": {
    "name": "当前用户",
    "username": "@current_user",
    "avatar": ""
  }
}
```

## 数据同步说明

### Agent 操作（Agent → 前端）

Agent 负责在云端完成文件的写入/修改/删除，完成后通过下发 Action 通知前端同步刷新。
前端收到 Action 后仅从云端读取最新数据，不再进行本地文件创建。

**Agent 创建帖子**:

1. Agent 在云端写入文件 `/posts/{id}.json`（内容为完整的帖子 JSON）
2. Agent 下发 `CREATE_POST` Action，params 携带 `filePath`（如 `/posts/{id}.json`）
3. 前端收到 Action 后从云端读取该文件，更新本地文件树和 UI

**Agent 更新/点赞/评论帖子**:

1. Agent 在云端修改帖子文件（更新内容、增加点赞、追加评论等）
2. Agent 下发对应 Action（`UPDATE_POST`/`LIKE_POST`/`UNLIKE_POST`/`COMMENT_POST`），params 携带 `filePath` 或 `postId`
3. 前端收到 Action 后从云端重新读取该帖子文件，替换本地数据并刷新 UI

**Agent 删除帖子**:

1. Agent 在云端删除帖子文件
2. Agent 下发 `DELETE_POST` Action，params 携带 `postId`
3. 前端收到 Action 后从本地文件树移除该帖子并刷新 UI

### 用户操作（前端 → 云端）

用户在前端的操作由前端代码自行处理，流程为：本地操作 → 同步到云端 → 上报 Action。

**用户创建帖子**:

1. 用户输入内容并点击发布
2. 前端生成帖子数据，写入本地文件系统 `/posts/{id}.json`
3. 前端同步文件到云端
4. 前端上报 `CREATE_POST` Action

**用户评论/点赞/删除**:

1. 用户在 UI 上操作
2. 前端更新本地文件系统
3. 前端同步到云端
4. 前端上报对应 Action

### 启动恢复

1. 前端调用 `initFromCloud()` 拉取所有文件
2. 读取 `/posts/` 目录下所有帖子文件，按时间排序后渲染
3. 读取 `/state.json` 恢复草稿内容和用户信息
