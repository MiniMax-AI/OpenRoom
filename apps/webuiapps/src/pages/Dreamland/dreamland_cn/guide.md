# 梦境 数据指南

## 目录结构

```
apps/dreamland/data/
├── dreamspaces/
│   ├── {id}.json        # 每个梦境一个文件
│   └── ...
├── images/
│   └── {id}-{timestamp}.jpg|png   # 绘制的背景（由应用写入）
├── avatar/
│   └── companion.vrm    # 用户上传的 3D 伙伴模型（二进制）
└── state.json           # 当前梦境、声音、3D 模型和倾斜偏好
```

## 文件定义

### 梦境 `/dreamspaces/{id}.json`

| 字段           | 类型           | 必填 | 说明                                                                                                                                |
| -------------- | -------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| id             | string         | 是   | 唯一 id，必须与不含 `.json` 的文件名一致                                                                                            |
| name           | string         | 是   | 顶栏显示的梦境名称（最多 60 字符）                                                                                                  |
| scenePrompt    | string         | 是   | 地点描述，用于绘制背景（最多 600 字符）                                                                                             |
| backgroundUrl  | string \| null | 否   | 背景图：`https://` 地址、`/api/session-data?...` 地址（例如来自 `generate_image`）或 `data:image/...` 地址。`null` 时显示绘制的天空 |
| timeOfDay      | string         | 是   | `dawn` \| `day` \| `dusk` \| `night`                                                                                                |
| weather        | string         | 是   | `clear` \| `rain` \| `snow` \| `fog` \| `fireflies` \| `stars` \| `petals`                                                          |
| mood           | string         | 是   | `serene` \| `mystical` \| `warm` \| `melancholic` \| `energetic`                                                                    |
| ambientSound   | string         | 是   | `none` \| `rain` \| `wind` \| `ocean` \| `night` \| `drone`                                                                         |
| expression     | string         | 是   | 形象表情：`happy` \| `shy` \| `peaceful` \| `depressing` \| `angry`                                                                 |
| caption        | string         | 否   | 形象上方显示的短句（最多 140 字符），为空则隐藏                                                                                     |
| autoBackground | boolean        | 否   | 默认 `true`：梦境打开时若没有背景则自动绘制。用户选择绘制的天空时应用会设为 `false`                                                 |
| createdAt      | number         | 是   | 创建时间，毫秒时间戳                                                                                                                |
| updatedAt      | number         | 是   | 最后修改时间，毫秒时间戳（最新的梦境排在最前）                                                                                      |

应用读取文件时，无效或缺失的值会被替换为默认值（timeOfDay `dusk`、weather `clear`、mood
`serene`、ambientSound `none`、expression `peaceful`）。

```json
{
  "id": "dream-lighthouse",
  "name": "Lighthouse Cove",
  "scenePrompt": "A small lighthouse on a rocky cove, waves crashing below, gulls circling",
  "backgroundUrl": null,
  "timeOfDay": "dusk",
  "weather": "fog",
  "mood": "melancholic",
  "ambientSound": "ocean",
  "expression": "peaceful",
  "caption": "",
  "autoBackground": true,
  "createdAt": 1794268800000,
  "updatedAt": 1794268800000
}
```

### 背景图 `/images/`

绘制背景时由应用写入（“生成背景”按钮、SET_SCENE、REGENERATE_BACKGROUND，或打开没有图片的梦境时自动绘制）。不要自行写入此目录；请通过
`backgroundUrl` 引用图片。

### 3D 伙伴模型 `/avatar/companion.vrm`

用户在应用中上传的 VRM 模型（例如用 VRoid
Studio 制作）。二进制文件，请不要自行写入或删除。开发服务器无法存储文件时，应用会改为保存在浏览器中（`state.json`
中 `storage: "browser"`）。

### 状态文件 `/state.json`

| 字段               | 类型           | 默认值  | 说明                                                                                                                                 |
| ------------------ | -------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| activeDreamspaceId | string \| null | `null`  | 屏幕上显示的梦境（为 null 或未知时显示第一个）                                                                                       |
| soundEnabled       | boolean        | `false` | 是否开启环境音。用户点击屏幕后才会开始播放                                                                                           |
| volume             | number         | `0.6`   | 环境音音量，0 到 1                                                                                                                   |
| avatarModel        | object \| null | `null`  | 3D 伙伴模型：`fileName`（字符串）、`size`（字节）、`updatedAt`（毫秒）、`storage`（`server` \| `browser`）。为 `null` 时显示梦之精灵 |
| motionEnabled      | boolean        | `false` | 场景随设备倾斜移动（手机/平板）                                                                                                      |

```json
{
  "activeDreamspaceId": "seed-starlit-lake",
  "soundEnabled": true,
  "volume": 0.6,
  "avatarModel": null,
  "motionEnabled": false
}
```

## 数据同步说明

### Agent 创建数据

1. 写入包含上述全部字段的 `/dreamspaces/{id}.json`。
2. 发送 `CREATE_DREAMSPACE`，`filePath` =
   `/dreamspaces/{id}.json`；应用读取文件、添加梦境并切换过去。
3. 可选：发送 `SET_SCENE`（同一 `dreamspaceId`）绘制背景。

修改已有梦境时优先使用操作类 Action（`SET_WEATHER`、`SET_EXPRESSION`
等）：它们会替你更新并保存文件。如果直接重写文件，请发送 `UPDATE_DREAMSPACE`。删除文件后发送
`DELETE_DREAMSPACE`。写入 `state.json` 后发送 `SYNC_STATE`。

### 用户创建数据

用户在应用中创建、重命名、编辑和删除梦境。修改立即生效，并在半秒内保存到
`/dreamspaces/{id}.json`。每次用户修改都会作为 Action 上报给你（`CREATE_DREAMSPACE`、`RENAME_DREAMSPACE`、`regenerate: "false"`
的 `SET_SCENE`、
`SET_WEATHER`、`SET_TIME_OF_DAY`、`SET_MOOD`、`SET_AMBIENT_SOUND`、`SET_EXPRESSION`、`REGENERATE_BACKGROUND`、
`SWITCH_DREAMSPACE`、`DELETE_DREAMSPACE`、`TOGGLE_SOUND`，用户点击你的形象时的
`POKE_AVATAR`，以及用户给你 3D 身体或移除它时的 `SET_AVATAR_MODEL` /
`CLEAR_AVATAR_MODEL`），方便你回应用户的创作。

### 启动恢复

启动时应用先检查 `state.json` 是否存在。首次启动时用默认值创建 `state.json`
并写入三个初始梦境。然后加载 `/dreamspaces/` 下的所有文件，从 `state.json`
恢复当前梦境、声音、3D 模型和倾斜偏好，并显示场景。如果当前梦境没有图片且已配置图像生成，会自动绘制一次。
