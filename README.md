# ChatGPT Usage Overlay for Firefox

Keep your ChatGPT usage and reset countdowns visible in a small, movable overlay.
Built for Firefox Desktop, with no dependencies or build step.

## Features

- Usage percentages and reset countdowns, including **5-hour** and **Weekly** windows when reported by ChatGPT.
- An expanded panel with usage bars, or a compact **N% used** display.
- Automatic refresh on page load, every 30 seconds, and when you return to the tab. A Refresh button is also available.
- Drag anywhere or dock beside the page's header controls. On Library, the dock sits at the top, left of the filter controls.
- Header collision detection that avoids nearby controls without following scrolling conversation content.
- Position, docked state, and collapsed state saved locally across reloads and browser restarts.
- Experimental estimates of send attempts remaining, learned from local usage changes.

Hover over a reset countdown to see the full date and time. Use **−** to collapse
and **+** to expand. To dock, drag the panel by its header onto **Drag here to
dock.**, or use the dock button while the panel is undocked.

When usage cannot be retrieved, the overlay shows **Waiting for usage…**,
**Usage unavailable**, or **Sign in for usage**, rather than stale percentages.

## Try it locally

1. Download and extract the source or add-on ZIP.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Choose **Load Temporary Add-on** and select `manifest.json`.
4. Open or refresh [ChatGPT](https://chatgpt.com/).

Temporary add-ons remain installed until Firefox fully restarts. After changing
source files, reload the extension on the debugging page and refresh ChatGPT.

## Privacy

The extension uses your existing ChatGPT session to request usage directly from
ChatGPT. Credentials are never saved,
logged, displayed, or sent to the developer or overlay.

It does not read prompts, conversations, passwords, or search-field contents.
Only validated usage fields reach the overlay. Layout preferences, numeric
estimator samples, and send-attempt counts are stored locally in Firefox.
There is no analytics, telemetry, remote code, additional login, or external
server.

The extension uses Firefox's storage permission and runs on `chatgpt.com`.
Its manifest declares **Authentication information** for the session handling
described above.

## Estimates and limitations

Send-attempt estimates are experimental, not guaranteed message allowances.
The extension counts send actions without reading their contents and compares
those counts with usage changes. It shows **Learning estimate…** until enough
samples are available. Failed sends and differences in task cost can affect
accuracy; ordinary chat sends are not established to consume the reported
allowance.

Usage availability and window durations depend on what ChatGPT reports. The
extension relies on internal ChatGPT endpoints and page structure, so website
changes may require updates. Firefox Desktop is supported; Android is not.

## Project status and development

The current source is **1.0.21**, with direct usage
retrieval and the latest docking improvements. Chat scrolling and Library
placement have been confirmed by user testing. Full release validation is
tracked in [Open issues](docs/OPEN_ISSUES.md); existing ZIPs may lag the source.

## Support

If you find the extension useful, [support me on Ko-fi ☕](https://ko-fi.com/wifiog).

## License

[MIT](LICENSE).
