import React, { useState, useEffect } from 'react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Brain,
  CheckCircle2,
  ChevronRight,
  Copy,
  Cpu,
  ExternalLink,
  Flame,
  Fuel,
  Gauge,
  Layers,
  Lock,
  Play,
  Radar,
  Radio,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  EtherscanIntelligenceState,
  OnChainTradePattern,
  OnChainTransaction,
  EtherscanAgent,
} from '../types';
import {
  fetchEtherscanLiveFeed,
  syncEtherscanNow,
  toggleOnChainAutoExecution,
  executeOnChainPatternTrade,
  runDeepAgentAnalysis,
  runDeepEtherscanSearch,
} from '../services/etherscanApi';
import { formatCurrency, formatPercent } from '../utils/cryptoMath';

interface EtherscanIntelligencePageProps {
  onBackToTradingDesk: () => void;
  onTradeAsset: (symbol: string) => void;
}

export const EtherscanIntelligencePage: React.FC<EtherscanIntelligencePageProps> = ({
  onBackToTradingDesk,
  onTradeAsset,
}) => {
  const [data, setData] = useState<EtherscanIntelligenceState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [autoExecute, setAutoExecute] = useState(false);
  const [minProfitThreshold, setMinProfitThreshold] = useState(0.01); // 0.01% (zero-loss guarantee, unbounded upside)
  const [txFilter, setTxFilter] = useState<'ALL' | 'WHALE' | 'DEX' | 'SMART'>('ALL');
  const [selectedPattern, setSelectedPattern] = useState<OnChainTradePattern | null>(null);
  const [executionStatusMsg, setExecutionStatusMsg] = useState<string | null>(null);
  const [isExecutingSignal, setIsExecutingSignal] = useState(false);

  // Deep Search Terminal State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<{
    summary: string;
    actionableStrategies: string[];
  } | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Initial and periodic feed polling
  const loadFeed = async () => {
    const feed = await fetchEtherscanLiveFeed();
    if (feed) {
      setData(feed);
      setAutoExecute(feed.autoExecutionEnabled);
      setMinProfitThreshold(
        typeof feed.minProfitThresholdPercent === 'number' && Number.isFinite(feed.minProfitThresholdPercent)
          ? feed.minProfitThresholdPercent
          : 0.25
      );
      if (!selectedPattern && feed.tradePatterns.length > 0) {
        setSelectedPattern(feed.tradePatterns[0]);
      }
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadFeed();
    const interval = setInterval(loadFeed, 3500);
    return () => clearInterval(interval);
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    const updated = await syncEtherscanNow();
    if (updated) setData(updated);
    setIsSyncing(false);
  };

  const handleToggleAutoExecute = async () => {
    const nextState = !autoExecute;
    setAutoExecute(nextState);
    await toggleOnChainAutoExecution(nextState, minProfitThreshold);
  };

  const handleExecutePattern = async (signal: OnChainTradePattern) => {
    setIsExecutingSignal(true);
    setExecutionStatusMsg(`Transmitting order for ${signal.targetAsset} to ${signal.recommendedExchange}...`);
    const res = await executeOnChainPatternTrade(signal.id);
    setIsExecutingSignal(false);
    if (res.success) {
      setExecutionStatusMsg(
        `🟢 Trade Filled on ${res.exchange}! Ref: ${res.orderId || res.receipt?.slice(0, 14)}. ${res.executionNote}`
      );
      loadFeed();
    } else {
      setExecutionStatusMsg(`⚠️ Execution notice: ${res.error || 'Check exchange gateway status'}`);
    }
  };

  const handleRunAiSearch = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const queryToUse = customQuery || searchQuery;
    if (!queryToUse.trim()) return;

    setIsSearching(true);
    const res = await runDeepEtherscanSearch(queryToUse);
    setIsSearching(false);

    if (res.success && res.analysis) {
      setAiAnalysisResult(res.analysis);
      if (res.matchingTransactions && res.matchingTransactions.length > 0 && data) {
        setData({
          ...data,
          liveTransactions: res.matchingTransactions,
        });
      }
    }
  };

  const handleTriggerAgentDeepThink = async () => {
    setIsSearching(true);
    const res = await runDeepAgentAnalysis(
      'Deep scan current Ethereum Mainnet block transactions and Uniswap liquidity pools. Identify highest expected value arbitrage or whale front-run opportunity.'
    );
    setIsSearching(false);
    if (res.success && res.analysis) {
      setAiAnalysisResult(res.analysis);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  // Filtered transactions
  const filteredTxs = (data?.liveTransactions || []).filter((tx) => {
    if (txFilter === 'ALL') return true;
    if (txFilter === 'WHALE') return tx.patternType === 'WHALE_TRANSFER' || tx.valueEth >= 5;
    if (txFilter === 'DEX') return tx.patternType === 'DEX_SWAP';
    if (txFilter === 'SMART') return tx.patternType === 'SMART_ACCUMULATION';
    return true;
  });

  const block = data?.blockSnapshot;

  return (
    <div className="min-h-screen bg-[#070A10] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Banner Navigation & Live Ethereum Radar Bar */}
      <div className="border-b border-slate-800 bg-[#0B0F17]/95 backdrop-blur-md sticky top-0 z-40 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Left: Back button & Breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToTradingDesk}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer shadow-sm"
            >
              <ArrowRight className="h-3.5 w-3.5 rotate-180" />
              <span>Trading Desk</span>
            </button>

            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400 border border-indigo-500/30">
                <Radar className="h-4 w-4 animate-spin-slow" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                    ETHERSCAN ON-CHAIN INTELLIGENCE
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                      5 AGENTS ACTIVE
                    </span>
                  </h1>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                  <span>Ethereum Mainnet Real-Time Feed</span>
                  <span aria-hidden="true">·</span>
                  <span>Whale Inflow & MEV Arbitrage Detector</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Live Block & Gas Metrics */}
          <div className="flex items-center gap-3 text-xs font-mono">
            {/* Live Block Number */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900/90 border border-slate-800">
              <Radio className="h-3 w-3 text-emerald-400 animate-pulse" />
              <span className="text-slate-400 text-[11px]">Block:</span>
              <a
                href={block ? `https://etherscan.io/block/${block.blockNumber}` : 'https://etherscan.io'}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-white hover:text-cyan-400 flex items-center gap-1"
                title="View latest block on Etherscan"
              >
                {block ? `#${block.blockNumber}` : 'no data'}
                <ExternalLink className="h-2.5 w-2.5 text-slate-500" />
              </a>
            </div>

            {data?.error && (
              <div className="px-3 py-1 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-[11px] font-mono">
                Etherscan: {data.error}
              </div>
            )}

            {/* Live Gas Oracle */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900/90 border border-slate-800">
              <Fuel className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-slate-400 text-[11px]">Gas:</span>
              <span className="font-bold text-amber-300">
                {block ? `${block.baseFeeGwei.toFixed(3)} Gwei` : 'no data'}
              </span>
            </div>

            {/* Builder identification */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900/90 border border-slate-800">
              <Cpu className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-slate-400 text-[11px]">Builder:</span>
              <span className="text-slate-200">{block?.builderName ?? 'no data'}</span>
            </div>

            {/* Manual Sync Button */}
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
              title="Sync latest on-chain block"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto w-full px-4 py-5 flex flex-col gap-6">
        {/* Automation Master Controller Banner */}
        <div className="rounded-2xl bg-gradient-to-r from-indigo-950/40 via-slate-900/80 to-purple-950/40 border border-indigo-500/30 p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/40">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide">
                  AUTOMATED ON-CHAIN TRADE EXECUTION
                </h2>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-md ${
                    autoExecute
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {autoExecute ? 'ACTIVE · AUTO-TRADING LIVE' : 'STANDBY · MANUAL APPROVAL'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatically routes trades to NonKYC, Kraken, Binance, or Coinbase when on-chain net profit threshold is satisfied.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            {/* Profit threshold selector */}
            <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl">
              <span className="text-slate-400">Min Net Profit:</span>
              <select
                value={Number.isFinite(minProfitThreshold) ? minProfitThreshold : 0.01}
                onChange={(e) => setMinProfitThreshold(parseFloat(e.target.value))}
                className="bg-slate-950 border border-slate-700 text-cyan-300 font-bold rounded px-2 py-0.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value={0.01}>+0.01% (Zero Loss · Unbounded Upside)</option>
                <option value={0.05}>+0.05% (Fast Inflow)</option>
                <option value={0.15}>+0.15% (Ultra-Aggressive)</option>
                <option value={0.25}>+0.25% (Standard)</option>
                <option value={0.5}>+0.50% (High Confidence)</option>
                <option value={1.0}>+1.00% (Whale Only)</option>
              </select>
              <span className="text-[10px] text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30">
                Max: ∞ Unbounded
              </span>
            </div>

            {/* Toggle Button */}
            <button
              onClick={handleToggleAutoExecute}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md ${
                autoExecute
                  ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20 animate-pulse'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${autoExecute ? 'bg-white' : 'bg-slate-950'}`}
              />
              <span>{autoExecute ? 'PAUSE AUTO-TRADING' : 'ENABLE AUTO-TRADING'}</span>
            </button>
          </div>
        </div>

        {/* Execution Status Toast / Notification */}
        {executionStatusMsg && (
          <div className="rounded-xl bg-slate-900/90 border border-cyan-500/50 p-3 text-xs font-mono text-cyan-200 flex items-center justify-between gap-3 shadow-lg animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-cyan-400" />
              <span>{executionStatusMsg}</span>
            </div>
            <button
              onClick={() => setExecutionStatusMsg(null)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* Section 1: The 5 Autonomous Specialist Agents Swarm */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-indigo-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Specialized On-Chain AI Agent Swarm (5 Autonomous Specialists)
              </h3>
            </div>
            <button
              onClick={handleTriggerAgentDeepThink}
              disabled={isSearching}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 text-xs font-semibold transition-all cursor-pointer"
            >
              <Sparkles className="h-3 w-3 text-indigo-400" />
              <span>{isSearching ? 'Synthesizing...' : 'Trigger Deep Swarm Audit'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {(data?.agents || []).map((agent) => (
              <div
                key={agent.id}
                className="rounded-xl bg-slate-900/70 border border-slate-800 p-3.5 flex flex-col justify-between gap-3 hover:border-slate-700 transition-all shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-bold text-white truncate">{agent.name}</span>
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                    {agent.role}
                  </p>
                </div>

                <div className="pt-2.5 border-t border-slate-800/80">
                  <div className="text-[10px] font-mono uppercase text-slate-500 mb-1">
                    Current Focus:
                  </div>
                  <div className="text-[11px] font-mono text-cyan-300 truncate">
                    {agent.currentFocus}
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2">
                    <span>Signals: <strong className="text-white">{agent.signalsFoundCount}</strong></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: High-Profit Trade Patterns & Automated Execution Opportunities */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Real-Time Profitable Trade Patterns Discovered on Etherscan
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Live algorithmic pattern matching against CEX/DEX order books
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {(data?.tradePatterns || []).map((pattern) => {
              const isSelected = selectedPattern?.id === pattern.id;
              return (
                <div
                  key={pattern.id}
                  onClick={() => setSelectedPattern(pattern)}
                  className={`rounded-2xl p-4 border transition-all cursor-pointer flex flex-col justify-between gap-4 shadow-md ${
                    isSelected
                      ? 'bg-slate-900 border-cyan-500/80 ring-1 ring-cyan-500/40 shadow-cyan-500/10'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/90'
                  }`}
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-white">
                          {pattern.targetAsset}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                          +{pattern.expectedProfitPercent}% Net ROI
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-cyan-400 font-semibold">
                        {pattern.winProbability}% Win Prob
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-slate-200 mb-1.5">{pattern.title}</h4>

                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                      {pattern.reason}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400">Route via:</span>
                      <span className="text-white font-bold px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                        {pattern.recommendedExchange}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={pattern.etherscanUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 font-mono"
                      >
                        <span>Etherscan Proof</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExecutePattern(pattern);
                        }}
                        disabled={isExecutingSignal}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs transition-all cursor-pointer shadow-sm active:scale-95"
                      >
                        <Play className="h-3 w-3 fill-slate-950" />
                        <span>Execute Trade</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 3: Deep Etherscan Natural Language Search & AI Terminal */}
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-cyan-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Deep Etherscan On-Chain Search & Gemini Reasoning Terminal
              </h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Powered by Gemini 3.8 Flash & Ethereum Mainnet RPC
            </span>
          </div>

          <form onSubmit={handleRunAiSearch} className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[280px]">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Ask or search Etherscan (e.g., 'Find all PEPE transactions above $100k', 'Analyze Wintermute token flow', 'Find highest ROI spatial arb')..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{isSearching ? 'Analyzing On-Chain Data...' : 'Analyze On-Chain'}</span>
            </button>
          </form>

          {/* Quick Search Badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-4">
            <span className="text-[11px] font-mono text-slate-500">Quick Searches:</span>
            <button
              onClick={() => handleRunAiSearch(undefined, 'Find largest whale accumulation in PEPE and ETH')}
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
            >
              Whale Accumulation (PEPE/ETH)
            </button>
            <button
              onClick={() => handleRunAiSearch(undefined, 'Analyze NonKYC vs Uniswap V3 spatial arbitrage spreads')}
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
            >
              NonKYC vs Uniswap V3 Arb
            </button>
            <button
              onClick={() => handleRunAiSearch(undefined, 'Check Wintermute & Justin Sun latest wallet token movements')}
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
            >
              Wintermute & Smart Money
            </button>
            <button
              onClick={() => handleRunAiSearch(undefined, 'Analyze Ethereum gas base fee trends for zero-slippage execution')}
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
            >
              Gas Base Fee Sniping
            </button>
          </div>

          {/* AI Analysis Summary Box if available */}
          {aiAnalysisResult && (
            <div className="rounded-xl bg-slate-950/80 border border-indigo-500/40 p-4 text-xs font-mono flex flex-col gap-3 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-indigo-300 font-bold flex items-center gap-1.5">
                  <Brain className="h-4 w-4" />
                  AI QUANT SYNTHESIS RESULT
                </span>
              </div>

              <p className="text-slate-300 leading-relaxed whitespace-pre-line text-xs font-sans">
                {aiAnalysisResult.summary}
              </p>

              <div className="pt-2 border-t border-slate-800">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">
                  Actionable Automated Strategies:
                </div>
                <div className="flex flex-col gap-1.5">
                  {aiAnalysisResult.actionableStrategies.map((strat, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-cyan-300">
                      <ChevronRight className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
                      <span>{strat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 4: Live Ethereum Mainnet & Etherscan Transaction Stream */}
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Live Ethereum Mainnet Transaction Stream (Direct Etherscan Links)
              </h3>
            </div>

            {/* Transaction Type Filters */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
              <button
                onClick={() => setTxFilter('ALL')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  txFilter === 'ALL'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All Txs ({data?.liveTransactions?.length || 0})
              </button>
              <button
                onClick={() => setTxFilter('WHALE')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  txFilter === 'WHALE'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Whale Moves
              </button>
              <button
                onClick={() => setTxFilter('DEX')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  txFilter === 'DEX'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Uniswap Swaps
              </button>
              <button
                onClick={() => setTxFilter('SMART')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  txFilter === 'SMART'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Smart Money
              </button>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase">
                  <th className="py-2.5 px-3">Tx Hash</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">From / To</th>
                  <th className="py-2.5 px-3 text-right">Value (ETH)</th>
                  <th className="py-2.5 px-3 text-right">Value (USD)</th>
                  <th className="py-2.5 px-3 text-right">Gas (Gwei)</th>
                  <th className="py-2.5 px-3 text-right">Etherscan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredTxs.map((tx) => (
                  <tr key={tx.hash} className="hover:bg-slate-850/50 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white">
                          {tx.hash.slice(0, 8)}...{tx.hash.slice(-6)}
                        </span>
                        <button
                          onClick={() => handleCopy(tx.hash)}
                          className="text-slate-500 hover:text-slate-300"
                          title="Copy hash"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        {copiedHash === tx.hash && (
                          <span className="text-[10px] text-emerald-400">Copied!</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                          tx.patternType === 'SMART_ACCUMULATION'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : tx.patternType === 'DEX_SWAP'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : tx.patternType === 'WHALE_TRANSFER'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {tx.patternType.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-slate-300">
                      <div className="flex flex-col">
                        <span className="text-white font-medium">
                          {tx.fromLabel || `${tx.from.slice(0, 6)}...${tx.from.slice(-4)}`}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          → {tx.toLabel || `${tx.to.slice(0, 6)}...${tx.to.slice(-4)}`}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-white">
                      {tx.valueEth.toFixed(4)} ETH
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-emerald-400">
                      ${tx.valueUsd.toLocaleString()}
                    </td>

                    <td className="py-3 px-3 text-right text-slate-400">
                      {tx.gasPriceGwei.toFixed(2)}
                    </td>

                    <td className="py-3 px-3 text-right">
                      <a
                        href={tx.etherscanUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 text-xs font-semibold transition-colors"
                      >
                        <span>View</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))}

                {filteredTxs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                      No on-chain transactions matching the selected filter in current block snapshot.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
