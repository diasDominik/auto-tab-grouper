# Auto Tab Grouper

Auto Tab Grouper is a Chrome extension that automatically organizes your open tabs into groups based on rules you define. It runs entirely locally — no servers, no telemetry. See [privacy_policy.md](privacy_policy.md).

## Features

- Groups tabs automatically by hostname as you browse
- Wildcard rules (`*.google.com`) and full regular expressions
- Most specific rule wins: a `mail.google.com` rule beats a `*.google.com` rule regardless of the order you added them
- Enable or disable individual rules without deleting them
- One-click **Group All**, **Merge Groups**, and **Add Current** from the popup
- Import/export your rules as JSON
- Light, dark, and system themes
- No build step, no runtime dependencies

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/auto-tab-grouper.git
   ```
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the cloned directory.

Requires Chrome 111 or newer.

## Usage

### Rules

Open the options page (**Settings** in the popup) to manage rules. Each rule maps a pattern to a group title and color.

| Pattern             | Matches                                                     |
| ------------------- | ----------------------------------------------------------- |
| `example.com`       | `example.com` and any subdomain of it                       |
| `*.example.com`     | `example.com` and any subdomain of it                       |
| `mail.google.com`   | that exact host only, and it outranks a `*.google.com` rule |
| `^https://.*/docs/` | any URL matching the regex — tick **Use Regex**             |

Precedence is by specificity, not by the order rules were added: an exact hostname match beats a suffix match, a suffix match beats a regex, and a longer suffix beats a shorter one. Regexes are validated when you save, so an unparseable pattern is rejected up front rather than failing silently later.

### Popup actions

- **Group All** — sweeps every ungrouped tab in every window through your rules.
- **Merge Groups** — consolidates groups that share a title into one, pulling tabs into your last focused window.
- **Add Current** — creates a rule for the active tab's domain and groups it immediately.

### Duplicate groups

Two groups with the same name in one window is never intentional, so the
extension merges them on its own. This is what happens when you combine two
windows that each had, say, a "Work" group: Chrome moves the tabs but keeps the
groups separate, and the extension folds them back into one.

Automatic merging is deliberately limited to groups that already share a
window. Merging across windows moves tabs between windows, which is disruptive
if you keep a "Work" group open in two windows on purpose — that stays behind
the explicit **Merge Groups** button.

Pinned tabs are never pulled into a group, and group titles are compared
case-sensitively, so "Work" and "work" stay separate.

### Import / export

Rules live in `chrome.storage.sync`, which caps a single item at 8 KB. The options page reports a clear error if a save exceeds that, and the **Export Rules** / **Import Rules** buttons in **Advanced** let you back up or move your rule set. Imported files are validated before anything is written.

## Development

```bash
npm install
npm run lint         # eslint (flat config, eslint.config.js)
npm run format       # prettier --write
npm test             # node --test
```

Rule-matching logic lives in `rules.js` and duplicate-group planning in
`groups.js`. Both are pure — no `chrome.*`, no DOM — so they are covered
directly by `test/rules.test.js` and `test/groups.test.js`. `background.js`, `popup.js`, and `options.js` all import from it, along with `storage.js` (promise wrappers that surface `chrome.runtime.lastError`) and `ui.js` (shared DOM helpers).

All extension scripts are ES modules, including the service worker (`"type": "module"` in the manifest).

## Store assets

The Chrome Web Store listing images live in `store-assets/`, and the extension
icons at the repo root are generated from `assets/icon.svg`:

```bash
npm run icons          # rebuild icon16/32/48/128.png from the SVG
npm run store-assets   # rebuild screenshots and promo tiles
npm run verify-assets  # check everything against the store spec
```

`npm run verify-assets` is also part of CI. It checks image dimensions, that the
128px icon is 96x96 of artwork with 16px transparent padding, that the icons
carry a real alpha channel, that screenshots are 1280x800 and full bleed, and
that the manifest name and description fit the store's length limits.

Screenshots are rendered from the real `popup.html` and `options.html` running
the real scripts against a stubbed `chrome.*` backend, so they stay honest. See
[store-assets/README.md](store-assets/README.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
