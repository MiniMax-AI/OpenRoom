# Design Tokens - Color Palette & Spacing

All apps MUST use these design tokens. Do NOT hardcode arbitrary color or spacing values.

## Color Palette

### Background (BG)
| Name | Hex | Opacity |
|------|-----|---------|
| bg-1 | `#121214` | 100% |
| bg-2 | `#1C1D20` | 100% |
| bg-3 | `#282A2A` | 100% |

### Grouped
| Name | Hex | Opacity |
|------|-----|---------|
| grouped-1 ~ grouped-5 | `#121214` → `#1C1D20` → `#282A2A` → `#333333` → `#404040` | 100% |

### Colorful
| Name | Hex |
|------|-----|
| gender1-blue | `#6083FF` |
| main1-yellow | `#FAEA5F` (10%: `main1-4`) |
| main3-red | `#FF3F4D` |
| main2-cyan | `#2EA7FF` |
| gender3-purple | `#7660FF` |
| main1-yellow-light | `#FFFDBB` |

### Fill / Text / Mask

```scss
// Fill
--fill-white-20 ~ --fill-white-2: rgba(255,255,255, 0.20/0.15/0.10/0.06/0.04/0.02);
--fill-black-10: rgba(0,0,0, 0.10);  --fill-black-15: rgba(0,0,0, 0.15);

// Text
--text-primary: rgba(255,255,255, 0.90);    --text-secondary: rgba(255,255,255, 0.75);
--text-tertiary: rgba(255,255,255, 0.60);   --text-quaternary: rgba(255,255,255, 0.50);
--text-placeholder: rgba(255,255,255, 0.35);
--text-accent: #FAEA5F;  --text-btn-primary: #121214;  --text-btn-secondary: rgba(18,18,20, 0.60);

// Mask
--mask-heavy: rgba(0,0,0, 0.70);  --mask-medium: rgba(0,0,0, 0.40);
--mask-light: rgba(0,0,0, 0.20);  --mask-half: rgba(0,0,0, 0.50);
```

## CSS Variable Mapping

```scss
// Background & Grouped
--bg-1: #121214; --bg-2: #1C1D20; --bg-3: #282A2A;
--grouped-1: #121214; --grouped-2: #1C1D20; --grouped-3: #282A2A;
--grouped-4: #333333; --grouped-5: #404040;

// Colorful
--color-blue: #6083FF; --color-yellow: #FAEA5F;
--color-yellow-10: rgba(250,234,95, 0.1);
--color-red: #FF3F4D; --color-cyan: #2EA7FF;
--color-purple: #7660FF; --color-yellow-light: #FFFDBB;
```

## Spacing Scale

| Value (px) | CSS Variable | Usage |
|------------|-------------|-------|
| 2 | `--spacing-2xs` | Minimal gap |
| 4 | `--spacing-xs` | Icon-to-text gap |
| 8 | `--spacing-sm` | List item internals |
| 12 | `--spacing-md` | Card padding |
| 16 | `--spacing-lg` | Module gap |
| 20 | `--spacing-xl` | Section divider |
| 24 | `--spacing-2xl` | Page regions |
| 32 | `--spacing-3xl` | Module groups |

## Usage Rules

1. **Always use CSS variables** - never hardcode hex values or pixel spacing.
2. **Text**: `--text-primary` for headings, `--text-secondary` for body, `--text-tertiary` for captions.
3. **Backgrounds**: `--bg-1` root, `--bg-2` cards/panels, `--bg-3` elevated surfaces.
4. **Accent**: `--color-yellow` (`#FAEA5F`) for highlights, active states, CTAs.
5. **Spacing**: 8-point grid, `--spacing-sm` (8px) as base unit.
