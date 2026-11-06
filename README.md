# Cloak Browser for OpenChamber

An [OpenChamber](https://github.com/openchamber/openchamber) extension that runs
[CloakBrowser](https://github.com/CloakHQ/CloakBrowser), a Chromium with
source-level fingerprint patches, on the OpenChamber server and shows it in
OpenChamber's panel: a live picture you click and type into, and the browser the
agent drives.

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

A skeleton. The manifest, the service (bearer check, `/health`, every shared-surface
route, with a transparent placeholder picture) and the strip docked above the
picture are in place; no browser runs yet. Next:

1. CloakBrowser on the server with a persistent profile; the picture from CDP's
   screencast; pointer, keys, wheel, paste, resize and copy into the page.
2. Tabs and the strip: address field, back/forward/reload, new tabs from
   Cmd/Ctrl+click and popups; dialogs, downloads and uploads.
3. The agent's browser: `provides: ["browser"]` and the twelve actions, answered in
   the shapes OpenChamber's own panel uses.

The host's viewer sets limits an extension cannot change: it has no input method
support, so Chinese and other composed text reaches the page by paste or through the
strip; the cursor keeps one shape; the title above the picture travels in an HTTP
header, so it is ASCII (the strip shows the page's real title).

## Layout

| Path | What |
|---|---|
| `package.json` | The OpenChamber manifest (`openchamber.contributes`) and the scripts. |
| `service/main.ts` | The service. `service/main.js` is its bundle, which OpenChamber runs with its own Node. |
| `panel/` | The strip docked above the picture. `panel/main.js` is its bundle. |

## Develop

```sh
bun install
bun run check   # tsc, strict
bun run build   # panel/main.js, service/main.js
```

Commit the bundles with their sources: OpenChamber loads the folder as it is, and
oc-forge's CI rebuilds them and fails when they differ. To try it, add the folder in
OpenChamber's Settings → Extensions (in oc-forge's dev container:
`/extensions/cloak-browser`), allow its local service, and open Cloak Browser in the
rail.

## Licenses

This repository is MIT. CloakBrowser's wrapper is MIT; its Chromium binary is free to
use but may not be redistributed (CloakBrowser's `BINARY-LICENSE.md`), so the service
will download it into the user's cache on first run, and nothing here or in an image
ships it.
