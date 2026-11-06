# Cloak Browser for OpenChamber

An [OpenChamber](https://github.com/openchamber/openchamber) extension that runs
[CloakBrowser](https://github.com/CloakHQ/CloakBrowser), a Chromium with
source-level fingerprint patches, on the OpenChamber server and shows it in
OpenChamber's panel: a live picture you click and type into, with back, forward,
reload and an address field above it. Next, the agent's browser too.

It is the `extensions/cloak-browser` submodule of
[oc-forge](https://github.com/antropy-research/oc-forge).

## Why

In OpenChamber's web build the browser panel is a display-only iframe. Sites that
refuse to be framed (google.com, most sign-in pages) show nothing there, and the
agent can open a tab but cannot read or click it: only the desktop app can drive a
page (`canDriveBrowserPage` in OpenChamber's
`packages/ui/src/lib/browser/hostCapability.ts`).

OpenChamber has shipped two extension points for this since 2.0, so the extension
needs no change to OpenChamber (`GUEST_SERVICES.md` in `@openchamber/sdk`):

- `service.surface: true`: the service hands out frames; OpenChamber draws them in
  the extension's panel, sends back the pointer, keys, wheel and paste, and keeps
  track of who is in control (the agent, or you until you hand back).
- `service.provides: ["browser"]`: the agent's `browser.*` actions (open, snapshot,
  click, type, …) go to the service once it is picked in Settings → General →
  OpenChamber Tools → Browser provider.

## Status

Works: the browser in the panel.

- **The browser.** CloakBrowser's free build (Chromium 146), downloaded from its GitHub
  release on first use, its signed SHA256SUMS and checksum checked. Headless, with one
  profile that keeps your logins and one fingerprint across restarts. It starts when the
  panel opens and restarts after it exits; a browser left behind by a killed service is
  stopped on the next start.
- **The picture.** The shown tab at the panel's size and the window's pixel ratio
  (Retina is sharp), sent when the page changes.
- **Input.** Click, double and triple click, drag, wheel, keys; on a Mac, Command acts
  as Control (the page is Chrome on Windows) and its line and word moves keep their
  meaning. Paste sends any text, Chinese included; copy hands the selection to your
  clipboard.
- **The strip.** Back, forward, reload or stop, an address field (a URL, a bare host,
  or words to search), and what the browser is doing (download progress, loading,
  errors). A link that opens a new tab shows that tab.

Next:

1. Tabs in the strip, and what a screencast does not show: `<select>` lists,
   alerts and prompts, file pickers, downloads.
2. The agent's browser: `provides: ["browser"]` and the twelve actions, answered in
   the shapes OpenChamber's own panel uses.
3. A CloakBrowser key for the newest build (the free build is Chromium 146).

Limits set by OpenChamber's viewer (2.6), which an extension cannot change:

- No input method: Chinese and other composed text reaches the page by paste.
- Back from another app, OpenChamber puts the keyboard in the chat box (its
  `refocusAfterWindowFocus` does not count the picture as a text field): click the
  picture again. The strip hands the keyboard back after each use, so a click on the
  picture right after the strip keeps it.
- Cut does not reach your clipboard (the viewer reads the clipboard after copy only).
- The cursor keeps one shape, and the title above the picture is ASCII (an HTTP
  header); the strip shows the page's address.
- One picture for every window: two windows with the panel open share it, at the size
  of the one that last resized.

## How it runs

| Path | What |
|---|---|
| `package.json` | The OpenChamber manifest (`openchamber.contributes`) and the scripts. |
| `service/main.ts` | The service: OpenChamber's routes (the surface, the strip's `/state`, `/navigate`, `/history`, `/reload`, `/stop`, `/viewer`). `service/main.js` is its bundle, which OpenChamber runs with its own Node. |
| `service/browser.ts` | The browser process: launch, profile, tabs, navigation. |
| `service/binary.ts` | Where the binary comes from: the free build, or `CLOAKBROWSER_BINARY_PATH`. |
| `service/surface.ts` | Frames, size and pixel ratio, input, copy. |
| `service/cdp.ts` | The DevTools protocol over the browser's WebSocket. |
| `panel/` | The strip docked above the picture. `panel/main.js` is its bundle. |

The host needs Chromium's libraries and fonts; oc-forge's dev image installs them
(`containers/openchamber-dev/Dockerfile`). The browser runs with
`--password-store=basic`: with a D-Bus session and no keyring answering, Chrome's
requests stall.

Settings, from the service's environment: `OC_CLOAK_DATA_DIR` (profile, fingerprint
seed, last address, pixel ratio; default `~/.local/share/oc-forge-cloak-browser`),
`OC_CLOAK_CACHE_DIR` (downloaded builds; `~/.cache/oc-forge-cloak-browser`),
`OC_CLOAK_START_URL` (a new profile's first page; Google), `CLOAKBROWSER_BINARY_PATH`
(a Chromium already on the machine instead of the download).

## Develop

```sh
bun install
bun run check   # tsc, strict
bun run build   # panel/main.js, service/main.js
bun run test    # end to end: the built service and a real Chromium
```

Commit the bundles with their sources: OpenChamber loads the folder as it is, and
oc-forge's CI rebuilds them and fails when they differ.

The tests start `service/main.js` under Node with a Chromium (`CLOAK_TEST_CHROME`,
else Playwright's newest, else a system Chrome) against pages they serve, and drive it
through the routes OpenChamber and the strip use. `tests/e2e/dev.mjs` is the journey
through oc-forge's dev OpenChamber with the real CloakBrowser (not in CI; it says how
to run it).

To try it elsewhere, add the folder in OpenChamber's Settings → Extensions, allow its
local service, and open Cloak Browser in the rail.

## Licenses

This repository is MIT. CloakBrowser's wrapper is MIT; its Chromium binary is free to
use but may not be redistributed (CloakBrowser's `BINARY-LICENSE.md`), so the service
downloads it into the user's cache, and nothing here or in an image ships it.
