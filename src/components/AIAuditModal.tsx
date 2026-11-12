import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Flame,
  Shield,
  ShieldAlert,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { AIAnalysisResult, StrategyParameters } from '../types';

interface AIAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: AIAnalysisResult | null;
  loading: boolean;
  onApplyRecommended: () => void;
  currentStrategy: StrategyParameters;
}

export const AIAuditModal: React.FC<AIAuditModalProps> = ({
  isOpen,
  onClose,
  analysis,
  loading,
  onApplyRecommended,
  currentStrategy,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl rounded-2xl bg-[#0F1422] border border-purple-500/30 shadow-2xl shadow-purple-500/10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                Gemini AI Strategy & Risk Audit
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-950/60 text-purple-300 border border-purple-500/30 font-mono">
                  QUANT AUDITOR
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Mathematical evaluation of algorithmic parameters & drawdown risk
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              <p className="font-mono text-slate-400 animate-pulse">
                Auditing volatility regime, liquidity, and leverage parameters with Gemini...
              </p>
            </div>
          ) : analysis ? (
            <>
              {/* Risk Gauge Header */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                    Risk Score
                  </div>
                  <div className="text-2xl font-bold font-mono text-white mt-0.5 flex items-baseline gap-1">
                    {analysis.riskScore}
                    <span className="text-xs font-normal text-slate-500">/ 100</span>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                    Risk Classification
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        analysis.riskLevel === 'Extreme'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : analysis.riskLevel === 'High'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {analysis.riskLevel} Risk
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                    Current Leverage
                  </div>
                  <div className="text-base font-bold font-mono text-slate-200 mt-1 flex items-center gap-1">
                    {currentStrategy.leverage}x
                    {currentStrategy.leverage > 2 && (
                      <span className="text-[10px] text-rose-400 font-sans font-normal">
                        (Liquidation Hazard)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Market Trend Assessment */}
              <div className="space-y-1.5">
                <div className="font-bold text-white flex items-center gap-1.5 text-xs">
                  <Shield className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Market Trend & Momentum Assessment</span>
                </div>
                <p className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/80 leading-relaxed text-slate-300">
                  {analysis.marketTrendSummary}
                </p>
              </div>

              {/* Strategy Parameters Critique */}
              <div className="space-y-1.5">
                <div className="font-bold text-white flex items-center gap-1.5 text-xs">
                  <AlertCircle className="h-3.5 w-3.5 text-purple-400" />
                  <span>Quantitative Strategy Analysis</span>
                </div>
                <p className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/80 leading-relaxed text-slate-300">
                  {analysis.strategyCritique}
                </p>
              </div>

              {/* Reality Check on Short-Term High Profit */}
              <div className="space-y-1.5">
                <div className="font-bold text-amber-300 flex items-center gap-1.5 text-xs">
                  <Flame className="h-3.5 w-3.5 text-amber-400" />
                  <span>Quantitative Reality Check: Short-Term High Profit Expectations</span>
                </div>
                <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 leading-relaxed text-amber-200/90 text-xs">
                  {analysis.shortTermProfitOutlook}
                </div>
              </div>

              {/* Actionable Recommendations */}
              <div className="space-y-2">
                <div className="font-bold text-emerald-300 flex items-center gap-1.5 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Institutional Risk Recommendations</span>
                </div>
                <div className="space-y-1.5">
                  {analysis.recommendedAdjustments.map((rec, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 flex items-start gap-2"
                    >
                      <span className="text-cyan-400 font-mono font-bold">•</span>
                      <span className="text-slate-300 leading-relaxed">{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-slate-400">
              No analysis data available. Please try again.
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-900/60">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer text-xs font-semibold"
          >
            Dismiss
          </button>

          <button
            onClick={() => {
              onApplyRecommended();
              onClose();
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-purple-500/20 cursor-pointer transition-all"
          >
            <Wand2 className="h-3.5 w-3.5" />
            <span>Apply Calibrated Safe Parameters</span>
          </button>
        </div>
      </div>
    </div>
  );
};
