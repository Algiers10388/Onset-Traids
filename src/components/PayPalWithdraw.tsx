import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import type { FiatAccount, FiatTransaction } from '../types';

/**
 * Withdraw from the USD ledger to PayPal (PayPal Payouts API).
 *
 * - Only PayPal emails registered on the server (PAYPAL_PAYOUT_RECIPIENTS) can be chosen. Nothing typed here can redirect money.
 * - Every withdrawal needs a fresh 6-digit 2FA code.
 * - The server reserves the amount on the ledger first, then asks PayPal. Status comes from PayPal (Refresh status).
 * - The request key is reused after a network error, so retrying can never pay twice.
 */

interface Props {
  availableBalance: number;
  onAccountUpdated: (account: FiatAccount, message: string) => void;
  onError?: (message: string) => void;
}

interface PaypalRails {
  withdrawals: boolean;
  paypal: { env: 'sandbox' | 'live'; recipients: { id: number; label: string }[]; dailyLimitUsd: number; withdrawnTodayUsd: number } | null;
}

async function api(method: 'GET' | 'POST', url: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = { success: false, error: `Server returned an unexpected response (HTTP ${res.status}).` };
  }
  return { status: res.status, data };
}

const statusStyle: Record<string, string> = {
  COMPLETED: 'text-emerald-300',
  PROCESSING: 'text-amber-300',
  PENDING: 'text-amber-300',
  FAILED: 'text-rose-300',
};

