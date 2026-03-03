# CyberNews 开发指南

## 概述

赛博朋克2077夜之城风格的新闻终端与调查板应用。包含新闻浏览、文章阅读和案件调查板三个核心功能。

## 数据结构

### Article（新闻文章）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一标识 |
| title | string | 标题（大写） |
| category | 'breaking' \| 'corporate' \| 'street' \| 'tech' | 分类 |
| summary | string | 摘要 |
| content | string | 正文 |
| imageUrl | string | 配图URL（可为空） |
| publishedAt | string | 发布时间 ISO 格式 |

### Case（调查案件）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一标识 |
| caseNumber | string | 案件编号 |
| title | string | 案件标题 |
| status | 'open' \| 'closed' \| 'classified' | 状态 |
| clues | Clue[] | 线索列表 |

### Clue（线索卡片）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一标识 |
| type | 'press' \| 'report' \| 'document' \| 'message' \| 'note' | 类型 |
| title | string | 标题 |
| content | string | 内容 |
| posX | number | 在调查板上的X坐标 |
| posY | number | 在调查板上的Y坐标 |

### AppState（应用状态）

| 字段 | 类型 | 默认值 |
|------|------|--------|
| currentView | 'news' \| 'case-board' | 'news' |
| selectedArticleId | string \| null | null |
| selectedCaseId | string \| null | null |
| newsFilter | ArticleCategory \| null | null |

## 存储结构

```
/articles/{id}.json    # 新闻文章
/cases/{id}.json       # 调查案件（含线索）
/state.json            # 应用状态
```

## 视图

1. **新闻首页**：左侧大图头条 + 右侧新闻列表，底部BREAKING NEWS滚动条
2. **文章详情**：全屏阅读模式
3. **调查板**：左侧案件列表 + 右侧软木板画布，线索卡片可拖拽

## Action 执行方式

### 数据变更类 Action（CREATE / UPDATE / DELETE）

数据变更类 Action 遵循**先写文件再通知**的模式。Agent 必须：

1. **先将数据文件写入** NAS 存储
2. **再发送 Action** 通知 App 刷新 UI

创建文章示例流程：

```
第1步：调用当前可用的生图能力，为新闻生成配图，得到图片 URL
第2步：将完整的 Article JSON（含 imageUrl）写入 /articles/{文章id}.json（路径由文章 id 决定）
第3步：发送 CREATE_ARTICLE action → App 从存储刷新文章列表
```

**创建新闻需要生图**：Article 的 imageUrl 需填写配图地址。请先使用当前环境提供的生图工具/能力生成赛博朋克/夜之城风格的新闻配图，再将返回的 URL 填入 imageUrl 后写入文章文件。

创建案件示例流程：

```
第1步：将完整的 Case JSON（含 clues 数组）写入 /cases/{案件id}.json（路径由案件 id 决定）
第2步：发送 CREATE_CASE action → App 从存储刷新案件列表
```

**重要**：App 不会根据 Action 参数创建文件，它只从存储中读取已有文件。如果发送 CREATE_ARTICLE 但没有事先写入文件，文章不会出现。

### 操作类 Action（VIEW / SELECT / FILTER / MOVE）

操作类 Action 立即执行，无需写文件。直接发送 Action 及正确参数即可。

### 刷新类 Action

发送 REFRESH_ARTICLES 或 REFRESH_CASES 强制 App 重新读取存储中的所有数据。可用 `navigateTo` 参数切换视图，`focusId` 参数自动选中某项。
