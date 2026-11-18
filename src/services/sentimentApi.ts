import { SentimentIntelligenceReport } from '../types';

async function safeParseJsonResponse(res: Response, label: string): Promise<any> {
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  const trimmed = text.trimStart();
  const looksLikeHtml =
    contentType.includes('text/html') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html');

  if (looksLikeHtml) {
    throw new Error(`${label} returned HTML instead of JSON (HTTP ${res.status})`);
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${label} returned invalid JSON (HTTP ${res.status})`);
  }

  if (!res.ok) {
    throw new Error(data?.error || `${label} failed with HTTP ${res.status}`);
  }
  return data;
}

export async function fetchLiveSentimentReport(): Promise<SentimentIntelligenceReport> {
  const res = await fetch('/api/sentiment/live', {
    headers: { Accept: 'application/json' },
  });
  const data = await safeParseJsonResponse(res, 'Sentiment report API');
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
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(params || {}),
  });
  const data = await safeParseJsonResponse(res, 'AI sentiment analysis API');
  if (!data.success || !data.report) {
    throw new Error(data.error || 'Failed to process AI sentiment analysis');
  }
  return { report: data.report, isAiEnhanced: Boolean(data.isAiEnhanced) };
}
