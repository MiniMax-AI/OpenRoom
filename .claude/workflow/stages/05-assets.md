---
requires_rules: []
requires_outputs:
  - solution-design.json
produces:
  - asset-manifest.json
---

# VibeApp Asset Generation

You are a visual asset engineer. Based on the `assets` field in the architecture design, use image generation capabilities to create visual assets for the App.

---

## Phase 1: Asset Requirement Analysis

### Step 1: Read Asset List

Get the list of images to generate from the `assets` field in `solution-design.json`:

```json
{
  "assets": [
    { "name": "hero-banner.png", "description": "Image content and style description", "size": "1200x600" }
  ]
}
```

**If the `assets` field does not exist or is an empty array**:
- Skip this stage directly
- Write an empty `asset-manifest.json`: `{ "assets": [], "skipped": true }`
- Mark the stage as completed, proceed to the next stage

### Step 2: Generation Plan

List all images to be generated, confirming:
- Filename (kebab-case, placed under `src/pages/{AppName}/assets/`)
- Image description (used for generation prompt)
- Size requirements

---

## Phase 2: Image Generation

### Step 3: Generate Images One by One

For each asset item, generate the image and save to `src/pages/{AppName}/assets/{name}`.

**Generation method** (by priority):
1. If the current environment has an available image generation tool (e.g., `/image-gen` Skill), call it directly
2. Otherwise, use CSS gradients/SVG to generate stylized placeholders, or prompt the user to provide manually

**Prompt construction rules**:
- Describe image content based on `description`
- Incorporate `designSystem` style info from `solution-design.json` for consistency
- Append `no text, no watermark, no letters` at the end (to avoid garbled text generation)
- If a specific ratio is needed, describe it in the prompt (e.g., `wide panoramic composition` for wide images)

### Step 4: Generate App Icon

**Required**: Every App needs an icon, saved to `src/pages/{AppName}/assets/icon.jpg`.

**Generation method**: Same as Step 3, prefer available image generation tools; if unavailable, use CSS gradients/SVG for stylized placeholder icons, or prompt the user to provide manually.

**Icon prompt construction rules**:
- Square composition (1:1 ratio)
- Incorporate the App's core theme and visual style (reference `designSystem` from `solution-design.json`)
- Clean, highly recognizable, suitable as an app icon
- Append `no text, no watermark, no letters, square 1:1 ratio, app icon style` at the end

### Step 5: Verify Images

- Use the Read tool to view each generated image (including icon), confirm content and style match expectations
- If unsatisfactory, adjust the prompt and regenerate
- Confirm all images are correctly saved to the `assets/` directory

---

## Phase 3: Artifact Output

### Step 6: Generate asset-manifest.json

Write to `.claude/thinking/{AppName}/outputs/asset-manifest.json`:

```json
{
  "icon": {
    "path": "src/pages/{AppName}/assets/icon.jpg",
    "description": "App icon description"
  },
  "assets": [
    {
      "name": "hero-banner.png",
      "path": "src/pages/{AppName}/assets/hero-banner.png",
      "description": "Generation description",
      "importPath": "@/pages/{AppName}/assets/hero-banner.png"
    }
  ],
  "skipped": false
}
```

**Code reference method** (for subsequent 06-integration stage reference):

```typescript
// Reference in components
import heroBanner from '@/pages/{AppName}/assets/hero-banner.png';
// or
<img src={heroBanner} alt="..." />
```

---

## Output Report

```text
Asset generation complete: {AppName}
Generated images: {N}
Asset directory: src/pages/{AppName}/assets/
Artifact manifest: asset-manifest.json
```

## After Completion

Update workflow.json, mark 05-assets as completed.
