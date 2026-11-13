import express, { type Request, type Response } from 'express';
import { GoogleGenAI } from '@google/genai';

export const sentimentRouter = express.Router();

let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-sentiment-agent',
        },
      },
    });
  }
  return aiClient;
}

export type SentimentCategory = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
export type SentimentMarketImpact = 'HIGH' | 'MEDIUM' | 'LOW';
export type SentimentTradingBias = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';

export interface SentimentFeedItem {
  id: string;
  source: 'COINDESK' | 'COINTELEGRAPH' | 'BLOOMBERG' | 'DECRYPT' | 'NEWS';
  sourceName: string;
  author: string;
  authorHandle?: string;
  title: string;
  content: string;
  url?: string;
  timestamp: number;
  sentiment: SentimentCategory;
  score: number; // -100 to +100
  confidence: number; // 0 to 100%
  relatedAssets: string[];
  keyTopics: string[];
  marketImpact: SentimentMarketImpact;
  tradingRecommendation: 'BUY_BIAS' | 'SELL_BIAS' | 'NEUTRAL_WAIT';
}

export interface AssetSentimentSummary {
  symbol: string;
  sentiment: SentimentCategory;
  score: number;
  sampleCount: number;
  bullishPercent: number;
  bearishPercent: number;
  neutralPercent: number;
  bias: SentimentTradingBias;
  velocity: 'HIGH' | 'NORMAL' | 'SURGING';
  topHeadline: string;
  lastUpdated: number;
}

export interface SentimentIntelligenceReport {
  timestamp: number;
  compositeScore: number;
  overallSentiment: SentimentCategory;
  fearGreedIndex: number;
  fearGreedLabel: 'EXTREME_FEAR' | 'FEAR' | 'NEUTRAL' | 'GREED' | 'EXTREME_GREED';
  socialVelocityPostsPerMin: number; // real articles/min over the last hour (news cadence)
  bullishSignalsCount: number;
  bearishSignalsCount: number;
  neutralSignalsCount: number;
  topTrendingTopics: Array<{ topic: string; count: number; sentiment: SentimentCategory }>;
  assetBreakdown: Record<string, AssetSentimentSummary>;
  feed: SentimentFeedItem[];
  tradingDirective: {
    bias: SentimentTradingBias;
    confidencePercent: number;
    reasoning: string;
    recommendedPositionMultiplier: number;
    sentimentGateStatus: 'ALLOW_BUY' | 'SUPPRESS_BUY' | 'FORCE_SELL_RISK' | 'HOLD_NEUTRAL';
  };
  aiModelUsed: string;
  isAiAnalyzed: boolean;
}

// ----------------------------------------------------------------------------
// Real data only:
//  - Headlines: CryptoCompare public news API (real articles, real timestamps and URLs)
//  - Fear & Greed: alternative.me index (the published value, not derived from our own scores)
//  - Per-article scoring: Gemini scores the REAL headlines (it is never asked to invent any).
// If any of these is unavailable the endpoints return an error. There is no seeded or canned feed.
// ----------------------------------------------------------------------------
const NEWS_URL = 'https://min-api.cryptocompare.com/data/v2/news/?lang=EN';
const FNG_URL = 'https://api.alternative.me/fng/?limit=1';
const CACHE_TTL_MS = 5 * 60 * 1000;
const KNOWN_TICKERS = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'LINK', 'AVAX', 'DOT', 'LTC', 'BNB', 'USDT', 'USDC', 'PEPE', 'SHIB', 'XMR', 'TRX', 'ARB', 'OP', 'UNI', 'AAVE']);

let lastReport: SentimentIntelligenceReport | null = null;
let lastReportAt = 0;

