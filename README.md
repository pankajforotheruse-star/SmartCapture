# SmartCapture

Free, local-first Chrome/Edge extension for combining temporary interactive popup states into a single screenshot.

## v0.2 — Start / Stop capture

1. Open any regular website (already-open tabs are supported).
2. Click the SmartCapture extension icon and select **Start Capture**.
3. Click or hover over items you want captured. Leave each popup visible briefly (about one second). Do **not** open the extension while a popup is still needed.
4. Reopen the extension and select **Stop & Save PNG**.
5. A single PNG downloads with the original page on the left and captured popups in a dedicated annex on the right. Connector lines identify the originating controls.

## Installation

Download this repository as ZIP, extract it, visit `chrome://extensions` or `edge://extensions`, enable Developer mode, click **Load unpacked**, and select the `extension` folder. When updating an installed version, use **Reload** on the extension card after replacing the folder contents.

## Design decisions

- Captures each popup as actual screen pixels at native resolution instead of recreating its content as HTML.
- De-duplicates popup states by trigger label and position plus normalized popup text.
- Does not intentionally reposition or obscure original page content; puts captured popups in a dedicated right-hand lane.
- Uses connector lines between source controls and captured popups.
- No backend, account, or data upload required.

## Known limitations

- Prototype, not yet verified on target business application.
- The popup is captured after a short debounce, so extremely brief or animated popups may be missed.
- On some pages heuristics may select an incorrect overlay or miss a popup, especially complex iframes, shadow DOM, or portals.
- Current export is the visible viewport, not a full-page scrolling capture.
- If the browser tab or extension is reloaded mid-session, the in-page session is lost.
- Opening browser internal pages (`chrome://` or `edge://`) is not supported.
- Captured UI may contain confidential information. Handle resulting PNGs accordingly.

See [roadmap](docs/PLAN.md).