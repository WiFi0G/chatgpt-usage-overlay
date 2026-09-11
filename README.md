# ChatGPT Usage Overlay for Firefox

A small, privacy-focused Firefox extension that displays ChatGPT usage windows,
reset times, and adaptive estimates of send attempts remaining.

Drag the overlay by its header to place it anywhere in the browser window. Its
position is remembered locally. While dragging, drop it on the temporary **Drag
here to dock.** target to anchor it beside ChatGPT's top-header Share button. A
docked overlay follows that button when the browser is resized and expands to
the left where space permits. If a narrow window has too little room, it moves
below the header instead of covering the anchor. Project-level Share buttons
lower on the page are ignored; on screens without an eligible anchor, the dock
reserves 200 pixels for the right-side header controls. When signed out, a docked
overlay moves below the header so it cannot cover the authentication controls.
The minus button collapses it to a comfortably padded compact bar such as
**35% used - Resets in 4h 30m**; use the plus button to expand it again. Window
titles remain visible in the expanded rows.

In the expanded panel, the reset countdown and message estimate share a single
line in 12-pixel text. Hover over the countdown to see the full reset day and
time. This keeps longer estimates and `Learning estimate…` from wrapping.

On first installation, the overlay starts docked and expanded. After you move,
collapse, expand, or redock it, the last-used state is restored when Firefox or
ChatGPT opens again. When the overlay is undocked, the small pop-out-style button
between Refresh and Minimize snaps it directly back beside Share.

Version **1.0.20 production candidate** retains the confirmed 1.0.14-style direct
usage retrieval and includes the completed interface backlog, corrected compact
wording and spacing, signed-out header clearance, and the wave icon.
It requests usage when ChatGPT opens, every 30 seconds, when the tab becomes
visible, and when you click Refresh. It does not depend on opening a Work
conversation and opens no temporary dashboard tabs. Fresh requests replace the
passive-only waiting and saved-reading cache from 1.0.15/1.0.16.

With no data, the collapsed pill says **Waiting for usage…**; failed requests
show **Usage unavailable**, or **Sign in for usage** when no session is returned.
Failures clear the displayed numbers and preserve your saved layout. Header
anchors use control attributes and geometry without reading page text.

Live Firefox usage retrieval is confirmed in 1.0.17 and 1.0.18. The 1.0.20
changes still need a final live layout pass. Window names
use a safe server-supplied label when present, otherwise a validated duration
such as **5-hour**, **7-day**, or **30-day**, with **Usage window** as the neutral
fallback. The observed limits must not be assumed to measure ordinary chat-message
allowances.

Firefox Desktop is the supported platform for now. Android and account-scoped
estimator history are intentionally out of scope.

The footer includes an optional **Support me on Ko-Fi☕** link to
`https://ko-fi.com/wifiog`.

## Privacy

The extension uses your existing ChatGPT session to request usage from ChatGPT.
Its page script temporarily reads a session token and selected-account cookie;
these values stay in page memory and are used only for requests back to ChatGPT.
It does not save credentials, log or display them, or send them to the developer.
It does not read passwords, prompts or conversations.

Only a validated plan label, percentages, reset timestamps, window durations,
and short safe window names pass to the overlay. Numeric estimator history,
send-attempt counts and overlay preferences
are stored locally in Firefox. The old 1.0.16 numeric reload cache is ignored;
its entries may remain until extension data is cleared. No analytics, remote
code, additional login or developer server is used. Ko-Fi opens only on a click.

Firefox requires access to chatgpt.com for automatic operation. This recovery
retains the original **Authentication information** declaration. Removing that
warning was retired/deferred from active production work on 2026-09-10 and will
only be revisited if requested later. Exact installation and update disclosures
remain to be verified.

## Temporary installation

1. Extract the ZIP file.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Select **Load Temporary Add-on**.
4. Open the extracted folder and select `manifest.json`.
5. Open or refresh `https://chatgpt.com/`.

The temporary installation remains active until Firefox fully restarts.

## How send-attempt estimates work

ChatGPT exposes percentage used rather than a fixed number of sends. Request
cost varies with the model, context, reasoning, tools, and task complexity.
The extension counts trusted local send attempts without reading message text,
using form submission as the primary signal and click/Enter only for composers
without a form. Duplicate signals within one second are coalesced. It then
correlates those counts with later usage-percentage increases. For example, if
four send attempts collectively increase usage by 1%, the learned cost is 0.25%
per attempt rather than incorrectly treating the 1% increase as one attempt.
The estimate uses the combined percentage change per attempt across up
to 18 recent correlated samples.

These estimates are experimental: attempts may fail, and ordinary-chat sends
have not been established to consume the observed Work allowance. They should
not be treated as a guaranteed number of successful sends or ordinary chat
messages remaining.

The five-hour estimate requires at least five attempts across two usage changes.
The 7-day estimate requires at least ten attempts across three usage changes.
Until those minimums are reached, it displays **Learning estimate…**. As an extra
conservative check, a 7-day result lower than the ready five-hour estimate is
also hidden as **Learning estimate…** rather than displaying a likely misleading
number.

## Permanent private installation

Standard Firefox requires add-ons to be signed. Submit the ZIP through Mozilla's
Add-on Developer Hub using **On your own** (unlisted/self-distributed), download
the signed `.xpi`, then open `about:addons` and choose the gear menu → **Install
Add-on From File**. It does not need to be publicly listed.

## Maintenance note

The usage response is an internal ChatGPT web interface rather than a documented
public API. A future ChatGPT change may require updating the endpoint or response
field names in `page-usage-fetcher.js`.
