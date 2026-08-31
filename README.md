# ChatGPT Usage Overlay for Firefox

A small, privacy-focused Firefox extension that displays ChatGPT's five-hour and
weekly usage windows, reset times, and adaptive estimates of messages remaining.

Drag the overlay by its header to place it anywhere in the browser window. Its
position is remembered locally. While dragging, drop it on the temporary **Drag
here to dock.** target to anchor it beside ChatGPT's top-header Share button. A
docked overlay follows that button when the browser is resized and expands to
the left so it does not cover it. Project-level Share buttons lower on the page
are ignored; on those screens, the overlay remains docked in the upper-right
corner. The minus button collapses it to a centered,
compact bar such as **24% used - Resets in 4h 17m**; use the plus button to
expand it again.

On first installation, the overlay starts docked and expanded. After you move,
collapse, expand, or redock it, the last-used state is restored when Firefox or
ChatGPT opens again. When the overlay is undocked, the small pop-out-style button
between Refresh and Minimize snaps it directly back beside Share.

When ChatGPT is signed out, the overlay temporarily expands and docks to the
left of the Log in or Sign in button so it does not cover the account controls.
The user's saved signed-in position and collapsed state are not overwritten.

[Support me on Ko-Fi☕](https://ko-fi.com/wifiog)

## Privacy

- Connects only to `chatgpt.com`.
- Uses your existing ChatGPT login automatically; there is no additional login
  or authorization. A page-side helper asks ChatGPT's own session endpoint for
  its short-lived access token and uses it only within your local, signed-in
  ChatGPT browser session to request your usage information from ChatGPT. The
  token is never sent to the overlay, stored, logged, or sent to the developer
  or any third party.
- Does not read or store conversation text.
- Sends nothing to the developer or any third-party service.
- Stores only previous usage percentages, reset timestamps, a numeric count of
  locally sent messages, recent message-to-percentage samples, and overlay
  settings in Firefox's local extension storage. Prompt and conversation text
  are never included.

Firefox will show “Access your data for chatgpt.com” because an automatic page
overlay requires permission to run on ChatGPT. Firefox cannot express a
permission limited to only one path on that site.

Firefox will also show the required **Authentication information** declaration.
This refers only to the temporary use of your existing ChatGPT session token as
described above. The extension does not ask for, read, or store your password.

## How message estimates work

ChatGPT exposes percentage used rather than a fixed number of messages. Message
cost varies with the model, context, reasoning, tools, and task complexity.
The extension counts local send actions without reading message text, then
correlates those counts with later usage-percentage increases. For example, if
four locally sent messages collectively increase usage by 1%, the learned cost
is 0.25% per message rather than incorrectly treating the 1% increase as one
message. The estimate uses the combined percentage change per message across up
to 18 recent correlated samples.

The five-hour estimate requires at least five messages across two usage changes.
The weekly estimate requires at least ten messages across three usage changes.
Until those minimums are reached, it displays **Learning estimate…**. As an extra
conservative check, a weekly result lower than the ready five-hour estimate is
also hidden as **Learning estimate…** rather than displaying a likely misleading
number.
