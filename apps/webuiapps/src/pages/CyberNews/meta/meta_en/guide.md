# CyberNews Developer Guide

## Overview

A Cyberpunk 2077 Night City-style news terminal and investigation board app. Features news browsing, article reading, and a case investigation board with draggable clue cards.

## Data Schemas

### Article

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| title | string | Title (uppercase) |
| category | 'breaking' \| 'corporate' \| 'street' \| 'tech' | Category |
| summary | string | Summary |
| content | string | Full article body |
| imageUrl | string | Cover image URL (can be empty) |
| publishedAt | string | ISO date string |

### Case

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| caseNumber | string | Case number |
| title | string | Case title |
| status | 'open' \| 'closed' \| 'classified' | Status |
| clues | Clue[] | List of clues |

### Clue

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| type | 'press' \| 'report' \| 'document' \| 'message' \| 'note' | Type |
| title | string | Title |
| content | string | Content |
| posX | number | X position on board |
| posY | number | Y position on board |

## Storage Structure

```
/articles/{id}.json    # News articles
/cases/{id}.json       # Investigation cases (with clues)
/state.json            # App state
```

## Views

1. **News Feed**: Left headline card + right news list, bottom breaking news ticker
2. **Article Detail**: Full-screen reading mode
3. **Case Board**: Left case sidebar + right corkboard canvas with draggable clue cards

## Action Execution Guide

### Mutation Actions (CREATE / UPDATE / DELETE)

Mutation actions follow a **write-then-notify** pattern. The Agent must:

1. **Write the data file first** to the NAS storage
2. **Then send the action** to notify the App to refresh its UI

Example flow for creating an article:

```
Step 1: Call the available image-generation capability to create a cover image; obtain the image URL
Step 2: Write full Article JSON (include imageUrl) to /articles/{articleId}.json (path is determined by the article's id)
Step 3: Send CREATE_ARTICLE action → App refreshes article list from storage
```

**Creating news requires image generation**: Article's imageUrl must be set. Use whatever image-generation tool or capability is provided in the current environment to create a cyberpunk/Night City-style cover image first, then fill imageUrl with the returned URL before writing the article file.

Example flow for creating a case with clues:

```
Step 1: Write full Case JSON (including clues array) to /cases/{caseId}.json (path is determined by the case's id)
Step 2: Send CREATE_CASE action → App refreshes case list from storage
```

**Important**: The App does NOT create files from action params. It only reads existing files from storage. If you send CREATE_ARTICLE without writing the file first, the article will not appear.

### Operation Actions (VIEW / SELECT / FILTER / MOVE)

Operation actions execute immediately — no file writing needed. Just send the action with the correct params.

### Refresh Actions

Send REFRESH_ARTICLES or REFRESH_CASES to force the App to re-read all data from storage. Use `navigateTo` param to switch views, `focusId` to auto-select an item.
