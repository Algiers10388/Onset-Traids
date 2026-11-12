import React from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Compass,
  CreditCard,
  Download,
  Flame,
  Gauge,
  Play,
  Pause,
  Percent,
  Radio,
  RefreshCw,
  Scale,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Info,
  CheckCircle,
} from 'lucide-react';
import { StrategyParameters, TechnicalIndicators, TriggerType, CryptoAsset } from '../types';
import { STRATEGY_PRESETS } from '../data/marketData';
import { formatPercent, formatCurrency, calculateDynamicPositionSize } from '../utils/cryptoMath';

interface StrategyBotControllerProps {
  strategy: StrategyParameters;
  onUpdateStrategy: (params: StrategyParameters) => void;
  indicators: TechnicalIndicators;
  botRunning: boolean;
  onToggleBot: () => void;
  onManualOrder: (side: 'BUY' | 'SELL') => void;
  isBuyConditionMet: boolean;
  buyConditionReason: string;
  isSellConditionMet?: boolean;
  sellConditionReason?: string;
  botCash?: number;
  onOpenDepositToBot?: (method?: 'BANK' | 'CARD') => void;
  availableAssets?: CryptoAsset[];
  onSelectAsset?: (symbol: string) => void;
  currentDailyLossUsd?: number;
  onResetCircuitBreaker?: () => void;
  activePositionsCount?: number;
  onQuickFundMargin?: () => void;
}

