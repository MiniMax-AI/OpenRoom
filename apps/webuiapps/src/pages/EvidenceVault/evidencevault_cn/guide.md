# 档案库 数据指南

## 文件夹结构

```
/
└── files/              # 档案文件集合
    ├── {id}.json       # 单条档案记录
    └── ...
```

## 文件定义

### 档案文件集合 `/files/`

存放所有档案文件，每个文件代表一条证据/档案记录。数据为静态只读，预先存储在云端。

文件命名规则：`{id}.json`，其中 `id` 为全局唯一标识。

#### 档案文件 `{id}.json`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 档案唯一标识 |
| title | string | 是 | 档案标题 |
| description | string | 是 | 档案描述摘要 |
| content | string | 是 | 档案正文内容 |
| type | string | 是 | 档案类型：`video` / `log` / `transaction` / `document` / `image` / `audio` / `chat` / `email` / `contract` / `report` / `trace` / `relation` |
| category | string | 是 | 所属分类：`identity` / `family` / `money` / `reputation` / `incident` / `secret` / `other` |
| impact | string | 是 | 影响类型：`vindicate`（正面）/ `expose`（负面）/ `neutral`（中性）/ `mixed`（复合） |
| source | string | 是 | 档案来源 |
| timestamp | number | 是 | 档案时间戳（Unix 毫秒） |
| credibility | number | 是 | 可信度（0-100） |
| importance | number | 是 | 重要性（0-100） |
| tags | string[] | 是 | 标签数组 |
| vindicateText | string | 否 | 正面影响说明 |
| exposeText | string | 否 | 负面影响说明 |

示例：

```json
{
  "id": "ev_001",
  "title": "银行转账记录",
  "description": "2024年3月至6月的银行账户流水明细",
  "content": "2024-03-15 转入 ¥50,000 来源：工资\n2024-04-01 转出 ¥12,000 用途：房租\n...",
  "type": "transaction",
  "category": "money",
  "impact": "vindicate",
  "source": "银行系统导出",
  "timestamp": 1710460800000,
  "credibility": 95,
  "importance": 80,
  "tags": ["财务", "银行", "转账"],
  "vindicateText": "转账记录证明资金来源合法",
  "exposeText": null
}
```

## 数据同步说明

### 静态只读模式

本应用为**纯静态只读展示**，不提供任何写操作：

- 用户不进行任何写操作（无创建、修改、删除）
- Agent 不进行任何写操作（无 action 下发）
- 数据预先存储在云端 `/files/` 目录下

### 用户操作

用户仅可执行以下只读操作（纯前端，不涉及云端交互）：

- 浏览档案列表
- 按分类筛选
- 搜索关键词
- 查看档案详情

### 启动恢复

前端启动时调用 `initFromCloud()` 从云端拉取 `/files/` 目录下的所有档案文件。若目录为空，则显示空状态。