async function fetchJson(url: string): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'TRAIDS-AGAIN/1.0' } });
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function mapPublisher(name: string): SentimentFeedItem['source'] {
  const n = (name || '').toLowerCase();
  if (n.includes('coindesk')) return 'COINDESK';
  if (n.includes('cointelegraph')) return 'COINTELEGRAPH';
  if (n.includes('bloomberg')) return 'BLOOMBERG';
  if (n.includes('decrypt')) return 'DECRYPT';
  return 'NEWS';
}

async function buildReport(customAsset?: string): Promise<SentimentIntelligenceReport> {
  const ai = getGenAI();
  if (!ai) throw new Error('GEMINI_API_KEY is not configured; cannot score headlines.');

  const [news, fng] = await Promise.all([fetchJson(NEWS_URL), fetchJson(FNG_URL)]);
  const articles: any[] = Array.isArray(news?.Data) ? news.Data.slice(0, 25) : [];
  if (articles.length === 0) throw new Error('News API returned no articles.');
  const fngRow = fng?.data?.[0];
  const fearGreedIndex = Number(fngRow?.value);
  if (!Number.isFinite(fearGreedIndex)) throw new Error('Fear & Greed index unavailable.');

  const prompt = `Score each REAL crypto news article below for market sentiment. Do not add, remove or invent articles.
Return ONLY a JSON array, one object per input id, matching exactly:
[{"id": string, "sentiment": "POSITIVE"|"NEGATIVE"|"NEUTRAL", "score": number -100..100, "confidence": number 0..100, "marketImpact": "HIGH"|"MEDIUM"|"LOW", "keyTopics": string[] (max 3)}]
Articles:
${JSON.stringify(articles.map((a) => ({ id: String(a.id), title: a.title, body: String(a.body || '').slice(0, 400) })))}`;

  let response: any = null;
  let usedModel = 'gemini-4-hydrogen';
  let lastErr: any = null;
  for (const model of ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']) {
    try {
      usedModel = model;
      response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      if (response?.text) break;
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || '');
      if (!/503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|TIMEOUT/i.test(msg)) {
        throw err;
      }
    }
  }
  if (!response?.text) {
    throw lastErr || new Error('Gemini returned empty scoring output.');
  }
  let scored: any[];
  try {
    scored = JSON.parse(response.text || '');
  } catch {
    throw new Error('Gemini returned unparseable scoring output.');
  }
  if (!Array.isArray(scored)) throw new Error('Gemini scoring output was not an array.');
  const byId = new Map(scored.map((x: any) => [String(x.id), x]));

  const feed: SentimentFeedItem[] = [];
  for (const a of articles) {
    const sc = byId.get(String(a.id));
    // Articles Gemini did not score are dropped, never given a default score.
    if (!sc || !Number.isFinite(Number(sc.score)) || !Number.isFinite(Number(sc.confidence))) continue;
    const cats = String(a.categories || '').split('|').map((c: string) => c.trim().toUpperCase());
    const related = cats.filter((c: string) => KNOWN_TICKERS.has(c));
    feed.push({
      id: `news-${a.id}`,
      source: mapPublisher(a.source_info?.name || a.source),
      sourceName: a.source_info?.name || a.source || 'News',
      author: a.source_info?.name || a.source || 'News',
      title: a.title,
      content: String(a.body || a.title).slice(0, 400),
      url: a.url,
      timestamp: Number(a.published_on) * 1000,
      sentiment: sc.sentiment,
      score: Math.max(-100, Math.min(100, Number(sc.score))),
      confidence: Math.max(0, Math.min(100, Number(sc.confidence))),
      relatedAssets: related,
      keyTopics: Array.isArray(sc.keyTopics) ? sc.keyTopics.slice(0, 3) : [],
      marketImpact: sc.marketImpact,
      tradingRecommendation: sc.score > 15 ? 'BUY_BIAS' : sc.score < -15 ? 'SELL_BIAS' : 'NEUTRAL_WAIT',
    });
  }
  if (feed.length === 0) throw new Error('No articles could be scored.');

  const visible = customAsset ? feed.filter((f) => f.relatedAssets.includes(customAsset.toUpperCase())) : feed;
  if (visible.length === 0) throw new Error(`No scored articles mention ${customAsset}.`);
  const report = computeSentimentReport(visible, true, usedModel);
  report.fearGreedIndex = Math.round(fearGreedIndex);
  report.fearGreedLabel = ({ 'Extreme Fear': 'EXTREME_FEAR', Fear: 'FEAR', Neutral: 'NEUTRAL', Greed: 'GREED', 'Extreme Greed': 'EXTREME_GREED' } as const)[fngRow.value_classification as string] ?? (
    fearGreedIndex >= 75 ? 'EXTREME_GREED' : fearGreedIndex >= 55 ? 'GREED' : fearGreedIndex >= 45 ? 'NEUTRAL' : fearGreedIndex >= 25 ? 'FEAR' : 'EXTREME_FEAR');
  return report;
}

