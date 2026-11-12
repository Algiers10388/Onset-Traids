import React, { useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, CheckCircle, RefreshCw, X } from 'lucide-react';
import { StrategyParameters, Candle } from '../types';
import { formatCurrency, formatPercent, computeIndicators } from '../utils/cryptoMath';

interface BacktestLabModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStrategy: StrategyParameters;
}

type MarketRegime = 'BULL_RUN' | 'FLASH_CRASH' | 'SIDEWAYS_CHOP';

interface BacktestResults {
  regime: MarketRegime;
  initialBalance: number;
  finalBalance: number;
  netProfit: number;
  netProfitPercent: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  tradesSummary: Array<{
    bar: number;
    side: 'BUY' | 'SELL';
    price: number;
    pnl?: number;
    reason: string;
  }>;
}

export const BacktestLabModal: React.FC<BacktestLabModalProps> = ({
  isOpen,
  onClose,
  currentStrategy,
}) => {
  const [selectedRegime, setSelectedRegime] = useState<MarketRegime>('BULL_RUN');
  const [isSimulating, setIsSimulating] = useState(false);
  const [results, setResults] = useState<BacktestResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const runBacktest = async () => {
    setIsSimulating(true);
    setError(null);

    try {
      // Fetch live market candle history from exchange API
      let candles: Candle[] = [];
      const res = await fetch(
        `/api/market/live-candles?symbol=${encodeURIComponent(currentStrategy.symbol || 'BTC/USDT')}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.candles && data.candles.length >= 30) {
          candles = data.candles;
        }
      }

      if (candles.length < 30) {
        throw new Error('Not enough real candle history from the exchanges to backtest (need at least 30 one-minute candles).');
      }

      // Execute simulation over bars
      let balance = 10000;
      let peak = balance;
      let maxDrawdown = 0;
      let wins = 0;
      let losses = 0;
      let grossProfit = 0;
      let grossLoss = 0;

      let inPosition = false;
      let entryPrice = 0;
      let positionSize = 0;
      const trades: BacktestResults['tradesSummary'] = [];

      for (let i = 15; i < candles.length; i++) {
        const historySlice = candles.slice(0, i + 1);
        const currentCandle = candles[i];
        const indicators = computeIndicators(historySlice);

        // Check Exit if in position
        if (inPosition) {
          const rawPnlPercent = ((currentCandle.close - entryPrice) / entryPrice) * 100;
          const leveragedPnlPercent = rawPnlPercent * currentStrategy.leverage;

          // Liquidation check
          if (leveragedPnlPercent <= -90) {
            const lossAmount = positionSize;
            balance -= lossAmount;
            losses++;
            grossLoss += lossAmount;
            trades.push({
              bar: i,
              side: 'SELL',
              price: currentCandle.close,
              pnl: -lossAmount,
              reason: 'Margin Liquidation',
            });
            inPosition = false;
            continue;
          }

          // Take profit check
          if (leveragedPnlPercent >= currentStrategy.takeProfitPercent) {
            const profitAmount = (positionSize * leveragedPnlPercent) / 100;
            const fee = positionSize * (currentStrategy.slippagePercent / 100) * 2;
            const net = profitAmount - fee;
            balance += net;
            wins++;
            grossProfit += Math.max(0, net);
            trades.push({
              bar: i,
              side: 'SELL',
              price: currentCandle.close,
              pnl: net,
              reason: `Take Profit Target (+${currentStrategy.takeProfitPercent}%) Hit`,
            });
            inPosition = false;
            continue;
          }

          // Stop loss check
          if (leveragedPnlPercent <= -currentStrategy.stopLossPercent) {
            const lossAmount = Math.abs((positionSize * leveragedPnlPercent) / 100);
            const fee = positionSize * (currentStrategy.slippagePercent / 100) * 2;
            const netLoss = -(lossAmount + fee);
            balance += netLoss;
            losses++;
            grossLoss += Math.abs(netLoss);
            trades.push({
              bar: i,
              side: 'SELL',
              price: currentCandle.close,
              pnl: netLoss,
              reason: `Stop Loss Trigger (-${currentStrategy.stopLossPercent}%) Hit`,
            });
            inPosition = false;
            continue;
          }

          // Dynamic Technical Indicator Exit (lock in gains before technical reversal)
          const isOverbought = indicators.rsi >= currentStrategy.rsiSellThreshold;
          const isMacdExit = Boolean(indicators.macd.isBearishCross || (indicators.macd.histogram < 0 && indicators.trendAnalysis?.signals.isPrecisionSell));
          if (leveragedPnlPercent >= 1.0 && (isOverbought || isMacdExit)) {
            const profitAmount = (positionSize * leveragedPnlPercent) / 100;
            const fee = positionSize * (currentStrategy.slippagePercent / 100) * 2;
            const net = profitAmount - fee;
            balance += net;
            wins++;
            grossProfit += Math.max(0, net);
            trades.push({
              bar: i,
              side: 'SELL',
              price: currentCandle.close,
              pnl: net,
              reason: isOverbought
                ? `Technical Exit: RSI Overbought (${indicators.rsi.toFixed(1)})`
                : `Technical Exit: MACD Bearish Reversal`,
            });
            inPosition = false;
            continue;
          }
        }

        // Check Entry if not in position
        if (!inPosition) {
          let buySignal = false;
          let reason = '';

          if (currentStrategy.triggerType === 'TRIPLE_CONFLUENCE_PRO') {
            const score = indicators.trendAnalysis?.confluenceScore ?? 0;
            if (score >= 30 || indicators.trendAnalysis?.signals.isPrecisionBuy) {
              buySignal = true;
              reason = `Triple Confluence (+${score}%) MACD+RSI+BB`;
            }
          } else if (currentStrategy.triggerType === 'BOLLINGER_MACD_SQUEEZE') {
            const bbPct = indicators.bollinger.percentB ?? 0.5;
            if ((indicators.bollinger.isSqueeze || bbPct <= 0.3) && indicators.macd.histogram > 0) {
              buySignal = true;
              reason = `Bollinger Squeeze + Bullish MACD Hist (+${indicators.macd.histogram.toFixed(2)})`;
            }
          } else if (currentStrategy.triggerType === 'MACD_CROSSOVER') {
            if (indicators.macd.isBullishCross || (indicators.macd.histogram > 0 && indicators.macd.isHistogramExpanding)) {
              buySignal = true;
              reason = `MACD Bullish Cross / Momentum Surge`;
            }
          } else if (currentStrategy.triggerType === 'RSI_DIVERGENCE_REVERSAL') {
            const isDiv = Boolean(indicators.trendAnalysis?.signals.divergenceStatus?.includes('Bullish'));
            if (isDiv || (indicators.rsi < currentStrategy.rsiBuyThreshold && indicators.macd.histogram > -0.5)) {
              buySignal = true;
              reason = isDiv ? 'Bullish RSI Regular Divergence' : `RSI Rebound (${indicators.rsi.toFixed(1)})`;
            }
          } else if (currentStrategy.triggerType === 'RSI_OVERSOLD') {
            if (indicators.rsi < currentStrategy.rsiBuyThreshold) {
              buySignal = true;
              reason = `RSI Oversold (${indicators.rsi.toFixed(1)} < ${currentStrategy.rsiBuyThreshold})`;
            }
          } else if (currentStrategy.triggerType === 'MOMENTUM_COMBO') {
            if (indicators.rsi < currentStrategy.rsiBuyThreshold && indicators.macd.histogram > 0) {
              buySignal = true;
              reason = `RSI (${indicators.rsi.toFixed(1)}) + Bullish MACD Hist`;
            }
          } else if (currentStrategy.triggerType === 'EMA_BREAKOUT') {
            if (indicators.ema9 > indicators.ema21) {
              buySignal = true;
              reason = `EMA 9 Crossed Above EMA 21`;
            }
          } else if (currentStrategy.triggerType === 'BOLLINGER_BOUNCE') {
            if (currentCandle.close <= indicators.bollinger.lower * 1.005) {
              buySignal = true;
              reason = `Lower Bollinger Band Bounce`;
            }
          }

          if (buySignal) {
            inPosition = true;
            entryPrice = currentCandle.close;
            positionSize = balance * (currentStrategy.orderSizePercent / 100);
            trades.push({
              bar: i,
              side: 'BUY',
              price: entryPrice,
              reason,
            });
          }
        }

        // Track Peak & Drawdown
        if (balance > peak) peak = balance;
        const currentDrawdown = ((peak - balance) / peak) * 100;
        if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;
      }

      const totalTrades = wins + losses;
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
      const netProfit = balance - 10000;
      const netProfitPercent = (netProfit / 10000) * 100;

      setResults({
        regime: selectedRegime,
        initialBalance: 10000,
        finalBalance: balance,
        netProfit,
        netProfitPercent,
        totalTrades,
        winRate: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
        profitFactor,
        maxDrawdown,
        tradesSummary: trades,
      });
    } catch (err) {
      console.error('Backtest error:', err);
      setResults(null);
      setError(err instanceof Error ? err.message : 'Backtest failed');
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl rounded-2xl bg-[#0F1422] border border-cyan-500/30 shadow-2xl shadow-cyan-500/10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                Algorithmic Backtest Simulation Lab
              </h2>
              <p className="text-[11px] text-slate-400">
                Stress-test "{currentStrategy.name}" across historical market volatility regimes
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

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          {/* Data source: real candles only (no synthetic market regimes) */}
          <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 text-[11px] text-slate-300 leading-relaxed">
            Backtests run on the most recent real 1-minute candles (up to 60) for the selected symbol, fetched live from the exchanges.
            No synthetic or scripted market scenarios are used, so this is a short recent-window check, not a long-horizon stress test.
            {error && <div className="mt-2 text-rose-300 font-mono">{error}</div>}
          </div>

          {/* Current Strategy Summary */}
          <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-slate-300 font-mono">
            <div>
              <span className="text-slate-500">Tested Strategy: </span>
              <strong className="text-white">{currentStrategy.name}</strong>
            </div>
            <div className="flex gap-3 text-[11px]">
              <span>TP: <strong className="text-emerald-400">+{currentStrategy.takeProfitPercent}%</strong></span>
              <span>SL: <strong className="text-rose-400">-{currentStrategy.stopLossPercent}%</strong></span>
              <span>Lev: <strong className="text-cyan-400">{currentStrategy.leverage}x</strong></span>
              <span>Size: <strong className="text-slate-200">{currentStrategy.orderSizePercent}%</strong></span>
            </div>
          </div>

          {/* Run Button */}
          <div className="flex justify-center">
            <button
              onClick={runBacktest}
              disabled={isSimulating}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 cursor-pointer transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isSimulating ? 'animate-spin' : ''}`} />
              <span>{isSimulating ? 'Computing 100 Candle Trajectory...' : 'Run Quantitative Backtest'}</span>
            </button>
          </div>

          {/* Backtest Output Results */}
          {results && (
            <div className="space-y-4 pt-2 border-t border-slate-800">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Net Profit</div>
                  <div
                    className={`text-lg font-bold font-mono mt-0.5 ${
                      results.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatCurrency(results.netProfit)} ({formatPercent(results.netProfitPercent)})
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Win Rate</div>
                  <div className="text-lg font-bold font-mono text-white mt-0.5">
                    {results.winRate.toFixed(1)}%
                    <span className="text-xs font-normal text-slate-400 ml-1">
                      ({results.totalTrades} trades)
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Max Drawdown</div>
                  <div className="text-lg font-bold font-mono text-rose-400 mt-0.5">
                    -{results.maxDrawdown.toFixed(1)}%
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Profit Factor</div>
                  <div className="text-lg font-bold font-mono text-cyan-400 mt-0.5">
                    {results.profitFactor.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Trades Log Preview */}
              <div>
                <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Backtest Execution Log ({results.tradesSummary.length} Events)
                </div>
                <div className="max-h-40 overflow-y-auto rounded-xl bg-slate-950/60 border border-slate-800 p-2 font-mono text-[11px] space-y-1">
                  {results.tradesSummary.map((t, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1 border-b border-slate-900 last:border-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.2 rounded font-bold text-[9px] ${
                            t.side === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {t.side}
                        </span>
                        <span className="text-slate-300">Bar #{t.bar} @ {formatCurrency(t.price)}</span>
                        <span className="text-slate-500 text-[10px] truncate max-w-[200px]">({t.reason})</span>
                      </div>

                      {t.pnl !== undefined && (
                        <span
                          className={`font-bold ${
                            t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {t.pnl >= 0 ? '+' : ''}
                          {formatCurrency(t.pnl)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
