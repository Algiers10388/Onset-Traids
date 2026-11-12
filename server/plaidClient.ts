import fs from "fs";
import path from "path";

/**
 * Minimal Plaid REST client (no SDK) plus a private store for Plaid access tokens.
 *
 * Plaid flow used by the fiat ledger (docs: plaid.com/docs/auth/partnerships/stripe):
 *   /link/token/create -> Plaid Link in the browser -> /item/public_token/exchange -> /auth/get
 *   then the server hands the account to Stripe (SetupIntent, us_bank_account) and keeps ONLY masked details.
 *
 * Plaid access tokens never leave the server and are NOT written to the fiat ledger JSON: they live in
 * PLAID_STORE_PATH (default ./data/plaid-items.json, mode 0600).
 */

const HOSTS: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  production: "https://production.plaid.com",
};

export interface PlaidConfig {
  clientId: string;
  secret: string;
  env: "sandbox" | "production";
  baseUrl: string;
  redirectUri?: string;
}

export function plaidConfig(): PlaidConfig | null {
  const clientId = process.env.PLAID_CLIENT_ID?.trim();
  const secret = process.env.PLAID_SECRET?.trim();
  if (!clientId || !secret) return null;
  const env = (process.env.PLAID_ENV || "sandbox").trim().toLowerCase();
  if (env !== "sandbox" && env !== "production") return null; // Plaid retired "development"
  return { clientId, secret, env, baseUrl: HOSTS[env], redirectUri: process.env.PLAID_REDIRECT_URI?.trim() || undefined };
}

export async function plaidRequest(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const cfg = plaidConfig();
  if (!cfg) {
    throw Object.assign(new Error("Plaid is not configured: set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (sandbox|production)."), { status: 503 });
  }
  const res = await fetch(`${cfg.baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PLAID-CLIENT-ID": cfg.clientId,
      "PLAID-SECRET": cfg.secret,
      "Plaid-Version": "2020-09-14",
    },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.display_message || json?.error_message || `Plaid returned HTTP ${res.status}`;
    throw Object.assign(new Error(msg), {
      status: res.status >= 500 ? 502 : 400,
      plaid: { code: json?.error_code, type: json?.error_type, requestId: json?.request_id },
    });
  }
  return json;
}

// ---------------------------------------------------------------------------------------------------------------
// Private item store (access tokens + Stripe ids per linked bank)
// ---------------------------------------------------------------------------------------------------------------

export interface PlaidItemRecord {
  linkedBankId: string;
  accessToken: string;
  itemId: string;
  plaidAccountId: string;
  fingerprint: string; // sha256(routing:account); used only to stop the same account being linked twice
  stripeCustomerId: string;
  stripePaymentMethodId: string;
  stripeMandateId?: string;
  authorizedAt: number; // unix seconds, when the user ticked the debit authorization
}

const STORE_PATH = () => process.env.PLAID_STORE_PATH || path.join(process.cwd(), "data", "plaid-items.json");

function readAll(): Record<string, PlaidItemRecord> {
  try {
    if (fs.existsSync(STORE_PATH())) return JSON.parse(fs.readFileSync(STORE_PATH(), "utf8"));
  } catch (err) {
    console.error(`[plaid] FATAL: could not read ${STORE_PATH()}:`, err);
    throw new Error(`Plaid item store at ${STORE_PATH()} is unreadable. Fix or restore it before linking or debiting banks.`);
  }
  return {};
}

function writeAll(all: Record<string, PlaidItemRecord>) {
  fs.mkdirSync(path.dirname(STORE_PATH()), { recursive: true });
  const tmp = STORE_PATH() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, STORE_PATH());
}

export const plaidStore = {
  get: (linkedBankId: string): PlaidItemRecord | undefined => readAll()[linkedBankId],
  all: (): PlaidItemRecord[] => Object.values(readAll()),
  save(rec: PlaidItemRecord) {
    const all = readAll();
    all[rec.linkedBankId] = rec;
    writeAll(all);
  },
  remove(linkedBankId: string) {
    const all = readAll();
    delete all[linkedBankId];
    writeAll(all);
  },
};
