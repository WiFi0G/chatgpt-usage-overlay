(() => {
  "use strict";

  if (window.__chatgptUsageOverlayBridgeInstalled) return;
  window.__chatgptUsageOverlayBridgeInstalled = true;

  const REQUEST_EVENT = "chatgpt-usage-overlay-request-v1";
  const RESULT_EVENT = "chatgpt-usage-overlay-result-v1";
  const ENDPOINTS = [
    "/backend-api/wham/usage",
    "/backend-api/codex/usage"
  ];
  let session = null;

  function numeric(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function windowName(raw) {
    const value = raw?.limit_name ?? raw?.limitName ?? raw?.window_name ?? raw?.windowName;
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    return /^[a-z0-9][a-z0-9 /+_.-]{0,31}$/i.test(trimmed) ? trimmed : "";
  }

  function limitedWindow(raw) {
    if (!raw || typeof raw !== "object") return null;
    const used = numeric(raw.used_percent ?? raw.usedPercent ?? raw.usage_percent);
    if (used === null || used < 0 || used > 100) return null;
    const duration = numeric(raw.limit_window_seconds ?? raw.limitWindowSeconds);
    // Preserve the baseline's support for varied/missing durations and reset times.
    return {
      used_percent: used,
      reset_at: numeric(raw.reset_at ?? raw.resetAt ?? raw.resets_at),
      limit_window_seconds: Number.isInteger(duration) && duration > 0 && duration <= 31_536_000
        ? duration
        : null,
      limit_name: windowName(raw)
    };
  }

  function limitedUsageData(raw) {
    const limits = raw?.rate_limit ?? raw?.rateLimit ?? raw?.usage ?? raw;
    const plan = raw?.plan_type ?? raw?.planType ?? raw?.plan;
    return {
      plan_type: typeof plan === "string" && /^[a-z0-9_-]{1,24}$/i.test(plan) ? plan : "",
      rate_limit: {
        primary_window: limitedWindow(limits?.primary_window ?? limits?.primaryWindow ?? limits?.five_hour),
        secondary_window: limitedWindow(limits?.secondary_window ?? limits?.secondaryWindow ?? limits?.weekly)
      }
    };
  }

  function publicError(error) {
    const message = error?.message;
    return typeof message === "string" && (
      /^(?:Session request failed \(HTTP \d{3}\)|HTTP \d{3})$/.test(message) ||
      message === "ChatGPT did not return an active session"
    ) ? message : "Usage information is unavailable";
  }

  function selectedAccountId() {
    const match = document.cookie.match(/(?:^|;\s*)_account=([^;]+)/);
    if (!match) return "";
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }

  async function getSession(forceRefresh = false) {
    const selectedAccount = selectedAccountId();
    if (session && !forceRefresh && session.accountId === selectedAccount) return session;

    const endpoint = forceRefresh
      ? "/api/auth/session?refresh=true"
      : "/api/auth/session";
    const response = await fetch(endpoint, {
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Session request failed (HTTP ${response.status})`);

    const data = await response.json();
    if (typeof data?.accessToken !== "string" || !data.accessToken) {
      throw new Error("ChatGPT did not return an active session");
    }
    session = {
      accessToken: data.accessToken,
      accountId: selectedAccountId()
    };
    return session;
  }

  async function requestUsage(endpoint, auth) {
    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${auth.accessToken}`
    };
    if (auth.accountId && auth.accountId !== "personal") {
      headers["ChatGPT-Account-ID"] = encodeURIComponent(auth.accountId);
    }

    return fetch(endpoint, {
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers
    });
  }

  async function getUsage() {
    let lastError;
    let auth = await getSession();
    for (const endpoint of ENDPOINTS) {
      try {
        let response = await requestUsage(endpoint, auth);
        if (response.status === 401) {
          auth = await getSession(true);
          response = await requestUsage(endpoint, auth);
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return limitedUsageData(await response.json());
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error("Usage information is unavailable");
  }

  window.addEventListener(REQUEST_EVENT, async (event) => {
    const requestId = typeof event.detail === "string" &&
      /^[0-9]+-[a-z0-9]+$/.test(event.detail) && event.detail.length <= 64
      ? event.detail : "";
    if (!requestId) return;
    let result;
    try {
      result = { requestId, ok: true, data: await getUsage() };
    } catch (error) {
      result = { requestId, ok: false, error: publicError(error) };
    }

    // A JSON string avoids Firefox cross-context restrictions on CustomEvent objects.
    window.dispatchEvent(new CustomEvent(RESULT_EVENT, {
      detail: JSON.stringify(result)
    }));
  });
})();
