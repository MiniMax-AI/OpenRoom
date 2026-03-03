# Evidence Vault Data Guide

## Folder Structure

```
/
└── files/              # Evidence file collection
    ├── {id}.json       # Single evidence record
    └── ...
```

## File Definitions

### Evidence File Collection `/files/`

Stores all evidence files, each representing a single evidence/archive record. Data is static and read-only, pre-stored on the cloud.

File naming convention: `{id}.json`, where `id` is a globally unique identifier.

#### Evidence File `{id}.json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique evidence identifier |
| title | string | Yes | Evidence title |
| description | string | Yes | Evidence summary |
| content | string | Yes | Evidence body content |
| type | string | Yes | Evidence type: `video` / `log` / `transaction` / `document` / `image` / `audio` / `chat` / `email` / `contract` / `report` / `trace` / `relation` |
| category | string | Yes | Category: `identity` / `family` / `money` / `reputation` / `incident` / `secret` / `other` |
| impact | string | Yes | Impact type: `vindicate` (positive) / `expose` (negative) / `neutral` / `mixed` |
| source | string | Yes | Evidence source |
| timestamp | number | Yes | Timestamp (Unix milliseconds) |
| credibility | number | Yes | Credibility score (0-100) |
| importance | number | Yes | Importance score (0-100) |
| tags | string[] | Yes | Tag array |
| vindicateText | string | No | Positive impact description |
| exposeText | string | No | Negative impact description |

Example:

```json
{
  "id": "ev_001",
  "title": "Bank Transfer Records",
  "description": "Bank account transaction details from March to June 2024",
  "content": "2024-03-15 Deposit ¥50,000 Source: Salary\n2024-04-01 Withdrawal ¥12,000 Purpose: Rent\n...",
  "type": "transaction",
  "category": "money",
  "impact": "vindicate",
  "source": "Bank system export",
  "timestamp": 1710460800000,
  "credibility": 95,
  "importance": 80,
  "tags": ["finance", "bank", "transfer"],
  "vindicateText": "Transfer records prove legitimate source of funds",
  "exposeText": null
}
```

## Data Synchronization

### Static Read-Only Mode

This application is **purely static and read-only**, with no write operations:

- Users do not perform any write operations (no create, update, or delete)
- Agent does not perform any write operations (no action dispatch)
- Data is pre-stored on the cloud under the `/files/` directory

### User Operations

Users can only perform the following read-only operations (pure frontend, no cloud interaction):

- Browse the evidence list
- Filter by category
- Search by keywords
- View evidence details

### Startup Recovery

On startup, the frontend calls `initFromCloud()` to pull all evidence files from the `/files/` directory on the cloud. If the directory is empty, an empty state is displayed.
