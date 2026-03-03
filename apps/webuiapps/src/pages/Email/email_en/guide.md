# Email Data Guide

## Important: Mailbox Ownership

This mailbox belongs to the **User**. All emails are viewed from the User's perspective. The `folder` field must be set accordingly:

- **`inbox`**: Emails received by the User. Emails sent by a Character to the User should be placed in `inbox`, because from the User's perspective, it is a received email.
- **`sent`**: Emails sent by the User. Only emails actively sent by the User should be placed in `sent`.
- **`drafts`**: The User's drafts.
- **`trash`**: Emails deleted by the User.

> **Common Mistake**: When a Character sends an email to the User, do NOT set `folder` to `sent`. Although the Character "sent" the email, from the User's perspective it is a **received email** and should be set to `inbox`.

## Folder Structure

```
/
├── emails/                 # Emails data directory
│   ├── {emailId}.json     # Single email file
│   └── ...
└── state.json             # App state file
```

## File Definitions

### Emails Directory `/emails/`

Stores all email data. Each email is saved as an independent JSON file, named by email ID.

- On startup, the frontend reads all files from this directory to render the email list
- When the Agent composes an email, it writes a new file directly
- Users can only view emails locally — composing, replying, and sending are not available
- Emails are displayed in descending order by `timestamp`

#### Email File `{emailId}.json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique email identifier, matches the filename (without `.json` extension) |
| from | object | Yes | Sender information |
| from.name | string | Yes | Sender name |
| from.address | string | Yes | Sender email address |
| to | array | Yes | Recipient list, each item is an EmailAddress object |
| cc | array | Yes | CC list, each item is an EmailAddress object, can be an empty array |
| subject | string | Yes | Email subject |
| content | string | Yes | Email body content |
| timestamp | integer | Yes | Send/receive timestamp (milliseconds) |
| isRead | boolean | Yes | Whether the email has been read |
| isStarred | boolean | Yes | Whether the email is starred |
| folder | string | Yes | Folder name, one of: `inbox`, `sent`, `drafts`, `trash` |

**EmailAddress Object Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Name |
| address | string | Yes | Email address |

Example:

```json
{
  "id": "1706000000000-a1b2c3d4e",
  "from": {
    "name": "John",
    "address": "john@example.com"
  },
  "to": [
    {
      "name": "Jane",
      "address": "jane@example.com"
    }
  ],
  "cc": [],
  "subject": "Discussion about project progress",
  "content": "Hi Jane,\n\nI'd like to discuss the current project progress with you.\n\nPhase one is now complete, and we can start working on phase two.\n\nAre you available for a meeting this week?\n\nBest regards,\nJohn",
  "timestamp": 1706000000000,
  "isRead": false,
  "isStarred": false,
  "folder": "inbox"
}
```

### State File `/state.json`

Stores the app's runtime state for restoring the session on startup. The frontend automatically saves and syncs to the cloud when state changes.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| selectedEmailId | string\|null | No | Currently selected email ID, null when none is selected |
| currentFolder | string | Yes | Current folder, one of: `inbox`, `sent`, `drafts`, `trash` |

Example:

```json
{
  "selectedEmailId": null,
  "currentFolder": "inbox"
}
```

## Data Synchronization

### Agent Operations (Agent → Frontend)

The Agent completes email file writes/deletions on the cloud, then dispatches Actions to notify the frontend to sync and refresh.
After receiving an Action, the frontend only reads the latest data from the cloud — it does not create files locally.

**Agent Composes an Email**:

1. The Agent writes the email file `/emails/{id}.json` on the cloud (containing the complete email JSON)
2. The Agent dispatches the `COMPOSE_EMAIL` Action with `filePath` in params (e.g., `/emails/{id}.json`)
3. The frontend reads the file from the cloud, updates the local file tree and UI

**Agent Deletes an Email**:

1. The Agent deletes the email file on the cloud
2. The Agent dispatches the `DELETE_EMAIL` Action with `emailId` in params
3. The frontend removes the email from the local file tree and refreshes the UI

**Agent Marks as Read**:

1. The Agent updates the email file on the cloud (`isRead` set to `true`)
2. The Agent dispatches the `MARK_READ` Action with `emailId` in params
3. The frontend re-reads the email file from the cloud and refreshes the UI

### User Operations (Frontend → Cloud)

User operations on the frontend are in read-only mode — composing, replying, and sending emails are not available. The operations users can perform are:

**User Reads an Email**:

1. User clicks an email to view details
2. The frontend automatically marks the email as read and updates the local file system
3. The frontend syncs to the cloud
4. The frontend reports the `READ_EMAIL` Action

**User Stars/Unstars an Email**:

1. User clicks the star button
2. The frontend updates the local file system
3. The frontend syncs to the cloud
4. The frontend reports the `STAR_EMAIL` or `UNSTAR_EMAIL` Action

**User Deletes an Email**:

1. User clicks the delete button
2. The frontend removes from the local file system
3. The frontend syncs to the cloud (deletes the cloud file)
4. The frontend reports the `DELETE_EMAIL` Action

### Startup Recovery

1. The frontend calls `initFromCloud()` to fetch all files
2. Reads all email files under `/emails/`, sorts by timestamp, and renders them
3. Reads `/state.json` to restore the current folder and selected email state
