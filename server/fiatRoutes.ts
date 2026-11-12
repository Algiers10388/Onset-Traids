import express, { Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { plaidConfig, plaidRequest, plaidStore } from "./plaidClient";
import { paypalConfig, paypalRequest } from "./paypalClient";
import {
  FiatAccount,
  FiatTransaction,
  BotSecuritySettings,
  SecurityAuditReport,
} from "../src/types";

/**
 * Fiat ledger + routes (LIVE MONEY ONLY).
 *
 * Rules this module enforces:
 *  - A balance is only ever credited after Stripe reports a succeeded PaymentIntent (checked server-side,
 *    either in the deposit response or via a signature-verified webhook). Nothing the browser sends can mint funds.
 *  - Raw card numbers / CVC are never accepted. Card data goes browser -> Stripe (Stripe.js), and the server
 *    only receives a PaymentMethod id (pm_...).
 *  - Rails that have no real processor behind them (bank/ACH, check deposit, withdrawals, bank/card linking,
 *    3DS simulation) return 501 instead of pretending to work.
 *  - 2FA is real TOTP (RFC 6238) against FIAT_TOTP_SECRET. If it is not configured, high-value actions are refused.
 *  - The ledger is persisted to disk (FIAT_LEDGER_PATH) so a restart cannot erase credited funds, and every
 *    Stripe PaymentIntent id is recorded so it can be credited at most once.
 *
 * Network access to /api is already restricted in server.ts (loopback or x-api-token); the Stripe webhook path is
 * the one exception and authenticates itself with the Stripe signature.
 */

// ---------------------------------------------------------------------------------------------------------------
// Persistent state
// ---------------------------------------------------------------------------------------------------------------

interface LedgerState {
  account: FiatAccount;
  botSecurity: BotSecuritySettings;
  transactions: FiatTransaction[];
  processedPaymentIntents: string[];
  dailyDepositDate: string; // YYYY-MM-DD (UTC)
  lastTotpCounter: number;
  stripeCustomerId?: string; // Stripe Customer that owns the linked bank PaymentMethods
  dailyWithdrawnUsd: number; // reserved/sent today (UTC); resets with the deposit window
}

const LEDGER_PATH = process.env.FIAT_LEDGER_PATH || path.join(process.cwd(), "data", "fiat-ledger.json");
const DAILY_DEPOSIT_LIMIT = Number(process.env.FIAT_DAILY_DEPOSIT_LIMIT_USD || 50000);
const MAX_TX_HISTORY = 500;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const todayUtc = () => new Date().toISOString().slice(0, 10);

function defaultState(): LedgerState {
  return {
    account: {
      accountId: "LEDGER-USD",
      accountNumberMasked: "—",
      routingNumberMasked: "—",
      accountHolder: "Trading Ledger",
      currency: "USD",
      availableBalance: 0,
      pendingBalance: 0,
      allocatedToTrading: 0,
      dailyDepositLimit: DAILY_DEPOSIT_LIMIT,
      dailyDepositUsed: 0,
      kycTier: "TIER_1_STANDARD",
      twoFactorEnabled: Boolean(process.env.FIAT_TOTP_SECRET),
      vaultEncryption: "NONE",
      fdicCustodyInsured: false,
      linkedBanks: [],
      linkedCards: [],
    },
    botSecurity: {
      emergencyFreezeActive: false,
      twoFactorEnforced: true,
      threeDsEnforced: true, // enforced by Stripe on the PaymentIntent when the issuer requires it
      maxSingleOrderUsd: 5000,
      maxDailyLossUsd: 250,
      slippageTolerancePercent: 0.5,
      ipWhitelistEnabled: false,
      withdrawalAddressWhitelistOnly: true,
      lastSecurityAuditTimestamp: Date.now(),
      securityGrade: "GUARDED",
      activeThreatLevel: "NOMINAL",
    },
    transactions: [],
    processedPaymentIntents: [],
    dailyDepositDate: todayUtc(),
    lastTotpCounter: 0,
    dailyWithdrawnUsd: 0,
  };
}

function loadState(): LedgerState {
  const base = defaultState();
  try {
    if (fs.existsSync(LEDGER_PATH)) {
      const raw = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
      return {
        ...base,
        ...raw,
        account: {
          ...base.account,
          ...raw.account,
          linkedBanks: Array.isArray(raw.account?.linkedBanks) ? raw.account.linkedBanks : [],
          linkedCards: [],
          vaultEncryption: "NONE",
          fdicCustodyInsured: false,
        },
        botSecurity: { ...base.botSecurity, ...raw.botSecurity, securityGrade: "GUARDED" },
      };
    }
  } catch (err) {
    // A corrupt ledger must not silently reset to zero while real money may be in it.
    console.error(`[fiat] FATAL: could not read ledger at ${LEDGER_PATH}:`, err);
    throw new Error(`Fiat ledger at ${LEDGER_PATH} is unreadable. Fix or restore it before starting the server.`);
  }
  return base;
}

let state: LedgerState = loadState();

function persist() {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  const tmp = LEDGER_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, LEDGER_PATH);
}

function rollDailyWindow() {
  const today = todayUtc();
  if (state.dailyDepositDate !== today) {
    state.dailyDepositDate = today;
    state.account.dailyDepositUsed = 0;
    state.dailyWithdrawnUsd = 0;
  }
}

function pushTx(tx: FiatTransaction) {
  state.transactions.unshift(tx);
  if (state.transactions.length > MAX_TX_HISTORY) state.transactions.length = MAX_TX_HISTORY;
}

