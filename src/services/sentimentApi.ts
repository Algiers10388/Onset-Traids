import { SentimentIntelligenceReport, SentimentFeedItem } from '../types';

export async function fetchLiveSentimentReport(): Promise<SentimentIntelligenceReport> {
  const res = await fetch('/api/sentiment/live');
  if (!res.ok) {
    throw new Error(`Failed to fetch sentiment report: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.success || !data.report) {
    throw new Error(data.error || 'Invalid sentiment data received from server');
  }
  return data.report;
}

export async function triggerAiSentimentAnalysis(params?: {
  customQuery?: string;
  asset?: string;
}): Promise<{ report: SentimentIntelligenceReport; isAiEnhanced: boolean }> {
  const res = await fetch('/api/sentiment/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {}),
  });
  if (!res.ok) {
    throw new Error(`AI Sentiment analysis failed with HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.success || !data.report) {
    throw new Error(data.error || 'Failed to process AI sentiment analysis');
  }
  return { report: data.report, isAiEnhanced: Boolean(data.isAiEnhanced) };
}
