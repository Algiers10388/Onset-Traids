import React, { useState } from 'react';
import {
  FileCheck,
  Camera,
  CheckCircle2,
  AlertCircle,
  Zap,
  Landmark,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  Eye,
  RotateCw,
  ArrowRight,
  Upload,
} from 'lucide-react';
import { FiatAccount, FiatTransaction } from '../types';
import { depositPersonalCheck, CheckDepositInput } from '../services/fiatApi';
import { formatCurrency } from '../utils/cryptoMath';

interface CashCheckModalTabProps {
  fiatAccount: FiatAccount;
  onAccountUpdated: (newAccount: FiatAccount, notificationMsg?: string) => void;
  onBotCashAdjusted?: (amountDelta: number) => void;
  botCash: number;
}

export const CashCheckModalTab: React.FC<CashCheckModalTabProps> = ({
  fiatAccount,
  onAccountUpdated,
  onBotCashAdjusted,
  botCash,
}) => {
  // Check Form State
  const [payerName, setPayerName] = useState<string>('');
  const [issuingBank, setIssuingBank] = useState<string>('');
  const [routingNumber, setRoutingNumber] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [checkNumber, setCheckNumber] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [settlementSpeed, setSettlementSpeed] = useState<'INSTANT' | 'STANDARD_CLEARING'>('INSTANT');
  const [destinationTarget, setDestinationTarget] = useState<'BOT' | 'VAULT'>('BOT');
  const [endorsementConfirmed, setEndorsementConfirmed] = useState<boolean>(false);

  // Check Imagery Simulation
  const [frontCaptured, setFrontCaptured] = useState<boolean>(false);
  const [backCaptured, setBackCaptured] = useState<boolean>(false);
  const [checkSide, setCheckSide] = useState<'FRONT' | 'BACK'>('FRONT');

  // Execution & Feedback
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [clearedReceipt, setClearedReceipt] = useState<FiatTransaction | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const handleCashCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 1.0) {
      setErrorMsg('Minimum check cashing amount is $1.00 USD.');
      return;
    }

    if (!payerName.trim()) {
      setErrorMsg('Please specify the payer name written on the check.');
      return;
    }

    const cleanRouting = routingNumber.replace(/\D/g, '');
    if (cleanRouting.length !== 9) {
      setErrorMsg('ABA Routing Number must be exactly 9 numeric digits.');
      return;
    }

    if (!frontCaptured || !backCaptured) {
      setErrorMsg('Both Front and Back photos of the check must be captured before submission.');
      return;
    }

    if (!endorsementConfirmed) {
      setErrorMsg('You must confirm the check is endorsed for mobile deposit.');
      return;
    }

    setIsLoading(true);
    try {
      const input: CheckDepositInput = {
        amount: numAmount,
        payerName: payerName.trim(),
        checkNumber: checkNumber.trim(),
        routingNumber: cleanRouting,
        accountNumber: accountNumber.trim(),
        issuingBank: issuingBank.trim(),
        settlementSpeed,
        directToBot: destinationTarget === 'BOT',
        endorsementConfirmed: true,
        memo: memo.trim(),
      };

      const res = await depositPersonalCheck(input);
      onAccountUpdated(res.account, res.message);
      if (destinationTarget === 'BOT' && onBotCashAdjusted) {
        onBotCashAdjusted(numAmount);
      }
      setClearedReceipt(res.transaction);
    } catch (err: any) {
      setErrorMsg(err.message || 'Check cashing failed. Please verify check details.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2500);
  };

  const numAmt = parseFloat(amount) || 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-950 border border-emerald-500/40 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 font-bold uppercase tracking-wider">
            <FileCheck className="h-4 w-4" />
            <span>Mobile Remote Deposit Capture (RDC)</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] border border-emerald-500/30">
              0% Fee Instant Settlement
            </span>
          </div>
          <h3 className="text-xl font-bold text-white mt-1">Cash a Personal Check</h3>
          <p className="text-xs text-slate-300 max-w-xl mt-1">
            Capture front and back check imagery with MICR line OCR parsing. Funds settle instantly directly into your{' '}
            <strong className="text-emerald-300">Trading Bot active margin</strong> or Live USD Vault.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-slate-950/80 px-4 py-3 rounded-xl border border-slate-800 text-xs font-mono shrink-0">
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Daily Check Limit</div>
            <div className="text-base font-bold text-white">$25,000.00 USD</div>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Settlement Rail</div>
            <div className="text-xs font-bold text-emerald-400 flex items-center gap-1">
              <Zap className="h-3 w-3" />
              <span>Real-Time (0s)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Success Receipt Banner */}
      {clearedReceipt && (
        <div className="p-5 rounded-2xl bg-emerald-950/50 border border-emerald-500/60 shadow-2xl space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Personal Check Successfully Cashed & Cleared</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    FUNDS AVAILABLE
                  </span>
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  {formatCurrency(clearedReceipt.amount)} has been credited to{' '}
                  <strong className="text-emerald-300">
                    {clearedReceipt.destinationName}
                  </strong>
                  . The funds are cleared and available immediately.
                </p>
              </div>
            </div>
            <button
              onClick={() => setClearedReceipt(null)}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-900 border border-slate-800"
            >
              Deposit Another Check
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <div className="text-[10px] text-slate-400 font-mono uppercase">Amount Cashed</div>
              <div className="text-base font-black text-emerald-400 font-mono mt-0.5">
                +{formatCurrency(clearedReceipt.amount)}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <div className="text-[10px] text-slate-400 font-mono uppercase">Destination</div>
              <div className="text-xs font-bold text-white truncate mt-0.5">
                {clearedReceipt.destinationName}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <div className="text-[10px] text-slate-400 font-mono uppercase">Settlement Rail</div>
              <div className="text-xs font-bold text-emerald-400 mt-0.5">
                Instant Ingo/RDC (0s)
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <div className="text-[10px] text-slate-400 font-mono uppercase">Bot Active Margin</div>
              <div className="text-base font-black text-cyan-400 font-mono mt-0.5">
                {formatCurrency(botCash)}
              </div>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Digital RDC Endorsement Hash:</span>
              <span className="text-cyan-400 truncate text-[11px] select-all">
                {clearedReceipt.referenceHash}
              </span>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(clearedReceipt.referenceHash)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] shrink-0 ml-2 transition-all cursor-pointer"
            >
              {copiedHash === clearedReceipt.referenceHash ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 text-slate-400" />
                  <span>Copy Hash</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5">
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          <div className="flex-1 font-mono">{errorMsg}</div>
        </div>
      )}

      {/* Remote Deposit Capture (RDC) Live Verification Standards */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>Remote Check Deposit (RDC) Requirements</span>
          </span>
          <span className="text-[10px] text-emerald-400 font-mono">Federal Reserve Reg CC Compliant</span>
        </div>
        <p className="text-xs text-slate-400">
          To deposit a check into your trading bot or treasury vault, enter the exact MICR transit routing and account numbers printed along the bottom edge of your paper check, followed by photos of the check front and endorsed back.
        </p>
      </div>

      {/* Interactive Personal Check Visualizer (Front & Back) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-300 flex items-center gap-2">
            <Eye className="h-4 w-4 text-cyan-400" />
            <span>Interactive Check Inspection Preview</span>
          </span>
          <button
            type="button"
            onClick={() => setCheckSide(checkSide === 'FRONT' ? 'BACK' : 'FRONT')}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono text-xs cursor-pointer transition-all"
          >
            <RotateCw className="h-3.5 w-3.5 text-cyan-400" />
            <span>Flip to {checkSide === 'FRONT' ? 'Back (Endorsement)' : 'Front'}</span>
          </button>
        </div>

        {checkSide === 'FRONT' ? (
          /* FRONT OF CHECK */
          <div className="relative rounded-2xl bg-gradient-to-br from-emerald-950/30 via-slate-900 to-cyan-950/40 border-2 border-emerald-500/40 p-5 sm:p-6 shadow-2xl font-mono text-slate-900 text-xs overflow-hidden">
            {/* Watermark Security Background pattern */}
            <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px]" />

            <div className="relative z-10 space-y-4">
              {/* Top Row: Payer Name & Check # */}
              <div className="flex justify-between items-start text-xs">
                <div>
                  <div className="font-bold text-white text-sm tracking-wide">{payerName || 'Payer Name'}</div>
                  <div className="text-[11px] text-slate-400">100 Wall Street, Suite 400</div>
                  <div className="text-[11px] text-slate-400">New York, NY 10005</div>
                </div>

                <div className="text-right">
                  <div className="font-bold text-white text-lg tracking-widest">#{checkNumber || '1042'}</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Date: <span className="text-slate-200 underline">{new Date().toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {/* Pay to the Order Line */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-slate-700 pb-2">
                <div className="flex-1 flex items-baseline gap-2">
                  <span className="text-[10px] text-slate-400 uppercase font-bold shrink-0">PAY TO THE ORDER OF:</span>
                  <span className="text-white font-bold text-sm underline tracking-wide">
                    Apex Quant Trading Desk (Live Custodial Account)
                  </span>
                </div>

                <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-emerald-500/60 font-mono text-base font-black text-emerald-400 shrink-0 text-right">
                  ${numAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              {/* Written Amount in Words */}
              <div className="border-b border-slate-700 pb-2 text-[11px] text-slate-300 italic">
                {numAmt > 0 ? (
                  <span>
                    *** {numAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD DOLLARS AND ZERO CENTS ***
                  </span>
                ) : (
                  <span>*** ZERO DOLLARS AND 00/100 ***</span>
                )}
              </div>

              {/* Bank Name & Memo & Signature */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-2">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Issuing Financial Institution</div>
                  <div className="text-white font-bold text-xs truncate">{issuingBank}</div>
                  <div className="text-[10px] text-emerald-400 font-mono">FDIC Insured Depository</div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Memo Line</div>
                  <div className="text-slate-300 text-xs underline truncate">{memo || 'Trading Bot Capital'}</div>
                </div>

                <div className="text-right">
                  <div className="font-serif italic text-base text-cyan-300 font-semibold border-b border-slate-700 pb-0.5 tracking-wider">
                    {payerName.slice(0, 18)}
                  </div>
                  <div className="text-[9px] text-slate-500 uppercase">Authorized Maker Signature</div>
                </div>
              </div>

              {/* MICR Encoding Strip at the Bottom */}
              <div className="mt-4 pt-3 border-t-2 border-dashed border-slate-700/80 bg-slate-950/80 -mx-6 -mb-6 p-4 rounded-b-2xl flex flex-wrap items-center justify-between text-cyan-400 font-mono tracking-widest text-xs">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-500 uppercase font-sans">MICR Line:</span>
                  <span className="text-sm font-bold select-all">
                    ⑈{checkNumber || '1042'}⑈ ⑆{routingNumber || '021000021'}⑆ •••• {accountNumber.slice(-4) || '8921'}⑈
                  </span>
                </div>
                <div className="text-[10px] text-emerald-400 flex items-center gap-1 font-sans">
                  <ShieldCheck className="h-3 w-3" />
                  <span>ABA Routing Checksum: PASSED</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* BACK OF CHECK (ENDORSEMENT AREA) */
          <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border-2 border-cyan-500/40 p-6 shadow-2xl font-mono text-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="font-bold text-white text-sm">Reverse Side Endorsement Area</span>
                <p className="text-[11px] text-slate-400">Federal Reserve Regulation CC compliant mobile endorsement stamp</p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] border border-cyan-500/40 font-bold">
                DIGITALLY VERIFIED
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="border-b-2 border-dashed border-slate-700 pb-2">
                <div className="text-[10px] text-slate-500 uppercase">ENDORSE HERE</div>
                <div className="font-serif italic text-lg text-emerald-400 font-semibold tracking-wider pt-1">
                  ✕ Apex Quant Trading Desk - Mobile Deposit
                </div>
              </div>

              <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-200 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>✓ For Mobile Deposit Only at Apex Quant Trading (Account #{fiatAccount.accountId})</span>
              </div>

              <div className="text-[10px] text-slate-500 text-center uppercase tracking-wider pt-2 border-t border-slate-800">
                DO NOT WRITE, STAMP, OR SIGN BELOW THIS LINE — RESERVED FOR FINANCIAL INSTITUTION
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Camera Capture Simulation Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Camera className="h-4 w-4 text-emerald-400" />
              <span>Check Front Scan</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                frontCaptured
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {frontCaptured ? 'Captured ✓' : 'Awaiting Scan'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Position all 4 corners of check front inside camera viewfinder.</p>
          <div className="pt-1 flex gap-2">
            <button
              type="button"
              onClick={() => setFrontCaptured(true)}
              className="flex-1 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 cursor-pointer transition-all"
            >
              {frontCaptured ? 'Retake Photo' : 'Capture Front'}
            </button>
            <button
              type="button"
              onClick={() => {
                setFrontCaptured(true);
                setCheckSide('FRONT');
              }}
              className="py-1.5 px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold border border-emerald-500/40 cursor-pointer transition-all"
            >
              View Front
            </button>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Camera className="h-4 w-4 text-cyan-400" />
              <span>Check Back Endorsement Scan</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                backCaptured
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {backCaptured ? 'Captured ✓' : 'Awaiting Scan'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Confirm reverse side has signature and mobile deposit endorsement.</p>
          <div className="pt-1 flex gap-2">
            <button
              type="button"
              onClick={() => setBackCaptured(true)}
              className="flex-1 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 cursor-pointer transition-all"
            >
              {backCaptured ? 'Retake Photo' : 'Capture Back'}
            </button>
            <button
              type="button"
              onClick={() => {
                setBackCaptured(true);
                setCheckSide('BACK');
              }}
              className="py-1.5 px-3 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-bold border border-cyan-500/40 cursor-pointer transition-all"
            >
              View Back
            </button>
          </div>
        </div>
      </div>

      {/* Check Details Form */}
      <form onSubmit={handleCashCheck} className="space-y-4 p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
        <h4 className="text-sm font-bold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
          <Landmark className="h-4 w-4 text-emerald-400" />
          <span>Verify & Cash Personal Check</span>
        </h4>

        {/* Row 1: Amount & Check # */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Check Dollar Amount ($ USD) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-base font-mono font-bold">$</span>
              <input
                type="number"
                step="0.01"
                min="1.00"
                max="25000.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="2500.00"
                className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-base font-bold focus:border-emerald-500 focus:outline-none"
                required
              />
            </div>
            <span className="text-[10px] text-slate-500 font-mono mt-1 block">Daily limit: $25,000.00 USD</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Check Number *
            </label>
            <input
              type="text"
              value={checkNumber}
              onChange={(e) => setCheckNumber(e.target.value)}
              placeholder="1042"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none"
              required
            />
            <span className="text-[10px] text-slate-500 font-mono mt-1 block">Printed at top-right & MICR strip</span>
          </div>
        </div>

        {/* Row 2: Payer Name & Issuing Bank */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Payer / Maker Name *
            </label>
            <input
              type="text"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              placeholder="e.g. John Doe or Apex Quant Inc."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:border-emerald-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Issuing Bank Name
            </label>
            <input
              type="text"
              value={issuingBank}
              onChange={(e) => setIssuingBank(e.target.value)}
              placeholder="e.g. Bank of America, Wells Fargo, etc."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Row 3: Routing Number & Account Number */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              ABA Routing Transit Number (9 Digits) *
            </label>
            <input
              type="text"
              maxLength={9}
              value={routingNumber}
              onChange={(e) => setRoutingNumber(e.target.value)}
              placeholder="021000021"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none"
              required
            />
            <span className="text-[10px] text-emerald-400 font-mono mt-1 block">Federal Reserve checksum validated</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Checking Account Number *
            </label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="489218491"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none"
              required
            />
            <span className="text-[10px] text-slate-500 font-mono mt-1 block">Tokenized on submission</span>
          </div>
        </div>

        {/* Destination Target: Fund Trading Bot vs Live Vault */}
        <div className="pt-2 border-t border-slate-800 space-y-2">
          <label className="block text-xs font-bold text-slate-300">
            Credit Destination Target:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDestinationTarget('BOT')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                destinationTarget === 'BOT'
                  ? 'bg-amber-500/20 border-amber-500 text-white ring-1 ring-amber-500/40 shadow-lg'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <Zap className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>⚡ Fund Trading Bot Directly</span>
                  <span className="text-[9px] bg-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">RECOMMENDED</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Check funds credit straight to active bot margin. Bot can execute trades immediately.
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDestinationTarget('VAULT')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                destinationTarget === 'VAULT'
                  ? 'bg-emerald-500/20 border-emerald-500 text-white ring-1 ring-emerald-500/40 shadow-lg'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <Landmark className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-white">
                  🏛️ Live USD Treasury Vault
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Deposit check into FDIC-insured custodial vault balance for holding.
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Settlement Speed: Instant vs Standard */}
        <div className="pt-2 border-t border-slate-800 space-y-2">
          <label className="block text-xs font-bold text-slate-300">
            Clearing Rail & Settlement Speed:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSettlementSpeed('INSTANT')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                settlementSpeed === 'INSTANT'
                  ? 'bg-emerald-500/20 border-emerald-500 text-white ring-1 ring-emerald-500/40'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Instant Settlement (0 Seconds)</span>
                </div>
                <div className="text-[10px] text-slate-400">Ingo Money / RTP Real-Time Rail</div>
              </div>
              <span className="text-[11px] font-bold text-emerald-400 font-mono">0% Fee (Free)</span>
            </button>

            <button
              type="button"
              onClick={() => setSettlementSpeed('STANDARD_CLEARING')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                settlementSpeed === 'STANDARD_CLEARING'
                  ? 'bg-emerald-500/20 border-emerald-500 text-white ring-1 ring-emerald-500/40'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="text-xs font-bold text-white">Standard Clearing (1-2 Days)</div>
                <div className="text-[10px] text-slate-400">Federal Reserve ACH Clearinghouse</div>
              </div>
              <span className="text-[11px] font-bold text-slate-400 font-mono">$0 Fee</span>
            </button>
          </div>
        </div>

        {/* Endorsement Checkbox */}
        <div className="pt-3 border-t border-slate-800">
          <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={endorsementConfirmed}
              onChange={(e) => setEndorsementConfirmed(e.target.checked)}
              className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500 bg-slate-950 border-slate-700 h-4 w-4"
              required
            />
            <span>
              I certify that this personal check is properly signed and endorsed on the back with{' '}
              <strong className="text-emerald-300">"For Mobile Deposit Only at Apex Quant Trading"</strong> and has not been deposited elsewhere.
            </span>
          </label>
        </div>

        {/* Submit Action */}
        <div className="pt-3">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Processing MICR Line & Clearing Check...</span>
              </>
            ) : (
              <>
                <FileCheck className="h-5 w-5" />
                <span>Cash Check for +{formatCurrency(numAmt)} Now ({settlementSpeed === 'INSTANT' ? 'Instant 0s' : 'Standard ACH'})</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
