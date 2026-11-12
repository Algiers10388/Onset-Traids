import React from 'react';
import {
  ArrowRightLeft,
  CheckCircle2,
  ExternalLink,
  GitCompare,
  Layers,
  Network,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  ExchangeConfig,
  ExchangeQuote,
  ExecutionRoutingMode,
  ArbitrageOpportunity,
} from '../types';
import { formatCurrency, formatPercent } from '../utils/cryptoMath';

interface MultiExchangeComparisonCardProps {
  quotes: ExchangeQuote[];
  exchanges: ExchangeConfig[];
  selectedSymbol: string;
  decimals: number;
  routingMode: ExecutionRoutingMode;
  onSetRoutingMode: (mode: ExecutionRoutingMode) => void;
  arbitrageOpp: ArbitrageOpportunity | null;
  onExecuteArbitrage: (opp: ArbitrageOpportunity) => void;
  onOpenExchangeSettings: () => void;
  totalSavedUsd: number;
}

export const MultiExchangeComparisonCard: React.FC<MultiExchangeComparisonCardProps> = ({
  quotes,
  exchanges,
  selectedSymbol,
  decimals,
  routingMode,
  onSetRoutingMode,
  arbitrageOpp,
  onExecuteArbitrage,
  onOpenExchangeSettings,
  totalSavedUsd,
}) => {
  // Find best quotes
  const bestBuyQuote = quotes.length > 0
    ? quotes.reduce((best, q) => (q.effectiveBuyPrice < best.effectiveBuyPrice ? q : best), quotes[0])
    : null;

  const bestSellQuote = quotes.length > 0
    ? quotes.reduce((best, q) => (q.effectiveSellPrice > best.effectiveSellPrice ? q : best), quotes[0])
    : null;

  const highestBidQuote = quotes.length > 0
    ? quotes.reduce((best, q) => (q.bidPrice > best.bidPrice ? q : best), quotes[0])
    : null;

  const lowestAskQuote = quotes.length > 0
    ? quotes.reduce((best, q) => (q.askPrice < best.askPrice ? q : best), quotes[0])
    : null;

  const maxSpreadUsd =
    highestBidQuote && lowestAskQuote
      ? Math.max(0, highestBidQuote.bidPrice - lowestAskQuote.askPrice)
      : 0;

  return (
    <div className="rounded-2xl bg-slate-900/70 border border-slate-800/80 p-4 shadow-xl backdrop-blur-sm flex flex-col gap-3.5">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Network className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide">
                Cross-Exchange Price Comparison & Smart Router (SOR)
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                Live Multi-Book
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Real-time quotes across Binance, Coinbase Pro, Kraken, Bybit & NonKYC (Zero-KYC) with net fee optimization
            </p>
          </div>
        </div>

        {/* Right side controls: Total Saved Alpha & Settings */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-slate-400 text-[11px]">SOR Savings:</span>
            <span className="font-bold font-mono text-emerald-400">
              +{formatCurrency(totalSavedUsd)}
            </span>
          </div>

          <button
            onClick={onOpenExchangeSettings}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold cursor-pointer transition-colors"
            title="Configure Connected Exchanges & API Keys"
          >
            <Settings className="h-3.5 w-3.5 text-slate-400" />
            <span>Exchange Manager</span>
          </button>
        </div>
      </div>

      {/* Routing Mode Quick Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
            Execution Mode:
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <button
              onClick={() => onSetRoutingMode('SMART_ORDER_ROUTER')}
              className={`px-2.5 py-1 rounded-lg font-mono text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
                routingMode === 'SMART_ORDER_ROUTER'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="h-3 w-3 text-amber-300" />
              <span>Smart Order Router (Best Price)</span>
            </button>

            {exchanges.map((ex) => (
              <button
                key={ex.id}
                onClick={() => onSetRoutingMode(ex.id)}
                className={`px-2 py-1 rounded-lg font-mono text-xs cursor-pointer transition-all ${
                  routingMode === ex.id
                    ? 'bg-slate-800 border border-cyan-500 text-cyan-300 font-bold'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Direct: {ex.shortName}
              </button>
            ))}
          </div>
        </div>

        <div className="text-[11px] font-mono text-slate-400">
          Target Pair: <strong className="text-white">{selectedSymbol}</strong>
        </div>
      </div>

      {/* Exchange Quotes Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {quotes.map((q) => {
          const ex = exchanges.find((e) => e.id === q.exchangeId);
          const isBestBuy = bestBuyQuote?.exchangeId === q.exchangeId;
          const isBestSell = bestSellQuote?.exchangeId === q.exchangeId;
          const isSelected = routingMode === q.exchangeId;

          return (
            <div
              key={q.exchangeId}
              className={`rounded-xl p-3 border transition-all flex flex-col justify-between relative overflow-hidden ${
                isSelected
                  ? 'bg-slate-900/90 border-cyan-500/70 shadow-lg shadow-cyan-500/10'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: ex?.tagColor || '#00E5FF' }}
                  />
                  <span className="font-bold text-xs text-white">{q.exchangeName}</span>
                </div>

                <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                  <span>{q.latencyMs}ms</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </div>
              </div>

              {/* Price Quotes Matrix */}
              <div className="space-y-2 py-2.5 text-xs font-mono">
                {/* Bid (Sell) */}
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[11px]">Bid (Sell):</span>
                  <div className="text-right">
                    <span className="font-bold text-slate-200">
                      {formatCurrency(q.bidPrice, decimals)}
                    </span>
                    <div className="text-[10px] text-slate-400">
                      Net: <strong className={isBestSell ? 'text-cyan-400' : 'text-slate-400'}>
                        {formatCurrency(q.effectiveSellPrice, decimals)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Ask (Buy) */}
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[11px]">Ask (Buy):</span>
                  <div className="text-right">
                    <span className="font-bold text-slate-200">
                      {formatCurrency(q.askPrice, decimals)}
                    </span>
                    <div className="text-[10px] text-slate-400">
                      Net: <strong className={isBestBuy ? 'text-emerald-400' : 'text-slate-400'}>
                        {formatCurrency(q.effectiveBuyPrice, decimals)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Spread & Taker Fee */}
                <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-900">
                  <span>Spread: {formatCurrency(q.spreadUsd, decimals)}</span>
                  <span>Taker Fee: {ex?.takerFeePercent}%</span>
                </div>

                {/* Liquidity Depth Bar */}
                <div className="pt-1">
                  <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                    <span>Depth:</span>
                    <span>${(q.depthBidUsd / 1000).toFixed(0)}k</span>
                  </div>
                  <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500/70 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (q.depthBidUsd / 200000) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Best Price Badges */}
              <div className="flex gap-1 pt-1">
                {isBestBuy && (
                  <span className="flex-1 text-center py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                    ★ Best Buy (Lowest Cost)
                  </span>
                )}
                {isBestSell && (
                  <span className="flex-1 text-center py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold">
                    ★ Best Sell (Highest Net)
                  </span>
                )}
                {!isBestBuy && !isBestSell && (
                  <span className="flex-1 text-center py-0.5 rounded bg-slate-900 text-slate-500 text-[10px]">
                    Secondary Pool
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cross-Exchange Spatial Arbitrage Banner */}
      <div className="rounded-xl p-3 bg-gradient-to-r from-purple-950/40 via-slate-900 to-blue-950/40 border border-purple-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30">
            <ArrowRightLeft className="h-4 w-4" />
          </div>
          <div>
            <div className="font-bold text-white flex items-center gap-2">
              Best-Market Spread Arbitrage Engine
              {arbitrageOpp && arbitrageOpp.isActionable ? (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono animate-pulse">
                  WINDOW OPEN (+{arbitrageOpp.netSpreadPercent.toFixed(3)}% Net)
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-mono">
                  ACTIVE PAIR SCANNER
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-300 font-mono mt-0.5">
              {arbitrageOpp && arbitrageOpp.isActionable ? (
                <span>
                  Best Market to Buy: <strong className="text-emerald-400">{arbitrageOpp.buyExchangeName}</strong> (Ask: {formatCurrency(arbitrageOpp.buyAskPrice, decimals)}) ➔ Paired Greatest Spread Sell: <strong className="text-cyan-400">{arbitrageOpp.sellExchangeName}</strong> (Bid: {formatCurrency(arbitrageOpp.sellBidPrice, decimals)})
                </span>
              ) : (
                <span>
                  Continuous Best-Market Pairing: Auto-evaluating lowest cost buy venues against highest bid liquidation markets. Max spread: {formatCurrency(maxSpreadUsd, decimals)}.
                </span>
              )}
            </div>
          </div>
        </div>

        {arbitrageOpp && arbitrageOpp.isActionable && (
          <button
            onClick={() => onExecuteArbitrage(arbitrageOpp)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 cursor-pointer transition-all"
          >
            <Zap className="h-3.5 w-3.5 fill-current" />
            <span>Execute Cross-Exchange Arbitrage</span>
          </button>
        )}
      </div>
    </div>
  );
};
