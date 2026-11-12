/**
 * Minimal PayPal REST client (no SDK) for the Payouts API.
 * Docs: developer.paypal.com/api/payouts  (POST /v1/payments/payouts, GET /v1/payments/payouts/{id})
 *
 * Errors carry `ambiguous: true` when the outcome of a request is unknown (network failure, timeout, HTTP 5xx).
 * Callers must NOT assume such a request failed: money may have moved.
 */

export interface PaypalConfig {
  clientId: string;
  secret: string;
  env: "sandbox" | "live";
  baseUrl: string;
}

export function paypalConfig(): PaypalConfig | null {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !secret) return null;
  const env = (process.env.PAYPAL_ENV || "sandbox").trim().toLowerCase();
  if (env !== "sandbox" && env !== "live") return null;
  return { clientId, secret, env, baseUrl: env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com" };
}

let tokenCache: { key: string; token: string; expiresAt: number } | null = null;

export function resetPaypalTokenCache() {
  tokenCache = null;
}

const TIMEOUT_MS = 20_000;

async function timedFetch(url: string, init: any): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch (err: any) {
    throw Object.assign(new Error(`PayPal request did not complete (${err?.name === "AbortError" ? "timed out" : err?.message || "network error"}). The outcome is unknown.`), {
      ambiguous: true,
      status: 502,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function accessToken(cfg: PaypalConfig): Promise<string> {
  const key = `${cfg.env}:${cfg.clientId}`;
  if (tokenCache && tokenCache.key === key && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;
  const res = await timedFetch(`${cfg.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    // Authentication happens before any money request, so this failure is definitive.
    throw Object.assign(new Error(json?.error_description || `PayPal authentication failed (HTTP ${res.status}). Check PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_ENV.`), { status: 502, ambiguous: false });
  }
  tokenCache = { key, token: json.access_token, expiresAt: Date.now() + Number(json.expires_in || 300) * 1000 };
  return json.access_token;
}

export async function paypalRequest(method: "GET" | "POST", path: string, body?: unknown, requestId?: string): Promise<any> {
  const cfg = paypalConfig();
  if (!cfg) {
    throw Object.assign(new Error("PayPal is not configured: set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_ENV (sandbox|live)."), { status: 503, ambiguous: false });
  }
  const token = await accessToken(cfg);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (requestId) headers["PayPal-Request-Id"] = requestId;
  const res = await timedFetch(`${cfg.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.details?.[0]?.issue || json?.name;
    const msg = json?.message || `PayPal returned HTTP ${res.status}`;
    throw Object.assign(new Error(detail && !msg.includes(detail) ? `${msg} (${detail})` : msg), {
      status: res.status >= 500 ? 502 : 400,
      ambiguous: res.status >= 500, // a 5xx may have been processed
      paypal: { name: json?.name, debugId: json?.debug_id },
    });
  }
  return json;
}
