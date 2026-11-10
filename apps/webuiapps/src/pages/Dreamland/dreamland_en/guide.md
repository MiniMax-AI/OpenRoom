# Dreamland Data Guide

## Folder Structure

```
apps/dreamland/data/
├── dreamspaces/
│   ├── {id}.json        # one file per dream
│   └── ...
├── images/
│   └── {id}-{timestamp}.jpg|png   # painted backgrounds (written by the app)
└── state.json           # active dream + sound preferences
```

## File Definitions

### Dreams `/dreamspaces/{id}.json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique id; must equal the file name without `.json` |
| name | string | Yes | Dream name shown in the top bar (max 60 chars) |
| scenePrompt | string | Yes | Description of the place, used to paint the background (max 600 chars) |
| backgroundUrl | string \| null | No | Background image: an `https://` URL, a `/api/session-data?...` URL (e.g. from `generate_image`) or a `data:image/...` URL. `null` shows a painted sky |
| timeOfDay | string | Yes | `dawn` \| `day` \| `dusk` \| `night` |
| weather | string | Yes | `clear` \| `rain` \| `snow` \| `fog` \| `fireflies` \| `stars` \| `petals` |
| mood | string | Yes | `serene` \| `mystical` \| `warm` \| `melancholic` \| `energetic` |
| ambientSound | string | Yes | `none` \| `rain` \| `wind` \| `ocean` \| `night` \| `drone` |
| expression | string | Yes | Avatar expression: `happy` \| `shy` \| `peaceful` \| `depressing` \| `angry` |
| caption | string | No | Short line shown above the avatar (max 140 chars); empty hides it |
| createdAt | number | Yes | Creation time, ms since epoch |
| updatedAt | number | Yes | Last change, ms since epoch (newest dreams are listed first) |

Invalid or missing values are replaced by defaults when the app reads the file
(timeOfDay `dusk`, weather `clear`, mood `serene`, ambientSound `none`, expression `peaceful`).

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
  "createdAt": 1794268800000,
  "updatedAt": 1794268800000
}
```

### Background images `/images/`

Written by the app when a background is painted (Generate background button, SET_SCENE or
REGENERATE_BACKGROUND). Do not write here yourself; reference images through `backgroundUrl`.

### State File `/state.json`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| activeDreamspaceId | string \| null | `null` | Dream shown on screen (first dream when null or unknown) |
| soundEnabled | boolean | `false` | Whether ambient sound is on. Audio only starts after the user taps the screen |
| volume | number | `0.6` | Ambient volume, 0 to 1 |

```json
{
  "activeDreamspaceId": "seed-starlit-lake",
  "soundEnabled": true,
  "volume": 0.6
}
```

## Data Sync Description

### Agent Creates Data
1. Write `/dreamspaces/{id}.json` with all fields above.
2. Send `CREATE_DREAMSPACE` with `filePath` = `/dreamspaces/{id}.json`; the app reads the file, adds the dream and
   switches to it.
3. Optionally send `SET_SCENE` (with the same `dreamspaceId`) to paint its background.

To change an existing dream, prefer the operation actions (`SET_WEATHER`, `SET_EXPRESSION`, ...): they update
and save the file for you. If you rewrite a file directly, send `UPDATE_DREAMSPACE`. After deleting a file, send
`DELETE_DREAMSPACE`. After writing `state.json`, send `SYNC_STATE`.

### User Creates Data
The user creates, renames, edits and deletes dreams in the app. Changes apply instantly and are saved to
`/dreamspaces/{id}.json` within half a second. Each user change is reported to you as an action
(`CREATE_DREAMSPACE`, `RENAME_DREAMSPACE`, `SET_SCENE` with `regenerate: "false"`, `SET_WEATHER`,
`SET_TIME_OF_DAY`, `SET_MOOD`, `SET_AMBIENT_SOUND`, `SET_EXPRESSION`, `REGENERATE_BACKGROUND`,
`SWITCH_DREAMSPACE`, `DELETE_DREAMSPACE`, `TOGGLE_SOUND`, `POKE_AVATAR` when the user taps your avatar) so you
can react to what they build.

### Startup Recovery
On start the app checks whether `state.json` exists. On the very first start it creates `state.json` with
defaults and writes two starter dreams. Then it loads all files in `/dreamspaces/`, restores the active dream
and sound preferences from `state.json`, and shows the scene.
