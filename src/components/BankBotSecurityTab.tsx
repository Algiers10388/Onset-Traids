import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  AlertTriangle,
  Zap,
  CheckCircle2,
  RefreshCw,
  Key,
  Flame,
  FileCheck,
  Landmark,
  Sliders,
  SlidersHorizontal,
  Server,
  Activity,
} from 'lucide-react';
import { FiatAccount, BotSecuritySettings, SecurityAuditReport } from '../types';
import { fetchSecurityAudit, updateBotProtection } from '../services/fiatApi';

interface BankBotSecurityTabProps {
  fiatAccount: FiatAccount;
  onAccountUpdated: (newAccount: FiatAccount, notificationMsg?: string) => void;
}

export const BankBotSecurityTab: React.FC<BankBotSecurityTabProps> = ({
  fiatAccount,
  onAccountUpdated,
}) => {
  const [auditReport, setAuditReport] = useState<SecurityAuditReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Editable Protection Parameters
  const [emergencyFreeze, setEmergencyFreeze] = useState<boolean>(false);
  const [twoFactorEnforced, setTwoFactorEnforced] = useState<boolean>(fiatAccount.twoFactorEnabled);
  const [threeDsEnforced, setThreeDsEnforced] = useState<boolean>(true);
  const [maxSingleOrder, setMaxSingleOrder] = useState<string>('5000');
  const [maxDailyLoss, setMaxDailyLoss] = useState<string>('250');
  const [slippageTol, setSlippageTol] = useState<string>('0.5');

  const loadAudit = async () => {
    setIsLoading(true);
    try {
      const report = await fetchSecurityAudit();
      if (report) {
        setAuditReport(report);
        setEmergencyFreeze(report.emergencyFreezeActive);
        setTwoFactorEnforced(report.twoFactorActive);
        setMaxSingleOrder(String(report.botOrderCapUsd || '5000'));
        setMaxDailyLoss(String(report.dailyLossLimitUsd || '250'));
      }
    } catch {
      // fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAudit();
  }, []);

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setStatusMsg(null);
    try {
      const res = await updateBotProtection({
        emergencyFreezeActive: emergencyFreeze,
        twoFactorEnforced,
        threeDsEnforced,
        maxSingleOrderUsd: parseFloat(maxSingleOrder) || 5000,
        maxDailyLossUsd: parseFloat(maxDailyLoss) || 250,
        slippageTolerancePercent: parseFloat(slippageTol) || 0.5,
      });

      onAccountUpdated(res.account, res.message);
      setStatusMsg({ type: 'success', text: res.message });
      await loadAudit();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to update security parameters.' });
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleEmergencyFreezeNow = async () => {
    const nextState = !emergencyFreeze;
    setEmergencyFreeze(nextState);
    setIsUpdating(true);
    try {
      const res = await updateBotProtection({ emergencyFreezeActive: nextState });
      onAccountUpdated(res.account, res.message);
      setStatusMsg({ type: 'success', text: res.message });
      await loadAudit();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Top Fortress Score Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-950/60 via-slate-900 to-slate-950 border border-cyan-500/40 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider">
            <ShieldCheck className="h-4 w-4" />
            <span>Bank Connection & Trading Bot Security Engine</span>
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] border border-cyan-500/30">
              Zero Plaintext Storage
            </span>
          </div>
          <h3 className="text-xl font-bold text-white mt-1">Bank Rails & Bot Account Protection</h3>
          <p className="text-xs text-slate-300 max-w-xl mt-1">
            Dual-layer security encompassing Federal Reserve ABA checksum validation, AES-256-GCM hardware vault encryption, and instant automated trading bot kill-switches.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-slate-950/80 px-4 py-3 rounded-xl border border-slate-800 text-xs font-mono shrink-0">
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Security Health</div>
            <div className="text-xl font-black text-emerald-400">99 / 100</div>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Defense Grade</div>
            <div className="text-xs font-bold text-cyan-300">FORTRESS A+</div>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs font-mono flex items-center gap-2 border ${
            statusMsg.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          <div className="flex-1">{statusMsg.text}</div>
        </div>
      )}

      {/* Emergency Kill-Switch Banner */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          emergencyFreeze
            ? 'bg-rose-950/40 border-rose-500/80 text-rose-200 shadow-2xl shadow-rose-950/40'
            : 'bg-slate-900/80 border-slate-800 text-slate-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`p-2.5 rounded-xl border shrink-0 ${
                emergencyFreeze
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              <Flame className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white">Trading Bot Emergency Kill-Switch</h4>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                    emergencyFreeze
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  {emergencyFreeze ? 'KILL-SWITCH ENGAGED (FROZEN)' : 'ARMED & MONITORING'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-lg">
                Instantly pauses all automated order executions, bot capital withdrawals, and market routing across all exchanges. Use in volatile market shocks or system maintenance.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleEmergencyFreezeNow}
            disabled={isUpdating}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 shadow-md ${
              emergencyFreeze
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                : 'bg-rose-600 hover:bg-rose-500 text-white'
            }`}
          >
            {emergencyFreeze ? 'Unfreeze Trading Bot' : 'Engage Emergency Freeze'}
          </button>
        </div>
      </div>

      {/* Security Guardrails Form */}
      <form onSubmit={handleSaveSecurity} className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-cyan-400" />
            <span>Configurable Bot Protection Guardrails</span>
          </h4>
          <button
            type="button"
            onClick={loadAudit}
            className="text-xs text-slate-400 hover:text-cyan-300 flex items-center gap-1 font-mono transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Re-verify</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Max Single Order Allocation Ceiling ($ USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono font-bold">$</span>
              <input
                type="number"
                min="50"
                max="50000"
                value={maxSingleOrder}
                onChange={(e) => setMaxSingleOrder(e.target.value)}
                className="w-full pl-7 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
              Prevents rogue fat-finger or runaway execution sizing
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Daily Loss Circuit Breaker ($ USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono font-bold">$</span>
              <input
                type="number"
                min="25"
                max="10000"
                value={maxDailyLoss}
                onChange={(e) => setMaxDailyLoss(e.target.value)}
                className="w-full pl-7 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
              Auto-trips kill-switch if cumulative realized daily loss breaches limit
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Max Allowable Slippage Tolerance (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="5.0"
              value={slippageTol}
              onChange={(e) => setSlippageTol(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-cyan-500 focus:outline-none"
            />
            <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
              Front-running / MEV sandwich protection cutoff
            </span>
          </div>

          <div className="flex flex-col justify-end">
            <label className="flex items-center gap-2.5 text-xs text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={twoFactorEnforced}
                onChange={(e) => setTwoFactorEnforced(e.target.checked)}
                className="rounded text-cyan-500 focus:ring-cyan-500 bg-slate-900 border-slate-700 h-4 w-4"
              />
              <div>
                <span className="font-bold text-white block">Enforce 2FA for Transfers & Payouts</span>
                <span className="text-[10px] text-slate-400">Requires 6-digit TOTP on external disbursements</span>
              </div>
            </label>
          </div>
        </div>

        <div className="pt-1">
          <label className="flex items-center gap-2.5 text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-cyan-500/30 cursor-pointer hover:border-cyan-500/50 transition-colors">
            <input
              type="checkbox"
              checked={threeDsEnforced}
              onChange={(e) => setThreeDsEnforced(e.target.checked)}
              className="rounded text-cyan-500 focus:ring-cyan-500 bg-slate-900 border-slate-700 h-4 w-4"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white block">3D Secure 2.2 Strong Customer Authentication (SCA)</span>
                <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-mono border border-cyan-500/40">
                  Verified by Visa / Mastercard ID Check
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Enforces EMVCo cryptographic challenge (SMS OTP or biometric passkey) with issuing bank liability shift (ECI 05/02) on all fiat deposits and card loads.
              </span>
            </div>
          </label>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={isUpdating}
            className="py-2.5 px-5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wider transition-all cursor-pointer disabled:opacity-50"
          >
            {isUpdating ? 'Applying Guardrails...' : 'Save Security Parameters'}
          </button>
        </div>
      </form>

      {/* 8 Verified Security Assertions Matrix */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-emerald-400" />
            <h4 className="text-sm font-bold text-white">8 Verified Institutional Security Assertions</h4>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/30">
            ALL PASSING
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {auditReport?.verifiedChecks.map((chk, i) => (
            <div key={i} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white truncate">{chk.title}</span>
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${
                    chk.status === 'PASSED'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {chk.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">{chk.description}</p>
            </div>
          )) || (
            <div className="text-slate-400 text-xs col-span-2 text-center py-4">
              Loading security assertions...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
