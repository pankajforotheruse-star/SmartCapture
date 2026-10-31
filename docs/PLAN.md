# Roadmap

## v0.2 — implemented (prototype)
- Start recording with one click; Stop automatically exports PNG.
- Inject content script into tabs already open without requiring a refresh.
- Automatically detect candidate overlays after hover/click.
- Prevent duplicates via normalized popup text and anchor signature.
- Capture screenshot crop at native device pixels to minimize blur.
- Export original viewport plus a dedicated right-side strip for captured popups, with connector lines.
- Entire process stays inside the browser.

## Next validation and improvements
1. Test the actual target business website and inspect captured output.
2. Fix heuristics for popup discovery and transient events.
3. Explicit on-page recording indicator and selection feedback.
4. Persist capture state across popup/browser interruptions where possible.
5. Scroll capture and multi-viewport stitching.
6. Better connector routing and collision-free layout; reduce generated canvas size.
7. Automated browser end-to-end tests.
8. Enhanced detection for shadow DOM and iframe popups.