# SmartCapture

## v0.10 — Hover popups and nearer context-aware placement (experimental)

- Hover events on small price/discount/info icons are recorded even without an ARIA tooltip attribute or framework-specific CSS class.
- Newly inserted floating panels are identified using DOM mutations, computed positioning and nearby source interactions; a bounded fallback scan also detects CSS-only hover panels with no DOM mutation.
- Earlier clicks no longer take precedence over a more recent, causally related hover when both were near a newly revealed popup.
- Plain links without hover-popup indicators remain excluded to avoid recreating the incorrect filename/menu association from v0.8.
- Large popup captures may be rendered at **94%** of their captured size **only when that enables significantly closer collision-free placement**. Normal 100% rendering remains preferred; no text is cropped.
- Tooltip detection is best-effort on very short hovers, unusual shadow DOM and cross-origin frames. Users should hold a tooltip open long enough for the browser screenshot to complete.
- Regression tests now cover unmarked SVG icons, dynamically inserted floating divs, distinct pricing tooltips, and safe compact popup placement. Browser testing on the actual business application is still required.


## v0.9 — Correct popup-to-control association (experimental)

- Each popup is attributed to **one** eligible trigger using recent interaction timing, DOM state changes, optional ARIA links and screen proximity; no page-specific coordinates or labels.
- Plain hyperlinks without hover-popover semantics are **not** registered as hover popup triggers. Clicking an ordinary link is still tracked, because links may legitimately open popovers.
- A menu that was already visible and did not change is not re-attributed to a later unrelated interaction.
- Matching popup content at the same visual location is claimed once per session, preventing duplicate boxes from competing controls.
- Popup clicks still work across different cards with identical labels when they generate distinct content/locations.
- Popup capture remains best-effort on websites with complex animation, shadow DOM, or cross-origin iframes.

New tests simulate a filename hyperlink beside a three-dot menu, unrelated clicks, and a real link tooltip. All 14 isolated regression tests passed in the development harness, but the business page is **not** yet browser-tested.


## v0.8 — Reliable capture of multiple controls (experimental)

SmartCapture is intended for general webpages; it does not use fixed popup positions or rules tied to any customer, contract, or sample screenshot. The layout engine finds clear areas using image occupancy and DOM rectangles, places captured popups near their triggering controls, and falls back to extending the output when no safe position exists.

**Capture reliability changes:**

- Keeps independent pending capture records for each clicked or hovered source (including two identical "1 Billing Account" controls in different cards).
- A second click cannot cancel the first trigger's timer.
- Stores the exact source rectangle with each triggered popup, rather than using a shared last-clicked element.
- Only captures a popup that appears or changes after the corresponding interaction; an already-open unrelated popup is ignored.
- Checks pending captures before Stop & Save; de-duplicates repeats of the same source and popup content.
- Shows the number of captured and detected interactions when finishing the session.

**Limitations:** The browser screenshot API does not guarantee that extremely fast open/close interactions can be captured. Leave each popup visible briefly while testing. Popups inside cross-origin iframes or unusual shadow roots may need additional support. Changes are covered by isolated regression tests, but **not yet verified on the target business webpage**.

Run `node --test tests/*.test.cjs` to execute layout and interaction regressions.


## v0.7 — Minimize wasted space for tall popups

The layout engine now permits a captured popup to begin inside verified blank space near its source and extend only slightly past the original screenshot height. It penalizes extra height and still rejects overlap with original text, controls, card borders and other popups. If no safe location exists, it retains the below-page fallback. This specifically addresses long product popups appearing below a giant empty gap. Four synthetic layout regression checks pass; behavior on the user's actual application remains unverified.


## v0.6 — Safety-first capture (experimental)

After v0.5 caused regressions, the layout engine was replaced with strict occupancy checks. It uses baseline DOM text and control bounds, screenshot ink, and panel boundary lines to reject positions that could cover existing content. It searches for safe positions, considers multiple popups together, and extends below the original screenshot if necessary. Connectors use an obstacle-avoiding grid; **a connector is omitted if no safe route is found** rather than drawing across text. Capture now waits for a popup to be stable and fully opaque, avoiding screenshots taken mid-fade; a popup that never settles may be missed. These safeguards have synthetic regression tests, not yet verified against the business application.

Run `node --test tests/layout.test.cjs` to execute layout regressions. GitHub Actions also checks the project on pushes.


## v0.5 — Global layout optimization (experimental)

- Detect actual text fragments and controls as obstacles instead of blocking whole cards.
- Combine baseline screenshot edge detail with DOM occupancy to reject visually busy regions.
- Generate popup candidates across the viewport; run beam-search global optimization to avoid popup overlap.
- Route source-to-popup connectors on an A* grid, preferring obstacle-free paths. If no clean route exists, a high-penalty fallback may cross content; inspect results.
- Preserve captured popup pixels without scaling. When no safe in-page position exists, extend the canvas downwards.
- Browser-site integration is not yet verified. A synthetic test of a two-popup layout confirmed distinct boxes and nonempty connector routes, but does not guarantee correct routing on other webpages.


## v0.4 — Safe nearest-whitespace layout\n\nPlacement checks DOM elements and screenshot image detail, then chooses the nearest clear area to each originating control. Connectors are drawn behind popup cards. Original-resolution popup pixels are copied without resizing. Fallback expands downward if no safe area is found. This remains an unverified browser prototype.\n\n## v0.3 — Context-aware layout

Captured popups are placed in low-detail / unused regions of the **original screenshot**, with a separate connector line from each triggering control. Popups are not forced into a right-hand annex. When no sufficiently blank position is available, export expands **below** the original screenshot rather than covering important information. This is a heuristic prototype; validate on your application.

Free, local-first Chrome/Edge extension for combining temporary interactive popup states into a single screenshot.

## v0.3 — Start / Stop capture

1. Open any regular website (already-open tabs are supported).
2. Click the SmartCapture extension icon and select **Start Capture**.
3. Click or hover over items you want captured. Leave each popup visible briefly (about one second). Do **not** open the extension while a popup is still needed.
4. Reopen the extension and select **Stop & Save PNG**.
5. A single PNG downloads with the original page and captured popups placed in available page whitespace. Connector lines identify the originating controls.

## Installation

Download this repository as ZIP, extract it, visit `chrome://extensions` or `edge://extensions`, enable Developer mode, click **Load unpacked**, and select the `extension` folder. When updating an installed version, use **Reload** on the extension card after replacing the folder contents.

## Design decisions

- Captures each popup as actual screen pixels at native resolution instead of recreating its content as HTML.
- De-duplicates popup states by trigger label and position plus normalized popup text.
- Does not intentionally reposition or obscure original page content; places captured popups in low-detail whitespace within the original page, falling back to extending the canvas downward.
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