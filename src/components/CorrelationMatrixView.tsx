import React, { useState, useMemo } from 'react';
import { CryptoAsset, Candle } from '../types';
import {
  buildCorrelationMatrix,
  detectMarketClusters,
  findStatisticalArbitragePairs,
  MarketCluster,
  StatisticalArbitragePair,
} from '../utils/correlationMath';
import { formatCurrency, formatPercent } from '../utils/cryptoMath';
import {
  Layers,
  Activity,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Info,
  Shield,
  Zap,
  Sliders,
  Filter,
  Check,
  Search,
  Maximize2,
  RefreshCw,
  Compass,
  GitBranch,
} from 'lucide-react';

interface CorrelationMatrixViewProps {
  assets: CryptoAsset[];
  candleMap: Record<string, Candle[]>;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onApplyPairToBot?: (symbolA: string, symbolB: string) => void;
}

export const CorrelationMatrixView: React.FC<CorrelationMatrixViewProps> = ({
  assets,
  candleMap,
  selectedSymbol,
  onSelectSymbol,
  onApplyPairToBot,
}) => {
  // Timeframe and Benchmark Filters
  const [timeframe, setTimeframe] = useState<'15M' | '1H' | '4H' | '24H' | '7D'>('1H');
  const [benchmark, setBenchmark] = useState<string>('BTC/USDT');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [activeCell, setActiveCell] = useState<{
    symA: string;
    symB: string;
    r: number;
    idxA: number;
    idxB: number;
  } | null>(null);

  // Asset selection filter
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(() =>
    assets.slice(0, 10).map((a) => a.symbol)
  );

  // Toggle asset in matrix
  const handleToggleSymbol = (sym: string) => {
    if (selectedSymbols.includes(sym)) {
      if (selectedSymbols.length <= 3) return; // Keep at least 3
      setSelectedSymbols(selectedSymbols.filter((s) => s !== sym));
    } else {
      setSelectedSymbols([...selectedSymbols, sym]);
    }
  };

  const handleSelectPreset = (preset: 'ALL' | 'L1' | 'DEFI' | 'TOP5') => {
    setSelectedCategory(preset);
    if (preset === 'ALL') {
      setSelectedSymbols(assets.map((a) => a.symbol));
    } else if (preset === 'TOP5') {
      setSelectedSymbols(assets.slice(0, 5).map((a) => a.symbol));
    } else if (preset === 'L1') {
      const l1s = assets.filter((a) => a.category === 'Layer 1' || a.category === 'Major').map((a) => a.symbol);
      setSelectedSymbols(l1s.length >= 3 ? l1s : assets.slice(0, 6).map((a) => a.symbol));
    } else if (preset === 'DEFI') {
      const defis = assets.filter((a) => a.category === 'DeFi' || a.symbol.includes('LINK') || a.symbol.includes('UNI')).map((a) => a.symbol);
      setSelectedSymbols(defis.length >= 3 ? defis : assets.slice(0, 5).map((a) => a.symbol));
    }
  };

  // Filtered Assets list
  const activeAssets = useMemo(() => {
    return assets.filter((a) => selectedSymbols.includes(a.symbol));
  }, [assets, selectedSymbols]);

  // Lookback candles count based on timeframe
  const lookbackCandles = useMemo(() => {
    switch (timeframe) {
      case '15M': return 25;
      case '1H': return 40;
      case '4H': return 60;
      case '24H': return 90;
      case '7D': return 120;
      default: return 60;
    }
  }, [timeframe]);

  // Compute Correlation Matrix
  const matrixData = useMemo(() => {
    return buildCorrelationMatrix(activeAssets, candleMap, benchmark, lookbackCandles);
  }, [activeAssets, candleMap, benchmark, lookbackCandles]);

  // Detect Market Movement Clusters
  const clusters = useMemo(() => {
    return detectMarketClusters(matrixData, activeAssets, 0.60);
  }, [matrixData, activeAssets]);

  // Find Statistical Arbitrage Pairs
  const arbPairs = useMemo(() => {
    return findStatisticalArbitragePairs(matrixData, candleMap, 0.65);
  }, [matrixData, candleMap]);

  // Cell Color Function
  const getCellColor = (r: number, isDiagonal: boolean) => {
    if (isDiagonal) return 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40 font-bold';
    if (r >= 0.8) return 'bg-emerald-500/40 text-emerald-100 hover:bg-emerald-500/50';
    if (r >= 0.5) return 'bg-emerald-600/30 text-emerald-200 hover:bg-emerald-600/40';
    if (r >= 0.2) return 'bg-teal-700/20 text-teal-200 hover:bg-teal-700/30';
    if (r > -0.2) return 'bg-slate-900/80 text-slate-300 hover:bg-slate-800';
    if (r > -0.5) return 'bg-amber-600/20 text-amber-200 hover:bg-amber-600/30';
    return 'bg-rose-600/30 text-rose-200 hover:bg-rose-600/40';
  };

  // Find the strongest hedge (minimum correlation to portfolio benchmark)
  const bestHedgeAsset = useMemo(() => {
    let minCorr = 1.0;
    let hedgeSym = activeAssets[0]?.symbol || '';
    const btcIdx = matrixData.symbols.indexOf(benchmark);
    if (btcIdx !== -1) {
      matrixData.symbols.forEach((sym, idx) => {
        if (sym !== benchmark) {
          const r = matrixData.matrix[btcIdx][idx];
          if (r < minCorr) {
            minCorr = r;
            hedgeSym = sym;
          }
        }
      });
    }
    return { symbol: hedgeSym, correlation: minCorr };
  }, [matrixData, benchmark, activeAssets]);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Top Controls Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/95 to-indigo-950/40 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono text-xs font-bold flex items-center gap-1.5 shadow-sm">
                <Compass className="h-3.5 w-3.5 text-cyan-400" />
                QUANT CLUSTER RADAR
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Real-Time Pearson Coefficients (r) & Rolling Covariance
              </span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              Crypto Asset Correlation Matrix & Market Movement Clusters
            </h2>
          </div>

          {/* Timeframe & Benchmark Switchers */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
              {(['15M', '1H', '4H', '24H', '7D'] as const).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    timeframe === tf
                      ? 'bg-cyan-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
              <span className="text-slate-400">Benchmark:</span>
              <select
                value={benchmark}
                onChange={(e) => setBenchmark(e.target.value)}
                className="bg-transparent text-cyan-300 font-bold focus:outline-none cursor-pointer"
              >
                {assets.map((a) => (
                  <option key={a.symbol} value={a.symbol} className="bg-slate-900 text-white">
                    {a.symbol}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Quick Filter Presets & Asset Chips */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-mono text-slate-400 mr-1 flex items-center gap-1">
              <Filter className="h-3.5 w-3.5 text-cyan-400" />
              Presets:
            </span>
            {(['ALL', 'L1', 'DEFI', 'TOP5'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => handleSelectPreset(cat)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer border ${
                  selectedCategory === cat
                    ? 'bg-indigo-500/20 border-indigo-400/50 text-indigo-300 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {cat === 'ALL' ? 'All Tokens' : cat === 'L1' ? 'Layer 1s' : cat === 'DEFI' ? 'DeFi' : 'Top 5'}
              </button>
            ))}
          </div>

          {/* Active Asset Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {assets.map((asset) => {
              const isSelected = selectedSymbols.includes(asset.symbol);
              return (
                <button
                  key={asset.symbol}
                  type="button"
                  onClick={() => handleToggleSymbol(asset.symbol)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-mono transition-all cursor-pointer border flex items-center gap-1 ${
                    isSelected
                      ? 'bg-slate-800 border-cyan-500/40 text-cyan-300 font-bold'
                      : 'bg-slate-950/40 border-slate-850 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span>{asset.symbol.split('/')[0]}</span>
                  {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Grid: Correlation Matrix & Cluster Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Interactive NxN Correlation Heatmap */}
        <div className="lg:col-span-8 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-400" />
                NxN Real-Time Correlation Heatmap ({matrixData.symbols.length} Assets)
              </h3>
            </div>

            {/* Heatmap Color Legend */}
            <div className="flex items-center gap-1 text-[10px] font-mono">
              <span className="text-rose-400 font-bold">-1.0 (Inverse)</span>
              <div className="flex h-2.5 w-24 rounded overflow-hidden">
                <span className="flex-1 bg-rose-600" />
                <span className="flex-1 bg-amber-600" />
                <span className="flex-1 bg-slate-800" />
                <span className="flex-1 bg-teal-600" />
                <span className="flex-1 bg-emerald-500" />
              </div>
              <span className="text-emerald-400 font-bold">+1.0 (Synced)</span>
            </div>
          </div>

          {/* Matrix Heatmap Table */}
          <div className="overflow-x-auto pb-2">
            <table className="border-collapse text-xs font-mono w-full min-w-[500px]">
              <thead>
                <tr>
                  <th className="p-2 text-left text-slate-500 text-[11px] font-semibold sticky left-0 bg-slate-900 z-10">
                    Asset
                  </th>
                  {matrixData.symbols.map((sym) => (
                    <th key={sym} className="p-1.5 text-center text-slate-300 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => onSelectSymbol(sym)}
                        className="hover:text-cyan-400 cursor-pointer"
                        title={`Select ${sym} in Trading Desk`}
                      >
                        {sym.split('/')[0]}
                      </button>
                    </th>
                  ))}
                  <th className="p-2 text-center text-slate-400 text-[11px]">Beta (β)</th>
                </tr>
              </thead>
              <tbody>
                {matrixData.symbols.map((symA, i) => (
                  <tr key={symA} className="hover:bg-slate-850/50 transition-colors">
                    {/* Row Header */}
                    <td className="p-2 font-bold text-white whitespace-nowrap sticky left-0 bg-slate-900 z-10 border-r border-slate-800">
                      <button
                        type="button"
                        onClick={() => onSelectSymbol(symA)}
                        className="flex items-center gap-1.5 hover:text-cyan-300 cursor-pointer text-left"
                      >
                        <span className={`h-2 w-2 rounded-full ${
                          (matrixData.changes24h[symA] || 0) >= 0 ? 'bg-emerald-400' : 'bg-rose-400'
                        }`} />
                        <span>{symA.split('/')[0]}</span>
                      </button>
                    </td>

                    {/* Correlation Cells */}
                    {matrixData.symbols.map((symB, j) => {
                      const r = matrixData.matrix[i][j];
                      const isDiagonal = i === j;
                      const isHovered =
                        activeCell?.symA === symA && activeCell?.symB === symB;

                      return (
                        <td key={symB} className="p-1 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveCell({ symA, symB, r, idxA: i, idxB: j })
                            }
                            className={`w-full py-2 px-1 rounded-lg transition-all text-[11px] font-bold border cursor-pointer ${
                              isHovered
                                ? 'ring-2 ring-cyan-400 scale-105 z-10 '
                                : 'border-transparent '
                            }${getCellColor(r, isDiagonal)}`}
                            title={`${symA} vs ${symB}: r = ${r.toFixed(3)}`}
                          >
                            {isDiagonal ? '1.0' : r.toFixed(2)}
                          </button>
                        </td>
                      );
                    })}

                    {/* Benchmark Beta Column */}
                    <td className="p-2 text-center border-l border-slate-800">
                      <span className={`font-bold ${
                        (matrixData.betas[symA] || 1) > 1.3
                          ? 'text-amber-400'
                          : (matrixData.betas[symA] || 1) < 0.8
                          ? 'text-cyan-400'
                          : 'text-slate-300'
                      }`}>
                        {(matrixData.betas[symA] || 1.0).toFixed(2)}x
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Active Cell Inspector */}
          {activeCell && (
            <div className="p-4 rounded-xl bg-slate-950 border border-cyan-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-mono text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-300 font-bold">{activeCell.symA}</span>
                  <span className="text-slate-500">↔</span>
                  <span className="text-indigo-300 font-bold">{activeCell.symB}</span>
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold text-[11px]">
                    Pearson r = {activeCell.r.toFixed(3)}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  {activeCell.r >= 0.7
                    ? 'Strong Positive Synchronization: These assets move in tight lockstep. Avoid pairing together for risk diversification.'
                    : activeCell.r <= -0.3
                    ? 'Inverse Decoupling / Natural Hedge: Excellent counter-trend balance.'
                    : 'Uncorrelated Behavior: Low co-movement offers ideal diversification and independent alpha.'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectSymbol(activeCell.symA)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs cursor-pointer transition-all"
                >
                  View {activeCell.symA.split('/')[0]} Chart
                </button>
                {onApplyPairToBot && (
                  <button
                    type="button"
                    onClick={() => onApplyPairToBot(activeCell.symA, activeCell.symB)}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    <span>Load Pair into Bot</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Market Movement Clusters & Sector Rotation */}
        <div className="lg:col-span-4 space-y-4">
          {/* Movement Clusters Panel */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-400" />
                Detected Movement Clusters ({clusters.length})
              </h3>
              <span className="text-[10px] font-mono text-slate-400">Cohesion r ≥ 0.60</span>
            </div>

            <div className="space-y-3">
              {clusters.map((cluster) => {
                const isBullish = cluster.movementState === 'EXPANDING_BULLISH';
                const isDistributing = cluster.movementState === 'DISTRIBUTING';

                return (
                  <div
                    key={cluster.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/90 space-y-2 hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-white font-mono text-xs">{cluster.name}</div>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                        isBullish
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : isDistributing
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      }`}>
                        {cluster.movementState.replace('_', ' ')}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-tight">
                      {cluster.sentimentDescription}
                    </p>

                    <div className="flex items-center justify-between text-xs font-mono pt-1 text-slate-300">
                      <div>
                        <span className="text-slate-500">Cohesion: </span>
                        <span className="text-cyan-300 font-bold">r = {cluster.avgCorrelation.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Avg Return: </span>
                        <span className={`font-bold ${cluster.avgReturn24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {cluster.avgReturn24h >= 0 ? '+' : ''}{cluster.avgReturn24h.toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    {/* Member Assets Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {cluster.symbols.map((sym) => {
                        const isLeader = sym === cluster.leadingSymbol;
                        return (
                          <button
                            key={sym}
                            type="button"
                            onClick={() => onSelectSymbol(sym)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-all border ${
                              isLeader
                                ? 'bg-amber-500/20 border-amber-400/50 text-amber-200 font-bold'
                                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                            }`}
                            title={isLeader ? 'Cluster Momentum Leader' : 'Cluster Member'}
                          >
                            {sym.split('/')[0]} {isLeader && '★'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Portfolio Diversification & Hedge Insight */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-emerald-400" />
                Best Market Hedge Asset:
              </span>
              <span className="text-emerald-400 font-bold">
                {bestHedgeAsset.symbol.split('/')[0]} (r = {bestHedgeAsset.correlation.toFixed(2)})
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Has the lowest co-movement with {benchmark.split('/')[0]}, providing maximum portfolio diversification against macro market drawdowns.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Section: Pairs Trading & Statistical Arbitrage Divergence Scanner */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-emerald-400" />
              Statistical Arbitrage & Pairs Divergence Scanner
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Detects historically synchronized pairs (r &gt; 0.65) experiencing temporary price divergence (Mean Reversion Alpha)
            </p>
          </div>

          <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30">
            {arbPairs.length} Divergence Opportunities Detected
          </span>
        </div>

        {arbPairs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {arbPairs.slice(0, 6).map((pair) => (
              <div
                key={`${pair.symbolA}-${pair.symbolB}`}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/90 space-y-2 font-mono text-xs hover:border-slate-700 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-white">
                    <span>{pair.symbolA.split('/')[0]}</span>
                    <span className="text-slate-500">/</span>
                    <span>{pair.symbolB.split('/')[0]}</span>
                  </div>
                  <span className="text-[10px] text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                    r = {pair.correlation.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Spread Divergence:</span>
                  <span className={`font-bold ${pair.divergencePercent >= 0 ? 'text-amber-400' : 'text-purple-400'}`}>
                    {pair.divergencePercent >= 0 ? '+' : ''}{pair.divergencePercent.toFixed(2)}% (Z = {pair.currentZScore}σ)
                  </span>
                </div>

                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Mean Reversion Potential:</span>
                  <span className="text-emerald-400 font-bold">~{pair.meanReversionEstimatePercent}%</span>
                </div>

                <div className="pt-1 flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    pair.action === 'LONG_A_SHORT_B'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : pair.action === 'LONG_B_SHORT_A'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {pair.action === 'LONG_A_SHORT_B'
                      ? `Long ${pair.symbolA.split('/')[0]} / Short ${pair.symbolB.split('/')[0]}`
                      : pair.action === 'LONG_B_SHORT_A'
                      ? `Long ${pair.symbolB.split('/')[0]} / Short ${pair.symbolA.split('/')[0]}`
                      : 'Equilibrium Spread'}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectSymbol(pair.symbolA);
                      if (onApplyPairToBot) onApplyPairToBot(pair.symbolA, pair.symbolB);
                    }}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <span>Trade</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-slate-500 font-mono text-xs">
            No severe divergence detected in current lookback window. Correlated assets are tracking in equilibrium.
          </div>
        )}
      </div>
    </div>
  );
};
