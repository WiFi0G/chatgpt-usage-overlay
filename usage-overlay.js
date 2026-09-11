(() => {
  "use strict";

  if (document.getElementById("chatgpt-usage-overlay-host")) return;

  const REQUEST_EVENT = "chatgpt-usage-overlay-request-v1";
  const RESULT_EVENT = "chatgpt-usage-overlay-result-v1";
  const STORAGE_KEY = "chatgptUsageEstimatorV2";
  const MESSAGE_COUNT_KEY = "chatgptUsageLocalMessageCountV1";
  const UI_KEY = "chatgptUsageOverlayUiV1";
  const POLL_MS = 30_000;
  const MAX_SAMPLES = 18;
  const MIN_SAMPLE_CHANGES = { primary: 2, secondary: 3 };
  const MIN_TRACKED_MESSAGES = { primary: 5, secondary: 10 };
  const PROMPT_SELECTOR = '#prompt-textarea, textarea[data-testid="prompt-textarea"], [contenteditable="true"][data-testid="prompt-textarea"]';
  const DOCK_GAP = 10;
  const DOCK_EDGE_GAP = 12;
  const DOCK_FALLBACK_RIGHT_GAP = 200;
  const HEADER_ANCHOR_MAX_BOTTOM = 72;
  const pendingRequests = new Map();
  let lastMessageSignalAt = 0;
  let messageCountWrite = Promise.resolve();

  const host = document.createElement("div");
  host.id = "chatgpt-usage-overlay-host";
  host.style.cssText = [
    "all:initial",
    "display:block",
    "position:fixed",
    "top:72px",
    `right:${DOCK_FALLBACK_RIGHT_GAP}px`,
    "z-index:2147483647",
    "font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"
  ].join(";");

  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      .panel {
        width: 276px; color: #f3f4f6; background: rgba(20, 20, 22, .96);
        border: 1px solid rgba(255,255,255,.14); border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,.28); overflow: hidden;
        font-size: 12px; line-height: 1.35;
      }
      .header {
        display:flex; align-items:center; gap:8px; padding:9px 10px; background:#19191b;
        cursor:grab; user-select:none; touch-action:none;
      }
      .header:active { cursor:grabbing; }
      .title { font-weight:700; letter-spacing:.01em; flex:1; white-space:nowrap; }
      .mini-title {
        display:none; align-items:center; justify-content:center; gap:4px;
        width:100%; min-width:0; padding:0 20px; white-space:nowrap;
      }
      .mini-primary { font-weight:700; }
      .mini-reset { color:#aeb1b7; font-weight:500; }
      .plan { color:#a7f3d0; font-size:10px; text-transform:uppercase; }
      button {
        display:inline-flex; align-items:center; justify-content:center;
        width:20px; height:20px; padding:0; color:#d1d5db;
        border:1px solid rgba(255,255,255,.09); border-radius:4px;
        background:rgba(255,255,255,.07); cursor:pointer; font:inherit;
      }
      button:hover {
        background:rgba(255,255,255,.15); border-color:rgba(255,255,255,.16); color:white;
      }
      #dock { padding:0; }
      #dock svg { width:13px; height:13px; fill:none; stroke:currentColor; stroke-width:1.6; }
      .panel.docked #dock { display:none; }
      .body { padding:10px; display:grid; gap:11px; }
      .panel.collapsed { width:220px; }
      .panel.collapsed .body, .panel.collapsed .footer, .panel.collapsed .error { display:none !important; }
      .panel.collapsed .title, .panel.collapsed .plan, .panel.collapsed #refresh { display:none; }
      .panel.collapsed .mini-title {
        display:flex; flex:1 1 auto; justify-content:flex-start;
        width:auto; min-width:0; padding-left:2px; overflow:hidden;
      }
      .panel.collapsed .header { padding:6px 9px 6px 13px; gap:8px; justify-content:flex-start; }
      .panel.collapsed #dock { display:none; }
      .panel.collapsed #collapse { flex:0 0 20px; width:20px; padding:0; }
      .dock-target {
        position:fixed; display:none; align-items:center; justify-content:center;
        height:34px; min-width:120px; padding:0 12px; color:#bfdbfe;
        background:rgba(37,99,235,.18); border:1px dashed rgba(96,165,250,.9);
        border-radius:10px; box-shadow:0 6px 18px rgba(0,0,0,.2);
        font-size:11px; font-weight:700; pointer-events:none;
      }
      .dock-target.visible { display:flex; }
      .dock-target.active { color:white; background:rgba(37,99,235,.42); border-style:solid; }
      .row-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
      .window-name { font-weight:650; color:#f9fafb; }
      .percent { color:#d1d5db; }
      .track { height:6px; background:#343438; border-radius:999px; overflow:hidden; margin:5px 0; }
      .fill { height:100%; width:0; border-radius:inherit; background:#10b981; transition:width .25s ease; }
      .details {
        display:flex; align-items:baseline; justify-content:space-between; gap:8px;
        color:#aeb1b7; font-size:12px; white-space:nowrap;
      }
      .estimate { color:#e5e7eb; font-weight:600; }
      .footer { padding:0 10px 9px; color:#858991; font-size:10px; display:flex; justify-content:space-between; }
      .support-link { color:#60a5fa; text-decoration:underline; text-underline-offset:2px; }
      .support-link:hover { color:#93c5fd; }
      .error { color:#fca5a5; padding:10px; display:none; }
    </style>
    <section class="panel" aria-label="ChatGPT Usage Overlay">
      <div class="header">
        <span class="title">ChatGPT Usage Overlay</span>
        <span class="mini-title">
          <span class="mini-primary" id="mini-primary">Waiting for usage…</span>
          <span id="mini-separator" aria-hidden="true" hidden>-</span>
          <span class="mini-reset" id="mini-reset" hidden></span>
        </span>
        <span class="plan" id="plan"></span>
        <button id="refresh" title="Refresh usage" aria-label="Refresh usage">↻</button>
        <button id="dock" title="Dock to ChatGPT header" aria-label="Dock to ChatGPT header">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="2.5" y="5.5" width="8" height="8" rx="1.25"></rect>
            <path d="M7 3h6v6M13 3 7.5 8.5"></path>
          </svg>
        </button>
        <button id="collapse" title="Collapse overlay" aria-label="Collapse overlay">−</button>
      </div>
      <div class="error" id="error"></div>
      <div class="body" id="body">
        <div class="usage-row" id="primary">
          <div class="row-head"><span class="window-name">5-hour</span><span class="percent">Loading…</span></div>
          <div class="track"><div class="fill"></div></div>
          <div class="details"><span class="reset"></span><span class="estimate"></span></div>
        </div>
        <div class="usage-row" id="secondary">
          <div class="row-head"><span class="window-name">7-day</span><span class="percent">Loading…</span></div>
          <div class="track"><div class="fill"></div></div>
          <div class="details"><span class="reset"></span><span class="estimate"></span></div>
        </div>
      </div>
      <div class="footer">
        <span id="status">Starting…</span>
        <a class="support-link" href="https://ko-fi.com/wifiog" target="_blank" rel="noopener noreferrer">Support me on Ko-Fi☕</a>
      </div>
    </section>
    <div class="dock-target" id="dock-target" aria-hidden="true">Drag here to dock.</div>`;

  document.documentElement.appendChild(host);

  const panel = shadow.querySelector(".panel");
  const header = shadow.querySelector(".header");
  const errorBox = shadow.getElementById("error");
  const body = shadow.getElementById("body");
  const status = shadow.getElementById("status");
  const plan = shadow.getElementById("plan");
  const miniTitle = shadow.querySelector(".mini-title");
  const miniPrimary = shadow.getElementById("mini-primary");
  const miniSeparator = shadow.getElementById("mini-separator");
  const miniReset = shadow.getElementById("mini-reset");
  const dockTarget = shadow.getElementById("dock-target");
  const dockButton = shadow.getElementById("dock");

  const collapseButton = shadow.getElementById("collapse");
  let docked = true;
  let dockAnchor = null;
  let signedOut = false;
  panel.classList.add("docked");

  function setDocked(value) {
    docked = Boolean(value);
    panel.classList.toggle("docked", docked);
  }

  function findShareButton() {
    const selectors = [
      'button[data-testid*="share" i]',
      'button[aria-label="Share"]',
      'button[aria-label^="Share " i]',
      '[role="button"][aria-label="Share"]'
    ];
    const candidates = new Set();
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((candidate) => candidates.add(candidate));
    }
    return [...candidates]
      .filter(element => !element.closest('[data-message-id], [data-testid^="conversation-turn-"], article'))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0 &&
        rect.bottom > 0 && rect.right > 0 &&
        rect.bottom <= HEADER_ANCHOR_MAX_BOTTOM &&
        rect.top < window.innerHeight && rect.left < window.innerWidth)
      .sort((a, b) => a.rect.top - b.rect.top || b.rect.right - a.rect.right)[0]?.element ?? null;
  }

  function findLoginButton() {
    const selectors = [
      'button[data-testid*="login" i]',
      'a[data-testid*="login" i]',
      'button[aria-label*="log in" i]',
      'button[aria-label*="sign in" i]',
      'a[href*="/auth/login" i]'
    ];
    const candidates = new Set();
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((candidate) => candidates.add(candidate));
    }
    return [...candidates]
      .filter(element => !element.closest('[data-message-id], [data-testid^="conversation-turn-"], article'))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0 &&
        rect.bottom > 0 && rect.right > 0 &&
        rect.bottom <= HEADER_ANCHOR_MAX_BOTTOM &&
        rect.top < window.innerHeight && rect.left < window.innerWidth)
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)[0]?.element ?? null;
  }

  function findDockAnchor() {
    if (dockAnchor?.isConnected) return dockAnchor;
    dockAnchor = findShareButton() ?? findLoginButton();
    return dockAnchor;
  }

  function dockCoordinates(requestedWidth, requestedHeight) {
    const anchorButton = findDockAnchor();
    const width = requestedWidth || panel.offsetWidth || 276;
    const height = requestedHeight || panel.offsetHeight || 36;
    const anchorRect = anchorButton?.getBoundingClientRect() ?? null;
    if (signedOut) {
      return {
        left: Math.max(DOCK_EDGE_GAP, window.innerWidth - DOCK_EDGE_GAP - width),
        top: HEADER_ANCHOR_MAX_BOTTOM + DOCK_GAP,
        anchorRect,
        belowHeader: true
      };
    }
    if (anchorRect) {
      const leftOfAnchor = anchorRect.left - DOCK_GAP - width;
      if (leftOfAnchor < DOCK_EDGE_GAP) {
        const maxLeft = Math.max(DOCK_EDGE_GAP, window.innerWidth - DOCK_EDGE_GAP - width);
        return {
          left: Math.min(maxLeft, Math.max(DOCK_EDGE_GAP, anchorRect.left)),
          top: Math.max(HEADER_ANCHOR_MAX_BOTTOM + DOCK_GAP, anchorRect.bottom + DOCK_GAP),
          anchorRect,
          belowHeader: true
        };
      }
      return {
        left: leftOfAnchor,
        top: Math.max(6, anchorRect.top + (anchorRect.height - height) / 2),
        anchorRect,
        belowHeader: false
      };
    }
    const fallbackLeft = window.innerWidth - DOCK_FALLBACK_RIGHT_GAP - width;
    return {
      left: Math.max(DOCK_EDGE_GAP, window.innerWidth - DOCK_FALLBACK_RIGHT_GAP - width),
      top: fallbackLeft < DOCK_EDGE_GAP ? HEADER_ANCHOR_MAX_BOTTOM + DOCK_GAP : 8,
      anchorRect: null,
      belowHeader: fallbackLeft < DOCK_EDGE_GAP
    };
  }

  function positionDockTarget() {
    const targetWidth = Math.max(120, Math.min(panel.offsetWidth || 232, 276));
    const target = dockCoordinates(targetWidth, 34);
    dockTarget.style.width = `${targetWidth}px`;
    dockTarget.style.left = `${target.left}px`;
    dockTarget.style.top = `${target.top}px`;
  }

  function updateDockedPosition() {
    if (!docked || drag) return;
    const target = dockCoordinates();
    host.style.left = `${target.left}px`;
    host.style.top = `${target.top}px`;
    host.style.removeProperty("right");
    host.style.removeProperty("bottom");
  }

  function applyCollapsed(collapsed) {
    panel.classList.toggle("collapsed", collapsed);
    collapseButton.textContent = collapsed ? "+" : "−";
    collapseButton.title = collapsed ? "Expand overlay" : "Collapse overlay";
    collapseButton.setAttribute("aria-label", collapseButton.title);
    collapseButton.setAttribute("aria-expanded", String(!collapsed));
  }

  function setPosition(left, top) {
    const width = panel.offsetWidth || 276;
    const height = panel.offsetHeight || 36;
    const maxLeft = Math.max(6, window.innerWidth - width - 6);
    const maxTop = Math.max(6, window.innerHeight - height - 6);
    host.style.left = `${Math.min(maxLeft, Math.max(6, left))}px`;
    host.style.top = `${Math.min(maxTop, Math.max(6, top))}px`;
    host.style.removeProperty("right");
    host.style.removeProperty("bottom");
  }

  function clampToWindow() {
    const rect = panel.getBoundingClientRect();
    setPosition(rect.left, rect.top);
  }

  function saveUiState() {
    const rect = panel.getBoundingClientRect();
    browser.storage.local.set({
      [UI_KEY]: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        collapsed: panel.classList.contains("collapsed"),
        docked
      }
    }).catch(() => {});
  }

  async function loadUiState() {
    const stored = await browser.storage.local.get(UI_KEY);
    const saved = stored[UI_KEY];
    if (!saved) {
      applyCollapsed(false);
      setDocked(true);
      requestAnimationFrame(updateDockedPosition);
      return;
    }
    applyCollapsed(Boolean(saved.collapsed));
    setDocked(Boolean(saved.docked));
    if (docked) {
      requestAnimationFrame(updateDockedPosition);
    } else if (Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      setPosition(saved.left, saved.top);
    }
  }

  collapseButton.addEventListener("click", () => {
    applyCollapsed(!panel.classList.contains("collapsed"));
    requestAnimationFrame(() => {
      if (docked) updateDockedPosition();
      else clampToWindow();
      saveUiState();
    });
  });
  shadow.getElementById("refresh").addEventListener("click", refresh);
  dockButton.addEventListener("click", () => {
    setDocked(true);
    requestAnimationFrame(() => {
      updateDockedPosition();
      saveUiState();
    });
  });

  let drag = null;
  header.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    const rect = panel.getBoundingClientRect();
    setDocked(false);
    drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    positionDockTarget();
    dockTarget.classList.add("visible");
    header.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  header.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    const targetRect = dockTarget.getBoundingClientRect();
    const overTarget = event.clientX >= targetRect.left - 18 &&
      event.clientX <= targetRect.right + 18 &&
      event.clientY >= targetRect.top - 18 &&
      event.clientY <= targetRect.bottom + 18;
    dockTarget.classList.toggle("active", overTarget);
  });
  function finishDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const targetRect = dockTarget.getBoundingClientRect();
    const shouldDock = event.clientX >= targetRect.left - 18 &&
      event.clientX <= targetRect.right + 18 &&
      event.clientY >= targetRect.top - 18 &&
      event.clientY <= targetRect.bottom + 18;
    drag = null;
    if (header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId);
    dockTarget.classList.remove("visible", "active");
    if (shouldDock) {
      setDocked(true);
      updateDockedPosition();
    } else {
      clampToWindow();
    }
    saveUiState();
  }
  header.addEventListener("pointerup", finishDrag);
  header.addEventListener("pointercancel", finishDrag);

  function recordLocalMessage() {
    const now = Date.now();
    if (now - lastMessageSignalAt < 1_000) return;
    lastMessageSignalAt = now;
    messageCountWrite = messageCountWrite.then(async () => {
      const stored = await browser.storage.local.get(MESSAGE_COUNT_KEY);
      const current = Number(stored[MESSAGE_COUNT_KEY]);
      const next = (Number.isFinite(current) && current >= 0 ? current : 0) + 1;
      await browser.storage.local.set({ [MESSAGE_COUNT_KEY]: next });
    }).catch(() => {});
  }

  function isPromptElement(element) {
    return element instanceof Element && Boolean(element.closest(PROMPT_SELECTOR));
  }

  function isSendButton(element) {
    if (!(element instanceof Element)) return false;
    const button = element.closest("button");
    if (!button || button.disabled) return false;
    const testId = button.getAttribute("data-testid") ?? "";
    const label = button.getAttribute("aria-label") ?? "";
    if (testId !== "send-button" && !/^send(?: message)?$/i.test(label.trim())) return false;
    const composer = button.closest("form") ?? button.parentElement;
    return Boolean(composer?.querySelector(PROMPT_SELECTOR) ?? document.querySelector(PROMPT_SELECTOR));
  }

  document.addEventListener("submit", (event) => {
    if (!event.isTrusted) return;
    const form = event.target;
    if (form instanceof Element && form.querySelector(PROMPT_SELECTOR)) recordLocalMessage();
  }, true);

  document.addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    if (isSendButton(event.target) && !event.target.closest("form")) recordLocalMessage();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (!event.isTrusted) return;
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    if (isPromptElement(event.target) && !event.target.closest("form")) recordLocalMessage();
  }, true);

  function number(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function percent(value) {
    const parsed = number(value);
    return parsed === null ? null : Math.min(100, Math.max(0, parsed));
  }

  function timestamp(value) {
    const parsed = number(value);
    if (parsed === null) return null;
    return parsed < 1e12 ? parsed * 1000 : parsed;
  }

  function windowName(value) {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    return /^[a-z0-9][a-z0-9 /+_.-]{0,31}$/i.test(trimmed) ? trimmed : "";
  }

  function durationSeconds(value) {
    const parsed = number(value);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 31_536_000 ? parsed : null;
  }

  function durationLabel(seconds) {
    if (seconds === 18_000) return "5-hour";
    if (seconds === 604_800) return "7-day";
    if (!seconds) return "Usage window";
    if (seconds % 86_400 === 0) return `${seconds / 86_400}-day`;
    if (seconds % 3_600 === 0) return `${seconds / 3_600}-hour`;
    if (seconds % 60 === 0) return `${seconds / 60}-minute`;
    return "Usage window";
  }

  function readWindow(source) {
    if (!source) return null;
    const used = percent(source.used_percent ?? source.usedPercent ?? source.usage_percent);
    const resetAt = timestamp(source.reset_at ?? source.resetAt ?? source.resets_at);
    const duration = durationSeconds(source.limit_window_seconds ?? source.limitWindowSeconds);
    const label = windowName(source.limit_name ?? source.limitName ?? source.window_name ?? source.windowName) ||
      durationLabel(duration);
    return used === null ? null : { used, resetAt, durationSeconds: duration, label };
  }

  function normalize(raw) {
    if (!raw || typeof raw !== "object") throw new Error("Usage response was invalid");
    const limits = raw.rate_limit ?? raw.rateLimit ?? raw.usage ?? raw;
    return {
      plan: typeof raw.plan_type === "string" && /^[a-z0-9_-]{0,24}$/i.test(raw.plan_type) ? raw.plan_type : "",
      primary: readWindow(limits.primary_window ?? limits.primaryWindow ?? limits.five_hour),
      secondary: readWindow(limits.secondary_window ?? limits.secondaryWindow ?? limits.weekly)
    };
  }

  window.addEventListener(RESULT_EVENT, (event) => {
    try {
      if (typeof event.detail !== "string" || event.detail.length > 4096) return;
      const result = JSON.parse(event.detail);
      if (!result || typeof result.requestId !== "string" || typeof result.ok !== "boolean") return;
      const pending = pendingRequests.get(result.requestId);
      if (!pending) return;
      pendingRequests.delete(result.requestId);
      clearTimeout(pending.timer);
      if (result.ok) pending.resolve(result.data);
      else pending.reject(new Error(
        typeof result.error === "string" && result.error.length <= 100
          ? result.error
          : "Usage is unavailable"
      ));
    } catch {
      // Ignore malformed events from the page.
    }
  });

  function fetchUsage() {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error("The ChatGPT page did not answer the usage request"));
      }, 10_000);
      pendingRequests.set(requestId, { resolve, reject, timer });
      window.dispatchEvent(new CustomEvent(REQUEST_EVENT, { detail: requestId }));
    }).then((raw) => {
      const normalized = normalize(raw);
      if (normalized.primary || normalized.secondary) return normalized;
      throw new Error("Usage windows were not present in the response");
    });
  }

  function updateSamples(saved, current, key, totalSent) {
    saved.samples ??= { primary: [], secondary: [] };
    saved.previous ??= {};
    saved.messageCursor ??= {};
    saved.pendingMessages ??= { primary: 0, secondary: 0 };
    const previous = saved.previous[key];
    const samples = Array.isArray(saved.samples[key])
      ? saved.samples[key].filter((sample) =>
        sample && Number.isFinite(sample.delta) && sample.delta > 0 &&
        Number.isInteger(sample.messages) && sample.messages > 0
      )
      : [];

    const previousCursor = Number(saved.messageCursor[key]);
    if (Number.isFinite(previousCursor)) {
      const newlySent = Math.max(0, totalSent - previousCursor);
      saved.pendingMessages[key] = Math.max(0, Number(saved.pendingMessages[key]) || 0) + newlySent;
    } else {
      saved.pendingMessages[key] = 0;
    }
    saved.messageCursor[key] = totalSent;

    if (previous && current) {
      const sameWindow = !previous.resetAt || !current.resetAt ||
        Math.abs(previous.resetAt - current.resetAt) < 5 * 60_000;
      const delta = current.used - previous.used;
      if (sameWindow && delta >= 0.01 && delta <= 50) {
        const messages = Math.floor(saved.pendingMessages[key]);
        if (messages > 0) samples.push({ delta, messages });
        saved.pendingMessages[key] = 0;
      } else if (!sameWindow || delta < 0 || delta > 50) {
        saved.pendingMessages[key] = 0;
      }
    }

    saved.samples[key] = samples.slice(-MAX_SAMPLES);
    saved.previous[key] = current;
  }

  function calculateEstimate(used, samples, key) {
    const valid = Array.isArray(samples) ? samples : [];
    const totalMessages = valid.reduce((sum, sample) => sum + sample.messages, 0);
    const totalDelta = valid.reduce((sum, sample) => sum + sample.delta, 0);
    const minimumChanges = MIN_SAMPLE_CHANGES[key];
    const minimumMessages = MIN_TRACKED_MESSAGES[key];
    if (valid.length < minimumChanges || totalMessages < minimumMessages || totalDelta <= 0) {
      return { ready: false, changes: valid.length, totalMessages, minimumChanges, minimumMessages };
    }
    const averageCost = totalDelta / totalMessages;
    if (!Number.isFinite(averageCost) || averageCost <= 0) {
      return { ready: false, changes: valid.length, totalMessages, minimumChanges, minimumMessages };
    }
    const remaining = Math.max(0, Math.floor((100 - used) / averageCost));
    return { ready: true, remaining, changes: valid.length, totalMessages, averageCost };
  }

  function estimateText(estimate) {
    if (!estimate?.ready) return "Learning estimate…";
    const remaining = estimate.remaining;
    const formatted = remaining > 9999 ? "9,999+" : remaining.toLocaleString();
    return `≈${formatted} send attempts left`;
  }

  function resetText(resetAt) {
    if (!resetAt) return "Reset time unavailable";
    const remaining = resetAt - Date.now();
    const clock = new Date(resetAt).toLocaleString([], {
      weekday: remaining > 24 * 60 * 60_000 ? "short" : undefined,
      hour: "numeric",
      minute: "2-digit"
    });
    if (remaining <= 0) return `Reset due · ${clock}`;
    const minutes = Math.ceil(remaining / 60_000);
    const relative = minutes < 60
      ? `${minutes}m`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
        : `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
    return `Resets in ${relative} · ${clock}`;
  }

  function compactResetText(resetAt) {
    if (!resetAt) return "Reset unavailable";
    const remaining = resetAt - Date.now();
    if (remaining <= 0) return "Reset due";
    const minutes = Math.ceil(remaining / 60_000);
    const relative = minutes < 60
      ? `${minutes}m`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
        : `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
    return `Resets in ${relative}`;
  }

  function selectCompactWindow(primary, secondary, now = Date.now()) {
    const isCurrent = (item) => item &&
      (!item.resetAt || item.resetAt >= now - 60_000);
    if (isCurrent(secondary) && secondary.used >= 100) return secondary;
    if (isCurrent(primary)) return primary;
    return null;
  }

  function renderCompact(current, unavailableText = "Usage unavailable") {
    miniSeparator.hidden = !current;
    miniReset.hidden = !current;
    if (!current) {
      miniPrimary.textContent = unavailableText;
      miniPrimary.style.removeProperty("color");
      miniReset.textContent = "";
      miniReset.removeAttribute("title");
      miniTitle.removeAttribute("aria-label");
      return;
    }
    const formatted = current.used.toFixed(current.used % 1 ? 1 : 0);
    miniPrimary.textContent = `${formatted}% used`;
    miniPrimary.style.color = colorFor(current.used);
    miniReset.textContent = compactResetText(current.resetAt);
    miniReset.title = resetText(current.resetAt);
    miniTitle.setAttribute("aria-label", `${current.label}, ${formatted}% used, ${miniReset.textContent}`);
  }

  function colorFor(used) {
    if (used >= 90) return "#ef4444";
    if (used >= 70) return "#f59e0b";
    return "#10b981";
  }

  function renderWindow(id, current, estimateResult) {
    const row = shadow.getElementById(id);
    if (!current) {
      row.style.display = "none";
      return;
    }
    row.style.display = "block";
    row.querySelector(".window-name").textContent = current.label;
    row.querySelector(".percent").textContent = `${current.used.toFixed(current.used % 1 ? 1 : 0)}% used`;
    const fill = row.querySelector(".fill");
    fill.style.width = `${current.used}%`;
    fill.style.background = colorFor(current.used);
    const reset = row.querySelector(".reset");
    reset.textContent = compactResetText(current.resetAt);
    reset.title = resetText(current.resetAt);
    reset.setAttribute("aria-label", reset.title);
    const estimate = row.querySelector(".estimate");
    estimate.textContent = estimateText(estimateResult);
    if (estimateResult?.ready) {
      estimate.title = `Based on ${estimateResult.totalMessages} locally observed send attempt${estimateResult.totalMessages === 1 ? "" : "s"} across ${estimateResult.changes} correlated usage change${estimateResult.changes === 1 ? "" : "s"}.`;
    } else if (estimateResult?.consistencyCheckFailed) {
      estimate.title = "The 7-day estimate is hidden until it becomes consistent with the five-hour estimate.";
    } else {
      estimate.title = `Learning from local send attempts (${estimateResult?.totalMessages ?? 0}/${estimateResult?.minimumMessages ?? 0} attempts and ${estimateResult?.changes ?? 0}/${estimateResult?.minimumChanges ?? 0} usage changes observed).`;
    }
  }

  let refreshing = false;
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    status.textContent = "Refreshing…";
    try {
      const usage = await fetchUsage();
      signedOut = false;
      const stored = await browser.storage.local.get([STORAGE_KEY, MESSAGE_COUNT_KEY]);
      const saved = stored[STORAGE_KEY] ?? {};
      const storedMessageCount = Number(stored[MESSAGE_COUNT_KEY]);
      const totalSent = Number.isFinite(storedMessageCount) && storedMessageCount >= 0
        ? Math.floor(storedMessageCount)
        : 0;
      updateSamples(saved, usage.primary, "primary", totalSent);
      updateSamples(saved, usage.secondary, "secondary", totalSent);
      await browser.storage.local.set({ [STORAGE_KEY]: saved });

      const primaryEstimate = usage.primary
        ? calculateEstimate(usage.primary.used, saved.samples.primary, "primary")
        : null;
      let secondaryEstimate = usage.secondary
        ? calculateEstimate(usage.secondary.used, saved.samples.secondary, "secondary")
        : null;
      if (secondaryEstimate?.ready && primaryEstimate?.ready &&
          secondaryEstimate.remaining < primaryEstimate.remaining) {
        secondaryEstimate = {
          ...secondaryEstimate,
          ready: false,
          consistencyCheckFailed: true
        };
      }

      renderWindow("primary", usage.primary, primaryEstimate);
      renderWindow("secondary", usage.secondary, secondaryEstimate);
      renderCompact(selectCompactWindow(usage.primary, usage.secondary));
      plan.textContent = usage.plan;
      errorBox.style.display = "none";
      body.style.removeProperty("display");
      status.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      if (docked) requestAnimationFrame(updateDockedPosition);
    } catch (error) {
      const sessionUnavailable = error.message === "ChatGPT did not return an active session";
      signedOut = sessionUnavailable;
      renderCompact(null, sessionUnavailable ? "Sign in for usage" : "Usage unavailable");
      plan.textContent = "";
      errorBox.textContent = `Unable to determine usage: ${error.message}. Make sure you are signed in to ChatGPT.`;
      errorBox.style.display = "block";
      body.style.display = "none";
      status.textContent = "Update failed";
      if (docked) requestAnimationFrame(updateDockedPosition);
    } finally {
      refreshing = false;
    }
  }

  loadUiState().then(refresh).catch((error) => {
    renderCompact(null);
    errorBox.textContent = `Unable to start: ${error.message}.`;
    errorBox.style.display = "block";
    body.style.display = "none";
    status.textContent = "Startup failed";
  });
  setInterval(refresh, POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
  function maintainPosition() {
    if (docked) updateDockedPosition();
    else clampToWindow();
  }

  let dockUpdateFrame = 0;
  function scheduleDockUpdate() {
    if (!docked || dockUpdateFrame) return;
    dockUpdateFrame = requestAnimationFrame(() => {
      dockUpdateFrame = 0;
      updateDockedPosition();
    });
  }

  const pageObserver = new MutationObserver(scheduleDockUpdate);
  pageObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });
  window.addEventListener("resize", () => requestAnimationFrame(maintainPosition));
})();
