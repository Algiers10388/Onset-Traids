import { EtherscanIntelligenceState } from '../types';

export async function fetchEtherscanLiveFeed(): Promise<EtherscanIntelligenceState | null> {
  try {
    const res = await fetch('/api/etherscan/live-feed');
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success) return null;
    return {
      blockSnapshot: data.blockSnapshot ?? null,
      error: data.error ?? null,
      liveTransactions: data.liveTransactions || [],
      tradePatterns: data.tradePatterns || [],
      agents: data.agents || [],
      autoExecutionEnabled: data.autoExecutionEnabled || false,
      minProfitThresholdPercent: data.minProfitThresholdPercent ?? 0,
      executedSignalsCount: data.executedSignalsCount || 0,
      executedSignalsLog: data.executedSignalsLog || [],
      timestamp: data.timestamp || Date.now(),
    };
  } catch {
    return null;
  }
}

export async function syncEtherscanNow(): Promise<EtherscanIntelligenceState | null> {
  try {
    const res = await fetch('/api/etherscan/sync-now', { method: 'POST' });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      blockSnapshot: data.blockSnapshot ?? null,
      error: data.error ?? null,
      liveTransactions: data.liveTransactions || [],
      tradePatterns: data.tradePatterns || [],
      agents: data.agents || [],
      autoExecutionEnabled: data.autoExecutionEnabled || false,
      minProfitThresholdPercent: data.minProfitThresholdPercent ?? 0,
      executedSignalsCount: data.executedSignalsCount || 0,
      executedSignalsLog: data.executedSignalsLog || [],
      timestamp: data.timestamp || Date.now(),
    };
  } catch {
    return null;
  }
}

export async function toggleOnChainAutoExecution(
  enabled: boolean,
  minProfitThresholdPercent: number
): Promise<{ success: boolean; autoExecutionEnabled: boolean; minProfitThresholdPercent: number }> {
  try {
    const res = await fetch('/api/etherscan/toggle-auto-execution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, minProfitThresholdPercent }),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, autoExecutionEnabled: false, minProfitThresholdPercent };
  }
}

export async function executeOnChainPatternTrade(signalId: string): Promise<{
  success: boolean;
  receipt?: string;
  orderId?: string;
  exchange?: string;
  targetAsset?: string;
  executionNote?: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/etherscan/execute-pattern-trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signalId }),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function runDeepAgentAnalysis(prompt?: string): Promise<{
  success: boolean;
  analysis?: {
    summary: string;
    actionableStrategies: string[];
    timestamp: number;
  };
  error?: string;
}> {
  try {
    const res = await fetch('/api/etherscan/run-agent-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function runDeepEtherscanSearch(query: string): Promise<{
  success: boolean;
  query: string;
  analysis?: {
    summary: string;
    actionableStrategies: string[];
  };
  matchingTransactions?: any[];
  error?: string;
}> {
  try {
    const res = await fetch('/api/etherscan/deep-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, query, error: err.message };
  }
}
