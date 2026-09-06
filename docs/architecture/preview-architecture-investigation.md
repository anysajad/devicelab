# Preview Architecture Investigation

Date: 2026-09-06 · Status: investigation (no implementation)

## 1. Executive summary

DeviceLab is a pure client-side React app. Today every preview is rendered by
placing the target URL inside a sandboxed `<iframe>` and rendering that
viewport on top of a single CSS scaling container. This works perfectly for
sites that allow embedding, but many real-world sites and web apps refuse to
be framed — via `X-Frame-Options` or CSP `frame-ancestors` — or are simply
cross-origin, which blocks same-origin DOM access, inspection, highlighting,
and the foreignObject-based screenshot pipeline.

**No legitimate client-side technique can lift those restrictions**, because
they are enforced by the browser engine itself. The correct fix is not to
bypass them but to change *how* we render the page: use a real browser
instance instead of a sandboxed frame.

**Recommendation: a hybrid architecture.**

- Keep the current **iframe backend** as the default for sites that permit
  embedding — it requires no companion process.
- Add a **browser-backed backend** delivered through a local **companion
  process** that drives Playwright (Chromium) over a loopback WebSocket, with
  the React UI consuming a real-time canvas Live View. This is the primary
  long-term direction. It is the smallest architecture that satisfies the
  product promise: *"enter the URL of a real website/web app and test it as if
  on different devices, including sites that do NOT allow iframe embedding."*
- Hosted/SaaS browser backends are a later evolution of the **same companion
  RPC protocol**, not a near-term target. A desktop app (Electron/Tauri) was
  analyzed and is not superior for this product; it is parked.

Auth is a first-class future requirement: real logged-in sessions must be
reusable, and the safest mechanism is **login once into a Playwright profile,
then hydrate per-device browser contexts from `storageState`** (portable,
parallel-safe, no credential duplication into the web UI). The Chrome
extension route (`chrome.debugger`) reuses the user's live browser session
with the least secret handling, but is Chrome-only and constrained for
multi-device; it is a Phase 3 enhancement, not the primary path.

- **Confidence:** high that the hybrid architecture satisfies the product
  promise (browser-backed rendering is the only broadly-correct mechanism);
  medium on companion UX/performance specifics (Live View bandwidth, security
  token flow, storageState coverage) — these are gated behind Phase 2 spikes.

---

## 2. Current architecture

All preview logic lives client-side. There is no backend.

| Module | Responsibility |
| --- | --- |
| `src/preview/previewEngine.ts` | `createPreviewController()`, owns one `<iframe>`, lifecycle state machine, zoom computation. |
| `src/preview/usePreview.ts` | React hook; wires controller to a container via `ResizeObserver`. |
| `src/preview/components/PreviewFrame.tsx` | Single scaling container (`transform: scale(effectiveZoom)`) + overlays (grid, safe-area, rulers, device info). |
| `src/preview/components/PreviewInstance.tsx` | Per-entry toolbar; per-instance viewport tools; custom-viewport synthetic device. |
| `src/preview/store/usePreviewStore.ts` | Zustand collection store (`entries`, `sharedUrl`, `layoutMode`, `compareIds`, `activeId`, inspection snapshots). |
| `src/inspection/inspectionEngine.ts` | `inspectIframe(iframe, viewport)`; `createInspectionContext(document, viewport, measurements)`. |
| `src/screenshot/capture.ts` | `createScreenshotCapturer()`; same-origin capture; statuses `not-ready`, `cross-origin`, `render-failed`, `ok`. |
| `src/screenshot/serialize.ts` / `renderer.ts` | Serialize to XHTML → SVG `<foreignObject>` → `<img>` → `<canvas>` → PNG (best-effort). |
| `src/devices/registry.ts` | Immutable `DeviceDefinition` presets (viewport, devicePixelRatio, safeArea, orientations). |
| `src/projects/serializer.ts` | Serializes workspace state (URL, device entries, layout, compare, active) to localStorage-backed projects. |

