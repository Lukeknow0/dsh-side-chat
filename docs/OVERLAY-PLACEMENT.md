# Overlay placement architecture

## Verified root cause

The overlap is structural, not a bad offset or an insufficient z-index:

1. The current drawer is viewport-fixed (`position: fixed; top/right/bottom: 12px`) with an approximately 448px width. It therefore ignores the AppFrame grid, the rendered sidebar/details widths, sibling overlay entries, and body portals.
2. DSH renders `shell.overlay` as an additive list inside one AppFrame-wide element: `[data-shell-overlay]` is `position: absolute; inset: 0; z-index: 20; pointer-events: none`. Its slot host is effectively a shared, allocation-free rendering surface. Entries are painted in slot order and opt back into pointer events, but neither ui-slots nor the overlay owner reserves geometry or performs collision resolution.
3. AppFrame always mounts the sidebar, conversation, details, and overlay elements. The overlay is a sibling of the three grid columns rather than a grid participant, so a fixed or absolute overlay child does not cause any column to concede space.
4. The public `ctx.layout` / `ILayout` contract exposes only `toggleSidebar()`, `openDetails()`, and `closeDetails()`. It exposes no readable panel geometry and no official overlay-placement or avoidance registry. Taking over the single `details` or `sidebar` slot would replace native UI and is therefore not an acceptable workaround.
5. The necessary rendered geometry is still measurable without replacing a native slot: the Side Chat root can locate its nearest `[data-shell-overlay]`, use that element as its containing block, measure its parent AppFrame, and measure the rendered sidebar/details elements. The optional dsh-web-ui-all compatibility layer stamps `[data-dsh-frame]` and `[data-pane=sidebar|conversation|details]`; core-only installations need structural/class-name fallbacks because those stamps are not part of rc.8 ui-layout itself.
6. Other `shell.overlay` entries can be measured only best-effort. Their sibling roots have no shared geometry contract. Body portals are outside the overlay subtree and require an explicit compatibility marker (`[data-dsh-side-chat-avoid]`) or configured selector. No implementation can truthfully infer every arbitrary third-party portal.

## Live reproduction

On the running DSH page at 1900 × 1089 CSS pixels:

- AppFrame / `[data-shell-overlay]`: approximately `(0, 0)–(1900, 1089)`.
- Existing Side Chat drawer: approximately `(1439, 12)–(1888, 1077)`.
- Desktop launcher shutdown button: approximately `(1830, 1019)–(1876, 1065)`.

The rectangles intersect. The drawer uses z-index 80 while the portal button uses z-index 900, proving that changing either z-index merely changes which interaction loses; it does not resolve the collision.

## Architectural decision

Side Chat remains a `shell.overlay` list entry, but its root becomes a click-through, absolute measuring layer scoped to `[data-shell-overlay]`. A pure placement function receives frame/viewport geometry, safe-area insets, and occupied rectangles, then deterministically chooses a full right rail, compact right rail, or bottom sheet. A React measurement hook owns bounded ResizeObserver/MutationObserver subscriptions and converts the result into CSS custom properties. The drawer itself never reads the DOM and no Host/session behavior changes.
