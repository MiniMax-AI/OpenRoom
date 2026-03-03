# Diary Data Guide

## Folder Structure

```
/
├── entries/                # Diary entries data directory
│   ├── {entryId}.json     # Single diary entry file
│   └── ...
└── state.json             # App state file
```

## File Definitions

### Entries Directory `/entries/`

Stores all diary entry data. Each entry is saved as an independent JSON file, named by entry ID.

- On startup, the frontend reads all files from this directory to render the calendar and diary content
- When the Agent creates a diary entry, it writes a new file directly
- When a user creates or edits a diary entry, the frontend creates/updates the file and syncs to the cloud
- Each date can have at most one entry; entries are browsed by date via the calendar navigator

#### Diary Entry File `{entryId}.json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique diary entry identifier, matches the filename (without `.json` extension) |
| date | string | Yes | Date in YYYY-MM-DD format (e.g., `2026-02-12`), at most one entry per day |
| title | string | Yes | Diary title, can be an empty string |
| content | string | Yes | Diary content, supports Markdown and special markup syntax, can be an empty string |
| mood | string | No | Mood tag: `happy` / `sad` / `neutral` / `excited` / `tired` / `anxious` / `hopeful` / `angry` |
| weather | string | No | Weather tag: `sunny` / `cloudy` / `rainy` / `snowy` / `windy` / `foggy` |
| createdAt | integer | Yes | Creation timestamp (milliseconds) |
| updatedAt | integer | Yes | Last updated timestamp (milliseconds) |

Example:

```json
{
  "id": "1706000000000-a1b2c3d4e",
  "date": "2026-02-12",
  "title": "Weekend Walk",
  "content": "The weather was great today. I took a walk in the park for an hour.\n\nThe willows by the lake are starting to sprout — {{strike}}winter isn't over yet{{/strike}} spring is coming.",
  "mood": "happy",
  "weather": "sunny",
  "createdAt": 1706000000000,
  "updatedAt": 1706003600000
}
```

#### Special Content Markup

Diary content supports the following hand-drawn effect markups. In preview mode, they render as animated SVG decorations:

| Markup | Effect | Description |
|--------|--------|-------------|
| `{{strike}}text{{/strike}}` | Hand-drawn strikethrough | Red wavy line through text |
| `{{scribble}}text{{/scribble}}` | Scribble cross-out | Double dark strikethrough lines |
| `{{messy}}text{{/messy}}` | Messy scribble | Zigzag scribble covering text |

### State File `/state.json`

Stores the app's runtime state for restoring the session on startup. The frontend automatically saves and syncs to the cloud when the selected date changes.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| selectedDate | string \| null | Yes | Currently selected date (YYYY-MM-DD), null when nothing is selected |

Example:

```json
{
  "selectedDate": "2026-02-12"
}
```

## Data Synchronization

### Agent Operations (Agent → Frontend)

The Agent completes file writes/modifications/deletions on the cloud, then dispatches Actions to notify the frontend to sync and refresh.
After receiving an Action, the frontend only reads the latest data from the cloud — it does not create files locally.

**Agent Creates a Diary Entry**:

1. The Agent writes the file `/entries/{id}.json` on the cloud (containing the complete diary entry JSON, must include `date` field)
2. The Agent dispatches the `CREATE_ENTRY` Action with `filePath` in params (e.g., `/entries/{id}.json`)
3. The frontend reads the file from the cloud, updates the local file tree and calendar, and auto-navigates to that date

**Agent Updates a Diary Entry**:

1. The Agent modifies the diary file on the cloud (updates title, content, mood, weather, etc.)
2. The Agent dispatches the `UPDATE_ENTRY` Action with `filePath` in params
3. The frontend re-reads the file from the cloud, replaces local data, and refreshes the UI

**Agent Deletes a Diary Entry**:

1. The Agent deletes the diary file on the cloud
2. The Agent dispatches the `DELETE_ENTRY` Action with `entryId` in params
3. The frontend removes the entry from the local file tree and refreshes the UI

**Agent Selects a Diary Entry**:

1. The Agent dispatches the `SELECT_ENTRY` Action with `entryId` in params
2. The frontend navigates the calendar to the date of that entry and displays its content

**Agent Navigates to a Date**:

1. The Agent dispatches the `SELECT_DATE` Action with `date` in params (YYYY-MM-DD)
2. The frontend navigates the calendar to that date and displays the corresponding entry (if exists)

### User Operations (Frontend → Cloud)

User operations on the frontend are handled by the frontend code. The flow is: local operation → sync to cloud → report Action.

**User Creates a Diary Entry**:

1. User selects a date on the calendar and clicks the "Write one" button
2. The frontend generates diary data (including `date` field) and writes it to the local file system at `/entries/{id}.json`
3. The frontend syncs the file to the cloud
4. The frontend reports the `CREATE_ENTRY` Action

**User Edits a Diary Entry**:

1. User modifies the title or content in the editor (switches to edit mode)
2. The frontend debounces for 800ms, then saves, updates the local file, and syncs to the cloud
3. The frontend reports the `UPDATE_ENTRY` Action

**User Sets Mood/Weather**:

1. User clicks the mood or weather icon and selects from the dropdown
2. The frontend immediately saves and syncs to the cloud
3. The frontend reports the `UPDATE_ENTRY` Action (with mood or weather field)

**User Deletes a Diary Entry**:

1. User clicks the delete button
2. The frontend removes `/entries/{id}.json` from the local file system and syncs the deletion to the cloud
3. The calendar marker for that date disappears
4. The frontend reports the `DELETE_ENTRY` Action

### Startup Recovery

1. The frontend calls `initFromCloud()` to fetch all files
2. Reads all diary files under `/entries/`, builds a date index for each entry
3. Reads `/state.json` to restore the previously selected date, and navigates the calendar to that month
4. If no saved state, defaults to today
