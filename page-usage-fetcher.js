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

  function limitedUsageData(raw) {
    const limits = raw?.rate_limit ?? raw?.rateLimit ?? raw?.usage ?? raw;
    return {
      plan_type: raw?.plan_type ?? raw?.planType ?? raw?.plan ?? "",
      rate_limit: {
        allowed: limits?.allowed,
        limit_reached: limits?.limit_reached ?? limits?.limitReached,
        primary_window: limits?.primary_window ?? limits?.primaryWindow ?? limits?.five_hour,
        secondary_window: limits?.secondary_window ?? limits?.secondaryWindow ?? limits?.weekly
      }
    };
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
    if (session && !forceRefresh) return session;

    const endpoint = forceRefresh
      ? "/api/auth/session?refresh=true"
      : "/api/auth/session";
    const response = await fetch(endpoint, {
      credentials: "same-origin",
      cache: "no-store",
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
    const requestId = typeof event.detail === "string" ? event.detail : "unknown";
    let result;
    try {
      result = { requestId, ok: true, data: await getUsage() };
    } catch (error) {
      result = { requestId, ok: false, error: error.message };
    }

    // A JSON string avoids Firefox cross-context restrictions on CustomEvent objects.
    window.dispatchEvent(new CustomEvent(RESULT_EVENT, {
      detail: JSON.stringify(result)
    }));
  });
})();