function computeSentimentReport(feed: SentimentFeedItem[], isAiAnalyzed = false, aiModelUsed = 'gemini-4-hydrogen'): SentimentIntelligenceReport {
  let totalWeightedScore = 0;
  let totalWeight = 0;
  let totalConfidence = 0;
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;

  const assetBuckets: Record<string, { scores: number[]; count: number; headlines: string[] }> = {};
  const topicCounts: Record<string, { count: number; sentiments: SentimentCategory[] }> = {};

  feed.forEach((item) => {
    const impactWeight = item.marketImpact === 'HIGH' ? 2.5 : item.marketImpact === 'MEDIUM' ? 1.5 : 1.0;
    const itemWeight = impactWeight * (item.confidence / 100);
    totalWeightedScore += item.score * itemWeight;
    totalWeight += itemWeight;
    totalConfidence += item.confidence;

    if (item.sentiment === 'POSITIVE') bullish++;
    else if (item.sentiment === 'NEGATIVE') bearish++;
    else neutral++;

    item.relatedAssets.forEach((asset) => {
      const clean = asset.toUpperCase().trim();
      if (!assetBuckets[clean]) assetBuckets[clean] = { scores: [], count: 0, headlines: [] };
      assetBuckets[clean].scores.push(item.score);
      assetBuckets[clean].count++;
      assetBuckets[clean].headlines.push(item.title);
    });

    item.keyTopics.forEach((t) => {
      if (!topicCounts[t]) topicCounts[t] = { count: 0, sentiments: [] };
      topicCounts[t].count++;
      topicCounts[t].sentiments.push(item.sentiment);
    });
  });

  const compositeScore = Math.max(-100, Math.min(100, Math.round(totalWeightedScore / totalWeight)));
  const overallSentiment: SentimentCategory = compositeScore >= 20 ? 'POSITIVE' : compositeScore <= -20 ? 'NEGATIVE' : 'NEUTRAL';

  const assetBreakdown: Record<string, AssetSentimentSummary> = {};
  for (const [symbol, data] of Object.entries(assetBuckets)) {
    const avgScore = Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length);
    const cat: SentimentCategory = avgScore >= 18 ? 'POSITIVE' : avgScore <= -18 ? 'NEGATIVE' : 'NEUTRAL';
    const bias: SentimentTradingBias =
      avgScore >= 45 ? 'STRONG_BUY' : avgScore >= 18 ? 'BUY' : avgScore <= -45 ? 'STRONG_SELL' : avgScore <= -18 ? 'SELL' : 'HOLD';
    const posCount = data.scores.filter((x) => x > 15).length;
    const negCount = data.scores.filter((x) => x < -15).length;
    assetBreakdown[symbol] = {
      symbol,
      sentiment: cat,
      score: avgScore,
      sampleCount: data.count,
      bullishPercent: Math.round((posCount / data.count) * 100),
      bearishPercent: Math.round((negCount / data.count) * 100),
      neutralPercent: Math.round(((data.scores.length - posCount - negCount) / data.count) * 100),
      bias,
      velocity: data.count >= 4 ? 'SURGING' : data.count >= 2 ? 'HIGH' : 'NORMAL',
      topHeadline: data.headlines[0],
      lastUpdated: Date.now(),
    };
  }

  const topTrendingTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([topic, info]) => {
      const pos = info.sentiments.filter((x) => x === 'POSITIVE').length;
      const neg = info.sentiments.filter((x) => x === 'NEGATIVE').length;
      return { topic, count: info.count, sentiment: (pos > neg ? 'POSITIVE' : neg > pos ? 'NEGATIVE' : 'NEUTRAL') as SentimentCategory };
    });

  // Rule-based gate on the real composite score. Reasoning states only what was measured.
  let directiveBias: SentimentTradingBias = 'HOLD';
  let multiplier = 1.0;
  let gateStatus: 'ALLOW_BUY' | 'SUPPRESS_BUY' | 'FORCE_SELL_RISK' | 'HOLD_NEUTRAL' = 'HOLD_NEUTRAL';
  if (compositeScore >= 40) { directiveBias = 'STRONG_BUY'; multiplier = 1.25; gateStatus = 'ALLOW_BUY'; }
  else if (compositeScore >= 15) { directiveBias = 'BUY'; multiplier = 1.1; gateStatus = 'ALLOW_BUY'; }
  else if (compositeScore <= -40) { directiveBias = 'STRONG_SELL'; multiplier = 0.6; gateStatus = 'FORCE_SELL_RISK'; }
  else if (compositeScore <= -15) { directiveBias = 'SELL'; multiplier = 0.8; gateStatus = 'SUPPRESS_BUY'; }
  const reasoning = `Composite headline sentiment ${compositeScore >= 0 ? '+' : ''}${compositeScore} across ${feed.length} scored articles (${bullish} positive, ${bearish} negative, ${neutral} neutral).`;

  const hourAgo = Date.now() - 60 * 60 * 1000;
  const lastHour = feed.filter((f) => f.timestamp >= hourAgo).length;

  return {
    timestamp: Date.now(),
    compositeScore,
    overallSentiment,
    fearGreedIndex: 0, // overwritten with the published index by buildReport()
    fearGreedLabel: 'NEUTRAL',
    socialVelocityPostsPerMin: Number((lastHour / 60).toFixed(2)),
    bullishSignalsCount: bullish,
    bearishSignalsCount: bearish,
    neutralSignalsCount: neutral,
    topTrendingTopics,
    assetBreakdown,
    feed,
    tradingDirective: {
      bias: directiveBias,
      confidencePercent: Math.round(totalConfidence / feed.length),
      reasoning,
      recommendedPositionMultiplier: multiplier,
      sentimentGateStatus: gateStatus,
    },
    aiModelUsed,
    isAiAnalyzed,
  };
}

async function getReport(force: boolean, asset?: string): Promise<SentimentIntelligenceReport> {
  if (!force && !asset && lastReport && Date.now() - lastReportAt < CACHE_TTL_MS) return lastReport;
  const report = await buildReport(asset);
  if (!asset) { lastReport = report; lastReportAt = Date.now(); }
  return report;
}

// GET /api/sentiment/live - real headlines + published Fear & Greed, scored by Gemini (cached 5 min)
sentimentRouter.get('/live', async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, report: await getReport(false) });
  } catch (err: any) {
    res.status(503).json({ success: false, error: err.message });
  }
});

// POST /api/sentiment/analyze - force a fresh pull + re-score; optional { asset } filters to articles mentioning it
sentimentRouter.post('/analyze', async (req: Request, res: Response) => {
  try {
    const asset = typeof req.body?.asset === 'string' && req.body.asset !== 'BTC' ? req.body.asset : undefined;
    res.json({ success: true, isAiEnhanced: true, report: await getReport(true, asset) });
  } catch (err: any) {
    res.status(503).json({ success: false, error: err.message });
  }
});