const newId = (prefix: string) => `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

// Exports used by the exchange layer to enforce the kill switch and per-order cap.
export function isBotEmergencyFrozen(): boolean {
  return state.botSecurity.emergencyFreezeActive;
}
export function getBotMaxSingleOrderUsd(): number {
  return state.botSecurity.maxSingleOrderUsd;
}
export function getBotSecuritySettings(): BotSecuritySettings {
  return { ...state.botSecurity };
}

// ---------------------------------------------------------------------------------------------------------------
// TOTP (RFC 6238, SHA-1, 6 digits, 30 s step)
// ---------------------------------------------------------------------------------------------------------------

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error("FIAT_TOTP_SECRET is not valid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpAt(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", key).update(msg).digest();
  const off = h[h.length - 1] & 0x0f;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

/** Returns the matching counter (so it can be burned against replay) or null. Allows +/-1 step of clock drift. */
export function verifyTotp(secretBase32: string, code: string, nowMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const counter = Math.floor(nowMs / 30000);
  for (const c of [counter - 1, counter, counter + 1]) {
    const expected = Buffer.from(totpAt(secretBase32, c));
    const given = Buffer.from(code);
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) return c;
  }
  return null;
}

type TwoFaResult = { ok: true } | { ok: false; status: number; body: Record<string, unknown> };

/** Checks a TOTP code (single use). Returns ok when 2FA is not enforced or the amount is under the threshold. */
function checkTwoFactor(code: unknown, amountUsd: number, thresholdUsd: number, force = false): TwoFaResult {
  if (!state.botSecurity.twoFactorEnforced) return { ok: true };
  if (!force && amountUsd < thresholdUsd) return { ok: true };

  const secret = process.env.FIAT_TOTP_SECRET;
  if (!secret) {
    return {
      ok: false,
      status: 503,
      body: {
        success: false,
        error: "2FA is enforced but FIAT_TOTP_SECRET is not configured on the server, so this action is refused. Set it in .env (base32 TOTP secret) and restart.",
      },
    };
  }
  const given = String(code ?? "").trim();
  if (!given) {
    return { ok: false, status: 403, body: { success: false, requires2FA: true, error: "This action requires a 6-digit 2FA code." } };
  }
  const counter = verifyTotp(secret, given);
  if (counter === null || counter <= state.lastTotpCounter) {
    return { ok: false, status: 403, body: { success: false, requires2FA: true, error: "Invalid or already-used 2FA code." } };
  }
  state.lastTotpCounter = counter;
  persist();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------
// Stripe (REST, no SDK so there is nothing extra to install)
// ---------------------------------------------------------------------------------------------------------------

const STRIPE_API = "https://api.stripe.com/v1";

function stripeKey(): string | null {
  return process.env.STRIPE_SECRET_KEY || null;
}

function form(params: Record<string, string | number | boolean | undefined>): string {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.append(k, String(v));
  return body.toString();
}

async function stripeRequest(method: "GET" | "POST", pathAndQuery: string, body?: string, idempotencyKey?: string): Promise<any> {
  const key = stripeKey();
  if (!key) throw Object.assign(new Error("STRIPE_SECRET_KEY is not configured on the server."), { status: 503 });
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${STRIPE_API}${pathAndQuery}`, { method, headers, body });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `Stripe returned HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status >= 500 ? 502 : 400, stripe: json?.error });
  }
  return json;
}

const PI_EXPAND = "expand[]=latest_charge.balance_transaction";

/** Credits a succeeded PaymentIntent exactly once. Returns the transaction, or null if already credited. */
export function settlePaymentIntent(pi: any): FiatTransaction | null {
  if (!pi || pi.status !== "succeeded") return null;
  if (pi.metadata?.purpose !== "fiat_deposit") return null;
  if (String(pi.currency).toLowerCase() !== "usd") return null;
  if (state.processedPaymentIntents.includes(pi.id)) return null;

  const gross = round2((pi.amount_received ?? pi.amount) / 100);
  const bt = pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge.balance_transaction : null;
  const feeUsd = bt && typeof bt === "object" ? round2(bt.fee / 100) : 0;
  const net = bt && typeof bt === "object" ? round2(bt.net / 100) : gross;

  rollDailyWindow();
  const toBot = pi.metadata?.direct_to_bot === "1" && !state.botSecurity.emergencyFreezeActive;
  if (toBot) state.account.allocatedToTrading = round2(state.account.allocatedToTrading + net);
  else state.account.availableBalance = round2(state.account.availableBalance + net);
  state.account.dailyDepositUsed = round2(state.account.dailyDepositUsed + gross);
  state.processedPaymentIntents.push(pi.id);

  const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const card = charge?.payment_method_details?.card ?? null;
  const bank = charge?.payment_method_details?.us_bank_account ?? null;
  const isAch = pi.metadata?.rail === "ach" || Boolean(bank);
  const linked = state.account.linkedBanks.find((b) => b.id === pi.metadata?.linked_bank_id);
  const sourceName = isAch
    ? `${bank?.bank_name || linked?.bankName || "Bank"} ${bank?.last4 ? `•••• ${bank.last4}` : linked?.accountNumberMasked || ""}`.trim()
    : card
      ? `${String(card.brand).toUpperCase()} card •••• ${card.last4}`
      : "Card (Stripe)";
  const destinationName = toBot ? "Trading Bot Cash Balance" : "USD Ledger";

  // An ACH debit is recorded as PROCESSING when submitted; finish that same row instead of adding a duplicate.
  const pending = state.transactions.find((t) => t.referenceHash === pi.id && t.status === "PROCESSING");
  if (pending) {
    state.account.pendingBalance = Math.max(0, round2(state.account.pendingBalance - pending.amount));
    Object.assign(pending, { timestamp: Date.now(), amount: gross, fee: feeUsd, netAmount: net, status: "COMPLETED", sourceName, destinationName });
    persist();
    return pending;
  }

  const tx: FiatTransaction = {
    id: newId(isAch ? "tx-ach" : "tx-card"),
    timestamp: Date.now(),
    type: isAch ? "BANK_ACH_DEPOSIT" : "DEBIT_CARD_LOAD",
    amount: gross,
    currency: "USD",
    fee: feeUsd,
    netAmount: net,
    status: "COMPLETED",
    sourceName,
    destinationName,
    referenceHash: pi.id,
    rail: isAch ? "ACH_TRANSFER" : "DEBIT_PULL",
  };
  pushTx(tx);
  persist();
  return tx;
}

/** ACH debit failed after submission (insufficient funds, closed account, ...): nothing was credited, so just release the pending hold. */
export function failPaymentIntent(pi: any): boolean {
  if (!pi || pi.metadata?.purpose !== "fiat_deposit") return false;
  const pending = state.transactions.find((t) => t.referenceHash === pi.id && t.status === "PROCESSING");
  if (!pending) return false;
  state.account.pendingBalance = Math.max(0, round2(state.account.pendingBalance - pending.amount));
  pending.status = "FAILED";
  pending.timestamp = Date.now();
  persist();
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// PayPal payouts (withdrawals)
// ---------------------------------------------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Only pre-registered PayPal emails can receive money. There is deliberately no "send to any address". */
function paypalRecipients(): string[] {
  return (process.env.PAYPAL_PAYOUT_RECIPIENTS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => EMAIL_RE.test(e));
}
const maskEmail = (e: string) => `${e[0]}***@${e.split("@")[1]}`;
const withdrawalDailyLimit = () => Number(process.env.FIAT_DAILY_WITHDRAWAL_LIMIT_USD || 1000);
const paypalReady = () => Boolean(paypalConfig() && paypalRecipients().length > 0);

const PAYOUT_FAILED_STATES = new Set(["FAILED", "BLOCKED", "RETURNED", "REFUNDED", "REVERSED", "CANCELED", "DENIED"]);

/** Put a reserved withdrawal back on the ledger. Only ever runs on a PROCESSING row, so it cannot refund twice. */
function refundWithdrawal(tx: FiatTransaction, newStatus: "FAILED" = "FAILED") {
  if (tx.status !== "PROCESSING") return false;
  state.account.availableBalance = round2(state.account.availableBalance + tx.amount);
  if (todayUtc() === new Date(tx.timestamp).toISOString().slice(0, 10)) {
    state.dailyWithdrawnUsd = Math.max(0, round2(state.dailyWithdrawnUsd - tx.amount));
  }
  tx.status = newStatus;
  persist();
  return true;
}

/** Ask PayPal (never trust a request body) where a payout stands and update the ledger. */
export async function reconcilePaypalPayout(tx: FiatTransaction): Promise<"completed" | "failed" | "pending"> {
  if (tx.type !== "WITHDRAW_TO_PAYPAL" || tx.status !== "PROCESSING" || !tx.externalId) return "pending";
  const out = await paypalRequest("GET", `/v1/payments/payouts/${encodeURIComponent(tx.externalId)}`);
  const batch = String(out?.batch_header?.batch_status || "").toUpperCase();
  const item = out?.items?.[0];
  const itemStatus = String(item?.transaction_status || "").toUpperCase();

  if (itemStatus === "SUCCESS") {
    tx.fee = round2(Number(item?.payout_item_fee?.value || 0));
    tx.status = "COMPLETED";
    persist();
    return "completed";
  }
  if (PAYOUT_FAILED_STATES.has(itemStatus) || PAYOUT_FAILED_STATES.has(batch)) {
    refundWithdrawal(tx);
    return "failed";
  }
  return "pending"; // PENDING / ONHOLD / UNCLAIMED (PayPal returns unclaimed money after 30 days, which arrives here as RETURNED)
}

// ---------------------------------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------------------------------

const NOT_AVAILABLE = (what: string, hint: string) => ({
  success: false,
  error: `${what} is not available: there is no live processor wired to it, so the server will not pretend it worked. ${hint}`,
});

function accountPayload() {
  rollDailyWindow();
  return state.account;
}

export function setupFiatRoutes(app: express.Application) {
  // 1. Account, config & status ------------------------------------------------------------------------------
  app.get("/api/fiat/account", (_req: Request, res: Response) => {
    res.json({
      success: true,
      account: accountPayload(),
      botSecurity: state.botSecurity,
      timestamp: Date.now(),
      security: {
        vault: "LEDGER_FILE_PLAINTEXT",
        pciDssCompliant: false, // card data never touches this server (Stripe.js tokenizes it)
        fdicInsured: false,
        twoFactorActive: Boolean(process.env.FIAT_TOTP_SECRET),
        emergencyFreezeActive: state.botSecurity.emergencyFreezeActive,
        botOrderCapUsd: state.botSecurity.maxSingleOrderUsd,
        stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
        stripeWebhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
        plaidConfigured: Boolean(plaidConfig()),
      },
    });
  });

  app.get("/api/fiat/config", (_req: Request, res: Response) => {
    res.json({
      success: true,
      stripe: {
        configured: Boolean(process.env.STRIPE_SECRET_KEY),
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
        webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      },
      rails: {
        card: Boolean(process.env.STRIPE_SECRET_KEY),
        bank: Boolean(plaidConfig() && process.env.STRIPE_SECRET_KEY),
        plaid: plaidConfig() ? { env: plaidConfig()!.env, oauthRedirectConfigured: Boolean(plaidConfig()!.redirectUri) } : null,
        check: false,
        withdrawals: paypalReady(),
        paypal: paypalReady()
          ? {
              env: paypalConfig()!.env,
              recipients: paypalRecipients().map((e, id) => ({ id, label: maskEmail(e) })),
              dailyLimitUsd: withdrawalDailyLimit(),
              withdrawnTodayUsd: state.dailyWithdrawnUsd,
            }
          : null,
      },
    });
  });

  // 1b. Security audit: computed from real state, no fixed grades or compliance claims --------------------------
  app.get("/api/fiat/security/audit", (_req: Request, res: Response) => {
    const bs = state.botSecurity;
    const totpOk = Boolean(process.env.FIAT_TOTP_SECRET);
    const stripeOk = Boolean(process.env.STRIPE_SECRET_KEY);
    const hookOk = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
    const liveGate = process.env.ENABLE_LIVE_TRADING === "1";
    const checks: SecurityAuditReport["verifiedChecks"] = [
      {
        title: "Two-factor (TOTP) secret configured",
        description: totpOk
          ? "FIAT_TOTP_SECRET is set; high-value transfers verify a real, single-use TOTP code."
          : "FIAT_TOTP_SECRET is not set. With 2FA enforced, high-value transfers are refused until it is configured.",
        status: totpOk ? "PASSED" : "WARNING",
        category: "ACCESS_CONTROL",
      },
      {
        title: "Two-factor enforcement",
        description: bs.twoFactorEnforced ? "2FA is enforced for large transfers." : "2FA enforcement is OFF.",
        status: bs.twoFactorEnforced ? "PASSED" : "WARNING",
        category: "ACCESS_CONTROL",
      },
      {
        title: "Card processor (Stripe) configured",
        description: stripeOk ? "STRIPE_SECRET_KEY is set. Deposits are credited only after Stripe confirms payment." : "STRIPE_SECRET_KEY is not set, so card deposits are unavailable.",
        status: stripeOk ? "PASSED" : "WARNING",
        category: "BANKING_RAILS",
      },
      {
        title: "Stripe webhook signature verification",
        description: hookOk ? "STRIPE_WEBHOOK_SECRET is set; webhooks are signature-verified." : "STRIPE_WEBHOOK_SECRET is not set; payments needing 3DS/async confirmation cannot be credited.",
        status: hookOk ? "PASSED" : "WARNING",
        category: "BANKING_RAILS",
      },
      {
        title: "Raw card data rejected",
        description: "The server rejects card numbers/CVC; only Stripe PaymentMethod ids are accepted.",
        status: "PASSED",
        category: "BANKING_RAILS",
      },
      {
        title: "Server live-order gate",
        description: liveGate ? "ENABLE_LIVE_TRADING=1: the server will place real orders." : "ENABLE_LIVE_TRADING is not set: the server refuses ALL orders (there is no simulation fallback).",
        status: liveGate ? "PASSED" : "WARNING",
        category: "BOT_TREASURY",
      },
      {
        title: "Emergency kill switch",
        description: bs.emergencyFreezeActive ? "FREEZE ACTIVE: bot funding and order placement are blocked." : "Kill switch is armed and not tripped.",
        status: bs.emergencyFreezeActive ? "WARNING" : "PASSED",
        category: "BOT_TREASURY",
      },
      {
        title: "Single-order size cap",
        description: `Orders above $${bs.maxSingleOrderUsd.toLocaleString()} are rejected by the exchange gateway.`,
        status: "PASSED",
        category: "BOT_TREASURY",
      },
      {
        title: "Ledger not encrypted at rest",
        description: `Balances are stored in ${LEDGER_PATH} (file mode 600, not encrypted). It holds no card or bank credentials.`,
        status: "WARNING",
        category: "ENCRYPTION",
      },
    ];
    const warnings = checks.filter((c) => c.status !== "PASSED").length;
    const report: SecurityAuditReport = {
      overallScore: Math.max(0, Math.round(100 - (warnings * 100) / checks.length)),
      securityGrade: "GUARDED",
      vaultEncryption: "None (plain JSON ledger, file mode 600)",
      twoFactorActive: totpOk && bs.twoFactorEnforced,
      emergencyFreezeActive: bs.emergencyFreezeActive,
      totalLinkedBanks: 0,
      allBanksChecksumVerified: true,
      zeroPlaintextGuarantee: false,
      pciDssLevel1Compliant: false,
      fdicCustodyInsured: false,
      botOrderCapUsd: bs.maxSingleOrderUsd,
      dailyLossLimitUsd: bs.maxDailyLossUsd,
      circuitBreakerActive: bs.emergencyFreezeActive,
      lastAuditTimestamp: Date.now(),
      verifiedChecks: checks,
    };
    res.json({ success: true, report, timestamp: Date.now() });
  });

  // 1c. Bot protection settings. Tightening is free; loosening requires a 2FA code. -----------------------------
  app.post("/api/fiat/security/update-bot-protection", (req: Request, res: Response) => {
    try {
      const b = req.body || {};
      const bs = state.botSecurity;

      const loosening =
        (b.emergencyFreezeActive === false && bs.emergencyFreezeActive) ||
        (b.twoFactorEnforced === false && bs.twoFactorEnforced) ||
        (b.maxSingleOrderUsd !== undefined && Number(b.maxSingleOrderUsd) > bs.maxSingleOrderUsd) ||
        (b.maxDailyLossUsd !== undefined && Number(b.maxDailyLossUsd) > bs.maxDailyLossUsd) ||
        (b.slippageTolerancePercent !== undefined && Number(b.slippageTolerancePercent) > bs.slippageTolerancePercent);

      if (loosening) {
        const tf = checkTwoFactor(b.twoFactorCode, 0, 0, true);
        if (!tf.ok) return res.status(tf.status).json(tf.body);
      }

      for (const k of ["maxSingleOrderUsd", "maxDailyLossUsd", "slippageTolerancePercent"] as const) {
        if (b[k] !== undefined) {
          const n = Number(b[k]);
          if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ success: false, error: `${k} must be a positive number.` });
        }
      }
      if (b.emergencyFreezeActive !== undefined) bs.emergencyFreezeActive = Boolean(b.emergencyFreezeActive);
      if (b.twoFactorEnforced !== undefined) bs.twoFactorEnforced = Boolean(b.twoFactorEnforced);
      if (b.threeDsEnforced !== undefined) bs.threeDsEnforced = Boolean(b.threeDsEnforced);
      if (b.ipWhitelistEnabled !== undefined) bs.ipWhitelistEnabled = Boolean(b.ipWhitelistEnabled);
      if (b.withdrawalAddressWhitelistOnly !== undefined) bs.withdrawalAddressWhitelistOnly = Boolean(b.withdrawalAddressWhitelistOnly);
      for (const k of ["maxSingleOrderUsd", "maxDailyLossUsd", "slippageTolerancePercent"] as const) {
        if (b[k] !== undefined) bs[k] = Number(b[k]);
      }
      bs.lastSecurityAuditTimestamp = Date.now();
      state.account.twoFactorEnabled = bs.twoFactorEnforced && Boolean(process.env.FIAT_TOTP_SECRET);
      persist();

      return res.json({
        success: true,
        message: bs.emergencyFreezeActive
          ? "EMERGENCY FREEZE ACTIVE: bot funding and exchange order placement are blocked."
          : "Bot protection settings updated.",
        botSecurity: bs,
        account: accountPayload(),
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Failed to update security settings" });
    }
  });

  // 1d. Verify a TOTP code (stateless check; endpoints that need 2FA verify the code themselves) ----------------
  app.post("/api/fiat/security/verify-2fa", (req: Request, res: Response) => {
    const secret = process.env.FIAT_TOTP_SECRET;
    if (!secret) {
      return res.status(503).json({ success: false, verified: false, error: "FIAT_TOTP_SECRET is not configured on the server." });
    }
    const code = String(req.body?.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, error: "Verification code must be 6 digits." });
    }
    // Does not burn the counter: the same code is then still usable for the action it was entered for.
    const counter = verifyTotp(secret, code);
    if (counter === null || counter <= state.lastTotpCounter) {
      return res.status(403).json({ success: false, verified: false, error: "Invalid or already-used 2FA code." });
    }
    return res.json({ success: true, verified: true, message: "2FA code is valid.", timestamp: Date.now() });
  });

  // 2. Card deposit via Stripe PaymentIntent ---------------------------------------------------------------------
  app.post("/api/fiat/deposit/card", async (req: Request, res: Response) => {
    try {
      const { amount, paymentMethodId, directToBot = false, twoFactorCode, idempotencyKey } = req.body || {};

      if (req.body?.newCard || req.body?.cardNumber || req.body?.cvc) {
        return res.status(400).json({
          success: false,
          error: "Raw card numbers are not accepted by this server. Collect the card with Stripe Elements in the browser and send the resulting paymentMethodId (pm_...).",
        });
      }
      if (!stripeKey()) {
        return res.status(503).json({ success: false, error: "Card deposits are unavailable: STRIPE_SECRET_KEY is not configured." });
      }
      if (typeof paymentMethodId !== "string" || !/^pm_[A-Za-z0-9_]+$/.test(paymentMethodId)) {
        return res.status(400).json({ success: false, error: "A Stripe paymentMethodId (pm_...) is required." });
      }
      if (directToBot && state.botSecurity.emergencyFreezeActive) {
        return res.status(403).json({ success: false, error: "Emergency kill switch is active. Unfreeze in Security Settings before funding the bot." });
      }

      const numAmount = round2(Number(amount));
      if (!Number.isFinite(numAmount) || numAmount < 0.5) {
        return res.status(400).json({ success: false, error: "Minimum card deposit is $0.50 USD." });
      }
      rollDailyWindow();
      if (state.account.dailyDepositUsed + numAmount > state.account.dailyDepositLimit) {
        return res.status(400).json({
          success: false,
          error: `Exceeds daily deposit limit ($${state.account.dailyDepositLimit.toLocaleString()}). Remaining today: $${(state.account.dailyDepositLimit - state.account.dailyDepositUsed).toFixed(2)}.`,
        });
      }
      const tf = checkTwoFactor(twoFactorCode, numAmount, 1000);
      if (!tf.ok) return res.status(tf.status).json(tf.body);

      const idem = typeof idempotencyKey === "string" && idempotencyKey.length >= 8 ? idempotencyKey : crypto.randomUUID();
      const created = await stripeRequest(
        "POST",
        `/payment_intents?${PI_EXPAND}`,
        form({
          amount: Math.round(numAmount * 100),
          currency: "usd",
          payment_method: paymentMethodId,
          confirm: true,
          "automatic_payment_methods[enabled]": true,
          "automatic_payment_methods[allow_redirects]": "never",
          "metadata[purpose]": "fiat_deposit",
          "metadata[direct_to_bot]": directToBot ? "1" : "0",
        }),
        `fiat-deposit-${idem}`,
      );

      if (created.status === "succeeded") {
        const tx = settlePaymentIntent(created);
        const existing = tx || state.transactions.find((t) => t.referenceHash === created.id) || null;
        return res.json({
          success: true,
          account: accountPayload(),
          transaction: existing,
          message: `Stripe confirmed payment of $${numAmount.toFixed(2)} USD.`,
          directToBot: Boolean(directToBot),
          botCreditAmount: directToBot ? existing?.netAmount : undefined,
        });
      }
      if (created.status === "requires_action") {
        // Real 3-D Secure: the browser must complete it with stripe.handleNextAction(clientSecret).
        // The ledger is credited by the webhook when Stripe reports succeeded.
        return res.status(202).json({
          success: true,
          requiresAction: true,
          paymentIntentId: created.id,
          clientSecret: created.client_secret,
          message: "Card issuer requires authentication. Complete it in the browser; funds are credited when Stripe confirms.",
        });
      }
      if (created.status === "processing") {
        return res.status(202).json({
          success: true,
          processing: true,
          paymentIntentId: created.id,
          message: "Payment is processing. Funds are credited when Stripe confirms.",
        });
      }
      return res.status(402).json({ success: false, error: `Payment not completed (Stripe status: ${created.status}).` });
    } catch (err: any) {
      const status = err.status || 500;
      return res.status(status).json({ success: false, error: err.message || "Card deposit failed", code: err.stripe?.code });
    }
  });

  // 2a. Confirm a PaymentIntent after the browser finished 3-D Secure (stripe.handleNextAction) ----------------------
  // The server re-fetches the PaymentIntent from Stripe and credits only what Stripe reports as succeeded, at most once.
  app.post("/api/fiat/deposit/confirm", async (req: Request, res: Response) => {
    try {
      const { paymentIntentId } = req.body || {};
      if (typeof paymentIntentId !== "string" || !/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) {
        return res.status(400).json({ success: false, error: "A Stripe paymentIntentId (pi_...) is required." });
      }
      if (!stripeKey()) {
        return res.status(503).json({ success: false, error: "Card deposits are unavailable: STRIPE_SECRET_KEY is not configured." });
      }
      const pi = await stripeRequest("GET", `/payment_intents/${encodeURIComponent(paymentIntentId)}?${PI_EXPAND}`);
      if (pi?.metadata?.purpose !== "fiat_deposit") {
        return res.status(400).json({ success: false, error: "This PaymentIntent was not created by this app's deposit flow." });
      }
      if (pi.status === "succeeded") {
        const tx = settlePaymentIntent(pi);
        const existing = tx || state.transactions.find((t) => t.referenceHash === pi.id) || null;
        const directToBot = pi.metadata?.direct_to_bot === "1";
        return res.json({
          success: true,
          account: accountPayload(),
          transaction: existing,
          message: `Stripe confirmed payment of $${(Number(pi.amount) / 100).toFixed(2)} USD.`,
          directToBot,
          botCreditAmount: directToBot ? existing?.netAmount : undefined,
        });
      }
      if (pi.status === "processing") {
        return res.status(202).json({ success: true, processing: true, paymentIntentId: pi.id, message: "Payment is processing. Funds are credited when Stripe confirms." });
      }
      if (pi.status === "requires_action" || pi.status === "requires_confirmation") {
        return res.status(202).json({ success: true, requiresAction: true, paymentIntentId: pi.id, clientSecret: pi.client_secret, message: "Authentication is still required." });
      }
      return res.status(402).json({ success: false, error: `Payment not completed (Stripe status: ${pi.status}).${pi.last_payment_error?.message ? " " + pi.last_payment_error.message : ""}` });
    } catch (err: any) {
      return res.status(err.status || 500).json({ success: false, error: err.message || "Could not confirm payment", code: err.stripe?.code });
    }
  });

  // 2b. Stripe webhook (signature-verified; credits payments that finish after the initial request) ---------------
  app.post("/api/fiat/stripe/webhook", async (req: Request, res: Response) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ success: false, error: "STRIPE_WEBHOOK_SECRET is not configured." });
    const raw: Buffer | undefined = (req as any).rawBody;
    const sigHeader = String(req.headers["stripe-signature"] || "");
    if (!raw || !sigHeader) return res.status(400).json({ success: false, error: "Missing body or signature." });

    const items = sigHeader.split(",").map((p) => p.trim());
    const ts = Number(items.find((p) => p.startsWith("t="))?.slice(2));
    const v1 = items.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
    if (!ts || v1.length === 0 || Math.abs(Date.now() / 1000 - ts) > 300) {
      return res.status(400).json({ success: false, error: "Invalid or expired signature timestamp." });
    }
    const expected = crypto.createHmac("sha256", secret).update(`${ts}.`).update(raw).digest("hex");
    const valid = v1.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
    if (!valid) return res.status(400).json({ success: false, error: "Signature mismatch." });

    try {
      const event = JSON.parse(raw.toString("utf8"));
      if (event.type === "payment_intent.succeeded") {
        const id = event.data?.object?.id;
        if (typeof id === "string") {
          // Re-fetch from Stripe with the balance transaction expanded so we credit what actually landed (net of fees).
          const pi = await stripeRequest("GET", `/payment_intents/${encodeURIComponent(id)}?${PI_EXPAND}`);
          settlePaymentIntent(pi);
        }
      } else if (event.type === "payment_intent.payment_failed" || event.type === "payment_intent.canceled") {
        const id = event.data?.object?.id;
        if (typeof id === "string") {
          const pi = await stripeRequest("GET", `/payment_intents/${encodeURIComponent(id)}`);
          if (failPaymentIntent(pi)) console.error(`[fiat] Deposit ${id} failed (${pi.last_payment_error?.message || pi.status}); pending hold released, nothing credited.`);
        }
      } else if (event.type === "charge.dispute.created") {
        // A chargeback on a credited deposit: stop the bot from trading on funds that may be clawed back.
        state.botSecurity.emergencyFreezeActive = true;
        state.botSecurity.activeThreatLevel = "ELEVATED";
        persist();
        console.error("[fiat] Stripe dispute opened; emergency freeze engaged. Review the Stripe dashboard.");
      }
      return res.json({ received: true });
    } catch (err: any) {
      // 5xx makes Stripe retry, which is what we want for a failed settle.
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. Bot capital sync. The ledger cannot know trading P&L (the exchange is the source of truth), so the client
  //    can no longer overwrite the allocation. Returns the real figure. ---------------------------------------
  app.post("/api/fiat/sync-bot-capital", (_req: Request, res: Response) => {
    return res.json({
      success: true,
      allocatedToTrading: state.account.allocatedToTrading,
      account: accountPayload(),
    });
  });

  // 4. Internal allocation between the ledger and the bot -------------------------------------------------------
  app.post("/api/fiat/transfer-bot", (req: Request, res: Response) => {
    try {
      const { direction, amount, twoFactorCode } = req.body || {};
      const numAmount = round2(Number(amount));

      if (direction !== "TO_BOT" && direction !== "FROM_BOT") {
        return res.status(400).json({ success: false, error: "Invalid transfer direction" });
      }
      if (direction === "TO_BOT" && state.botSecurity.emergencyFreezeActive) {
        return res.status(403).json({ success: false, error: "Emergency kill switch is active. Unfreeze before allocating capital." });
      }
      if (!Number.isFinite(numAmount) || numAmount < 0.01) {
        return res.status(400).json({ success: false, error: "Minimum transfer amount is $0.01 USD" });
      }
      const tf = checkTwoFactor(twoFactorCode, numAmount, 2000);
      if (!tf.ok) return res.status(tf.status).json(tf.body);

      const acct = state.account;
      if (direction === "TO_BOT") {
        if (numAmount > acct.availableBalance) {
          return res.status(400).json({ success: false, error: `Insufficient available cash. Available: $${acct.availableBalance.toFixed(2)}` });
        }
        acct.availableBalance = round2(acct.availableBalance - numAmount);
        acct.allocatedToTrading = round2(acct.allocatedToTrading + numAmount);
      } else {
        if (numAmount > acct.allocatedToTrading) {
          return res.status(400).json({ success: false, error: `Cannot move more than is allocated to the bot ($${acct.allocatedToTrading.toFixed(2)}).` });
        }
        acct.allocatedToTrading = round2(acct.allocatedToTrading - numAmount);
        acct.availableBalance = round2(acct.availableBalance + numAmount);
      }

      const tx: FiatTransaction = {
        id: newId(direction === "TO_BOT" ? "tx-tobot" : "tx-frombot"),
        timestamp: Date.now(),
        type: direction === "TO_BOT" ? "TRANSFER_TO_BOT_CAPITAL" : "TRANSFER_FROM_BOT_CAPITAL",
        amount: numAmount,
        currency: "USD",
        fee: 0,
        netAmount: numAmount,
        status: "COMPLETED",
        sourceName: direction === "TO_BOT" ? "USD Ledger" : "Trading Bot Cash Balance",
        destinationName: direction === "TO_BOT" ? "Trading Bot Cash Balance" : "USD Ledger",
        referenceHash: crypto.randomBytes(12).toString("hex").toUpperCase(),
        rail: "INTERNAL_TRANSFER",
      };
      pushTx(tx);
      persist();

      return res.json({
        success: true,
        direction,
        amount: numAmount,
        message:
          direction === "TO_BOT"
            ? `Allocated $${numAmount.toFixed(2)} USD to the trading bot.`
            : `Returned $${numAmount.toFixed(2)} USD from the bot to the ledger.`,
        account: accountPayload(),
        transaction: tx,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Failed to transfer funds" });
    }
  });

  // 5. History --------------------------------------------------------------------------------------------------
  app.get("/api/fiat/transactions", (_req: Request, res: Response) => {
    res.json({ success: true, transactions: state.transactions, timestamp: Date.now() });
  });
  app.get("/api/fiat/check-deposits", (_req: Request, res: Response) => {
    res.json({ success: true, checks: [], timestamp: Date.now() });
  });

  // 7. Bank deposits: Plaid Link (verification) + Stripe ACH Direct Debit (money movement) -----------------------
  const plaidReady = () => Boolean(plaidConfig() && stripeKey());
  const bankUnavailable = () => ({
    success: false,
    error: !plaidConfig()
      ? "Bank deposits are unavailable: set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (sandbox|production)."
      : "Bank deposits are unavailable: STRIPE_SECRET_KEY is not configured.",
  });
  const errBody = (err: any) => ({ success: false, error: err.message || "Request failed", code: err.plaid?.code || err.stripe?.code });

  app.post("/api/fiat/bank/link-token", async (_req: Request, res: Response) => {
    if (!plaidReady()) return res.status(503).json(bankUnavailable());
    try {
      const cfg = plaidConfig()!;
      const out = await plaidRequest("/link/token/create", {
        client_name: "Trading Ledger",
        language: "en",
        country_codes: ["US"],
        user: { client_user_id: state.account.accountId },
        products: ["auth"],
        account_filters: { depository: { account_subtypes: ["checking", "savings"] } },
        ...(cfg.redirectUri ? { redirect_uri: cfg.redirectUri } : {}),
      });
      return res.json({ success: true, linkToken: out.link_token, expiration: out.expiration, env: cfg.env });
    } catch (err: any) {
      return res.status(err.status || 500).json(errBody(err));
    }
  });

  app.post("/api/fiat/link-bank", async (req: Request, res: Response) => {
    if (!plaidReady()) return res.status(503).json(bankUnavailable());
    try {
      const { publicToken, accountId, accountHolderName, accountHolderType, authorizationAccepted } = req.body || {};
      if (authorizationAccepted !== true) {
        return res.status(400).json({ success: false, error: "You must accept the ACH debit authorization before a bank can be linked." });
      }
      if (typeof publicToken !== "string" || !publicToken.startsWith("public-")) {
        return res.status(400).json({ success: false, error: "A Plaid publicToken is required." });
      }
      if (typeof accountId !== "string" || !accountId) {
        return res.status(400).json({ success: false, error: "A Plaid accountId is required (select exactly one account in Plaid Link)." });
      }
      const holder = typeof accountHolderName === "string" ? accountHolderName.trim() : "";
      if (holder.length < 2 || holder.length > 100) {
        return res.status(400).json({ success: false, error: "Enter the account holder's full legal name as it appears on the bank account." });
      }
      const holderType = accountHolderType === "company" ? "company" : "individual";
      const authorizedAt = Math.floor(Date.now() / 1000);

      // 1. public_token -> access_token (server only)
      const ex = await plaidRequest("/item/public_token/exchange", { public_token: publicToken });
      const accessToken: string = ex.access_token;
      const itemId: string = ex.item_id;

      const cleanup = async () => {
        try { await plaidRequest("/item/remove", { access_token: accessToken }); } catch { /* best effort */ }
      };

      // 2. Account + routing numbers for exactly the account the user selected
      const auth = await plaidRequest("/auth/get", { access_token: accessToken, options: { account_ids: [accountId] } });
      const ach = (auth.numbers?.ach || []).find((n: any) => n.account_id === accountId);
      const acct = (auth.accounts || []).find((a: any) => a.account_id === accountId);
      if (!ach || !acct) {
        await cleanup();
        return res.status(400).json({ success: false, error: "Plaid did not return ACH details for that account." });
      }
      const subtype = String(acct.subtype || "").toLowerCase();
      if (subtype !== "checking" && subtype !== "savings") {
        await cleanup();
        return res.status(400).json({ success: false, error: "Only checking or savings accounts can be used for ACH deposits." });
      }
      if (acct.verification_status && /^pending|failed|expired/.test(String(acct.verification_status))) {
        await cleanup();
        return res.status(409).json({
          success: false,
          error: "This account needs micro-deposit verification, which is not supported. Choose a bank that verifies instantly in Plaid Link.",
        });
      }

      const fingerprint = crypto.createHash("sha256").update(`${ach.routing}:${ach.account}`).digest("hex");
      const dupe = plaidStore.all().find((r) => r.fingerprint === fingerprint && state.account.linkedBanks.some((b) => b.id === r.linkedBankId));
      if (dupe) {
        await cleanup();
        return res.json({ success: true, account: accountPayload(), message: "That bank account is already linked.", alreadyLinked: true });
      }

      // 3. Institution name (best effort)
      let bankName = "Bank";
      try {
        const instId = auth.item?.institution_id;
        if (instId) {
          const inst = await plaidRequest("/institutions/get_by_id", { institution_id: instId, country_codes: ["US"] });
          bankName = inst.institution?.name || bankName;
        }
      } catch { /* keep default */ }

      // 4. Stripe: one Customer for the ledger, one SetupIntent that creates the us_bank_account PaymentMethod + mandate.
      //    Verification is skipped because Plaid already verified ownership; Stripe must have enabled this for your account.
      let customerId = state.stripeCustomerId;
      if (!customerId) {
        const cust = await stripeRequest(
          "POST",
          "/customers",
          form({ name: holder, "metadata[ledger_account]": state.account.accountId, "metadata[purpose]": "fiat_ledger" }),
        );
        customerId = cust.id as string;
        state.stripeCustomerId = customerId;
        persist();
      }
      const si = await stripeRequest(
        "POST",
        "/setup_intents",
        form({
          customer: customerId,
          confirm: true,
          "payment_method_types[]": "us_bank_account",
          "payment_method_options[us_bank_account][verification_method]": "skip",
          "payment_method_data[type]": "us_bank_account",
          "payment_method_data[billing_details][name]": holder,
          "payment_method_data[us_bank_account][routing_number]": ach.routing,
          "payment_method_data[us_bank_account][account_number]": ach.account,
          "payment_method_data[us_bank_account][account_holder_type]": holderType,
          "mandate_data[customer_acceptance][type]": "offline",
          "mandate_data[customer_acceptance][accepted_at]": authorizedAt,
          "metadata[plaid_item_id]": itemId,
        }),
        `fiat-link-${crypto.createHash("sha256").update(`${itemId}:${accountId}`).digest("hex").slice(0, 32)}`,
      );
      if (si.status !== "succeeded" || typeof si.payment_method !== "string") {
        await cleanup();
        return res.status(402).json({ success: false, error: `Stripe could not save this bank account (status: ${si.status}).` });
      }

      // 5. Persist. Raw routing/account numbers are not stored anywhere on this server.
      const linkedBankId = newId("bank");
      plaidStore.save({
        linkedBankId,
        accessToken,
        itemId,
        plaidAccountId: accountId,
        fingerprint,
        stripeCustomerId: customerId!,
        stripePaymentMethodId: si.payment_method,
        stripeMandateId: typeof si.mandate === "string" ? si.mandate : undefined,
        authorizedAt,
      });
      state.account.linkedBanks.forEach((b) => (b.isDefault = false));
      state.account.linkedBanks.push({
        id: linkedBankId,
        bankName,
        accountType: subtype === "savings" ? "SAVINGS" : "CHECKING",
        routingNumber: `•••• ${String(ach.routing).slice(-4)}`,
        accountNumberMasked: `•••• ${String(ach.account).slice(-4)}`,
        accountHolderName: holder,
        status: "VERIFIED",
        isDefault: true,
        currency: "USD",
        connectedVia: "PLAID_OPEN_BANKING",
        addedAt: Date.now(),
      });
      persist();
      return res.json({ success: true, account: accountPayload(), message: `${bankName} •••• ${String(ach.account).slice(-4)} linked.` });
    } catch (err: any) {
      return res.status(err.status || 500).json(errBody(err));
    }
  });

  app.post("/api/fiat/deposit/bank", async (req: Request, res: Response) => {
    try {
      const { amount, linkedBankId, twoFactorCode, idempotencyKey, directToBot } = req.body || {};
      if (!plaidReady()) return res.status(503).json(bankUnavailable());
      if (directToBot) {
        return res.status(400).json({
          success: false,
          error: "Bank (ACH) deposits go to the USD ledger first. ACH can be returned for days after it clears, so move funds to the bot only after they settle.",
        });
      }
      const bank = state.account.linkedBanks.find((b) => b.id === linkedBankId);
      const rec = typeof linkedBankId === "string" ? plaidStore.get(linkedBankId) : undefined;
      if (!bank || !rec) return res.status(404).json({ success: false, error: "Linked bank account not found. Link it again." });

      const numAmount = round2(Number(amount));
      if (!Number.isFinite(numAmount) || numAmount < 1) {
        return res.status(400).json({ success: false, error: "Minimum bank deposit is $1.00 USD." });
      }
      rollDailyWindow();
      const committed = state.account.dailyDepositUsed + state.account.pendingBalance;
      if (committed + numAmount > state.account.dailyDepositLimit) {
        return res.status(400).json({
          success: false,
          error: `Exceeds daily deposit limit ($${state.account.dailyDepositLimit.toLocaleString()}), counting debits still processing. Remaining: $${Math.max(0, state.account.dailyDepositLimit - committed).toFixed(2)}.`,
        });
      }
      const tf = checkTwoFactor(twoFactorCode, numAmount, 1000);
      if (!tf.ok) return res.status(tf.status).json(tf.body);

      const idem = typeof idempotencyKey === "string" && idempotencyKey.length >= 8 ? idempotencyKey : crypto.randomUUID();
      const pi = await stripeRequest(
        "POST",
        `/payment_intents?${PI_EXPAND}`,
        form({
          amount: Math.round(numAmount * 100),
          currency: "usd",
          customer: rec.stripeCustomerId,
          payment_method: rec.stripePaymentMethodId,
          "payment_method_types[]": "us_bank_account",
          confirm: true,
          mandate: rec.stripeMandateId,
          description: "Trading ledger ACH deposit",
          "metadata[purpose]": "fiat_deposit",
          "metadata[rail]": "ach",
          "metadata[direct_to_bot]": "0",
          "metadata[linked_bank_id]": bank.id,
        }),
        `fiat-bank-${idem}`,
      );

      if (pi.status === "succeeded") {
        const tx = settlePaymentIntent(pi);
        return res.json({
          success: true,
          account: accountPayload(),
          transaction: tx || state.transactions.find((t) => t.referenceHash === pi.id) || null,
          message: `Stripe confirmed the $${numAmount.toFixed(2)} bank debit.`,
        });
      }
      if (pi.status === "processing") {
        // ACH takes days. Show it as pending; the signature-verified webhook credits the ledger when Stripe says succeeded.
        if (!state.transactions.some((t) => t.referenceHash === pi.id)) {
          state.account.pendingBalance = round2(state.account.pendingBalance + numAmount);
          pushTx({
            id: newId("tx-ach"),
            timestamp: Date.now(),
            type: "BANK_ACH_DEPOSIT",
            amount: numAmount,
            currency: "USD",
            fee: 0,
            netAmount: numAmount,
            status: "PROCESSING",
            sourceName: `${bank.bankName} ${bank.accountNumberMasked}`,
            destinationName: "USD Ledger",
            referenceHash: pi.id,
            rail: "ACH_TRANSFER",
          });
          persist();
        }
        return res.status(202).json({
          success: true,
          processing: true,
          paymentIntentId: pi.id,
          account: accountPayload(),
          message: `ACH debit of $${numAmount.toFixed(2)} submitted. Funds are credited after Stripe confirms, typically about 4 business days.${process.env.STRIPE_WEBHOOK_SECRET ? "" : " WARNING: STRIPE_WEBHOOK_SECRET is not set, so the credit will not arrive automatically."}`,
        });
      }
      return res.status(402).json({ success: false, error: `Bank debit not accepted (Stripe status: ${pi.status}).${pi.last_payment_error?.message ? " " + pi.last_payment_error.message : ""}` });
    } catch (err: any) {
      return res.status(err.status || 500).json(errBody(err));
    }
  });

  app.delete("/api/fiat/bank/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const idx = state.account.linkedBanks.findIndex((b) => b.id === id);
      if (idx < 0) return res.status(404).json({ success: false, error: "Linked bank account not found." });
      if (state.transactions.some((t) => t.status === "PROCESSING" && state.account.linkedBanks[idx] && t.sourceName.includes(state.account.linkedBanks[idx].accountNumberMasked))) {
        return res.status(409).json({ success: false, error: "A debit from this bank is still processing. Unlink it after it settles." });
      }
      const rec = plaidStore.get(id);
      if (rec) {
        try { await plaidRequest("/item/remove", { access_token: rec.accessToken }); } catch { /* item may already be gone */ }
        try { await stripeRequest("POST", `/payment_methods/${encodeURIComponent(rec.stripePaymentMethodId)}/detach`, ""); } catch { /* keep going */ }
        plaidStore.remove(id);
      }
      state.account.linkedBanks.splice(idx, 1);
      if (state.account.linkedBanks.length && !state.account.linkedBanks.some((b) => b.isDefault)) state.account.linkedBanks[0].isDefault = true;
      persist();
      return res.json({ success: true, account: accountPayload(), message: "Bank account unlinked." });
    } catch (err: any) {
      return res.status(err.status || 500).json(errBody(err));
    }
  });

  // 8. Withdrawals: PayPal Payouts to pre-registered recipients only -----------------------------------------
  app.post("/api/fiat/withdraw/paypal", async (req: Request, res: Response) => {
    try {
      const { amount, recipientId, twoFactorCode, idempotencyKey } = req.body || {};
      if (!paypalConfig()) {
        return res.status(503).json({ success: false, error: "PayPal withdrawals are unavailable: set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_ENV (sandbox|live)." });
      }
      const recipients = paypalRecipients();
      if (recipients.length === 0) {
        return res.status(503).json({ success: false, error: "PayPal withdrawals are unavailable: set PAYPAL_PAYOUT_RECIPIENTS to the PayPal email(s) allowed to receive money." });
      }
      if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8) {
        return res.status(400).json({ success: false, error: "An idempotencyKey (8+ characters) is required so a retry can never pay twice." });
      }
      const senderBatchId = `wd-${crypto.createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 24)}`;

      // Same request again (double-click, retry): return what already happened. No new reservation, no 2FA use.
      const prior = state.transactions.find((t) => t.type === "WITHDRAW_TO_PAYPAL" && t.referenceHash === senderBatchId);
      if (prior) {
        return res.status(prior.status === "FAILED" ? 409 : 200).json({
          success: prior.status !== "FAILED",
          duplicate: true,
          transaction: prior,
          account: accountPayload(),
          message: `This withdrawal was already submitted (status: ${prior.status}).`,
          error: prior.status === "FAILED" ? "That withdrawal failed and was refunded. Use a new request to try again." : undefined,
        });
      }

      if (state.botSecurity.emergencyFreezeActive) {
        return res.status(403).json({ success: false, error: "Emergency kill switch is active. Withdrawals are blocked until you unfreeze." });
      }
      const idx = Number(recipientId);
      const receiver = Number.isInteger(idx) ? recipients[idx] : undefined;
      if (!receiver) return res.status(400).json({ success: false, error: "Choose one of the registered PayPal recipients." });

      const numAmount = round2(Number(amount));
      if (!Number.isFinite(numAmount) || numAmount < 1) {
        return res.status(400).json({ success: false, error: "Minimum withdrawal is $1.00 USD." });
      }
      rollDailyWindow();
      const limit = withdrawalDailyLimit();
      if (state.dailyWithdrawnUsd + numAmount > limit) {
        return res.status(400).json({
          success: false,
          error: `Exceeds the daily withdrawal limit ($${limit.toLocaleString()}). Remaining today: $${Math.max(0, limit - state.dailyWithdrawnUsd).toFixed(2)}.`,
        });
      }
      if (numAmount > state.account.availableBalance) {
        return res.status(400).json({
          success: false,
          error: `Insufficient funds: $${state.account.availableBalance.toFixed(2)} available in the USD ledger. Move money back from the bot first if needed.`,
        });
      }
      // Withdrawals always need a fresh TOTP code, whatever the amount.
      const tf = checkTwoFactor(twoFactorCode, numAmount, 0, true);
      if (!tf.ok) return res.status(tf.status).json(tf.body);

      // 1. Reserve the money on the ledger and save to disk BEFORE calling PayPal, so a crash can't pay out without a record.
      state.account.availableBalance = round2(state.account.availableBalance - numAmount);
      state.dailyWithdrawnUsd = round2(state.dailyWithdrawnUsd + numAmount);
      const tx: FiatTransaction = {
        id: newId("tx-pp"),
        timestamp: Date.now(),
        type: "WITHDRAW_TO_PAYPAL",
        amount: numAmount,
        currency: "USD",
        fee: 0,
        netAmount: numAmount,
        status: "PROCESSING",
        sourceName: "USD Ledger",
        destinationName: `PayPal ${maskEmail(receiver)}`,
        referenceHash: senderBatchId,
        rail: "PAYPAL_PAYOUT",
      };
      pushTx(tx);
      persist();

      // 2. Send. Same sender_batch_id + PayPal-Request-Id means a retry can never create a second payout.
      try {
        const out = await paypalRequest(
          "POST",
          "/v1/payments/payouts",
          {
            sender_batch_header: {
              sender_batch_id: senderBatchId,
              email_subject: "You have a payout",
              email_message: "Withdrawal from your trading ledger.",
            },
            items: [
              {
                recipient_type: "EMAIL",
                amount: { value: numAmount.toFixed(2), currency: "USD" },
                receiver,
                note: "Trading ledger withdrawal",
                sender_item_id: tx.id,
              },
            ],
          },
          senderBatchId,
        );
        tx.externalId = out?.batch_header?.payout_batch_id;
        persist();
        return res.status(202).json({
          success: true,
          processing: true,
          transaction: tx,
          account: accountPayload(),
          message: `$${numAmount.toFixed(2)} sent to PayPal (${maskEmail(receiver)}). It shows as processing until PayPal confirms; use Refresh status.`,
        });
      } catch (err: any) {
        if (err.ambiguous) {
          // Unknown outcome: money may have left. Keep it reserved; never auto-refund (that could double-spend).
          return res.status(202).json({
            success: true,
            processing: true,
            unknownOutcome: true,
            transaction: tx,
            account: accountPayload(),
            message: "PayPal did not answer, so the result is unknown. The amount stays reserved. Check your PayPal activity; if it was NOT sent, resolve it with a refund (needs 2FA).",
          });
        }
        refundWithdrawal(tx); // PayPal definitively refused it: nothing left, put the money back
        return res.status(err.status || 400).json({ success: false, error: err.message, code: err.paypal?.name, account: accountPayload() });
      }
    } catch (err: any) {
      return res.status(err.status || 500).json({ success: false, error: err.message || "Withdrawal failed" });
    }
  });

  // Refresh every in-flight payout from PayPal (the source of truth).
  app.post("/api/fiat/withdraw/paypal/reconcile", async (_req: Request, res: Response) => {
    if (!paypalConfig()) return res.status(503).json({ success: false, error: "PayPal is not configured." });
    const results: Record<string, string> = {};
    for (const tx of state.transactions.filter((t) => t.type === "WITHDRAW_TO_PAYPAL" && t.status === "PROCESSING" && t.externalId)) {
      try {
        results[tx.id] = await reconcilePaypalPayout(tx);
      } catch (err: any) {
        results[tx.id] = `error: ${err.message}`;
      }
    }
    return res.json({ success: true, results, account: accountPayload(), transactions: state.transactions });
  });

  // Manual resolution of a payout whose outcome PayPal never confirmed (no payout id was recorded).
  app.post("/api/fiat/withdraw/paypal/:id/resolve", (req: Request, res: Response) => {
    const { action, twoFactorCode } = req.body || {};
    const tx = state.transactions.find((t) => t.id === req.params.id && t.type === "WITHDRAW_TO_PAYPAL");
    if (!tx) return res.status(404).json({ success: false, error: "Withdrawal not found." });
    if (tx.status !== "PROCESSING" || tx.externalId) {
      return res.status(409).json({ success: false, error: "Only a withdrawal with an unknown PayPal outcome can be resolved by hand. Others are settled from PayPal's status." });
    }
    if (action !== "refund" && action !== "complete") return res.status(400).json({ success: false, error: "action must be 'refund' or 'complete'." });
    const tf = checkTwoFactor(twoFactorCode, tx.amount, 0, true);
    if (!tf.ok) return res.status(tf.status).json(tf.body);
    if (action === "refund") refundWithdrawal(tx);
    else {
      tx.status = "COMPLETED";
      persist();
    }
    return res.json({ success: true, transaction: tx, account: accountPayload(), message: action === "refund" ? "Reserved amount returned to the ledger." : "Marked as sent." });
  });

  // PayPal webhook: the body is never trusted. It only tells us which payout to re-read from PayPal.
  app.post("/api/fiat/paypal/webhook", async (req: Request, res: Response) => {
    try {
      const r = req.body?.resource || {};
      const batchId = r.payout_batch_id || r.batch_header?.payout_batch_id;
      const tx = typeof batchId === "string" ? state.transactions.find((t) => t.externalId === batchId && t.status === "PROCESSING") : undefined;
      if (tx && paypalConfig()) await reconcilePaypalPayout(tx);
    } catch (err: any) {
      console.error("[fiat] PayPal webhook reconcile failed:", err.message);
      return res.status(500).json({ received: false }); // PayPal retries
    }
    return res.json({ received: true });
  });

  // 6. Rails with no live processor: honest 501s instead of fabricated success --------------------------------
  app.post("/api/fiat/deposit/check", (_req, res) =>
    res.status(501).json(NOT_AVAILABLE("Check deposit", "Remote deposit capture needs a licensed provider; it is not implemented.")));
  app.post("/api/fiat/withdraw", (_req, res) =>
    res.status(501).json(NOT_AVAILABLE("Fiat withdrawal", "Paying out to a bank or card needs a payout provider (e.g. Stripe Connect). PayPal payouts are available at POST /api/fiat/withdraw/paypal.")));
  app.post("/api/fiat/link-card", (_req, res) =>
    res.status(501).json(NOT_AVAILABLE("Card linking", "Cards are collected per deposit with Stripe Elements; the server stores no card data.")));
  app.delete("/api/fiat/card/:id", (_req, res) =>
    res.status(404).json({ success: false, error: "No linked cards exist." }));
  app.post("/api/fiat/3ds/initiate", (_req, res) =>
    res.status(501).json(NOT_AVAILABLE("Simulated 3-D Secure", "Real 3DS is handled by Stripe: /api/fiat/deposit/card returns requiresAction + clientSecret when the issuer demands it.")));
  app.post("/api/fiat/3ds/verify", (_req, res) =>
    res.status(501).json(NOT_AVAILABLE("Simulated 3-D Secure", "Real 3DS is handled by Stripe.js.")));
}
