# SmartCapture roadmap

## v0.1
- Start a session and snapshot the base visible viewport.
- Click a control, show its popup, hover the popup, then preserve the popup using Alt+Shift+S.
- Repeat for more popups without losing previous captures.
- Export one PNG with each popup anchored to its original control via a visible line.
- Never intentionally rearrange the source page.

## Limitations to test
- Some dynamic menus dismiss on keyboard shortcuts or extension focus.
- Popup candidate detection is heuristic; manual targeting may be needed.
- Captures only the visible viewport, not a full scrolling page.
- Popups can obscure original information; placement optimization is preliminary.
- Browser special pages and cross-origin iframes are not supported.

## Next
Add element picker, drag positioning with updating connectors, smart whitespace selection, and UI regression tests.