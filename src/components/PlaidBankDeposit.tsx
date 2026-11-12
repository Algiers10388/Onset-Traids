import React, { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { Banknote, CheckCircle2, Landmark, Loader2, Trash2 } from 'lucide-react';
import type { FiatAccount, LinkedBankAccount } from '../types';

/**
 * Real bank deposits: Plaid Link verifies the account, Stripe ACH Direct Debit moves the money.
 *
 *   1. POST /api/fiat/bank/link-token       -> Plaid link_token (server holds the Plaid secret)
 *   2. Plaid Link (react-plaid-link)        -> public_token + the one account the user picked
 *   3. POST /api/fiat/link-bank             -> server exchanges the token, saves the bank with Stripe, keeps only masked details
 *   4. POST /api/fiat/deposit/bank          -> server creates the ACH PaymentIntent (status "processing" for ~4 business days)
 *   5. Stripe webhook                       -> server credits the ledger when Stripe reports "succeeded"
 *
 * The browser never sees routing/account numbers or the Plaid access token.
 */

interface Props {
  linkedBanks: LinkedBankAccount[];
  onAccountUpdated: (account: FiatAccount, message: string) => void;
  onError?: (message: string) => void;
}

interface RailsConfig {
  bank: boolean;
  plaid: { env: 'sandbox' | 'production'; oauthRedirectConfigured: boolean } | null;
}

async function api(method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown): Promise<{ status: number; data: any }> {
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

const AUTHORIZATION_TEXT =
  'I authorize this app to electronically debit the bank account I select in Plaid, by ACH, for deposit amounts that I request, ' +
  'and to credit that account to correct errors. I understand ACH debits can be returned by my bank, and that I can revoke this ' +
  'authorization at any time by unlinking the account.';

export const PlaidBankDeposit: React.FC<Props> = ({ linkedBanks, onAccountUpdated, onError }) => {
  const [rails, setRails] = useState<RailsConfig | null>(null);
  const [holderName, setHolderName] = useState('');
  const [holderType, setHolderType] = useState<'individual' | 'company'>('individual');
  const [authorized, setAuthorized] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const [selectedBankId, setSelectedBankId] = useState('');
  const [amount, setAmount] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [code, setCode] = useState('');
  const [depositing, setDepositing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const fail = useCallback(
    (m: string) => {
      setError(m);
      onError?.(m);
    },
    [onError]
  );

  useEffect(() => {
    let cancelled = false;
    api('GET', '/api/fiat/config')
      .then(({ data }) => !cancelled && setRails({ bank: Boolean(data?.rails?.bank), plaid: data?.rails?.plaid ?? null }))
      .catch(() => !cancelled && setRails({ bank: false, plaid: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!linkedBanks.some((b) => b.id === selectedBankId)) {
      setSelectedBankId((linkedBanks.find((b) => b.isDefault) || linkedBanks[0])?.id || '');
    }
  }, [linkedBanks, selectedBankId]);

  const onPlaidSuccess = useCallback(
    async (publicToken: string | null, metadata: any) => {
      setLinkToken(null);
      if (!publicToken) {
        setLinking(false);
        fail('Plaid Link did not return a valid public token.');
        return;
      }
      const accounts = metadata?.accounts || [];
      if (accounts.length !== 1) {
        setLinking(false);
        fail('Select exactly one checking or savings account in Plaid Link.');
        return;
      }
      try {
        const { status, data } = await api('POST', '/api/fiat/link-bank', {
          publicToken,
          accountId: accounts[0].id,
          accountHolderName: holderName.trim(),
          accountHolderType: holderType,
          authorizationAccepted: authorized,
        });
        if (!data?.success) throw new Error(data?.error || `Could not link the bank (HTTP ${status}).`);
        setInfo(data.message || 'Bank linked.');
        setAuthorized(false);
        onAccountUpdated(data.account, data.message || 'Bank linked.');
      } catch (e: any) {
        fail(e?.message || 'Could not link the bank.');
      } finally {
        setLinking(false);
      }
    },
    [authorized, fail, holderName, holderType, onAccountUpdated]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: (err) => {
      setLinkToken(null);
      setLinking(false);
      if (err) fail(err.display_message || err.error_message || 'Plaid Link closed with an error.');
    },
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  const startLink = async () => {
    setError(null);
    setInfo(null);
    if (holderName.trim().length < 2) return fail("Enter the account holder's full legal name first.");
    if (!authorized) return fail('Tick the ACH debit authorization to continue.');
    setLinking(true);
    try {
      const { status, data } = await api('POST', '/api/fiat/bank/link-token');
      if (!data?.success || !data?.linkToken) throw new Error(data?.error || `Could not start Plaid Link (HTTP ${status}).`);
      setLinkToken(data.linkToken);
    } catch (e: any) {
      setLinking(false);
      fail(e?.message || 'Could not start Plaid Link.');
    }
  };

  const deposit = async () => {
    setError(null);
    setInfo(null);
    const amt = parseFloat(amount);
    if (!selectedBankId) return fail('Link a bank account first.');
    if (!Number.isFinite(amt) || amt < 1) return fail('Minimum bank deposit is $1.00.');
    setDepositing(true);
    try {
      const { status, data } = await api('POST', '/api/fiat/deposit/bank', {
        amount: amt,
        linkedBankId: selectedBankId,
        twoFactorCode: needs2fa && code.trim() ? code.trim() : undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      if (data?.requires2FA) {
        setNeeds2fa(true);
        throw new Error(data.error || 'Enter your 6-digit 2FA code, then press the button again.');
      }
      if (!data?.success) throw new Error(data?.error || `Bank deposit failed (HTTP ${status}).`);
      setNeeds2fa(false);
      setCode('');
      setAmount('');
      setInfo(data.message);
      if (data.account) onAccountUpdated(data.account, data.message);
    } catch (e: any) {
      fail(e?.message || 'Bank deposit failed.');
    } finally {
      setDepositing(false);
    }
  };

  const unlink = async (bank: LinkedBankAccount) => {
    if (!window.confirm(`Unlink ${bank.bankName} ${bank.accountNumberMasked}? Future deposits from it will need a new link.`)) return;
    setError(null);
    const { status, data } = await api('DELETE', `/api/fiat/bank/${encodeURIComponent(bank.id)}`);
    if (!data?.success) return fail(data?.error || `Could not unlink (HTTP ${status}).`);
    setInfo(data.message);
    onAccountUpdated(data.account, data.message);
  };

  if (!rails) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Checking bank deposit setup…</span>
      </div>
    );
  }
  if (!rails.bank) {
    return (
      <div className="text-xs text-amber-200 bg-amber-950/30 border border-amber-900/60 rounded-xl px-3 py-3 space-y-1">
        <div className="font-bold">Bank deposits are not configured</div>
        <p>Set PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV (sandbox or production) and STRIPE_SECRET_KEY on the server. Card deposits still work.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {rails.plaid?.env === 'sandbox' && (
        <div className="text-[11px] text-cyan-200 bg-cyan-950/30 border border-cyan-900/60 rounded-lg px-3 py-2">
          Plaid <b>sandbox</b>: no real money moves. In Plaid Link pick any bank and sign in with <span className="font-mono">user_good</span> /{' '}
          <span className="font-mono">pass_good</span>.
        </div>
      )}
      {rails.plaid?.env === 'production' && !rails.plaid.oauthRedirectConfigured && (
        <div className="text-[11px] text-amber-200 bg-amber-950/30 border border-amber-900/60 rounded-lg px-3 py-2">
          PLAID_REDIRECT_URI is not set, so banks that require OAuth sign-in (many large banks) cannot be linked yet.
        </div>
      )}

      {/* Linked banks + deposit */}
      {linkedBanks.length > 0 && (
        <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Banknote className="h-4 w-4 text-emerald-400" />
            <span>Deposit from a linked bank (ACH)</span>
          </div>

          <div className="space-y-2">
            {linkedBanks.map((b) => (
              <label
                key={b.id}
                className={`flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer ${
                  selectedBankId === b.id ? 'border-emerald-500/60 bg-emerald-950/20' : 'border-slate-800 bg-slate-900/50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <input type="radio" name="plaid-bank" checked={selectedBankId === b.id} onChange={() => setSelectedBankId(b.id)} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{b.bankName}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {b.accountType} {b.accountNumberMasked} · {b.accountHolderName}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" /> Verified by Plaid
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      unlink(b);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-950/40 cursor-pointer"
                    title="Unlink"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </label>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Amount (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 font-mono text-sm">$</span>
              <input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="100.00"
                className="w-full bg-slate-900 border border-slate-700 text-white pl-8 pr-4 py-2.5 rounded-xl font-mono text-base font-bold focus:outline-none focus:border-emerald-500"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              ACH takes about 4 business days and can be returned by the bank. Funds land in your USD ledger after Stripe confirms; move them to the bot after
              they settle.
            </p>
          </div>

          {needs2fa && (
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">6-digit 2FA code</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-40 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
                placeholder="123456"
              />
            </div>
          )}

          <button
            type="button"
            onClick={deposit}
            disabled={depositing || !selectedBankId || !(parseFloat(amount) >= 1)}
            className="w-full px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {depositing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
            <span>{depositing ? 'Submitting to Stripe…' : `Debit bank ${parseFloat(amount) >= 1 ? '$' + parseFloat(amount).toFixed(2) : ''}`}</span>
          </button>
        </div>
      )}

      {/* Link a new bank */}
      <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Landmark className="h-4 w-4 text-cyan-400" />
          <span>{linkedBanks.length ? 'Link another bank' : 'Link your bank with Plaid'}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Account holder legal name</label>
            <input
              type="text"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              autoComplete="name"
              placeholder="As shown on the bank account"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Account type</label>
            <select
              value={holderType}
              onChange={(e) => setHolderType(e.target.value as 'individual' | 'company')}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="individual">Personal</option>
              <option value="company">Business</option>
            </select>
          </div>
        </div>

        <label className="flex items-start gap-2 text-[11px] text-slate-300 leading-snug cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />
          <span>{AUTHORIZATION_TEXT}</span>
        </label>

        <button
          type="button"
          onClick={startLink}
          disabled={linking}
          className="w-full px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
          <span>{linking ? 'Connecting…' : 'Connect bank with Plaid'}</span>
        </button>
        <p className="text-[10px] text-slate-500 text-center">
          You sign in to your bank inside Plaid. This app never sees your bank login, and the full account number is never stored here.
        </p>
      </div>

      {error && <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded-lg px-3 py-2">{error}</div>}
      {info && <div className="text-xs text-emerald-200 bg-emerald-950/30 border border-emerald-900/60 rounded-lg px-3 py-2">{info}</div>}
    </div>
  );
};

export default PlaidBankDeposit;
