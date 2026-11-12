import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Filter,
  Flame,
  Globe,
  MessageCircle,
  MessageSquare,
  Newspaper,
  PlusCircle,
  Radio,
  RefreshCw,
  Send,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import {
  AssetSentimentSummary,
  SentimentBotMode,
  SentimentCategory,
  SentimentFeedItem,
  SentimentIntelligenceReport,
  StrategyConfig,
} from '../types';

interface SentimentAnalysisPanelProps {
  report: SentimentIntelligenceReport | null;
  loading: boolean;
  onRefresh: () => void;
  onTriggerAiAnalysis: (customQuery?: string) => Promise<void>;
  strategy: StrategyConfig;
  onUpdateStrategy: (updates: Partial<StrategyConfig>) => void;
  selectedAssetSymbol?: string;
  onSelectAsset?: (symbol: string) => void;
}

export const SentimentAnalysisPanel: React.FC<SentimentAnalysisPanelProps> = ({
  report,
  loading,
  onRefresh,
  onTriggerAiAnalysis,
  strategy,
  onUpdateStrategy,
  selectedAssetSymbol = 'BTC/USDT',
  onSelectAsset,
}) => {
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'NEWS' | 'SOCIAL' | 'POSITIVE' | 'NEGATIVE'>('ALL');
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');


  const cleanAsset = selectedAssetSymbol.split('/')[0] || 'BTC';

  const handleRunAi = async () => {
    try {
      setAnalyzingAi(true);
      await onTriggerAiAnalysis(customPrompt || undefined);
      setCustomPrompt('');
    } finally {
      setAnalyzingAi(false);
    }
  };

  // Filter feed items
  const filteredFeed = (report?.feed || []).filter((item) => {
    if (sourceFilter === 'NEWS') {
      return ['COINDESK', 'COINTELEGRAPH', 'BLOOMBERG', 'DECRYPT', 'NEWS'].includes(item.source);
    }
    if (sourceFilter === 'SOCIAL') {
      return ['TWITTER', 'REDDIT', 'TELEGRAM'].includes(item.source);
    }
    if (sourceFilter === 'POSITIVE') {
      return item.sentiment === 'POSITIVE';
    }
    if (sourceFilter === 'NEGATIVE') {
      return item.sentiment === 'NEGATIVE';
    }
    return true;
  });

  const fearGreed = report?.fearGreedIndex ?? 50;
  const composite = report?.compositeScore ?? 0;

  const getFearGreedColor = (val: number) => {
    if (val >= 75) return 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
    if (val >= 55) return 'text-teal-300 border-teal-500/40 bg-teal-500/10';
    if (val >= 45) return 'text-amber-300 border-amber-500/40 bg-amber-500/10';
    if (val >= 25) return 'text-orange-400 border-orange-500/40 bg-orange-500/10';
    return 'text-rose-400 border-rose-500/40 bg-rose-500/10';
  };

  const getSourceIcon = (source: SentimentFeedItem['source']) => {
    switch (source) {
      case 'TWITTER':
        return <span className="font-bold text-sky-400">𝕏</span>;
      case 'REDDIT':
        return <span className="font-bold text-orange-500">🤖</span>;
      case 'TELEGRAM':
        return <span className="font-bold text-blue-400">✈️</span>;
      case 'BLOOMBERG':
        return <span className="font-bold text-purple-400">BBG</span>;
      case 'COINDESK':
      case 'COINTELEGRAPH':
      case 'DECRYPT':
      default:
        return <Newspaper className="h-3.5 w-3.5 text-cyan-400" />;
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* TOP HERO: SENTIMENT INTELLIGENCE & AGENT DECISION BAR */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-950 to-indigo-950/40 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          {/* Title & Fear/Greed Meter */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-500/20 text-pink-400 border border-pink-500/30 shadow-sm">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                  AI Sentiment Analysis & Social Media Radar
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/40 font-mono">
                    GEMINI-3.8-FLASH NLP
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Continuous multi-source surveillance of crypto news, Twitter/X momentum, Reddit sentiment, and institutional ETF headlines.
                </p>
              </div>
            </div>

            {/* Fear & Greed Dial Summary */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <div className={`px-3 py-1.5 rounded-xl border font-mono text-xs font-bold flex items-center gap-2 ${getFearGreedColor(fearGreed)}`}>
                <Flame className="h-4 w-4" />
                <span>
                  Fear & Greed Index: {fearGreed}/100 ({report?.fearGreedLabel?.replace('_', ' ') || 'NEUTRAL'})
                </span>
              </div>

              <div className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950/70 text-slate-300 font-mono text-xs flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-400" />
                <span>Composite Mood:</span>
                <strong className={composite >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {composite > 0 ? `+${composite}` : composite} / 100 ({report?.overallSentiment || 'NEUTRAL'})
                </strong>
              </div>

              <div className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950/70 text-slate-300 font-mono text-xs flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
                <span>News Velocity:</span>
                <strong className="text-white">{report ? `${report.socialVelocityPostsPerMin} articles/min (last hour)` : 'n/a'}</strong>
              </div>
            </div>
          </div>

          {/* Action Controls: Refresh, AI Analysis, Simulate Event */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-center shrink-0">
            <button
              onClick={handleRunAi}
              disabled={analyzingAi || loading}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-pink-500/20 to-purple-500/20 hover:from-pink-500/30 hover:to-purple-500/30 border border-pink-500/40 text-pink-300 font-bold text-xs flex items-center gap-2 cursor-pointer shadow-md transition-all active:scale-95"
              title="Execute fresh Gemini 3.8 Flash analysis across live market streams"
            >
              <Sparkles className={`h-4 w-4 text-pink-400 ${analyzingAi ? 'animate-spin' : ''}`} />
              <span>{analyzingAi ? 'Analyzing Gemini Feed...' : 'AI Analyze Market'}</span>
            </button>

            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              title="Sync latest live sentiment feeds"
            >
              <RefreshCw className={`h-4 w-4 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* AGENT TRADING DIRECTIVE BANNER: HOW SENTIMENT INFORMS ORDERS */}
        <div className="mt-4 p-4 rounded-xl bg-slate-950/80 border border-slate-800/90 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-inner">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                <BrainCircuit className="h-3.5 w-3.5" />
                Active Agent Decision Directive (Sentiment Informed)
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${
                report?.tradingDirective.bias.includes('BUY')
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : report?.tradingDirective.bias.includes('SELL')
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}>
                {report?.tradingDirective.bias || 'HOLD'} ({report?.tradingDirective.confidencePercent || 75}% Confidence)
              </span>
            </div>

            <p className="text-xs text-slate-300 font-sans leading-relaxed">
              {report?.tradingDirective.reasoning ||
                'Market sentiment is balanced. The trading agent allows standard technical entries while factoring in social velocity.'}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono text-slate-400">
              <span className="flex items-center gap-1">
                {report?.tradingDirective.sentimentGateStatus === 'ALLOW_BUY' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : report?.tradingDirective.sentimentGateStatus === 'SUPPRESS_BUY' ? (
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                ) : report?.tradingDirective.sentimentGateStatus === 'FORCE_SELL_RISK' ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                ) : (
                  <Activity className="h-3.5 w-3.5 text-slate-400" />
                )}
                <span>Gate Status: </span>
                <strong className="text-white">{report?.tradingDirective.sentimentGateStatus || 'ALLOW_BUY'}</strong>
              </span>

              <span>•</span>

              <span>
                Position Sizing Multiplier:{' '}
                <strong className="text-cyan-300 font-bold">
                  {report?.tradingDirective.recommendedPositionMultiplier?.toFixed(2) || '1.00'}x
                </strong>
              </span>
            </div>
          </div>

          {/* Bot Sentiment Mode Controls */}
          <div className="shrink-0 p-3 rounded-xl bg-slate-900 border border-slate-800/80 space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-400 text-[11px] flex items-center gap-1">
                <Sliders className="h-3 w-3 text-cyan-400" />
                Bot Sentiment Integration:
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateStrategy({
                    sentimentIntegrationEnabled: !(strategy.sentimentIntegrationEnabled ?? true),
                  })
                }
                className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all ${
                  (strategy.sentimentIntegrationEnabled ?? true)
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-800 text-slate-500 border border-slate-700'
                }`}
              >
                {(strategy.sentimentIntegrationEnabled ?? true) ? 'ACTIVE' : 'BYPASSED'}
              </button>
            </div>

            <div className="flex items-center gap-1">
              {(['CONFIRMATORY', 'WEIGHTED_CONFLUENCE', 'CONTRARIAN', 'OFF'] as SentimentBotMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onUpdateStrategy({ sentimentMode: mode })}
                  className={`px-2 py-1 rounded text-[10px] font-mono cursor-pointer transition-all ${
                    (strategy.sentimentMode || 'CONFIRMATORY') === mode
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode === 'WEIGHTED_CONFLUENCE' ? 'WEIGHTED' : mode}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ASSET SENTIMENT MATRIX */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-cyan-400" />
            Asset Sentiment Radar Breakdown (BTC, ETH, SOL, XRP)
          </span>
          <span className="text-[11px] font-mono text-slate-500">
            Click asset card to synchronize Trading Desk chart
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {report?.assetBreakdown && Object.keys(report.assetBreakdown).length > 0 ? (
            Object.entries(report.assetBreakdown).map(([sym, item]) => {
              const isSelected = cleanAsset === sym;
              const isBull = item.score > 0;
              const isStrong = Math.abs(item.score) >= 40;

              return (
                <div
                  key={sym}
                  onClick={() => onSelectAsset && onSelectAsset(`${sym}/USDT`)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 border-cyan-500/60 shadow-lg shadow-cyan-500/10'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <strong className="text-sm font-sans text-white">{sym}</strong>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400">
                        {item.sampleCount} signals
                      </span>
                    </div>

                    <div className={`px-2 py-0.5 rounded-md font-mono text-xs font-bold flex items-center gap-1 ${
                      isBull ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
                    }`}>
                      {isBull ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                      <span>{isBull ? `+${item.score}` : item.score}</span>
                    </div>
                  </div>

                  {/* Distribution Bar */}
                  <div className="mt-2.5 space-y-1">
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                      <div style={{ width: `${item.bullishPercent}%` }} className="bg-emerald-500 h-full" />
                      <div style={{ width: `${item.neutralPercent}%` }} className="bg-slate-500 h-full" />
                      <div style={{ width: `${item.bearishPercent}%` }} className="bg-rose-500 h-full" />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span className="text-emerald-400">{item.bullishPercent}% Bull</span>
                      <span className="text-slate-500">{item.neutralPercent}% Neu</span>
                      <span className="text-rose-400">{item.bearishPercent}% Bear</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 mt-2 line-clamp-1 italic font-sans">
                    "{item.topHeadline}"
                  </p>
                </div>
              );
            })
          ) : (
            <div className="col-span-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400 font-mono">
              Collecting asset sentiment data streams...
            </div>
          )}
        </div>
      </div>

      {/* FEED FILTER BAR & LIVE NEWS/SOCIAL STREAM */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-400">Stream Filter:</span>
            {(['ALL', 'NEWS', 'SOCIAL', 'POSITIVE', 'NEGATIVE'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setSourceFilter(filter)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                  sourceFilter === filter
                    ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {filter === 'ALL'
                  ? `All Streams (${report?.feed?.length || 0})`
                  : filter === 'NEWS'
                  ? 'News Outlets'
                  : filter === 'SOCIAL'
                  ? 'X / Reddit / TG'
                  : filter}
              </button>
            ))}
          </div>

          <span className="text-[11px] font-mono text-slate-500">
            Updated {report?.timestamp ? new Date(report.timestamp).toLocaleTimeString() : 'just now'}
          </span>
        </div>

        {/* FEED ITEMS LIST */}
        <div className="space-y-2.5 max-h-[550px] overflow-y-auto pr-1">
          {filteredFeed.map((item) => {
            const isPos = item.sentiment === 'POSITIVE';
            const isNeg = item.sentiment === 'NEGATIVE';

            return (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 transition-all space-y-2"
              >
                {/* Header: Source, Author, Timestamp & Sentiment Tag */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-xs">
                      {getSourceIcon(item.source)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <strong className="text-white font-sans">{item.author}</strong>
                        {item.authorHandle && <span className="text-slate-500 font-mono text-[11px]">{item.authorHandle}</span>}
                        <span className="text-slate-600">•</span>
                        <span className="text-[11px] font-mono text-slate-400">{item.sourceName}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div
                      className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-bold border flex items-center gap-1 ${
                        isPos
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : isNeg
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {isPos ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : isNeg ? (
                        <TrendingDown className="h-3 w-3" />
                      ) : (
                        <Activity className="h-3 w-3" />
                      )}
                      <span>
                        {isPos ? `+${item.score}` : item.score} {item.sentiment}
                      </span>
                    </div>

                    <span className="text-[10px] font-mono text-slate-500">
                      {Math.max(1, Math.round((Date.now() - item.timestamp) / 60000))}m ago
                    </span>
                  </div>
                </div>

                {/* Title & Content */}
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-100 font-sans leading-snug">
                    {item.title}
                  </h4>
                  <p className="text-xs text-slate-400 font-sans mt-1 leading-relaxed">
                    {item.content}
                  </p>
                </div>

                {/* Footer Badges & Engagement */}
                <div className="pt-1.5 border-t border-slate-900 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {item.relatedAssets.map((asset) => (
                      <span
                        key={asset}
                        className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300 font-bold text-[10px]"
                      >
                        ${asset}
                      </span>
                    ))}

                    {item.keyTopics.map((topic, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 text-[10px]">
                        #{topic}
                      </span>
                    ))}

                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      item.marketImpact === 'HIGH'
                        ? 'bg-rose-950/40 text-rose-300 border border-rose-500/30'
                        : item.marketImpact === 'MEDIUM'
                        ? 'bg-amber-950/40 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-900 text-slate-400'
                    }`}>
                      {item.marketImpact} IMPACT
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-slate-500">
                    {item.upvotesOrLikes !== undefined && (
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" /> {item.upvotesOrLikes}
                      </span>
                    )}
                    {item.sharesOrRetweets !== undefined && (
                      <span className="flex items-center gap-1">
                        <Share2 className="h-3 w-3" /> {item.sharesOrRetweets}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