Key engine details relevant to architecture (`previewEngine.ts`):

- Lifecycle: `idle | loading | ready | error`, 10 s load timeout
  (`PREVIEW_LOAD_TIMEOUT_MS`), a loopback-only reachability probe
  (`isLoopbackProbeEligible`), and a synchronous HTTPS/mixed-content error.
- Sandbox: `allow-scripts allow-same-origin allow-forms allow-popups`;
  `allow-same-origin` is required so framed apps keep cookies/localStorage —
  which is exactly what makes cross-origin DOM reads (and inspection) possible
  for same-origin targets.
- The iframe's CSS viewport is **never** scaled; zoom is a single CSS
  `transform: scale()` on the wrapper container (`PreviewFrame.tsx:107`).
- `PreviewController` is imperative and framework-agnostic: `load`,
  `setContainerSize`, `reload`, `destroy`, `getState`, `subscribe`,
  `getIframe`, `setZoom`/`zoomIn`/`zoomOut`/`setZoomMode`
  (`src/preview/types.ts:47`).

Inspection and screenshot both read `iframe.contentDocument` directly
(`inspectionEngine.ts:119`, `capture.ts:39`). For cross-origin targets this
throws or returns `null`, and both systems already classify that honestly as
`inaccessible: 'cross-origin'` / `status: 'cross-origin'` rather than
guessing. That honest handling is worth preserving.

The Playwright e2e suite (`playwright.config.ts`) runs two Vite servers
(`APP_PORT=5178`, `CROSS_ORIGIN_PORT=4178`) against fixtures in
`public/fixtures/`. Tests pass today only because those fixtures are
served from the same origin as the app. This is the key diagnostic: the
current feature set works against same-origin fixtures, not against
arbitrary public sites.

## 3. Why iframe rendering fails for arbitrary sites

A site can refuse to be embedded in three ways, all enforced by the browser:

1. **`X-Frame-Options: DENY | SAMEORIGIN`** — HTTP header; the browser refuses
   to attach the document to the frame (refuses to render into the framed
   browsing context).
2. **CSP `frame-ancestors 'none' | <origin>`** — enforced at content
   navigation/attachment time; the framed document refuses embedding.
3. **Cross-origin isolation + Same-Origin Policy** — even when the page *does*
   render, `iframe.contentDocument` is unreadable cross-origin, so all
   same-origin features degrade.

There is **no client-side workaround** for (1)/(2) in a regular browser —
MDN documents these as immutable browser-enforced boundaries, and there is no
JS/extension hook that can override them for a frame. The mixed-content check
(`previewEngine.ts`) is a sibling example of an enforced, non-bypassable
boundary the codebase already respects.

Consequences for the current product:

| Feature | Behind same-origin frame | Behind cross-origin / CSP-refusing frame |
| --- | --- | --- |
| Render page | ✓ | **✗ (refused to frame)** or ✓ (renders but untouchable) |
| Zoom/device bezel/rulers | ✓ | ✓ (pixels, works) |
| Inspection | ✓ | ✗ `inaccessible: cross-origin` |
| Highlighting | ✓ (style injection into frame doc) | ✗ |
| Screenshot | ✓ (best-effort) | ✗ `status: 'cross-origin'` |
| Live interaction | ✓ | ✗ (no keyboard/mouse bridging to a framed page) |

## 4. Security boundaries that must never be bypassed

Whatever we build, these stay intact:

- **Do not** attempt to defeat `frame-ancestors`, `X-Frame-Options`,
  Same-Origin Policy, or mixed-content blocking. The browser engine is the
  security boundary; tampering is both non-viable and wrong for a dev tool.
- **The companion is a user-invoked browser.** A real headless Chromium
  visiting a URL is a legitimate first-class client — that is not a
  "bypass", it is the correct primitive. However, sites may detect automation
  (`navigator.webdriver`) and choose to block; we honor that and document it
  rather than stealth-evade.