export const PayPalWithdraw: React.FC<Props> = ({ availableBalance, onAccountUpdated, onError }) => {
  const [rails, setRails] = useState<PaypalRails | null>(null);
  const [recipientId, setRecipientId] = useState(0);
  const [amount, setAmount] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [payouts, setPayouts] = useState<FiatTransaction[]>([]);
  const keyRef = useRef<string>(crypto.randomUUID());

  const fail = useCallback(
    (m: string) => {
      setError(m);
      onError?.(m);
    },
    [onError]
  );

  const loadRails = useCallback(async () => {
    try {
      const { data } = await api('GET', '/api/fiat/config');
      setRails({ withdrawals: Boolean(data?.rails?.withdrawals), paypal: data?.rails?.paypal ?? null });
    } catch {
      setRails({ withdrawals: false, paypal: null });
    }
  }, []);

  const loadPayouts = useCallback(async () => {
    try {
      const { data } = await api('GET', '/api/fiat/transactions');
      setPayouts((data?.transactions || []).filter((t: FiatTransaction) => t.type === 'WITHDRAW_TO_PAYPAL').slice(0, 10));
    } catch {
      /* list is informational */
    }
  }, []);

  useEffect(() => {
    loadRails();
    loadPayouts();
  }, [loadRails, loadPayouts]);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const { data } = await api('POST', '/api/fiat/withdraw/paypal/reconcile');
      if (!data?.success) throw new Error(data?.error || 'Could not refresh payout status.');
      if (data.account) onAccountUpdated(data.account, 'Payout status refreshed from PayPal.');
      setPayouts((data.transactions || []).filter((t: FiatTransaction) => t.type === 'WITHDRAW_TO_PAYPAL').slice(0, 10));
      loadRails();
    } catch (e: any) {
      fail(e?.message || 'Could not refresh payout status.');
    } finally {
      setRefreshing(false);
    }
  };

  const submit = async () => {
    setError(null);
    setInfo(null);
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt < 1) return fail('Minimum withdrawal is $1.00.');
    if (amt > availableBalance) return fail(`Only $${availableBalance.toFixed(2)} is available in the USD ledger.`);
    if (!/^\d{6}$/.test(code)) return fail('Enter the current 6-digit 2FA code.');
    setBusy(true);
    try {
      const { status, data } = await api('POST', '/api/fiat/withdraw/paypal', {
        amount: amt,
        recipientId,
        twoFactorCode: code,
        idempotencyKey: keyRef.current,
      });
      if (!data?.success) {
        // A definitive answer (not a network failure) ends this attempt, so the next one gets a new key.
        if (status !== 502 && status !== 504) keyRef.current = crypto.randomUUID();
        throw new Error(data?.error || `Withdrawal failed (HTTP ${status}).`);
      }
      keyRef.current = crypto.randomUUID();
      setAmount('');
      setCode('');
      setInfo(data.message);
      if (data.account) onAccountUpdated(data.account, data.message);
      loadPayouts();
      loadRails();
    } catch (e: any) {
      // Network error: keep the same key so pressing the button again cannot create a second payout.
      fail(e?.message || 'Withdrawal failed.');
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (tx: FiatTransaction, action: 'refund' | 'complete') => {
    if (!/^\d{6}$/.test(code)) return fail('Enter a fresh 6-digit 2FA code above first.');
    if (!window.confirm(action === 'refund' ? 'Only refund if PayPal shows this payout was NOT sent. Continue?' : 'Only mark as sent if PayPal shows it WAS sent. Continue?')) return;
    const { data } = await api('POST', `/api/fiat/withdraw/paypal/${encodeURIComponent(tx.id)}/resolve`, { action, twoFactorCode: code });
    if (!data?.success) return fail(data?.error || 'Could not resolve.');
    setCode('');
    setInfo(data.message);
    onAccountUpdated(data.account, data.message);
    loadPayouts();
  };

  if (!rails) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Checking withdrawal setup…</span>
      </div>
    );
  }

  if (!rails.withdrawals || !rails.paypal) {
    return (
      <div className="text-xs text-amber-200 bg-amber-950/30 border border-amber-900/60 rounded-xl px-4 py-4 space-y-1.5">
        <div className="font-bold">Withdrawals are not configured</div>
        <p>
          Set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV (sandbox or live) and PAYPAL_PAYOUT_RECIPIENTS (the PayPal email(s) allowed to receive money) on the
          server. Your PayPal Business account must have Payouts enabled.
        </p>
      </div>
    );
  }

  const p = rails.paypal;
  const remainingToday = Math.max(0, p.dailyLimitUsd - p.withdrawnTodayUsd);

  return (
    <div className="space-y-5">
      {p.env === 'sandbox' && (
        <div className="text-[11px] text-cyan-200 bg-cyan-950/30 border border-cyan-900/60 rounded-lg px-3 py-2">
          PayPal <b>sandbox</b>: no real money moves.
        </div>
      )}

      <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <ArrowUpRight className="h-4 w-4 text-emerald-400" />
            <span>Withdraw to PayPal</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            Available ${availableBalance.toFixed(2)} · Left today ${remainingToday.toFixed(2)}
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Send to</label>
          <select
            value={recipientId}
            onChange={(e) => setRecipientId(Number(e.target.value))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          >
            {p.recipients.map((r) => (
              <option key={r.id} value={r.id}>
                PayPal {r.label}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-500 mt-1">Only PayPal accounts registered on the server can receive withdrawals.</p>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Amount (USD)</label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-slate-400 font-mono text-sm">$</span>
            <input
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="25.00"
              className="w-full bg-slate-900 border border-slate-700 text-white pl-8 pr-4 py-2.5 rounded-xl font-mono text-base font-bold focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> 2FA code (required for every withdrawal)
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            className="w-40 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="w-full px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
          <span>{busy ? 'Sending to PayPal…' : `Withdraw ${parseFloat(amount) >= 1 ? '$' + parseFloat(amount).toFixed(2) : ''} to PayPal`}</span>
        </button>
        <p className="text-[10px] text-slate-500">
          The amount leaves your ledger immediately and returns automatically if PayPal blocks, fails or returns the payout. PayPal may charge a payout fee to your
          PayPal balance.
        </p>
      </div>

      {error && <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded-lg px-3 py-2">{error}</div>}
      {info && <div className="text-xs text-emerald-200 bg-emerald-950/30 border border-emerald-900/60 rounded-lg px-3 py-2">{info}</div>}

      <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white">Recent PayPal withdrawals</span>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="text-xs text-cyan-300 hover:text-cyan-200 flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh status</span>
          </button>
        </div>
        {payouts.length === 0 ? (
          <div className="text-[11px] text-slate-500">No PayPal withdrawals yet.</div>
        ) : (
          <div className="space-y-2">
            {payouts.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 text-[11px] bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <div className="text-slate-200 font-mono truncate">
                    ${t.amount.toFixed(2)} → {t.destinationName}
                  </div>
                  <div className="text-slate-500">{new Date(t.timestamp).toLocaleString()}</div>
                  {t.status === 'PROCESSING' && !t.externalId && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-amber-300">PayPal never confirmed this one. Check your PayPal activity, then:</span>
                      <button type="button" onClick={() => resolve(t, 'refund')} className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer">
                        Not sent: refund
                      </button>
                      <button type="button" onClick={() => resolve(t, 'complete')} className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer">
                        Was sent
                      </button>
                    </div>
                  )}
                </div>
                <span className={`font-bold shrink-0 ${statusStyle[t.status] || 'text-slate-300'}`}>{t.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PayPalWithdraw;
