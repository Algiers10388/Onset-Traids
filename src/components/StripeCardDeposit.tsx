import React, { useEffect, useRef, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { CreditCard, Loader2, Lock } from 'lucide-react';
import type { FiatAccount, FiatTransaction } from '../types';

/**
 * Real card deposits with Stripe Elements (deferred-intent flow, same pattern as
 * github.com/stripe-samples/accept-a-payment):
 *
 *   1. Card details are typed into Stripe's <PaymentElement> (an iframe). They never reach this app or our server.
 *   2. elements.submit() validates the form, stripe.createPaymentMethod({ elements }) returns a pm_... id.
 *   3. POST /api/fiat/deposit/card creates and confirms the PaymentIntent server-side (USD, card only).
 *   4. If the issuer wants 3-D Secure the server answers 202 + clientSecret; stripe.handleNextAction() shows the
 *      real challenge, then POST /api/fiat/deposit/confirm lets the server re-read the PaymentIntent from Stripe.
 *   5. The balance is credited by the server only when Stripe reports "succeeded" (once per PaymentIntent id).
 */

export interface StripeDepositResult {
  account: FiatAccount;
  transaction: FiatTransaction | null;
  message: string;
  directToBot?: boolean;
  botCreditAmount?: number;
}

interface Props {
  /** Amount in USD the user wants to deposit. */
  amount: number;
  /** Credit the trading bot's cash balance instead of the vault. */
  directToBot?: boolean;
  onDeposited: (result: StripeDepositResult) => void;
  onError?: (message: string) => void;
  buttonLabel?: string;
}

const MIN_USD = 0.5; // Stripe's minimum charge for USD

let stripeCache: { key: string; promise: Promise<Stripe | null> } | null = null;
function getStripe(publishableKey: string): Promise<Stripe | null> {
  // Created once per key, outside any component render, so the Stripe object is never recreated.
  if (!stripeCache || stripeCache.key !== publishableKey) {
    stripeCache = { key: publishableKey, promise: loadStripe(publishableKey) };
  }
  return stripeCache.promise;
}

async function postJson(url: string, body: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = { success: false, error: `Server returned an unexpected response (HTTP ${res.status}).` };
  }
  return { status: res.status, data };
}

const CardForm: React.FC<Props> = ({ amount, directToBot = false, onDeposited, onError, buttonLabel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [needs2fa, setNeeds2fa] = useState(false);
  const [code, setCode] = useState('');
  const inFlight = useRef(false);

  const amountOk = Number.isFinite(amount) && amount >= MIN_USD;

  const fail = (msg: string) => {
    setError(msg);
    onError?.(msg);
  };

  const handleSubmit = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (!stripe || !elements || inFlight.current) return;
    if (!amountOk) {
      fail(`Minimum card deposit is $${MIN_USD.toFixed(2)} USD.`);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const submitted = await elements.submit();
      if (submitted.error) throw new Error(submitted.error.message || 'Please check your card details.');

      const created = await stripe.createPaymentMethod({ elements });
      if (created.error || !created.paymentMethod) {
        throw new Error(created.error?.message || 'Stripe could not read the card details.');
      }

      let { status, data } = await postJson('/api/fiat/deposit/card', {
        amount,
        paymentMethodId: created.paymentMethod.id,
        directToBot,
        twoFactorCode: needs2fa && code.trim() ? code.trim() : undefined,
        idempotencyKey: crypto.randomUUID(),
      });

      if (data?.requires2FA) {
        setNeeds2fa(true);
        throw new Error(data.error || 'Enter your 6-digit 2FA code, then press the button again.');
      }

      if (status === 202 && data?.requiresAction && data?.clientSecret) {
        // Real 3-D Secure challenge shown by Stripe.js
        const action = await stripe.handleNextAction({ clientSecret: data.clientSecret });
        if (action.error) throw new Error(action.error.message || 'Card authentication failed.');
        const confirmed = await postJson('/api/fiat/deposit/confirm', {
          paymentIntentId: action.paymentIntent?.id || data.paymentIntentId,
        });
        status = confirmed.status;
        data = confirmed.data;
      }

      if (data?.processing) {
        setInfo(data.message || 'Payment is processing. Your balance updates when Stripe confirms.');
        return;
      }
      if (!data?.success) throw new Error(data?.error || `Card deposit failed (HTTP ${status}).`);

      setNeeds2fa(false);
      setCode('');
      onDeposited({
        account: data.account,
        transaction: data.transaction ?? null,
        message: data.message || 'Deposit confirmed by Stripe.',
        directToBot: data.directToBot,
        botCreditAmount: data.botCreditAmount,
      });
    } catch (err: any) {
      fail(err?.message || 'Card deposit failed.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3.5">  {/* a div, not a <form>: this component is also rendered inside other forms */}
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
        <CreditCard className="h-4 w-4 text-cyan-400" />
        <span>Card details (entered in Stripe&apos;s secure fields)</span>
      </div>

      <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-3">
        <PaymentElement
          options={{ layout: 'tabs', wallets: { applePay: 'never', googlePay: 'never' } }}
          onReady={() => setReady(true)}
          onLoadError={(ev) => fail(ev.error?.message || 'Stripe form failed to load.')}
        />
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
            className="w-40 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
            placeholder="123456"
          />
        </div>
      )}

      {error && <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded-lg px-3 py-2">{error}</div>}
      {info && <div className="text-xs text-cyan-200 bg-cyan-950/40 border border-cyan-900/60 rounded-lg px-3 py-2">{info}</div>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={busy || !stripe || !elements || !ready || !amountOk}
        className="w-full px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        <span>
          {busy
            ? 'Processing with Stripe…'
            : amountOk
              ? `${buttonLabel || 'Charge card'} $${amount.toFixed(2)}`
              : `Enter at least $${MIN_USD.toFixed(2)}`}
        </span>
      </button>
      <p className="text-[10px] text-slate-500 text-center">
        Card data goes straight to Stripe. This app never sees it. Funds are credited only after Stripe confirms the payment.
      </p>
    </div>
  );
};

export const StripeCardDeposit: React.FC<Props> = (props) => {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/fiat/config')
      .then((r) => r.json())
      .then((cfg) => {
        if (cancelled) return;
        const s = cfg?.stripe;
        if (!s?.configured) {
          setProblem('Card deposits are unavailable: STRIPE_SECRET_KEY is not set on the server.');
        } else if (!s?.publishableKey) {
          setProblem('Card deposits are unavailable: STRIPE_PUBLISHABLE_KEY is not set on the server.');
        } else {
          setStripePromise(getStripe(s.publishableKey));
        }
      })
      .catch(() => !cancelled && setProblem('Could not load the payment configuration from the server.'));
    return () => {
      cancelled = true;
    };
  }, []);

  if (problem) {
    return <div className="text-xs text-amber-200 bg-amber-950/30 border border-amber-900/60 rounded-xl px-3 py-3">{problem}</div>;
  }
  if (!stripePromise) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading secure card form…</span>
      </div>
    );
  }

  const cents = Math.max(Math.round(MIN_USD * 100), Math.round((props.amount || 0) * 100));
  return (
    <Elements
      stripe={stripePromise}
      options={{
        mode: 'payment',
        amount: cents,
        currency: 'usd',
        paymentMethodCreation: 'manual',
        appearance: { theme: 'night', variables: { colorPrimary: '#22d3ee' } },
      } as any}
    >
      <CardForm {...props} />
    </Elements>
  );
};

export default StripeCardDeposit;