- **Companion hardening**: bind to loopback only, use a random high-entropy
  token, restrict CORS to allowlisted origins, accept RPC only over token
  (not origin) validation, and never expose a generic URL-fetching/proxy
  primitive (which would become an SSRF/open-proxy).
- **Credentials**: the web UI orchestrates; the companion owns profiles and
  storage state locally. Never copy cookies/sessions into the app origin.

## 5. Option evaluation

### A. Iframe (current)

- **How it works:** frames the URL in a sandboxed iframe; same-origin access
  for DOM/inspection/screenshot.
- **Can do:** embeddable + same-origin sites, device viewports via CSS
  dimensions, zoom/bezel/rulers, inspection, screenshots, localhost dev
  servers. No companion, works in any browser, fully web-hosted.
- **Cannot do:** CSP/cross-origin refusing sites (the core gap), cross-origin
  inspection/screenshots, keyboard/mouse input to the framed page, authentic
  mobile user agent / device emulation (only CSS viewport).
- **Verdict:** keep as a backend (no-companion mode), not the only backend.

### B. Reverse proxy

- **How it works:** app server fetches the target and re-serves it same-origin
  under our origin, so the frame is "same-origin" and bypasses framing
  restrictions (and mixed content).
- **Why it does not work for arbitrary sites:**
  - Origin-keyed security breaks: cookies are bound to *our* origin, so the
    target's CDN/API signatures, `Set-Cookie` handling, and OAuth redirect
    flows break. Sites that pin their origin (CSP `default-src`, service
    workers, `document.domain`) misbehave.
  - Streaming/binary (video, SSE, WebSockets, ranged downloads) requires a
    full upgrade/proxy path; HTTP-interactive sites (arrows between client and
    server) fundamentally depend on the *real* origin.
  - **SSRF / open-proxy risk:** a generic "fetch any URL" endpoint is an
    open proxy — internal-network probing, cloud-metadata extraction,
    request smuggling. It would need deep network/security isolation to be
    safe, which is out of scope for a static web app and not justified.
- **Verdict:** reject as a primary mechanism. Too many security and fidelity
  failure modes. (It can be a *narrow* enhancer later — e.g. same-origin
  presentation of a *local dev server only* — but not for arbitrary sites.)

### C. Browser extension (`chrome.debugger`)

- **How it works:** a small extension attaches the CDP `debugger` to real
  tabs via `chrome.debugger`, giving us `Emulation.setDeviceMetricsOverride`
  (true per-device viewport), `Page.captureScreenshot`, `DOM.*`
  (cross-origin inspection!), `Runtime.evaluate` (highlighting), `Input.*`
  (interaction). Uses the user's real browser, real cookies, real logged-in
  sessions — zero credential duplication.
- **Verified constraints (MDN):** Firefox does **not** implement
  `chrome.debugger` (Mozilla bug 1316741 tracked and remains unimplemented).
  Chrome-only.
- **Workspace fit:** to host N simultaneous device previews the extension
  must open N tabs and attach to each — viable with a shared session, but the
  tabs are real user-visible tabs. Each tab reports a single viewport; we
  resize it per device. Screenshot/Live View via polling `captureScreenshot`
  (~10 FPS) — `Page.startScreencast` through `chrome.debugger` is unverified.
- **Friction:** extension install + "started debugging this browser" banner,
  distribution/review, MV3. No companion daemon needed.
- **Verdict:** strong auth/session story, Chrome-only. Secondary (Phase 3)
  provider for "use my live session" logged-in scenarios — not the primary
  multi-device engine.

### D. Desktop app (Electron/Tauri)

- **How it works:** bundle a webview (`<webview>`/WebView2/WKWebView) or embed
  the companion, package DeviceLab as a desktop binary.
