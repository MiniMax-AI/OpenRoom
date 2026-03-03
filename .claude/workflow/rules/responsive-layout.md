# Responsive Layout Rules

Apps run inside iframes and must fully fill the parent container, adapting to size changes. Blank space or fixed dimensions are prohibited.

---

## 1. Core Principles

- **Fill container**: Root element fills 100% of the iframe
- **Follow changes**: Adapt in real-time when size changes
- **No fixed dimensions**: Fixed px width/height prohibited for main area
- **Content first**: Core functionality usable at any size

---

## 2. Root Container Requirements

```css
.app-root {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
```

- Use `100%`; `100vw`/`100vh` are prohibited (unreliable inside iframes)
- `min-width: 0` + `min-height: 0` prevents flex/grid from overflowing the container

---

## 3. Layout Implementation

```css
.layout { display: flex; width: 100%; height: 100%; }
.sidebar { width: 240px; min-width: 0; flex-shrink: 0; }
.content { flex: 1; min-width: 0; min-height: 0; overflow: auto; }
```

**Fixed dimensions allowed for**: Navigation/toolbar height, sidebar width, icons/buttons, list item height. Main content area must use `flex: 1`.

**Scroll strategy**:
- Root container `overflow: hidden`, content area `overflow: auto`
- Avoid nested scrolling in the same direction

---

## 4. Size Adaptation

| Width Range | Layout Strategy |
|----------|----------|
| < 320px | Minimal mode, core functionality only |
| 320-480px | Single column compact, hide sidebar |
| 480-768px | Collapsible sidebar |
| > 768px | Full desktop layout |

- Very small: hide non-core elements | Very large: may set `max-width` to limit reading width

---

## 5. Prohibited Practices

| Prohibited | Correct Approach |
|------|----------|
| Fixed px width/height for page | `100%` + flex/grid |
| Using `100vw`/`100vh` | Use `100%` |
| Fixed main content causing blank space | `flex: 1` to fill |
| Scrollbar on root container | `overflow: hidden` |
| Multi-layer nested scrolling in same direction | One layer per direction max |

---

## 6. Development Checklist

- [ ] App root element has `width: 100%` + `height: 100%`, no `100vw` / `100vh`
- [ ] Main content area uses `flex: 1` or equivalent to auto-fill remaining space
- [ ] Layout follows in real-time when iframe is resized by dragging, no blank space or overflow
- [ ] Core functionality remains operable at very small sizes
- [ ] Content does not stretch infinitely to unreadable widths at very large sizes
- [ ] Root container has no scrollbar; content area scrolls internally as needed
- [ ] No fixed pixel values used as overall page dimensions
