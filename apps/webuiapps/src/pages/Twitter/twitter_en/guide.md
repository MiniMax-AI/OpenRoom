# Twitter Data Guide

## Folder Structure

```
/
├── posts/                  # Posts data directory
│   ├── {postId}.json      # Single post file
│   └── ...
└── state.json             # App state file
```

## File Definitions

### Posts Directory `/posts/`

Stores all post data. Each post is saved as an independent JSON file, named by post ID.

- On startup, the frontend reads all files from this directory to render the post list
- When the Agent creates a post, it writes a new file directly
- When a user creates a post, the frontend creates the file and syncs to the cloud
- Posts are displayed in descending order by `timestamp`

#### Post File `{postId}.json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique post identifier, matches the filename (without `.json` extension) |
| author | object | Yes | Author information |
| author.name | string | Yes | Author display name |
| author.username | string | Yes | Author username (`@xxx` format) |
| author.avatar | string | Yes | Author avatar URL, can be an empty string |
| content | string | Yes | Post content, max 280 characters |
| timestamp | integer | Yes | Publication timestamp (milliseconds) |
| likes | integer | Yes | Like count, minimum 0 |
| isLiked | boolean | Yes | Whether the current user has liked this post |
| comments | array | Yes | Comment list, each item is a Comment object |

**Comment Object Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique comment identifier |
| author | object | Yes | Comment author information |
| author.name | string | Yes | Author display name |
| author.username | string | Yes | Author username (`@xxx` format) |
| author.avatar | string | Yes | Author avatar URL, can be an empty string |
| content | string | Yes | Comment content, max 280 characters |
| timestamp | integer | Yes | Comment timestamp (milliseconds) |

### State File `/state.json`

Stores the app's runtime state for restoring the session on startup. The frontend automatically saves and syncs to the cloud when state changes.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| draftContent | string | No | Current draft content in the post input box |
| currentUser | object | Yes | Current logged-in user information |
| currentUser.name | string | Yes | User display name |
| currentUser.username | string | Yes | Username (`@xxx` format) |
| currentUser.avatar | string | Yes | Avatar URL, can be an empty string |

Example:

```json
{
  "draftContent": "Draft being edited...",
  "currentUser": {
    "name": "Current User",
    "username": "@current_user",
    "avatar": ""
  }
}
```

## Data Synchronization

### Agent Operations (Agent → Frontend)

The Agent completes file writes/modifications/deletions on the cloud, then dispatches Actions to notify the frontend to sync and refresh.
After receiving an Action, the frontend only reads the latest data from the cloud — it does not create files locally.

**Agent Creates a Post**:

1. The Agent writes the file `/posts/{id}.json` on the cloud (containing the complete post JSON)
2. The Agent dispatches the `CREATE_POST` Action with `filePath` in params (e.g., `/posts/{id}.json`)
3. The frontend reads the file from the cloud, updates the local file tree and UI

**Agent Updates/Likes/Comments on a Post**:

1. The Agent modifies the post file on the cloud (updates content, adds likes, appends comments, etc.)
2. The Agent dispatches the corresponding Action (`UPDATE_POST`/`LIKE_POST`/`UNLIKE_POST`/`COMMENT_POST`) with `filePath` or `postId` in params
3. The frontend re-reads the post file from the cloud, replaces local data, and refreshes the UI

**Agent Deletes a Post**:

1. The Agent deletes the post file on the cloud
2. The Agent dispatches the `DELETE_POST` Action with `postId` in params
3. The frontend removes the post from the local file tree and refreshes the UI

### User Operations (Frontend → Cloud)

User operations on the frontend are handled by the frontend code. The flow is: local operation → sync to cloud → report Action.

**User Creates a Post**:

1. User enters content and clicks publish
2. The frontend generates post data and writes it to the local file system at `/posts/{id}.json`
3. The frontend syncs the file to the cloud
4. The frontend reports the `CREATE_POST` Action

**User Comments/Likes/Deletes**:

1. User operates on the UI
2. The frontend updates the local file system
3. The frontend syncs to the cloud
4. The frontend reports the corresponding Action

### Startup Recovery

1. The frontend calls `initFromCloud()` to fetch all files
2. Reads all post files under `/posts/`, sorts by timestamp, and renders them
3. Reads `/state.json` to restore draft content and user information