- **Asset vs cost:** native webviews can visit any site (no framing
  restriction — *not* a bypass, a real browsing context), but native
  screenshot APIs are **viewport-only** (WKWebView `takeSnapshot`, WebView2
  `CapturePreview`, WebKit `get_snapshot` `VISIBLE`) and full-page capture is
  immature (wry #1674 is viewport-only). Multi-instance device emulation
  inside one desktop window is awkward; you end up shipping a whole browser
  anyway.
- **Superiority check:** our product is fundamentally "a web UI around
  per-device browser contexts". A Playwright companion already *is* the
  "embedded browser"; the desktop shell adds packaging, auto-update, and
  WebView quirks without adding capability. Electron/Tauri is **not** shown
  to be superior — it just relocates the same problem into a thicker shell.
- **Verdict:** reject as primary. Revisit only if the web + companion model
  is proven inadequate (e.g. we must preload a profile without a user step —
  not the case).

### E. Playwright standalone (server-hosted)

- **How it works:** a Node process runs Playwright (Chromium/Firefox/WebKit),
  creating per-preview browser contexts (each its own viewport/cookies), and
  exposes control over HTTP/WS. Full-page screenshots are native
  (`page.screenshot({ fullPage: true })`); Live View via CDP `Page.startScreencast`
  (Chromium only) or high-frequency `page.screenshot` (Firefox fallback).
- **It is exactly what useful architecture needs — minus the deployment
  posture.** Options are: a Hosted/SaaS service (backend infra, cost,
  session isolation) vs a **local companion** (next option) vs nothing.
- **Verdict:** the *engine* is right; the deployment we want now is local.

### F. Local companion (CLI / loopback server)

- **How it works:** a tiny Node CLI (`devicelab-companion`) launches one
  Playwright Chromium and exposes a loopback WebSocket (WS) API. The React
  app connects from any origin (loopback is "potentially trustworthy", so an
  HTTPS-hosted app can still use `ws://127.0.0.1`). Every preview = one
  browser context; the companion multiplexes N previews in one Chromium.
- **Why it is the right primary:**
  - Real browser = arbitrary sites, real viewports, real screenshots, real
    interaction, CSP-free rendering (because it *is* a browser), real
    "browser automation" (power-user feature for free).
  - All secrets stay on the machine and in the companion, not the app origin.
  - No build/CI change: the app stays a static bundle (matches the repo's
    "no backend" architecture). e2e already uses Playwright; the runtime just
    moves it from test-only to user-facing.
- **Wiring:** see §8 (communication) and §9 (representation).

### G. Hybrid (iframe + companion/browser backend)

- **How it works:** per `.preview` entry, a `backendId`/`backendMode` picks
  which engine renders: iframe (embeddable, no companion) or browser
  (arbitrary sites, needs companion). If the iframe reports `cross-origin` or
  the site refuses to frame, the UI offers to reopen that preview in the
  browser backend.
- **Verdict:** minimizes install surface while closing the capability gap. **This is the recommendation.**

## 6. Capability matrix

Ratings: ● full · ◐ partial · ○ none · ✗ actively harmful · **need companion/extension**

| Architecture | Arbitrary websites | CSP-blocked sites | Cross-origin DOM inspection | Screenshots | Multiple previews | Custom viewport | Authenticated apps | Localhost | Browser automation | Security complexity | Operational complexity | Web-only | Long-term suitability |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| A. Iframe (current) | ○ | ○ | ◐ same-origin only | ◐ same-origin best-effort | ● | ● CSS | ◐ same-origin cookies | ● | ○ | low | none | yes | ◐ feature ceiling |
| B. Reverse proxy | ◐ broken for many | ◐ by origin replay | ◐ (becomes same-origin, distorted) | ◐ | ● | ● | ◐ broken (cookie origin pinning) | ◐ | ○ | **✗ high (SSRF/open proxy)** | high | yes (server) | ○ |
| C. Extension (chrome.debugger) | ● | ● | ● | ● via captureScreenshot | ◐ N real tabs (session-shared) | ● physical + CSS | **● real live session** | ● | ● | medium (debugger privilege) | medium (install/update) | yes + extension | ◐ Chrome-only |
| D. Desktop (Electron/Tauri) | ● | ● | ● (embedded webview) | ◐ viewport-only native | ◐ | ● | ● profile-based | ● | ◐ | medium | high (packaging, updates) | ○ | ◐ heavier shell, no gain |
| E. Playwright standalone (hosted) | ● | ● | ● | ● full-page | ● | ● physical | ● profile/storageState | ● | ● | high (SaaS infra, isolation) | high | ○ (requires server) | ● |
| **F. Local companion** | ● | ● | ● | ● full-page | ● | ● physical | ● profile/storageState | ● | ● | **medium (loopback+token)** | **low (one CLI)** | yes + companion | ● |
| **G. Hybrid (A+F)** | ● | ● | ● | ● | ● | ● physical | ● profile/storageState | ● | ● | medium | low–medium | yes + companion | **● recommended** |

### What only a real browser (companion/extension) unlocks — and what stays web-only

- **A real browser unlocks:** arbitrary/cross-origin/CSP sites, native
  full-page screenshots, cross-origin DOM inspection, per-device *physical*
  viewports + real devicePixelRatio + real `navigator.userAgent`, keyboard/
  mouse/pinch input to the page, and present-day-authenticated sessions.
- **Pure web-only JS, no companion/extension, cannot** render a CSP-refusing
  page, read a cross-origin DOM, capture a cross-origin full-page screenshot,
  or emulate a real mobile UA/DPR on an arbitrary site. Any design that
  "must ship tomorrow with zero install" is bounded by these — the
  highest-value achievable today is honest messaging + the iframe backend.

## 7. Smallest viable architecture (§5)

Concretely:

1. **Backend abstraction** (`PreviewController` → `PreviewBackend`):
   the controller surface you already have (`load/config`, `setContainerSize`,
   `reload`, `destroy`, `getState`, `subscribe`, zoom) becomes the stable
   contract. Today it owns an iframe it created itself (`getIframe()`); with a
   backend it instead yields a **surface** the UI mounts (see §9). The iframe
   contract keeps working unmodified as `IframeBackend`.
2. **A `backendMode: 'iframe' | 'browser'`** on `PreviewEntry`
   (`src/preview/types.ts`). Persisted through the existing projects
   serializer unchanged.
3. **Companion RPC over loopback WS** (protocol in §8). The app never imports
   Playwright and never runs it in the page — the daemon does.
4. **The Render UI does not change:** `PreviewFrame` keeps the single scaling
   container; what it mounts inside the container is a canvas (browser
   backend) instead of an iframe (current backend). Grid/rulers/safe-area/
   device info and compare/focus/grid layouts are already resolutionindependent
   of that one swapped child.

## 8. React UI ⟷ local Playwright companion: the actual wire protocol

This is the part that must be concrete, not hand-waved.

**Discovery/transport.** The companion is a local Node process. It:
1. Launches one Playwright **Chromium** (`--headless=new`), creating a fresh
   **default context** for anonymous browsing plus named profile contexts on
   demand (see §10).
2. Binds `ws://127.0.0.1:<port>/ws?token=<high-entropy-random>` and a tiny
   `GET http://127.0.0.1:<port>/status` endpoint.
3. Prints the connect string to the terminal. The app's "Connect Companion"
   dialog asks for the install command, shows the paste box, stores the
   `{ port, token }` locally (e.g. `localStorage`), then opens the WS.

Security invariants for the transport:
- Loopback bind (`127.0.0.1`), **random port**, token validated **before**
  any command is executed (WS handshake check). CSRF-resistant regardless of
  `Origin`, since a hostile site on the web cannot guess the token; a
  compromised page *can* drive the browser via the token we stored — so the
  companion never returns page content into the page except the live-view
  pixels of URLs the user explicitly opened (existing CDP-type privacy
  posture).
- CORS is not allowed to weaken this: all state-changing commands require
  the token; no arbitrary-origin fetch of page content.
- No generic `fetch(url)`/proxy command (prevents SSRF use of the daemon).

**RPC surface (JSON over WS, `id`-correlated requests/responses):**

| Command | Payload → Result |
| --- | --- |
| `session.open` | `{ previewId, url, device }` → `sessionId`. Allocates a context in the browser backend with the requested viewport/DPR/UA. |
| `session.close` | `sessionId` → removes context. |
| `session.navigate` | `{ previewId, url? }` → reload/click-through. Returns `{ status }`. |
| `view.setDevice` | `{ previewId, device }` → apply `Emulation.setDeviceMetricsOverride` (physical viewport + DPR + UA). |
| `frame.getLiveView` | `{ previewId }` → starts sending JPEG viewport frames (see below). |
| `frame.fullPageCapture` | `{ previewId }` → PNG bytes for the screenshot feature. |
| `input.dispatch` | `{ previewId, x, y, button }` / `key` / `touch` — pointer/keyboard (see §9). |
| `inspection.request` | `{ previewId, maxElements }` → returns a **serializable inspector payload** (see inspection). |
| `session.state` / `session.list` | snapshot per preview for `PreviewState` mirrors (`lifecycle`, `error`). |

Live view: Chromium-only `Page.startScreencast` via a per-session CDP session
for low-overhead frames; if unavailable (e.g. a Firefox collaboration later),
fall back to high-frequency `page.screenshot` (10 FPS). Kept as two internal
frame sources behind `frame.getLiveView`.

**Store/route mapping.** `createPreviewController` becomes a thin router: for
`backendMode === 'iframe'` it uses the existing `IframeBackend` (a renamed
today's `previewEngine.ts`); for `'browser'` it proxies to the companion
transport, translating `PreviewState` from `session.state` events and keeping
the same `subscribe`-driven React flow (`usePreview.ts` unchanged).

## 9. How a browser-controlled page is represented in the Workspace

The workspace is `entries × layoutMode (grid/focus/compare)` — all UI above
the frame. The browser backend only changes **one swapped child** in
`PreviewFrame.tsx`.

**Live View = canvas surface.** For each backend-rooted preview:

- The `containerRef` div (already sized to device viewport W×H, `PreviewFrame.tsx:92`) is filled with a `<canvas width=W*dpr height=H*dpr>`.
- The companion pushes JPEG viewport frames over the WS; the app
  `drawImage`s each into the canvas and discards old blobs (no leak). At 10 FPS
  and ~30–60 KB/frame this is a few MB/s over loopback — acceptable; optional
  bitrate cap per preview for high-DPR devices.
- The **single scaling container** (`transform: scale(effectiveZoom)`) wraps
  the canvas exactly as it wraps the iframe today. Grid/rulers/safe-area
  overlays are children of that container and unchanged.
- **Input bridging:** a pointer handler on the canvas maps
  `(clientX,clientY) → viewport-relative (x,y)` via `effectiveZoom` and
  `devicePixelRatio`, then sends `input.dispatch` (CDP
  `Input.dispatchMouseEvent`/`dispatchTouchEvent`/`dispatchKeyEvent`). Focus,
  hover, scroll, pinch all go through the daemon into the *real* page.
- **Highlighting/inspection:** instead of injecting a `<style>` into a frame
  (impossible cross-origin), the companion computes an **inspector payload**
  (`inspection.request`): a bounded set of serialized elements with
  `getComputedStyle`-relevant subset, element ids/positions (the existing
  `MeasurementAdapter` model, `src/inspection/measurement.ts`, is already
  reusable as a "probe payload" generator). DeviceLab applies its
  deterministic diagnostic IDs and renders highlight rectangles as **canvas
  overlays** positioned like today's frame injection — the `highlight.ts`
  style-injection path is used only for the iframe backend.
- **Screenshot:** the existing "Captur buttons" call `frame.fullPageCapture`
  and receive a real full-page PNG from the real browser (vs today's
  foreignObject best-effort). `capture.ts` keeps its honest statuses but gains
  a browser-engine source: status `'ok'` from daemon bytes.
- **Workspace invariants preserved:** `usePreviewStore` entries/layout/
  compare need no schema change (`backendMode` is the only new field);
  `src/projects/serializer.ts` round-trips it; custom-viewport entries reuse
  the existing synthetic `DeviceDefinition` path (`CUSTOM_DEVICE_ID`); the
  device registry stays the single source of device data; e2e fixtures remain
  same-origin but also exercise `backendMode: 'browser'` with a real site.

Multi-preview cost control: cap concurrent browser sessions (compare mode
uses fullPage captures, then live canvas per active preview; grid serves
throttled frames, focus serves full-rate). This mirrors the existing
`MAX_ELEMENTS` bound for inspection (`inspectionEngine.ts:54`).

## 10. Authenticated / private apps (first-class requirement)

Requirement: *"test a web app I am logged into, on multiple devices."* Reuse
must be safe and practical. Two mechanisms, and a comparison:

### Mechanism 1 — Persistent Playwright profiles + `storageState`

Companion-native.

- **Bootstrap a profile:** companion opens a **visible (headful) Chromium**
  window for the user to sign in ("browse to the app and log in"). The user
  explicitly chooses a profile name. Then `context.storageState()` is
  exported to the profile directory *on the user's machine*.
- **Hydrate per-device contexts:** each preview gets a fresh
  `browser.newContext({ storageState })` + per-device `Emulation
  .setDeviceMetricsOverride`. Parallel, portable, no directory lock.
- **Coverage:** `storageState` captures cookies, localStorage, IndexedDB, and
  WebAuthn/passkeys (Playwright docs). It does **not** cover
  `sessionStorage` or http cache — apps relying on those need an
  `addInitScript` shim (documented; Playwright has this pattern).
- **Persistent `launchPersistentContext(userDataDir)`** alternative: carries
  more (full userprofile/extension state) but an entire profile = a single
  locked directory — two previews on the same profile cannot run concurrently,
  and the dir is not portable. Rejected as *primary*; kept as an optional
  "faithful profile" mode for single-preview debug sessions where the extra
  fidelity matters.

### Mechanism 2 — Browser extension, `chrome.debugger` (user's live session)

Attaches CDP to the user's real logged-in browser.
- **Best session fidelity:** zero copied credential material (the browser
  keeps it; we hold CDP handles only). "Test the thing I'm logged into, right
  now."
- **Verified blockers:** Firefox has no `chrome.debugger` (MDN, Mozilla bug
  1316741) — Chrome-only. Multi-device = N real tabs sharing the user's
  session (concurrent device viewports on *one* login are possible via
  per-tab `setDeviceMetricsOverride` but the tab count and the "debugging"
  banner is user-visible friction). Live view via polling `captureScreenshot`
  is verified; `Page.startScreencast` through `chrome.debugger` is unverified.

### Comparison & recommendation

| Criterion | Persistent profile + storageState (F) | Extension live session (C) |
| --- | --- | --- |
| Session fidelity | High (func if storageState covers) | **Highest** (real browser, real session) |
| Credential handling | Stored locally, never in app origin | **No copying at all** |
| Multi-device concurrency | ● full | ◐ N real tabs |
| Browser coverage | All (companion is browser-agnostic) | Chrome only |
| Fidelity edge cases (sessionStorage, cache) | Known gaps (shimmable) | Real |
| Operating model | Assistant-installed CLI | Extension install/distribution |

**Recommendation:** primary path = **Mechanism 1** (login once → per-device
`storageState` contexts), exposed with an explicit "sign in into a portable
profile" step and clear text in the companion's local UI that these are
*DeviceLab-profile* credentials (not the user's daily browser profile), so the
companion's anonymous browser stays clean by default. **Mechanism 2 is a
Phase 3 optional provider** for "test my live logged-in tab" — with the
Chrome-only constraint and the real-tab multi-preview caveat documented. Do
not ship a mechanism that copies passwords/cookies into the web app's origin.

## 11. Migration path (preserving the workspace)

**Phase 0 — today (iframe backend).** Status quo; document boundaries.
Reachable today with no unpacking of the controller.

**Phase 1 — backend abstraction (first implementation phase).**
This is what should actually be built now:
1. Introduce `PreviewBackend` (the `PreviewController` surface minus
   `getIframe`; add `setSurface(el)`/`mount(el)`), with `IframeBackend`
   extracted from today's `previewEngine.ts` unmodified in behavior.
2. Add `backendMode` to `PreviewEntry` (+ serializer round-trip, default
   `'iframe'`).
3. Introduce the **surface** mount in `PreviewFrame` (branch: render
   `iframe` element **or** a reactive canvas slot, same scaling container).
4. Keep all e2e/unit tests green; add a fixture that asserts iframe-mode
   continues to behave identically.
No user-visible change; this is the refactor that makes the migration safe.
The abstraction contract (controller surface, subscriber model, honest
`PreviewState`/) is the "seam" every later phase plugs into.

**Phase 2 — Playwright companion MVP.**
- `devicelab-companion` CLI (npm package): launch Chromium, loopback WS RPC
  (§8), live-view canvas (§9), full-page captures, pointer/keyboard input,
  `storageState` profile bootstrap (§10), CORS/token hardening, apply device
  viewports/DPR via context + CDP.
- App side: "Connect Companion" dialog, `browser` backend route, per-entry
  `backendMode` in UI, auto-suggest *"This site doesn't allow embedding — use
  the browser preview?"* when an iframe preview lands on `cross-origin`/refusal.
- e2e: `backendMode: 'browser'` scenarios against the *real* two-server setup
  plus one genuinely-embedding-refusing site.

**Phase 3 — companion ergonomics + auth escalation.**
Profiles manager (name, sign-in flow, rotate/reset), sessionStorage shim,
performance: screencast path + bitrate caps, discoverability (status chip in
workspace when companion is absent, token paste), and optional extension
provider (Mechanism 2) for live logged-in tabs (Chrome-only).

**Phase 4+ — hosted option.** The same companion RPC spec implemented as a
hosted service (isolated per-session contexts, presigned live-view streams,
e.g. the Bedrock AgentCore pattern of direct video to the client). The app
talks to `Backends` (iface/companion/hosted) through the one abstraction.

**DeviceLab components that are explicitly preserved end-to-end:**
`usePreviewStore`, `projects/serializer`, device registry, layout modes
(grid/focus/compare), rulers/overlays/bezel, inspection engine (via probe
payload), screenshot statuses, and the workspace React tree. Rewrites are
limited to: `previewEngine.ts` (becomes the `IframeBackend`), introduction of
`browserBackend` (new), and mounting the surface in `PreviewFrame`.

## 12. Final recommendation

**Hybrid: iframe backend + Playwright local companion (primary), with
`backendMode` routing per preview; profiles/`storageState` for auth; a
loopback WS RPC + canvas Live View as the app↔browser bridge; hosted and
extension paths later.**

- **Confidence: high** that this is architecturally correct (a real browser is
  the only broadly-correct way to render arbitrary sites; the abstraction and
  wire protocol keep the existing workspace and store intact).
- **Confidence: medium** on Phase 2 execution details that must be validated
  with spikes: (1) screencast-vs-poll live-view bandwidth at 3+ simultaneous
  previews; (2) loopback WS from an HTTPS-hosted app (loopback is
  potentially-trustworthy, but confirm blessing in the target environments);
  (3) storageState holes for the specific target apps (sessionStorage etc.);
  (4) whether `chrome.debugger` can start screencast (Phase 3 only); (5) which
  embedding-refusing sites real users hit most (drives the auto-suggest UX).

**Unknowns to validate experimentally** (each is a small, isolated spike
before the Phase 2 build): see the list above, plus Chromium
`navigator.webdriver`-driven blocks on popular sites, per-context DPR/UA
fidelity, and the token-paste UX acceptance.

## 13. Explicit non-goals

What we are **not** doing in this investigation (implementation), and what the
product must respect: no frame-ancestors/XFO/reverse-proxy bypass, no
automation-stealth, no app-side credential handling, no proxy/extension/desktop
build yet — only this document. The repository is unchanged except this file.