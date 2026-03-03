# 相册 数据指南

## 文件夹结构

```
/
└── images/                # 图片元数据目录
    ├── {id}.json         # 单张图片元数据（含图片地址等）
    └── ...
```

## 文件定义

### 图片目录 `/images/`

存储所有预存图片的元数据。每张图片一个 JSON 文件，文件名为图片 ID。

- 前端启动时从该目录读取所有文件，解析后以网格形式展示
- 本应用仅支持浏览，不支持在前端编辑、删除或新增
- 图片按 `createdAt` 降序排列展示

#### 图片文件 `{id}.json`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 图片唯一标识，与文件名一致（不含 `.json` 后缀） |
| src | string | 是 | 图片地址：data URL（如 `data:image/png;base64,...`）或 https URL |
| createdAt | integer | 是 | 创建时间戳（毫秒） |

示例：

```json
{
  "id": "img-001",
  "src": "data:image/jpeg;base64,/9j/4AAQ...",
  "createdAt": 1706000000000
}
```

或使用外链：

```json
{
  "id": "img-002",
  "src": "https://example.com/photo.jpg",
  "createdAt": 1706000000000
}
```

## 数据同步说明

### Agent 操作（Agent → 前端）

Agent 在云端新增或删除图片文件后，下发 `REFRESH` Action，前端收到后重新执行 `initFromCloud()` 并刷新列表。

### 用户操作

相册为只读应用，用户仅可浏览与点击大图查看，无上报 Action。
