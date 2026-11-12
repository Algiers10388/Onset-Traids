import { ExchangeHealthCheckSummary, ExchangeId, ExchangeWallet, ExchangeWalletTransaction } from '../types';

export async function fetchExchangeWallets(): Promise<{
  wallets: Record<ExchangeId, ExchangeWallet>;
  timestamp: number;
}> {
  const res = await fetch('/api/exchange/wallets');
  if (!res.ok) {
    throw new Error('Failed to retrieve exchange wallets');
  }
  const data = await res.json();
  return { wallets: data.wallets, timestamp: data.timestamp };
}

export async function linkExchangeWallet(params: {
  exchange: ExchangeId;
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  depositAddress?: string;
  walletLabel?: string;
}): Promise<{
  success: boolean;
  exchange: ExchangeId;
  isLinked: boolean;
  connectionVerified: boolean;
  verificationMessage: string;
  apiKeyMasked?: string;
}> {
  const res = await fetch('/api/exchange/link-wallet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Failed to link ${params.exchange} wallet`);
  }
  return data;
}

export async function unlinkExchangeWallet(exchange: ExchangeId): Promise<boolean> {
  const res = await fetch('/api/exchange/unlink-wallet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exchange }),
  });
  const data = await res.json();
  return data.success;
}

export async function executeWalletTransaction(params: {
  exchange: ExchangeId;
  type: 'BUY_ORDER' | 'SELL_ORDER' | 'WALLET_WITHDRAWAL' | 'WALLET_TRANSFER';
  symbolOrAsset: string;
  amount: number;
  price?: number;
  destinationAddress?: string;
}): Promise<{
  success: boolean;
  transaction: ExchangeWalletTransaction;
}> {
  const res = await fetch('/api/exchange/wallet-transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  let text = '';
  try {
    text = await res.text();
  } catch {
    throw new Error('Network error reading exchange response');
  }
  let data: any = null;
  if (text && text.trim().length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        res.status >= 500
          ? 'Exchange transaction gateway is busy. Please try again.'
          : `Server returned an unexpected response (HTTP ${res.status}).`
      );
    }
  }
  if (!res.ok || !data || !data.success) {
    throw new Error((data && data.error) || 'Failed to execute exchange wallet transaction');
  }
  return data;
}

export async function fetchWalletTransactions(): Promise<ExchangeWalletTransaction[]> {
  try {
    const res = await fetch('/api/exchange/wallet-transactions');
    if (!res.ok) return [];
    const data = await res.json();
    return data.transactions || [];
  } catch {
    return [];
  }
}

export async function fetchExchangeHealthCheck(): Promise<ExchangeHealthCheckSummary> {
  const res = await fetch('/api/exchange/health-check');
  if (!res.ok) {
    throw new Error(`Health check probe failed with status HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to complete exchange API health check');
  }
  return data.healthSummary;
}

