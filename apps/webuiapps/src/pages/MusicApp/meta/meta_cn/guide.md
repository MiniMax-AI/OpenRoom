# MusicApp 数据指南

## 文件夹结构

```text
apps/musicPlayer/data/
├── songs/
│   ├── {id}.json
│   └── ...
├── playlists/
│   ├── {id}.json
│   └── ...
└── state.json
```

## 文件定义

### Songs `/songs/`

歌曲数据集合，每首歌曲一个 JSON 文件。文件名为 `{id}.json`，由 App 或 Agent 在创建时写入。

#### 歌曲文件 `{id}.json`

| Field      | Type   | Required | Description                          |
| ---------- | ------ | -------- | ------------------------------------ |
| id         | string | 是       | 歌曲唯一标识，如 `song-001`          |
| title      | string | 是       | 歌曲标题                             |
| artist     | string | 是       | 艺术家名称                           |
| album      | string | 是       | 专辑名称                             |
| duration   | number | 是       | 时长（秒）                           |
| coverColor | string | 是       | 封面颜色（hex，如 `#6366F1`）        |
| createdAt  | number | 是       | 创建时间戳（毫秒）                   |
| audioUrl   | string | 是       | 音频文件 URL                         |

```json
{
  "id": "song-001",
  "title": "Midnight Dreams",
  "artist": "Luna Echo",
  "album": "Starlight Sessions",
  "duration": 234,
  "coverColor": "#6366F1",
  "createdAt": 1707350400000,
  "audioUrl": "/music/midnight-dreams.mp3"
}
```

### Playlists `/playlists/`

播放列表数据集合，每个播放列表一个 JSON 文件。文件名为 `{id}.json`。

#### 播放列表文件 `{id}.json`

| Field     | Type     | Required | Description                              |
| --------- | -------- | -------- | ---------------------------------------- |
| id        | string   | 是       | 播放列表唯一标识，如 `playlist-001`      |
| name      | string   | 是       | 播放列表名称                             |
| songIds   | string[] | 是       | 歌曲 ID 列表                            |
| createdAt | number   | 是       | 创建时间戳（毫秒）                       |

```json
{
  "id": "playlist-001",
  "name": "Chill Vibes",
  "songIds": ["song-001", "song-002", "song-005"],
  "createdAt": 1707350400000
}
```

### 状态文件 `/state.json`

应用运行时状态文件，用于现场恢复和跨端状态同步。App 启动时读取此文件恢复上次状态，运行中定期保存。

| Field            | Type           | Default     | Description                                        |
| ---------------- | -------------- | ----------- | -------------------------------------------------- |
| currentView      | string         | "all-songs" | 当前视图（`"all-songs"` \| `"playlist"`）          |
| activePlaylistId | string \| null | null        | 当前选中的播放列表 ID                              |
| player           | object         | -           | 播放器状态对象（见下表）                           |
| searchQuery      | string         | ""          | 当前搜索关键词                                     |

#### Player State（嵌套在 `player` 中）

| Field                  | Type           | Default      | Description                                                  |
| ---------------------- | -------------- | ------------ | ------------------------------------------------------------ |
| currentSongId          | string \| null | null         | 当前播放歌曲 ID                                              |
| currentPlaylistContext | string \| null | null         | 当前播放上下文的播放列表 ID                                  |
| isPlaying              | boolean        | false        | 是否正在播放                                                 |
| currentTime            | number         | 0            | 当前播放进度（秒）                                           |
| volume                 | number         | 0.7          | 音量（0.0 - 1.0）                                            |
| playMode               | string         | "sequential" | 播放模式（`"sequential"` \| `"repeat-one"` \| `"shuffle"`）  |

```json
{
  "currentView": "all-songs",
  "activePlaylistId": null,
  "player": {
    "currentSongId": null,
    "currentPlaylistContext": null,
    "isPlaying": false,
    "currentTime": 0,
    "volume": 0.7,
    "playMode": "sequential"
  },
  "searchQuery": ""
}
```

## 数据同步说明

### Agent 创建数据

1. Agent 将歌曲/播放列表 JSON 文件写入 NAS 对应目录（`/songs/{id}.json` 或 `/playlists/{id}.json`）
2. Agent 下发数据变更类 Action（如 `CREATE_SONG`、`CREATE_PLAYLIST`）
3. App 收到 Action 后调用对应 Repo 的 `refresh()` 方法从云端拉取最新数据
4. UI 自动更新显示新数据

### 用户创建数据

1. 用户在 App 中操作（如创建播放列表、添加歌曲到播放列表）
2. App 将数据写入云端（`syncToCloud`）
3. App 调用 `reportAction` 上报用户操作（如 `reportAction('CREATE_PLAYLIST', { playlistId: '...' })`）

### 启动恢复

1. App 启动，上报 `DOM_READY` 生命周期
2. 调用 `initFromCloud()` 从 NAS 拉取所有数据（songs、playlists、state.json）
3. 读取 `state.json`，恢复 `currentView`、`activePlaylistId`、`player` 等状态到内存
4. UI 渲染完成，上报 `READY` 生命周期
5. App 进入就绪状态，开始接收 Agent Action
