# MusicApp Data Guide

## Folder Structure

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

## File Definitions

### Songs `/songs/`

Song data collection, one JSON file per song. File name is `{id}.json`, written by the App or Agent upon creation.

#### Song File `{id}.json`

| Field      | Type   | Required | Description                              |
| ---------- | ------ | -------- | ---------------------------------------- |
| id         | string | Yes      | Unique song identifier, e.g. `song-001`  |
| title      | string | Yes      | Song title                               |
| artist     | string | Yes      | Artist name                              |
| album      | string | Yes      | Album name                               |
| duration   | number | Yes      | Duration in seconds                      |
| coverColor | string | Yes      | Cover color (hex, e.g. `#6366F1`)        |
| createdAt  | number | Yes      | Creation timestamp (milliseconds)        |
| audioUrl   | string | Yes      | Audio file URL                           |

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

Playlist data collection, one JSON file per playlist. File name is `{id}.json`.

#### Playlist File `{id}.json`

| Field     | Type     | Required | Description                                  |
| --------- | -------- | -------- | -------------------------------------------- |
| id        | string   | Yes      | Unique playlist identifier, e.g. `playlist-001` |
| name      | string   | Yes      | Playlist name                                |
| songIds   | string[] | Yes      | List of song IDs                             |
| createdAt | number   | Yes      | Creation timestamp (milliseconds)            |

```json
{
  "id": "playlist-001",
  "name": "Chill Vibes",
  "songIds": ["song-001", "song-002", "song-005"],
  "createdAt": 1707350400000
}
```

### State File `/state.json`

Runtime state file for session recovery and cross-device state synchronization. The App reads this file on startup to restore the previous state, and periodically saves during runtime.

| Field            | Type           | Default     | Description                                        |
| ---------------- | -------------- | ----------- | -------------------------------------------------- |
| currentView      | string         | "all-songs" | Current view (`"all-songs"` \| `"playlist"`)       |
| activePlaylistId | string \| null | null        | Currently selected playlist ID                     |
| player           | object         | -           | Player state object (see below)                    |
| searchQuery      | string         | ""          | Current search keyword                             |

#### Player State (nested in `player`)

| Field                  | Type           | Default      | Description                                                  |
| ---------------------- | -------------- | ------------ | ------------------------------------------------------------ |
| currentSongId          | string \| null | null         | Currently playing song ID                                    |
| currentPlaylistContext | string \| null | null         | Playlist ID of current playback context                      |
| isPlaying              | boolean        | false        | Whether audio is currently playing                           |
| currentTime            | number         | 0            | Current playback position in seconds                         |
| volume                 | number         | 0.7          | Volume level (0.0 - 1.0)                                    |
| playMode               | string         | "sequential" | Play mode (`"sequential"` \| `"repeat-one"` \| `"shuffle"`) |

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

## Data Synchronization

### Agent Creates Data

1. Agent writes song/playlist JSON files to the corresponding NAS directory (`/songs/{id}.json` or `/playlists/{id}.json`)
2. Agent sends a data mutation Action (e.g. `CREATE_SONG`, `CREATE_PLAYLIST`)
3. App receives the Action and calls the corresponding Repo's `refresh()` method to pull latest data from cloud
4. UI automatically updates to display new data

### User Creates Data

1. User performs an operation in the App (e.g. create playlist, add song to playlist)
2. App writes data to cloud (`syncToCloud`)
3. App calls `reportAction` to report the user operation (e.g. `reportAction('CREATE_PLAYLIST', { playlistId: '...' })`)

### Startup Recovery

1. App starts, reports `DOM_READY` lifecycle event
2. Calls `initFromCloud()` to pull all data from NAS (songs, playlists, state.json)
3. Reads `state.json`, restores `currentView`, `activePlaylistId`, `player` and other state to memory
4. UI rendering completes, reports `READY` lifecycle event
5. App enters ready state and begins accepting Agent Actions
