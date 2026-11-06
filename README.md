# Cloak Browser for OpenChamber

An [OpenChamber](https://github.com/openchamber/openchamber) extension that runs
[CloakBrowser](https://github.com/CloakHQ/CloakBrowser), a Chromium with
source-level fingerprint patches, on the OpenChamber server and shows it in
OpenChamber's panel: the shown tab's page as HTML you click, type and scroll in,
with tabs, back, forward, reload and an address field above it. The agent's browser
actions run in it too: OpenChamber's own `openchamber_web` tool, answered by
CloakBrowser.

It is the `extensions/cloak-browser` submodule of
[oc-forge](https://github.com/antropy-research/oc-forge).

## Why

In OpenChamber's web build the browser panel is a display-only iframe. Sites that
refuse to be framed (google.com, most sign-in pages) show nothing there, and the
agent can open a tab but cannot read or click it: only the desktop app can drive a
page (`canDriveBrowserPage` in OpenChamber's
`packages/ui/src/lib/browser/hostCapability.ts`).

The extension needs no change to OpenChamber (`GUEST_SERVICES.md` in
`@openchamber/sdk`): `service.provides: ["browser"]` sends the agent's `browser.*`
actions (open, snapshot, click, type, …) to the service once it is picked in
Settings → General → OpenChamber Tools → Browser provider, and the panel is the
extension's own page, which reaches the service through `host.serviceRequest`.

OpenChamber also offers a shared surface (`service.surface`: frames out, input in),
which the extension used before 0.4. It sends pictures: 3 s of scrolling cost 0.7 to
12 MB, against 14 to 260 KB as HTML (below), and a page docked beside it can take at
most half the panel.

## Status

Works: the browser in the panel, and the agent's browser.

- **The browser.** CloakBrowser's free build (Chromium 146), downloaded from its GitHub
  release on first use, its signed SHA256SUMS and checksum checked. Headless, with one
  profile that keeps your logins and one fingerprint across restarts. It starts when the
  panel opens and restarts after it exits; a browser left behind by a killed service is
  stopped on the next start, and a lock left on the profile by an earlier container over
  the same volume (another hostname, which Chrome refuses) is cleared.
- **The page as HTML.** A recorder in an isolated world of the shown tab (the page's own
  scripts see neither it nor its observers) describes the document once, then each change
  (children, attributes, text, CSSOM rules, form values, scroll, focus, shadow roots,
  adopted sheets). The panel builds it in a frame of its own and keeps it current; the
  page is laid out at the panel's size and the window's pixel ratio. Style sheets go by
  address and, with images and fonts, come through the service from what the page loaded
  (or over the browser's own network, with its cookies), once per site: the panel never
  reaches the site. Images load as they come near the view, and what a style names (a
  background, a font) when the panel's renderer asks for it. A new page stays behind the
  old one until its style sheets are here. No script of the page's ever runs in the panel:
  no script element in any namespace, no event handler, no `javascript:` value, no
  `srcdoc`, no `autofocus`.
- **The page's layout.** The content is laid out in the page's own width (a scroll bar
  takes 15 px of the browser's window and may take none of yours), an image the panel has
  not fetched yet keeps its own size, a style sheet comes whole (the browser's copy is
  taken once the page has loaded all of it, and never fetched a second time while the page
  is still loading it), sheets the page's script adds or turns on later come too, and
  custom elements are `:defined` in the panel exactly when the page has defined them.
- **Pictures for what HTML cannot carry.** A canvas, a video, another site's frame, an
  embed: the part the window shows is captured in the page and painted on its stand-in, a
  few times a second for a canvas or a video and once a second for the rest, sent only when
  it changed. A click on a pictured frame lands in the frame, at the same place.
- **The page as a picture**, where HTML cannot show it: when pictured elements take half the
  window or more (a map, a game), when the panel keeps failing to follow the page, or when
  you ask (the strip's picture button). A new page starts as HTML again.
- **Input.** A click, the wheel or a drag lands on the element it was over in the panel, at
  the same place on it, wherever the page has it (scrolled into view first if needed), as
  real input: pages see trusted events. Typing shows at once and goes to the page; an input
  method composes in the panel and its text goes; paste sends any text, never the paste
  chord. A `<select>` opens its own list in the panel and the pick is made in the page.
  Scrolling happens in the panel first; the page gets the same wheel or keys and each
  scroller then takes the page's position, and a scroll with no input of its own (find in
  page) moves the page instead. Copy and cut are the panel's own (your clipboard); on a
  Mac, Command acts as Control (the page is Chrome on Windows) and its line and word moves
  keep their meaning.
- **The strip.** The tabs (a new one, one shown, one closed; the agent's marked AI),
  back, forward, reload or stop, an address field (a URL, a bare host, or words to
  search), the picture button, *Open in your browser*, and what the browser is doing
  (download progress, loading, errors, who has control). A link that opens a new tab
  shows that tab; a click with Control (Command on a Mac) or the middle button opens it
  in a tab behind, and the page stays where it is.
- **Alerts, confirms and prompts.** The shown tab's appear over the page (OK, Cancel,
  the prompt's text); Enter and Escape answer them too. A tab behind, or one the agent
  works in, answers its own (OK, the prompt's default).
- **The browser's keys**, while the page has the focus: mod+T, mod+W, Control+Tab,
  mod+PageUp/PageDown, mod+1…9 and mod+Alt+←/→ for the tabs; mod+[ and mod+] (Alt+← and
  Alt+→ off a Mac) for back and forward; mod+R and F5 to reload; mod+L, Alt+D or F6 for
  the address, where what you type right away lands even before the field has the
  focus. mod is Command on a Mac, else Control. Keys that would act on OpenChamber's
  window (reload it, go back in its history) stay with the page. Chrome keeps
  Control+Tab, mod+T and mod+W for itself in a normal tab; they work in OpenChamber
  installed as an app.
- **Control**, as OpenChamber's surface had it: the agent holds it for 30 s after each
  action (*Agent is working*), you take it by acting in the page (moving the pointer is
  looking: it goes to the page only while you hold control), another window sees
  *Another device has control* and cannot take it, and the agent's actions are refused
  with OpenChamber's own message while you hold it. *Hand back to agent* gives it back;
  so does a minute without input, or closing the window. The strip says you hold control
  only with an agent around (it acted or tried to in the last ten minutes): to someone
  just browsing it means nothing.
- **The browser outlives its service.** OpenChamber stops a browser provider's service
  ten minutes after the agent's last action, whoever is browsing. Stopped while a panel
  is shown, the service leaves the browser running and the next one, which the panel's
  next request starts, takes it over: tabs, pages, what you typed. Nobody takes it within
  a minute (the extension was paused or removed), or its handover is gone: a watchdog
  stops it.
- **A panel that is not shown** (closed, or another panel in its place) asks the service
  for nothing, and catches up when shown again. OpenChamber does not tell a page when its
  panel is closed: the panel counts as shown while nearly all of it is in view.
- **Zooming OpenChamber** gives pages the new pixel ratio at once; the browser is never
  restarted for it.
- **The agent's browser.** With Cloak Browser as the Browser provider (Settings →
  General → OpenChamber Tools), the agent's twelve `browser.*` actions run here,
  answered in the shapes OpenChamber's own panel uses (its page scripts, adapted).
  `browser.open` opens a tab of the chat's own, behind your page, in a window of its
  own so it runs as a page in front does; without a `tabId`, an action works in the
  chat's last tab. Clicks and typing are real input. `browser.close` closes only the
  agent's tabs, an unknown `tabId` is refused, and a dialog the action raised is
  answered and reported.

What it costs on the wire (dev, a Retina window, OpenChamber's compression), against
the picture the extension sent before (JPEG 80, ratio 2, 1000×700):

| page | shown after Enter | first view | a scroll (10 wheel steps, 3 s) | 10 s still | one picture | a scroll as pictures |
|---|---|---|---|---|---|---|
| en.wikipedia.org/wiki/Web_browser | 1.0 s | 925 KB | 121 KB | 9 KB | 320 KB | 9.3 MB |
| github.com/openchamber/openchamber | 3.8 s | 552 KB | 259 KB | 11 KB | 207 KB | 3.9 MB |
| www.bbc.com/news | 2.2 s | 1.4 MB | 122 KB | 11 KB | 210 KB | 11.9 MB |
| news.ycombinator.com | 2.0 s | 18 KB | 14 KB | 9 KB | 267 KB | 0.7 MB |

A first view costs more than one picture (style sheets, fonts, images), and those come
once per site: what follows is changes.

Where the panel puts things against the page (the tops of the first headings, paragraphs
or rows, `tests/e2e/mirror-drift.mjs`): Wikipedia 3 px apart in the median, 5 at most;
GitHub 5 and 38; Hacker News 6 and 6; example.com 26 and 26. What is left is text drawn
with other fonts (Limits): when Wikipedia shows its fundraising banner (to some first
visits), the banner's paragraphs take more lines in the panel, and the article sits 249 px
lower.

Next:

1. File pickers, downloads, date and color pickers (type the value meanwhile).
2. A CloakBrowser key for the newest build (the free build is Chromium 146).

Limits:

- A page without a doctype shows in standards mode (the panel's frame is a `srcdoc`,
  which never is in quirks mode): old table layouts can differ a little.
- The panel's frame may load nothing from the network (OpenChamber's policy for
  extension pages): what a page loads is fetched through the service, a little later
  than the page has it.
- Text is drawn with the fonts of the machine your window runs on. Where they differ from
  the browser's (oc-forge's image has Liberation and Noto), a line can break elsewhere and
  what follows it moves: on example.com, 26 px by the end. Giving a Chromium window the
  browser's own font files does not help (the same files lay out differently on another
  machine: hinting, glyph advances); branch `html-mirror-chromium` has the attempt.

## How it runs

| Path | What |
|---|---|
| `package.json` | The OpenChamber manifest (`openchamber.contributes`) and the scripts. |
| `service/main.ts` | The service: OpenChamber's routes (`/browser-control` for the agent; the panel's `/state`, `/navigate`, `/history`, `/reload`, `/stop`, `/tabs`, `/dialog`, `/address`, `/control`, `/mirror/*`). `service/main.js` is its bundle, which OpenChamber runs with its own Node. |
| `service/browser.ts` | The browser process: launch, handing over and taking over, profile, tabs (each with its own DevTools session), navigation, dialogs. |
| `service/mirror-recorder.ts` | The recorder in the page's isolated world: the snapshot, the changes, and where the user's input lands. |
| `service/mirror.ts` | The page as HTML for the panel: the recorder drained while a panel is shown, the long poll, resources, pictures of what HTML cannot carry. |
| `service/mirror-input.ts` | The panel's input, checked and placed on the page. |
| `service/control.ts` | Who works in the browser: nobody, the agent, or the user in one window. |
| `service/surface.ts` | Input as CDP events, the browser's keys, the page's size and pixel ratio, the screencast for the page as a picture. |
| `service/agent.ts` | The agent's twelve `browser.*` actions. |
| `service/page-scripts.ts` | What those actions run in a page, adapted from OpenChamber's own panel (`pageActions.ts`, MIT). |
| `service/address.ts`, `binary.ts`, `cdp.ts` | What the address field holds as a URL; where the binary comes from; the DevTools protocol. |
| `panel/main.ts` | The panel: the strip, the dialog, control, whether the panel is shown. |
| `panel/mirror-view.ts`, `panel/frame.ts`, `panel/frame-input.ts` | The page as HTML: the view that follows the service, and the frame that builds the page and takes the user's input. |
| `panel/picture-view.ts`, `panel/keys.ts` | The page as a picture; the key rules both share. |

`panel/main.js`, `panel/frame.js` and `service/main.js` are the bundles.

The host needs Chromium's libraries and fonts; oc-forge's dev image installs them
(`containers/openchamber-dev/Dockerfile`). The browser runs with
`--password-store=basic`: with a D-Bus session and no keyring answering, Chrome's
requests stall.

Settings, from the service's environment: `OC_CLOAK_DATA_DIR` (profile, fingerprint
seed, last address, pixel ratio, a handover; default
`~/.local/share/oc-forge-cloak-browser`), `OC_CLOAK_CACHE_DIR` (downloaded builds;
`~/.cache/oc-forge-cloak-browser`), `OC_CLOAK_START_URL` (a new profile's first page;
Google), `CLOAKBROWSER_BINARY_PATH` (a Chromium already on the machine instead of the
download).

## Develop

```sh
bun install
bun run check   # tsc, strict
bun run build   # panel/main.js, panel/frame.js, service/main.js
bun run test    # end to end: the built service and a real Chromium
```

Commit the bundles with their sources: OpenChamber loads the folder as it is, and
oc-forge's CI rebuilds them and fails when they differ.

The tests start `service/main.js` under Node with a Chromium (`CLOAK_TEST_CHROME`,
else Playwright's newest, else a system Chrome) against pages they serve, and drive it
through the routes OpenChamber and the panel use.

`tests/e2e/` holds the journeys through oc-forge's dev OpenChamber with the real
CloakBrowser (not in CI; each says how to run it): `dev.mjs` (the whole of it, the
agent's browser and with `--agent` a real agent), and `mirror-input`, `mirror-patches`,
`mirror-control`, `mirror-watchdog`, `mirror-hidden`, `mirror-safety` (a page that
tries to run code in the panel), `mirror-layout` (a page that moves its layout without
changing its text), `mirror-sites` (the cost table above) and `mirror-drift` (where things
sit on real sites). `--temp` (the default for the `mirror-*` ones) installs this
checkout's build as a temporary extension with its own id and data, so the Cloak Browser
dev runs is untouched.

To try it elsewhere, add the folder in OpenChamber's Settings → Extensions, allow its
local service, and open Cloak Browser in the rail. For the agent, pick Cloak Browser
as the Browser provider in Settings → General → OpenChamber Tools.

## Licenses

This repository is MIT. CloakBrowser's wrapper is MIT; its Chromium binary is free to
use but may not be redistributed (CloakBrowser's `BINARY-LICENSE.md`), so the service
downloads it into the user's cache, and nothing here or in an image ships it.