export const StrategyBotController: React.FC<StrategyBotControllerProps> = ({
  strategy,
  onUpdateStrategy,
  indicators,
  botRunning,
  onToggleBot,
  onManualOrder,
  isBuyConditionMet,
  buyConditionReason,
  isSellConditionMet = false,
  sellConditionReason = '',
  botCash,
  onOpenDepositToBot,
  availableAssets,
  onSelectAsset,
  currentDailyLossUsd = 0,
  onResetCircuitBreaker,
  activePositionsCount = 0,
  onQuickFundMargin,
}) => {
  const [showSellDiagnostics, setShowSellDiagnostics] = React.useState(true);
  const [showIndicatorSettings, setShowIndicatorSettings] = React.useState(false);

  const handlePresetSelect = (presetId: string) => {
    const found = STRATEGY_PRESETS.find((p) => p.id === presetId);
    if (found) {
      onUpdateStrategy({ ...found, symbol: strategy.symbol });
    }
  };

  // Liquidation distance estimate: ~100% / leverage
  const estLiquidationDrop = (100 / strategy.leverage).toFixed(1);

  // Active asset price & ATR metrics
  const currentAsset = availableAssets?.find((a) => a.symbol === strategy.symbol);
  const currentPrice = currentAsset ? currentAsset.price : 68500;
  const currentAtr = indicators.atr || (currentPrice * 0.018);
  const currentAtrPct = indicators.atrPercent || ((currentAtr / currentPrice) * 100);

  // Dynamic Volatility Position Sizing Calculation
  const dynamicSizing = calculateDynamicPositionSize({
    portfolioCash: botCash && botCash > 0 ? botCash : 10000,
    currentPrice,
    atr: currentAtr,
    atrMultiplier: strategy.atrMultiplier ?? 2.0,
    riskPerTradePercent: strategy.riskPerTradePercent ?? 2.0,
    leverage: strategy.leverage,
    maxCapPercent: 35.0,
    minOrderUsd: 25.0,
  });

  // Effective Stop-Loss and Take-Profit calculations
  const effectiveStopLossPct = strategy.dynamicPositionSizing
    ? dynamicSizing.stopDistancePercent
    : strategy.stopLossPercent;

  const effectiveTakeProfitPct = strategy.takeProfitType === 'RISK_REWARD_RATIO'
    ? effectiveStopLossPct * (strategy.riskRewardRatio ?? 2.5)
    : strategy.takeProfitPercent;

  const projectedStopLossPrice = currentPrice * (1 - (effectiveStopLossPct / 100) / strategy.leverage);
  const projectedTakeProfitPrice = currentPrice * (1 + (effectiveTakeProfitPct / 100) / strategy.leverage);
  const projectedRiskUsd = dynamicSizing.riskAmountUsd;
  const projectedRewardUsd = projectedRiskUsd * (strategy.riskRewardRatio ?? 2.5);

  return (
    <div className="rounded-2xl bg-slate-900/70 border border-slate-800/80 p-4 shadow-xl backdrop-blur-sm flex flex-col gap-4">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-bold text-white tracking-wide">
            Automated Strategy Parameters
          </h2>
        </div>

        {/* Master Active / Pause Toggle */}
        <button
          onClick={onToggleBot}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm ${
            botRunning
              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 ring-2 ring-emerald-500/20'
              : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30'
          }`}
        >
          {botRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {botRunning ? 'BOT MONITORING & EXECUTING' : 'BOT PAUSED (STANDBY)'}
        </button>
      </div>

      {/* Low Margin Advisory Banner */}
      {typeof botCash === 'number' && botCash < 30 && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="text-xs text-amber-200">
              Bot trading margin is low (<strong>${botCash.toFixed(2)} USD</strong>). Fund the bot from your bank or check card to execute trades.
            </span>
          </div>
          {onOpenDepositToBot && (
            <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => onOpenDepositToBot('BANK')}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1"
              >
                <Building2 className="h-3 w-3" />
                <span>+ Bank</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenDepositToBot('CARD')}
                className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1"
              >
                <CreditCard className="h-3 w-3" />
                <span>+ Check Card</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bot Capital & Instant Bank / Check Card Quick Bar */}
      {typeof botCash === 'number' && (
        <div className="p-3 bg-slate-950/60 border border-slate-800/90 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase font-mono text-slate-400 flex items-center gap-1.5">
              <Wallet className="h-3 w-3 text-cyan-400" />
              <span>Available Bot Margin</span>
              <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-bold font-mono">
                Active Margin
              </span>
            </div>
            <div className="text-base font-mono font-black text-emerald-400 mt-0.5">
              ${botCash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {botCash < 30 && onQuickFundMargin && (
              <button
                type="button"
                onClick={onQuickFundMargin}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs cursor-pointer shadow-md transition-all shrink-0 animate-pulse"
                title="1-Click fund $1,000 trading margin to enable automated algorithmic orders"
              >
                <Zap className="h-3.5 w-3.5 fill-current" />
                <span>+ Load $1,000 Margin</span>
              </button>
            )}

            {onOpenDepositToBot && (
              <>
                <button
                  type="button"
                  onClick={() => onOpenDepositToBot('BANK')}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold cursor-pointer transition-all hover:scale-[1.02] shadow-sm"
                  title="Deposit directly from connected bank into Bot Trading Cash"
                >
                  <Building2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Fund via Bank</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenDepositToBot('CARD')}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold cursor-pointer transition-all hover:scale-[1.02] shadow-sm"
                  title="Deposit directly from check or debit card into Bot Trading Cash"
                >
                  <CreditCard className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Fund via Check Card</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Preset Selector Chips */}
      <div>
        <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2">
          Strategy Archetypes (Quick Select)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STRATEGY_PRESETS.map((preset) => {
            const isActive = strategy.name === preset.name || strategy.id === preset.id;
            const isDefault = preset.id === 'best-market-spread-arbitrage';
            return (
              <button
                key={preset.id}
                onClick={() => handlePresetSelect(preset.id)}
                className={`px-2.5 py-2 rounded-xl text-left border transition-all cursor-pointer text-xs relative ${
                  isActive
                    ? 'bg-cyan-500/15 border-cyan-500/60 text-cyan-200 font-semibold shadow-md ring-1 ring-cyan-500/30'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <div className="font-medium truncate">{preset.name}</div>
                  {isDefault && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40 uppercase tracking-tighter shrink-0 font-mono font-bold">
                      DEFAULT
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {isDefault
                    ? `Lowest Cost ➜ Greatest Spread · ${preset.cooldownSeconds}s loop`
                    : `TP ${preset.takeProfitPercent}% · SL ${preset.stopLossPercent}% · ${preset.leverage}x`}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Crypto Trading Agent Trend Analysis & Precision Confluence Engine */}
      {indicators.trendAnalysis && (
        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 flex flex-col gap-3 font-mono">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-cyan-400 animate-spin" style={{ animationDuration: '10s' }} />
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                Agent Trend Analysis Engine (MACD · RSI · Bollinger)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <a
                href="/api/download/flash-arb-zip"
                download="crypto-trade-agent-suite.zip"
                className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 text-[10px] font-bold flex items-center gap-1.5 transition-all shadow-sm"
                title="Download full standalone Autonomous Crypto Trading Agent & FlashArb ZIP"
              >
                <Download className="h-3 w-3 text-cyan-400" />
                <span>Download Agent (ZIP)</span>
              </a>

              <span className="text-[10px] text-slate-400">Action:</span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  indicators.trendAnalysis.signals.recommendedAction === 'STRONG_BUY'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : indicators.trendAnalysis.signals.recommendedAction === 'BUY'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : indicators.trendAnalysis.signals.recommendedAction === 'STRONG_SELL'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : indicators.trendAnalysis.signals.recommendedAction === 'SELL'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {indicators.trendAnalysis.signals.recommendedAction || 'HOLD / MONITOR'}
              </span>
            </div>
          </div>

          {/* Confluence Score & Confidence Meters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
            {/* Net Confluence Bias */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
              <div className="flex justify-between items-center text-[11px] text-slate-400 mb-1">
                <span className="flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5 text-purple-400" />
                  Confluence Score
                </span>
                <span
                  className={`font-bold ${
                    indicators.trendAnalysis.confluenceScore > 0
                      ? 'text-emerald-400'
                      : indicators.trendAnalysis.confluenceScore < 0
                      ? 'text-rose-400'
                      : 'text-slate-300'
                  }`}
                >
                  {indicators.trendAnalysis.confluenceScore > 0 ? '+' : ''}
                  {indicators.trendAnalysis.confluenceScore}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                <div
                  className="bg-rose-500 h-full transition-all duration-300"
                  style={{
                    width: `${Math.max(0, -indicators.trendAnalysis.confluenceScore) / 2}%`,
                  }}
                />
                <div
                  className="bg-emerald-500 h-full transition-all duration-300 ml-auto"
                  style={{
                    width: `${Math.max(0, indicators.trendAnalysis.confluenceScore) / 2}%`,
                  }}
                />
              </div>
              <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                <span>Bearish (-100%)</span>
                <span>Bullish (+100%)</span>
              </div>
            </div>

            {/* Buy Confidence */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
              <div className="flex justify-between items-center text-[11px] text-slate-400 mb-1">
                <span className="flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-emerald-400" />
                  Precision Buy Signal
                </span>
                <span className="font-bold text-emerald-400">
                  {indicators.trendAnalysis.buyConfidence}% Conf
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-400 h-full transition-all duration-300"
                  style={{ width: `${indicators.trendAnalysis.buyConfidence}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 mt-1 truncate">
                {indicators.trendAnalysis.signals.isPrecisionBuy
                  ? '🟢 Precision Buy Condition Aligned'
                  : 'Accumulating Confluence'}
              </div>
            </div>

            {/* Sell Confidence */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
              <div className="flex justify-between items-center text-[11px] text-slate-400 mb-1">
                <span className="flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-rose-400" />
                  Precision Sell / Exit
                </span>
                <span className="font-bold text-rose-400">
                  {indicators.trendAnalysis.sellConfidence}% Conf
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="bg-rose-400 h-full transition-all duration-300"
                  style={{ width: `${indicators.trendAnalysis.sellConfidence}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 mt-1 truncate">
                {indicators.trendAnalysis.signals.isPrecisionSell
                  ? '🔴 Precision Sell / Exit Aligned'
                  : 'No Sell Pressure'}
              </div>
            </div>
          </div>

          {/* Indicator Trio Live Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
            <div className="p-2 rounded bg-slate-900/60 border border-slate-800 flex flex-col gap-0.5">
              <span className="text-slate-400 font-bold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> MACD (12,26,9):
              </span>
              <span className={indicators.macd.histogram >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                {indicators.trendAnalysis.signals.macdStatus}
              </span>
              <span className="text-[10px] text-slate-400">
                Line: {indicators.macd.macd.toFixed(2)} | Sig: {indicators.macd.signal.toFixed(2)} | Hist: {indicators.macd.histogram.toFixed(2)}
              </span>
            </div>

            <div className="p-2 rounded bg-slate-900/60 border border-slate-800 flex flex-col gap-0.5">
              <span className="text-slate-400 font-bold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> RSI (14): {indicators.rsi.toFixed(1)}
              </span>
              <span className={indicators.rsi <= 35 ? 'text-emerald-300' : indicators.rsi >= 68 ? 'text-rose-300' : 'text-cyan-300'}>
                {indicators.trendAnalysis.signals.rsiStatus}
              </span>
              <span className="text-[10px] text-slate-400">
                Divergence: {indicators.trendAnalysis.signals.divergenceStatus || 'None'}
              </span>
            </div>

            <div className="p-2 rounded bg-slate-900/60 border border-slate-800 flex flex-col gap-0.5">
              <span className="text-slate-400 font-bold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400" /> Bollinger Bands (20,2):
              </span>
              <span className="text-purple-300">
                {indicators.trendAnalysis.signals.bollingerStatus}
              </span>
              <span className="text-[10px] text-slate-400">
                %B: {(indicators.bollinger.percentB ?? 0.5).toFixed(2)} | Squeeze: {indicators.bollinger.isSqueeze ? '⚡ YES' : 'No'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Live Signal Readiness Banners (Buy + Sell) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
        {/* Buy Trigger Monitor */}
        <div
          className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 ${
            isBuyConditionMet
              ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300 animate-pulse'
              : 'bg-slate-950/60 border-slate-800 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <span
              className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                isBuyConditionMet ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'
              }`}
            />
            <div className="truncate">
              <span className="font-semibold text-slate-200">Buy Entry: </span>
              <span className="text-slate-300 truncate">{buyConditionReason}</span>
            </div>
          </div>

          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
              isBuyConditionMet
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {isBuyConditionMet ? 'BUY TRIGGERED' : 'SCANNING'}
          </span>
        </div>

        {/* Sell / Exit Trigger Monitor */}
        <div
          className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 ${
            isSellConditionMet
              ? 'bg-rose-950/40 border-rose-500/50 text-rose-300 animate-pulse'
              : 'bg-slate-950/60 border-slate-800 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <span
              className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                isSellConditionMet ? 'bg-rose-400 animate-ping' : 'bg-slate-600'
              }`}
            />
            <div className="truncate">
              <span className="font-semibold text-slate-200">Sell / Exit: </span>
              <span className="text-slate-300 truncate">{sellConditionReason || 'Guarding positions'}</span>
            </div>
          </div>

          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
              isSellConditionMet
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {isSellConditionMet ? 'SELL ACTIVE' : 'NO SELL'}
          </span>
        </div>
      </div>

      {/* Parameter Sliders & Config Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 text-xs">
        {/* Target Market Coin Selector */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between">
          <label className="text-slate-400 font-mono text-[11px] block mb-1">
            Trading Market Coin
          </label>
          <select
            value={strategy.symbol}
            onChange={(e) => {
              const newSym = e.target.value;
              onUpdateStrategy({ ...strategy, symbol: newSym });
              if (onSelectAsset) onSelectAsset(newSym);
            }}
            className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            {availableAssets && availableAssets.length > 0 ? (
              availableAssets.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.symbol} ({a.name})
                </option>
              ))
            ) : (
              <option value={strategy.symbol}>{strategy.symbol}</option>
            )}
          </select>
          <span className="text-[10px] text-slate-400 mt-1.5 block">
            Automates across all connected exchange books
          </span>
        </div>

        {/* Trigger Rule */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between">
          <label className="text-slate-400 font-mono text-[11px] block mb-1">
            Algorithm Logic
          </label>
          <select
            value={strategy.triggerType}
            onChange={(e) =>
              onUpdateStrategy({ ...strategy, triggerType: e.target.value as TriggerType })
            }
            className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="CROSS_EXCHANGE_ARBITRAGE">★ Best-Market Spread Arbitrage (Buy Lowest Cost ➜ Sell Greatest Spread)</option>
            <option value="TRIPLE_CONFLUENCE_PRO">Triple Confluence Pro (MACD+RSI+BB)</option>
            <option value="BOLLINGER_MACD_SQUEEZE">Bollinger Squeeze + MACD Surge</option>
            <option value="MACD_CROSSOVER">MACD Golden Cross Trend Follower</option>
            <option value="RSI_DIVERGENCE_REVERSAL">RSI Divergence Reversal Engine</option>
            <option value="MOMENTUM_COMBO">Momentum Combo (RSI + MACD)</option>
            <option value="RSI_OVERSOLD">RSI Oversold Dip Buyer</option>
            <option value="EMA_BREAKOUT">EMA 9/21 Trend Crossover</option>
            <option value="BOLLINGER_BOUNCE">Bollinger Lower Band Bounce</option>
          </select>
          <span className="text-[10px] text-slate-400 mt-1.5 block">
            {strategy.triggerType === 'CROSS_EXCHANGE_ARBITRAGE'
              ? '⚡ Default Bot Function: Pairs lowest-cost buy market against highest-spread sell market for net profit'
              : 'Evaluates indicators on tick update'}
          </span>
        </div>

        {/* RSI Buy Threshold */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <div className="flex justify-between items-center text-slate-400 font-mono text-[11px] mb-1">
            <span>RSI Buy Trigger</span>
            <span className="font-bold text-cyan-400">{Number.isFinite(strategy.rsiBuyThreshold) ? strategy.rsiBuyThreshold : 30}</span>
          </div>
          <input
            type="range"
            min="15"
            max="50"
            step="1"
            value={Number.isFinite(strategy.rsiBuyThreshold) ? strategy.rsiBuyThreshold : 30}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (Number.isFinite(val)) onUpdateStrategy({ ...strategy, rsiBuyThreshold: val });
            }}
            className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
            <span>Aggressive (45)</span>
            <span>Conservative (25)</span>
          </div>
        </div>

        {/* RSI Sell Trigger (Take Profit Reversal Threshold) */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <div className="flex justify-between items-center text-slate-400 font-mono text-[11px] mb-1">
            <span>RSI Sell Trigger</span>
            <span className="font-bold text-rose-400">{Number.isFinite(strategy.rsiSellThreshold) ? strategy.rsiSellThreshold : 70}</span>
          </div>
          <input
            type="range"
            min="55"
            max="85"
            step="1"
            value={Number.isFinite(strategy.rsiSellThreshold) ? strategy.rsiSellThreshold : 70}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (Number.isFinite(val)) onUpdateStrategy({ ...strategy, rsiSellThreshold: val });
            }}
            className="w-full accent-rose-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
            <span>Conservative (65)</span>
            <span>Exhaustion (80)</span>
          </div>
        </div>

        {/* Take Profit % */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <div className="flex justify-between items-center text-slate-400 font-mono text-[11px] mb-1">
            <span>Take Profit (TP)</span>
            <span className="font-bold text-emerald-400">+{Number.isFinite(strategy.takeProfitPercent) ? strategy.takeProfitPercent : 4.0}%</span>
          </div>
          <input
            type="range"
            min="1"
            max="20"
            step="0.5"
            value={Number.isFinite(strategy.takeProfitPercent) ? strategy.takeProfitPercent : 4.0}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (Number.isFinite(val)) onUpdateStrategy({ ...strategy, takeProfitPercent: val });
            }}
            className="w-full accent-emerald-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
            <span>Scalp (2%)</span>
            <span>Swing (15%)</span>
          </div>
        </div>

        {/* Stop Loss % */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <div className="flex justify-between items-center text-slate-400 font-mono text-[11px] mb-1">
            <span>Stop Loss (SL)</span>
            <span className="font-bold text-rose-400">-{Number.isFinite(strategy.stopLossPercent) ? strategy.stopLossPercent : 2.0}%</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="10"
            step="0.1"
            value={Number.isFinite(strategy.stopLossPercent) ? strategy.stopLossPercent : 2.0}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (Number.isFinite(val)) onUpdateStrategy({ ...strategy, stopLossPercent: val });
            }}
            className="w-full accent-rose-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
            <span>Tight (1.0%)</span>
            <span>Wide (5.0%)</span>
          </div>
        </div>
      </div>

      {/* ADVANCED RISK MANAGEMENT & DYNAMIC VOLATILITY SIZING CONSOLE */}
      <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col gap-3 font-mono">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Advanced Risk Engine & Volatility Sizing
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400">ATR Volatility Regime:</span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                dynamicSizing.volatilityRegime === 'EXTREME'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : dynamicSizing.volatilityRegime === 'ELEVATED'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : dynamicSizing.volatilityRegime === 'LOW'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              }`}
            >
              {dynamicSizing.volatilityRegime} VOL ({currentAtrPct.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* Dynamic Volatility Position Sizing (ATR Sizing) */}
        <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={strategy.dynamicPositionSizing ?? true}
                onChange={(e) =>
                  onUpdateStrategy({ ...strategy, dynamicPositionSizing: e.target.checked })
                }
                className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-0 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-200">
                Dynamic Volatility Position Sizing (ATR-Adjusted)
              </span>
            </label>

            <span className="text-[10px] text-slate-400">
              {strategy.dynamicPositionSizing
                ? '⚡ Trade volume dynamically scales inverse to ATR volatility'
                : 'Static allocation mode active'}
            </span>
          </div>

          {strategy.dynamicPositionSizing && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {/* Risk Per Trade % Slider */}
              <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800">
                <div className="flex justify-between items-center text-[11px] text-slate-400 mb-1">
                  <span>Risk Per Trade (% of Capital)</span>
                  <span className="font-bold text-cyan-400">
                    {Number.isFinite(strategy.riskPerTradePercent) ? strategy.riskPerTradePercent : 2.0}% (${(dynamicSizing.riskAmountUsd).toFixed(2)})
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="5.0"
                  step="0.5"
                  value={Number.isFinite(strategy.riskPerTradePercent) ? strategy.riskPerTradePercent : 2.0}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val)) onUpdateStrategy({ ...strategy, riskPerTradePercent: val });
                  }}
                  className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Capped dollar loss if stop-loss triggers
                </span>
              </div>

              {/* ATR Buffer Multiplier */}
              <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800">
                <div className="flex justify-between items-center text-[11px] text-slate-400 mb-1">
                  <span>ATR Volatility Stop Buffer</span>
                  <span className="font-bold text-purple-400">
                    {Number.isFinite(strategy.atrMultiplier) ? strategy.atrMultiplier : 2.0}x ATR ({formatCurrency(dynamicSizing.stopDistanceUsd)})
                  </span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="3.5"
                  step="0.2"
                  value={Number.isFinite(strategy.atrMultiplier) ? strategy.atrMultiplier : 2.0}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val)) onUpdateStrategy({ ...strategy, atrMultiplier: val });
                  }}
                  className="w-full accent-purple-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Pads stop outside normal market noise wicks
                </span>
              </div>
            </div>
          )}

          {/* Real-Time Sizing Preview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
            <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Calculated Margin</span>
              <span className="font-bold text-white text-xs">
                {formatCurrency(dynamicSizing.margin)}
              </span>
              <span className="text-[9px] text-slate-500 block">
                {dynamicSizing.sizingMultiplier}x vs standard
              </span>
            </div>

            <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Trade Volume (Notional)</span>
              <span className="font-bold text-cyan-300 text-xs">
                {formatCurrency(dynamicSizing.notional)}
              </span>
              <span className="text-[9px] text-slate-500 block">
                {dynamicSizing.units.toFixed(4)} {strategy.symbol.split('/')[0]}
              </span>
            </div>

            <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Stop-Loss Distance</span>
              <span className="font-bold text-rose-300 text-xs">
                -{effectiveStopLossPct.toFixed(2)}%
              </span>
              <span className="text-[9px] text-slate-500 block">
                {formatCurrency(dynamicSizing.stopDistanceUsd)} buffer
              </span>
            </div>

            <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Take-Profit Target</span>
              <span className="font-bold text-emerald-300 text-xs">
                +{effectiveTakeProfitPct.toFixed(2)}%
              </span>
              <span className="text-[9px] text-slate-500 block">
                Target: {formatCurrency(projectedTakeProfitPrice)}
              </span>
            </div>
          </div>
        </div>

        {/* Take-Profit Targets & Stop-Loss Threshold Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {/* Target Take-Profit Mode & Expectancy */}
          <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-slate-300 font-bold text-xs flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-emerald-400" />
                Take-Profit Strategy
              </span>
              <span className="text-[10px] text-emerald-400 font-bold">
                TP Target: {formatCurrency(projectedTakeProfitPrice)}
              </span>
            </div>

            <div className="flex gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => onUpdateStrategy({ ...strategy, takeProfitType: 'RISK_REWARD_RATIO' })}
                className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                  strategy.takeProfitType === 'RISK_REWARD_RATIO'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Risk-Reward ({strategy.riskRewardRatio ?? 2.5}:1)
              </button>
              <button
                type="button"
                onClick={() => onUpdateStrategy({ ...strategy, takeProfitType: 'PERCENT' })}
                className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                  strategy.takeProfitType === 'PERCENT'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Fixed % (+{strategy.takeProfitPercent}%)
              </button>
            </div>

            {strategy.takeProfitType === 'RISK_REWARD_RATIO' ? (
              <div>
                <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                  <span>Risk : Reward Ratio</span>
                  <span className="font-bold text-emerald-400">
                    1 : {strategy.riskRewardRatio ?? 2.5}
                  </span>
                </div>
                <div className="flex gap-1">
                  {[1.5, 2.0, 2.5, 3.0, 4.0].map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => onUpdateStrategy({ ...strategy, riskRewardRatio: ratio })}
                      className={`flex-1 py-1 rounded text-[10px] font-mono cursor-pointer border transition-all ${
                        (strategy.riskRewardRatio ?? 2.5) === ratio
                          ? 'bg-emerald-500/25 border-emerald-500/60 text-emerald-300 font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {ratio}x
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                  <span>Target Profit Percentage</span>
                  <span className="font-bold text-emerald-400">+{Number.isFinite(strategy.takeProfitPercent) ? strategy.takeProfitPercent : 4.0}%</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="0.5"
                  value={Number.isFinite(strategy.takeProfitPercent) ? strategy.takeProfitPercent : 4.0}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val)) onUpdateStrategy({ ...strategy, takeProfitPercent: val });
                  }}
                  className="w-full accent-emerald-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
              </div>
            )}
            <span className="text-[10px] text-slate-500 mt-2 block">
              Automated exit executes as soon as mark price strikes {formatCurrency(projectedTakeProfitPrice)}.
            </span>
          </div>

          {/* Automatic Stop-Loss Threshold & Trailing Stop */}
          <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-slate-300 font-bold text-xs flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-rose-400" />
                Automatic Stop-Loss Threshold
              </span>
              <span className="text-[10px] text-rose-400 font-bold">
                SL Target: {formatCurrency(projectedStopLossPrice)}
              </span>
            </div>

            <div className="p-2 rounded bg-slate-950 border border-slate-800/80 mb-2">
              <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                <span>Loss Threshold Tolerance</span>
                <span className="font-bold text-rose-400">-{Number.isFinite(strategy.stopLossPercent) ? strategy.stopLossPercent : 2.0}%</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="8.0"
                step="0.1"
                value={Number.isFinite(strategy.stopLossPercent) ? strategy.stopLossPercent : 2.0}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (Number.isFinite(val)) onUpdateStrategy({ ...strategy, stopLossPercent: val });
                }}
                className="w-full accent-rose-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-1.5 text-slate-300 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={strategy.trailingStopEnabled}
                  onChange={(e) =>
                    onUpdateStrategy({ ...strategy, trailingStopEnabled: e.target.checked })
                  }
                  className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-0 cursor-pointer"
                />
                <span>Trailing Stop-Loss</span>
              </label>
              <span className="font-mono text-cyan-400 text-xs font-bold">
                {strategy.trailingStopPercent}% from peak
              </span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              Auto-exits when loss breaches tolerance or price drops {strategy.trailingStopPercent}% from highest peak.
            </span>
          </div>
        </div>

        {/* Daily Loss Limit Circuit Breaker */}
        <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg border ${
                strategy.circuitBreakerActive
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 animate-pulse'
                  : 'bg-slate-950 border-slate-800 text-emerald-400'
              }`}
            >
              {strategy.circuitBreakerActive ? (
                <ShieldAlert className="h-4 w-4" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
            </div>
            <div>
              <div className="font-bold text-slate-200 flex items-center gap-2">
                <span>Daily Max Loss Circuit Breaker</span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                    strategy.circuitBreakerActive
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  {strategy.circuitBreakerActive ? 'TRIPPED - HALTED' : 'ARMED (ACTIVE)'}
                </span>
              </div>
              <div className="text-[10px] text-slate-400">
                Daily Realized Loss: <span className="text-rose-400 font-bold">{formatCurrency(currentDailyLossUsd)}</span> / Cap: <span className="text-slate-300 font-bold">${strategy.dailyLossLimitUsd ?? 150}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="number"
              min="25"
              max="2000"
              step="25"
              value={Number.isFinite(strategy.dailyLossLimitUsd) ? strategy.dailyLossLimitUsd : 150}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (Number.isFinite(val)) onUpdateStrategy({ ...strategy, dailyLossLimitUsd: val });
              }}
              className="w-24 bg-slate-950 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-xs font-mono text-center focus:outline-none focus:border-cyan-500"
              title="Daily Max Loss Limit in USD"
            />

            {strategy.circuitBreakerActive && onResetCircuitBreaker && (
              <button
                type="button"
                onClick={onResetCircuitBreaker}
                className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3 text-rose-400" />
                <span>Reset Breaker</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ADVANCED TECHNICAL INDICATORS & SIGNAL GENERATION CONSOLE (MACD, RSI & BOLLINGER BANDS) */}
      <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col gap-3 font-mono">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            <div>
              <span className="text-xs font-bold text-white uppercase tracking-wider block">
                Advanced Technical Indicators & Signal Engine
              </span>
              <span className="text-[10px] text-slate-400">
                MACD (12,26,9) · RSI (14) · Bollinger Bands (20,2) Confluence
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowIndicatorSettings(!showIndicatorSettings)}
              className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1"
            >
              <Settings2 className="h-3 w-3 text-cyan-400" />
              <span>{showIndicatorSettings ? 'Hide Parameters' : 'Tune Indicator Settings'}</span>
              {showIndicatorSettings ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        </div>

        {/* Dynamic Indicator Customizer (When Expanded) */}
        {showIndicatorSettings && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
            {/* 1. MACD Parameter Tuning */}
            <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col gap-2">
              <span className="font-bold text-cyan-300 text-[11px] flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> MACD Parameters
              </span>
              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                <div>
                  <span className="text-slate-400 block mb-0.5">Fast EMA</span>
                  <input
                    type="number"
                    min="5"
                    max="20"
                    value={Number.isFinite(strategy.macdFastPeriod) ? strategy.macdFastPeriod : 12}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val)) onUpdateStrategy({ ...strategy, macdFastPeriod: val });
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-center text-white"
                  />
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Slow EMA</span>
                  <input
                    type="number"
                    min="15"
                    max="40"
                    value={Number.isFinite(strategy.macdSlowPeriod) ? strategy.macdSlowPeriod : 26}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val)) onUpdateStrategy({ ...strategy, macdSlowPeriod: val });
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-center text-white"
                  />
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Signal</span>
                  <input
                    type="number"
                    min="3"
                    max="18"
                    value={Number.isFinite(strategy.macdSignalPeriod) ? strategy.macdSignalPeriod : 9}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val)) onUpdateStrategy({ ...strategy, macdSignalPeriod: val });
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-center text-white"
                  />
                </div>
              </div>
              <span className="text-[9px] text-slate-500">
                Golden Cross = Buy · Death Cross = Sell / Exit
              </span>
            </div>

            {/* 2. RSI Parameter Tuning */}
            <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col gap-2">
              <span className="font-bold text-emerald-300 text-[11px] flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> RSI Parameters
              </span>
              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                <div>
                  <span className="text-slate-400 block mb-0.5">Period</span>
                  <input
                    type="number"
                    min="5"
                    max="25"
                    value={Number.isFinite(strategy.rsiPeriod) ? strategy.rsiPeriod : 14}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val)) onUpdateStrategy({ ...strategy, rsiPeriod: val });
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-center text-white"
                  />
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Buy (Oversold)</span>
                  <input
                    type="number"
                    min="15"
                    max="50"
                    value={Number.isFinite(strategy.rsiBuyThreshold) ? strategy.rsiBuyThreshold : 30}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val)) onUpdateStrategy({ ...strategy, rsiBuyThreshold: val });
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-center text-cyan-300"
                  />
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Sell (Overbought)</span>
                  <input
                    type="number"
                    min="55"
                    max="85"
                    value={Number.isFinite(strategy.rsiSellThreshold) ? strategy.rsiSellThreshold : 70}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val)) onUpdateStrategy({ ...strategy, rsiSellThreshold: val });
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-center text-rose-300"
                  />
                </div>
              </div>
              <span className="text-[9px] text-slate-500">
                Oversold = Dip Buy · Overbought = Exit / Sell
              </span>
            </div>

            {/* 3. Bollinger Bands Tuning */}
            <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col gap-2">
              <span className="font-bold text-purple-300 text-[11px] flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400" /> Bollinger Bands
              </span>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div>
                  <span className="text-slate-400 block mb-0.5">Period (SMA)</span>
                  <input
                    type="number"
                    min="10"
                    max="40"
                    value={Number.isFinite(strategy.bollingerPeriod) ? strategy.bollingerPeriod : 20}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val)) onUpdateStrategy({ ...strategy, bollingerPeriod: val });
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-center text-white"
                  />
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Std Dev Multiplier</span>
                  <input
                    type="number"
                    min="1.0"
                    max="3.5"
                    step="0.1"
                    value={Number.isFinite(strategy.bollingerStdDev) ? strategy.bollingerStdDev : 2}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val)) onUpdateStrategy({ ...strategy, bollingerStdDev: val });
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-center text-purple-300"
                  />
                </div>
              </div>
              <span className="text-[9px] text-slate-500">
                Lower Band = Support Buy · Upper Band = Resistance Sell
              </span>
            </div>
          </div>
        )}

        {/* Real-time Indicator Cards Trio */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
          {/* Card 1: MACD */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between gap-2">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  MACD ({strategy.macdFastPeriod ?? 12},{strategy.macdSlowPeriod ?? 26},{strategy.macdSignalPeriod ?? 9})
                </span>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    indicators.macd.isBullishCross
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                      : indicators.macd.isBearishCross
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                      : indicators.macd.histogram >= 0
                      ? 'bg-emerald-950/60 text-emerald-400'
                      : 'bg-rose-950/60 text-rose-400'
                  }`}
                >
                  {indicators.macd.isBullishCross
                    ? '⚡ GOLDEN CROSS'
                    : indicators.macd.isBearishCross
                    ? '⚠️ DEATH CROSS'
                    : indicators.macd.histogram >= 0
                    ? 'BULLISH HIST'
                    : 'BEARISH HIST'}
                </span>
              </div>

              <div className="text-[10px] text-slate-300 mt-1">
                {indicators.trendAnalysis?.signals?.macdStatus || 'Neutral Momentum'}
              </div>
            </div>

            <div className="p-2 rounded bg-slate-950 border border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
              <div>
                <span className="text-slate-500 block">MACD Line</span>
                <span className="font-bold text-white">{indicators.macd.macd.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Signal Line</span>
                <span className="font-bold text-slate-300">{indicators.macd.signal.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Histogram</span>
                <span
                  className={`font-bold ${
                    indicators.macd.histogram >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {indicators.macd.histogram >= 0 ? '+' : ''}
                  {indicators.macd.histogram.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: RSI */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between gap-2">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  RSI ({strategy.rsiPeriod ?? 14})
                </span>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    indicators.rsi <= strategy.rsiBuyThreshold
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                      : indicators.rsi >= strategy.rsiSellThreshold
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {indicators.rsi <= strategy.rsiBuyThreshold
                    ? '⚡ OVERSOLD BUY'
                    : indicators.rsi >= strategy.rsiSellThreshold
                    ? '⚠️ OVERBOUGHT SELL'
                    : 'NEUTRAL ZONE'}
                </span>
              </div>

              <div className="text-[10px] text-slate-300 mt-1 truncate">
                {indicators.trendAnalysis?.signals?.divergenceStatus && indicators.trendAnalysis.signals.divergenceStatus !== 'None'
                  ? indicators.trendAnalysis.signals.divergenceStatus
                  : indicators.trendAnalysis?.signals?.rsiStatus || 'Normal RSI Range'}
              </div>
            </div>

            {/* RSI Visual Meter */}
            <div className="p-2 rounded bg-slate-950 border border-slate-800/80 flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-400">Current RSI:</span>
                <span
                  className={`font-black text-xs ${
                    indicators.rsi <= strategy.rsiBuyThreshold
                      ? 'text-emerald-400'
                      : indicators.rsi >= strategy.rsiSellThreshold
                      ? 'text-rose-400'
                      : 'text-cyan-300'
                  }`}
                >
                  {indicators.rsi.toFixed(1)}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden relative">
                <div
                  className={`h-full transition-all duration-300 ${
                    indicators.rsi <= strategy.rsiBuyThreshold
                      ? 'bg-emerald-400'
                      : indicators.rsi >= strategy.rsiSellThreshold
                      ? 'bg-rose-400'
                      : 'bg-cyan-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, indicators.rsi))}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>Buy &le; {strategy.rsiBuyThreshold}</span>
                <span>Mid (50)</span>
                <span>Sell &ge; {strategy.rsiSellThreshold}</span>
              </div>
            </div>
          </div>

          {/* Card 3: Bollinger Bands */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between gap-2">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-bold text-purple-300 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-purple-400" />
                  Bollinger Bands ({strategy.bollingerPeriod ?? 20},{strategy.bollingerStdDev ?? 2})
                </span>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    indicators.bollinger.isSqueeze
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                      : (indicators.bollinger.percentB ?? 0.5) >= 0.88
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : (indicators.bollinger.percentB ?? 0.5) <= 0.15
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {indicators.bollinger.isSqueeze
                    ? '⚡ SQUEEZE PINCH'
                    : (indicators.bollinger.percentB ?? 0.5) >= 0.88
                    ? 'UPPER RESIST'
                    : (indicators.bollinger.percentB ?? 0.5) <= 0.15
                    ? 'LOWER BOUNCE'
                    : 'NORMAL BAND'}
                </span>
              </div>

              <div className="text-[10px] text-slate-300 mt-1 truncate">
                {indicators.trendAnalysis?.signals?.bollingerStatus || 'Normal Range'}
              </div>
            </div>

            <div className="p-2 rounded bg-slate-950 border border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
              <div>
                <span className="text-slate-500 block">Lower Band</span>
                <span className="font-bold text-emerald-400">{formatCurrency(indicators.bollinger.lower, currentAsset?.decimals || 2)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">%B Position</span>
                <span className="font-bold text-white">{(indicators.bollinger.percentB ?? 0.5).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Upper Band</span>
                <span className="font-bold text-rose-400">{formatCurrency(indicators.bollinger.upper, currentAsset?.decimals || 2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Auto-Sell on Indicator Exit Policy Toggle */}
        <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800/90 flex flex-wrap items-center justify-between gap-3 text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={strategy.autoSellEnabled ?? true}
              onChange={(e) =>
                onUpdateStrategy({ ...strategy, autoSellEnabled: e.target.checked })
              }
              className="rounded border-slate-700 bg-slate-950 text-rose-500 focus:ring-0 cursor-pointer"
            />
            <span className="text-xs font-bold text-slate-200">
              Automated Technical Sell Engine (Auto-Exit on MACD Death Cross / RSI Overbought / BB Upper Piercing)
            </span>
          </label>

          <span
            className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
              strategy.autoSellEnabled !== false
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {strategy.autoSellEnabled !== false ? 'AUTO-SELL ARMED' : 'MANUAL SELL ONLY'}
          </span>
        </div>
      </div>

      {/* WHY ISN'T IT MAKING ANY SALES / SELLS? LIVE DIAGNOSTIC BOX */}
      <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col gap-2.5 font-mono">
        <div
          onClick={() => setShowSellDiagnostics(!showSellDiagnostics)}
          className="flex items-center justify-between cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-bold text-amber-300">
              Why Isn&apos;t It Making Any Sells / Sales? (Live Strategy Diagnostic)
            </span>
            <span className="text-[10px] text-slate-500 hidden sm:inline">
              — Real-time analysis of why sell orders execute or wait
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
            <span className="text-[10px]">{showSellDiagnostics ? 'Collapse' : 'Inspect'}</span>
            {showSellDiagnostics ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </div>
        </div>

        {showSellDiagnostics && (
          <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-2.5 text-xs animate-in fade-in duration-150">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
              {/* Check 1: Open Positions */}
              <div
                className={`p-2.5 rounded-lg border ${
                  activePositionsCount > 0
                    ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                    : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  {activePositionsCount > 0 ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  )}
                  <span>1. Position Inventory Status</span>
                </div>
                <div className="text-[10px] text-slate-300 pl-5">
                  {activePositionsCount > 0
                    ? `Currently ${activePositionsCount} open position(s) on the ledger waiting for technical exit trigger or target TP.`
                    : `0 Open Positions. The automated engine only sells positions that have been opened (or execute an immediate Spot Sell below).`}
                </div>
              </div>

              {/* Check 2: MACD Trend Signal */}
              <div
                className={`p-2.5 rounded-lg border ${
                  indicators.macd.isBearishCross || (indicators.macd.macd < indicators.macd.signal && indicators.macd.histogram < 0)
                    ? 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      indicators.macd.histogram < 0 ? 'bg-rose-400' : 'bg-emerald-400'
                    }`}
                  />
                  <span>2. MACD Momentum Status</span>
                </div>
                <div className="text-[10px] text-slate-300 pl-3.5">
                  {indicators.macd.isBearishCross
                    ? '🔴 MACD Death Cross detected! Bearish sell condition is actively firing.'
                    : indicators.macd.histogram < 0
                    ? `🔴 MACD histogram is negative (${indicators.macd.histogram.toFixed(2)}) — downside momentum active.`
                    : `🟢 MACD is currently positive (+${indicators.macd.histogram.toFixed(2)}). Waiting for Death Cross or downward turn to signal a sell.`}
                </div>
              </div>

              {/* Check 3: RSI Threshold */}
              <div
                className={`p-2.5 rounded-lg border ${
                  indicators.rsi >= strategy.rsiSellThreshold
                    ? 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      indicators.rsi >= strategy.rsiSellThreshold ? 'bg-rose-400' : 'bg-cyan-400'
                    }`}
                  />
                  <span>3. RSI Overbought Threshold</span>
                </div>
                <div className="text-[10px] text-slate-300 pl-3.5">
                  {indicators.rsi >= strategy.rsiSellThreshold
                    ? `🔴 RSI is at ${indicators.rsi.toFixed(1)} &ge; ${strategy.rsiSellThreshold}. Overbought sell signal active!`
                    : `🟢 RSI is currently at ${indicators.rsi.toFixed(1)}. Market has not reached overbought resistance (${strategy.rsiSellThreshold}) to sell.`}
                </div>
              </div>

              {/* Check 4: Bollinger Bands Upper Band */}
              <div
                className={`p-2.5 rounded-lg border ${
                  (indicators.bollinger.percentB ?? 0.5) >= 0.88 || indicators.bollinger.isPiercingUpper
                    ? 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      (indicators.bollinger.percentB ?? 0.5) >= 0.88 ? 'bg-rose-400' : 'bg-purple-400'
                    }`}
                  />
                  <span>4. Bollinger Bands Resistance</span>
                </div>
                <div className="text-[10px] text-slate-300 pl-3.5">
                  {(indicators.bollinger.percentB ?? 0.5) >= 0.88 || indicators.bollinger.isPiercingUpper
                    ? `🔴 Price has pierced upper Bollinger band (%B ${(indicators.bollinger.percentB ?? 0.5).toFixed(2)}). Mean reversion sell active!`
                    : `🟢 Current %B is ${(indicators.bollinger.percentB ?? 0.5).toFixed(2)}. Normal channel range (needs &ge; 0.88 to trigger sell).`}
                </div>
              </div>
            </div>

            {/* Direct Action Bar to Make an Instant Sale */}
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
              <div className="text-[11px] text-slate-300">
                <strong>Want to make a sale right now?</strong> Click below to execute a live sell order through the Smart Order Router or fund margin to initiate trade cycles.
              </div>

              <div className="flex items-center gap-2">
                {typeof botCash === 'number' && botCash < 50 && onQuickFundMargin && (
                  <button
                    type="button"
                    onClick={onQuickFundMargin}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Wallet className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Quick Fund $1,000 Margin</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onManualOrder('SELL')}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold transition-all cursor-pointer shadow-sm shadow-rose-500/20 flex items-center gap-1.5"
                >
                  <TrendingDown className="h-3.5 w-3.5" />
                  <span>Execute Market Sell Now (SOR)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Advanced Sizing, Leverage & Risk Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* Trading Leverage Selector */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <div className="flex justify-between items-center text-slate-400 font-mono text-[11px] mb-1.5">
            <span className="flex items-center gap-1">
              Trading Leverage
              {strategy.leverage > 3 && <Flame className="h-3 w-3 text-rose-400" />}
            </span>
            <span
              className={`font-bold font-mono ${
                strategy.leverage >= 5 ? 'text-rose-400' : strategy.leverage > 1 ? 'text-amber-400' : 'text-slate-300'
              }`}
            >
              {strategy.leverage}x
            </span>
          </div>

          <div className="flex gap-1">
            {[1, 2, 3, 5, 10].map((lev) => (
              <button
                key={lev}
                onClick={() => onUpdateStrategy({ ...strategy, leverage: lev })}
                className={`flex-1 py-1 rounded-lg font-mono text-xs cursor-pointer border transition-all ${
                  strategy.leverage === lev
                    ? lev >= 5
                      ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 font-bold'
                      : lev > 1
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold'
                      : 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {lev}x
              </button>
            ))}
          </div>

          <div className="text-[10px] text-slate-400 mt-1.5 flex items-center justify-between font-mono">
            <span>Est. Liq Wick:</span>
            <span className={strategy.leverage >= 5 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
              ~{estLiquidationDrop}% drop
            </span>
          </div>
        </div>

        {/* Manual Action Buttons */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 font-mono text-[11px] mb-1">
            <span>Manual Execution Override</span>
            <span className="text-[10px] text-cyan-400">Routes via SOR</span>
          </div>

          {/* Manual Order Override */}
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => onManualOrder('BUY')}
              className="flex-1 py-2 px-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-semibold cursor-pointer transition-colors text-center text-xs"
            >
              Manual Buy
            </button>
            <button
              onClick={() => onManualOrder('SELL')}
              className="flex-1 py-2 px-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-semibold cursor-pointer transition-colors text-center text-xs"
            >
              Manual Sell
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
