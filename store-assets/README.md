# Chrome Web Store listing assets

Everything in this directory is generated. Rebuild with:

```bash
node tools/build-icons.mjs         # extension icons -> repo root
node tools/build-store-assets.mjs  # listing images -> this directory
```

Both scripts drive headless Chrome; override the binary with `CHROME_PATH` if
it is not at the default macOS location.

## What the store requires, and what we ship

| Asset              | Spec                                                         | File                         |
| ------------------ | ------------------------------------------------------------ | ---------------------------- |
| Store icon         | 128×128 PNG, 96×96 of art with 16px transparent padding      | `../icon128.png`             |
| Screenshots        | 1280×800 or 640×400, 1–5 of them, square corners, full bleed | `screenshot-*.png` (3)       |
| Small promo tile   | 440×280                                                      | `promo-small-440x280.png`    |
| Marquee promo tile | 1400×560, optional (required to be featured)                 | `promo-marquee-1400x560.png` |

`node tools/verify-store-assets.mjs` checks every one of these against the spec
— dimensions, PNG validity, the 96×96 art box and the 16px transparent padding
on the store icon, and that the icons really do carry an alpha channel.

## Screenshots are the real UI

The screenshots are not mockups. `assets/shot-popup.html` and
`assets/shot-options.html` reuse the real markup from `popup.html` and
`options.html` and load the real `popup.js`, `options.js` and `theme.js`.
Only the `chrome.*` backend is stubbed, by `assets/shot-shim.js`, which seeds a
representative rule set and returns canned tab-group data. ES modules will not
load over `file://`, so the build serves the repo over a temporary localhost
HTTP server while rendering.

If you change the UI, re-run the build so the listing images keep matching the
extension. That is a store policy requirement, not just tidiness: screenshots
must "demonstrate the actual user experience".

## Notes on the artwork

`assets/icon.svg` is the single source for every icon size. The mark is three
cascading tab-group cards, drawn with flat saturated fills, no white and no
drop shadows, so it holds up on both light and dark backgrounds. Each card
behind is masked by the next one grown by 3px, which carves a transparent
gutter and keeps the shapes separable at 16px.

The store icon uses the 96/128 ratio the spec calls for. The 16, 32 and 48px
toolbar icons deliberately use a tighter margin — at 16px the store's padding
ratio would leave the mark too small to read.

The promo tiles carry no text, per the store's promo guidance ("avoid text",
"saturated colors", "make sure the edges are well defined", and they must still
work shrunk to half size).
