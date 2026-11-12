import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, ShieldCheck, X, Zap } from 'lucide-react';

export const RiskDisclosureBanner: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="border-b border-amber-500/15 bg-amber-950/20 px-3 sm:px-4 py-1.5 text-xs text-amber-200/90 font-mono transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 truncate">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="font-semibold text-amber-300 shrink-0 text-[11px]">Execution Notice:</span>
          <span className="text-slate-400 text-[11px] truncate">
            100% live multi-exchange market feeds with direct Smart Order Routing.
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-amber-400/90 hover:text-amber-300 transition-colors cursor-pointer text-[11px]"
          >
            <span>{expanded ? 'Hide Guide' : 'Safety Guide'}</span>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          <button
            onClick={() => setDismissed(true)}
            className="text-slate-500 hover:text-slate-300 transition-colors p-0.5 rounded cursor-pointer"
            title="Dismiss notice"
            aria-label="Dismiss notice"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="max-w-7xl mx-auto mt-2 pt-2 border-t border-amber-500/15 grid grid-cols-1 md:grid-cols-3 gap-2.5 text-slate-300 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
            <div className="flex items-center gap-1.5 font-semibold text-amber-300 mb-1 text-[11px]">
              <Zap className="h-3 w-3 text-amber-400" />
              <span>Capital Preservation</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Targeting high returns mathematically requires higher leverage or larger order sizing. Use strict stop-losses to protect capital.
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
            <div className="flex items-center gap-1.5 font-semibold text-cyan-300 mb-1 text-[11px]">
              <ShieldCheck className="h-3 w-3 text-cyan-400" />
              <span>Slippage & Routing</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              The Smart Order Router (SOR) compares bid/ask depth across Kraken, Binance, and Coinbase to achieve lowest net effective fill cost.
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-300 mb-1 text-[11px]">
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              <span>Risk Management</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Maintain conservative sizing (10–20% per trade) with automated take-profits, trailing stops, and confluence exit triggers.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
