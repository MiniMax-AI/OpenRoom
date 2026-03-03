# Album Data Guide

## Folder Structure

```
/
└── images/                # Image metadata directory
    ├── {id}.json         # Single image metadata (image URL, etc.)
    └── ...
```

## File Definitions

### Image Directory `/images/`

Stores metadata for all pre-stored images. Each image has a separate JSON file, named by image ID.

- On startup, the frontend reads all files from this directory and displays them in a grid layout
- This app is read-only; editing, deleting, or adding images from the frontend is not supported
- Images are displayed in descending order by `createdAt`

#### Image File `{id}.json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique image identifier, matches the filename (without `.json` extension) |
| src | string | Yes | Image URL: data URL (e.g., `data:image/png;base64,...`) or https URL |
| createdAt | integer | Yes | Creation timestamp (milliseconds) |

Example:

```json
{
  "id": "img-001",
  "src": "data:image/jpeg;base64,/9j/4AAQ...",
  "createdAt": 1706000000000
}
```

Or using an external link:

```json
{
  "id": "img-002",
  "src": "https://example.com/photo.jpg",
  "createdAt": 1706000000000
}
```

## Data Synchronization

### Agent Operations (Agent → Frontend)

After the Agent adds or deletes image files on the cloud, it dispatches the `REFRESH` Action. Upon receiving it, the frontend re-executes `initFromCloud()` and refreshes the list.

### User Operations

The album is a read-only app. Users can only browse and click to view full-size images. No Actions are reported.
