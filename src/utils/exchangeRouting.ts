import {
  ExchangeConfig,
  ExchangeId,
  ExchangeQuote,
  SmartOrderRouteResult,
  ArbitrageOpportunity,
  ExecutionRoutingMode,
} from '../types';
import { DEFAULT_EXCHANGES } from '../data/exchangeData';

/**
 * Convert standard symbol (e.g. BTC/USDT) to NonKYC ticker symbol format (e.g. BTC_USDT)
 */
export function formatNonKYCSymbol(symbol: string): string {
  return symbol.replace('/', '_');
}

/**
 * Convert NonKYC ticker symbol format (e.g. BTC_USDT) back to standard symbol (e.g. BTC/USDT)
 */
export function parseNonKYCSymbol(ticker: string): string {
  return ticker.replace('_', '/');
}

/**
 * Smart Order Router (SOR) algorithm:
 * Determines the most favorable exchange to execute the trade on (including NonKYC),
 * taking into account gross quote price, exchange taker fees, and routing preferences.
 * Fully guarded against empty quotes or uninitialized states.
 */
export function routeOrderSmart(
  side: 'BUY' | 'SELL',
  symbol: string,
  notionalUsd: number,
  quotes: ExchangeQuote[],
  exchanges: ExchangeConfig[],
  routingMode: ExecutionRoutingMode,
  _referencePrice?: number // unused: kept so call sites need no change; prices come ONLY from live quotes
): SmartOrderRouteResult {
  const safeExchanges = exchanges && exchanges.length > 0 ? exchanges : DEFAULT_EXCHANGES;

  const rawQuotes = Array.isArray(quotes) ? quotes : [];
  const eligibleQuotes = rawQuotes.filter(
    (q) =>
      q &&
      q.symbol === symbol &&
      q.bidPrice > 0 &&
      q.askPrice > 0 &&
      safeExchanges.some((e) => e.id === q.exchangeId && e.enabled)
  );

  // No live quote = no route. Prices are never generated or assumed.
  if (eligibleQuotes.length === 0) {
    throw new Error(`No live exchange quotes available for ${symbol}; cannot route an order.`);
  }

  // If user selected a specific exchange instead of auto SOR (including NonKYC direct routing)
  if (routingMode !== 'SMART_ORDER_ROUTER') {
    const forcedQuote = eligibleQuotes.find((q) => q.exchangeId === routingMode);
    if (!forcedQuote) {
      throw new Error(`No live quote from ${routingMode} for ${symbol}; refusing to reroute silently.`);
    }
    const exConfig = safeExchanges.find((e) => e.id === forcedQuote.exchangeId);
    if (!exConfig) throw new Error(`Exchange ${forcedQuote.exchangeId} is not configured.`);
    const feeRate = exConfig.takerFeePercent / 100;

    const rawPrice = side === 'BUY' ? forcedQuote.askPrice : forcedQuote.bidPrice;
    const effectivePrice = side === 'BUY' ? forcedQuote.effectiveBuyPrice : forcedQuote.effectiveSellPrice;
    const feeAmountUsd = notionalUsd * feeRate;

    const routeReason =
      forcedQuote.exchangeId === 'NONKYC'
        ? `Direct order routed exclusively to NonKYC Exchange (manual zero-KYC exchange override).`
        : `Direct order routed exclusively to ${forcedQuote.exchangeName} (manual exchange override).`;

    return {
      side,
      symbol,
      bestExchange: forcedQuote.exchangeId,
      bestExchangeName: forcedQuote.exchangeName,
      rawPrice,
      effectivePrice,
      takerFeePercent: exConfig.takerFeePercent,
      feeAmountUsd,
      worstExchangePrice: rawPrice,
      savingsUsd: 0,
      savingsPercent: 0,
      quotesCompared: eligibleQuotes,
      routeReason,
    };
  }

  // SMART ORDER ROUTER LOGIC:
  // For BUY: We want the MINIMUM effective buy price (ask * (1 + fee))
  // For SELL: We want the MAXIMUM effective sell price (bid * (1 - fee))
  let bestQuote = eligibleQuotes[0];
  let worstQuote = eligibleQuotes[0];

  if (side === 'BUY') {
    bestQuote = eligibleQuotes.reduce(
      (best, curr) => (curr.effectiveBuyPrice < best.effectiveBuyPrice ? curr : best),
      eligibleQuotes[0]
    );
    worstQuote = eligibleQuotes.reduce(
      (worst, curr) => (curr.effectiveBuyPrice > worst.effectiveBuyPrice ? curr : worst),
      eligibleQuotes[0]
    );
  } else {
    bestQuote = eligibleQuotes.reduce(
      (best, curr) => (curr.effectiveSellPrice > best.effectiveSellPrice ? curr : best),
      eligibleQuotes[0]
    );
    worstQuote = eligibleQuotes.reduce(
      (worst, curr) => (curr.effectiveSellPrice < worst.effectiveSellPrice ? curr : worst),
      eligibleQuotes[0]
    );
  }

  const exConfig = safeExchanges.find((e) => e.id === bestQuote.exchangeId);
  if (!exConfig) throw new Error(`Exchange ${bestQuote.exchangeId} is not configured.`);
  const takerFeePercent = exConfig.takerFeePercent;
  const feeAmountUsd = notionalUsd * (takerFeePercent / 100);

  const rawPrice = side === 'BUY' ? bestQuote.askPrice : bestQuote.bidPrice;
  const effectivePrice = side === 'BUY' ? bestQuote.effectiveBuyPrice : bestQuote.effectiveSellPrice;
  const worstPrice = side === 'BUY' ? worstQuote.effectiveBuyPrice : worstQuote.effectiveSellPrice;

  // Calculate savings in $ and %
  let savingsPercent = 0;
  if (side === 'BUY') {
    savingsPercent = Math.max(0, ((worstPrice - effectivePrice) / (worstPrice || 1)) * 100);
  } else {
    savingsPercent = Math.max(0, ((effectivePrice - worstPrice) / (worstPrice || 1)) * 100);
  }

  const savingsUsd = (notionalUsd * savingsPercent) / 100;

  const isNonKYC = bestQuote.exchangeId === 'NONKYC';
  const tagNote = isNonKYC ? ' (Zero-KYC Spot order book)' : '';

  const routeReason =
    side === 'BUY'
      ? `SOR selected ${bestQuote.exchangeName}: Lowest net effective cost ($${effectivePrice.toFixed(2)}) saving $${savingsUsd.toFixed(2)} (${savingsPercent.toFixed(3)}%) vs ${worstQuote.exchangeName}${tagNote}.`
      : `SOR selected ${bestQuote.exchangeName}: Highest net liquidation price ($${effectivePrice.toFixed(2)}) gaining $${savingsUsd.toFixed(2)} (${savingsPercent.toFixed(3)}%) vs ${worstQuote.exchangeName}${tagNote}.`;

  return {
    side,
    symbol,
    bestExchange: bestQuote.exchangeId,
    bestExchangeName: bestQuote.exchangeName,
    rawPrice,
    effectivePrice,
    takerFeePercent,
    feeAmountUsd,
    worstExchangePrice: worstPrice,
    savingsUsd,
    savingsPercent,
    quotesCompared: eligibleQuotes,
    routeReason,
  };
}

/**
 * Scan for cross-exchange spatial arbitrage opportunities across all connected exchanges
 * including NonKYC:
 * Look for instances where Best Bid on Exchange A > Best Ask on Exchange B
/**
 * Scan for cross-exchange spatial arbitrage opportunities across all connected exchanges:
 * Automatically identifies the best market to buy (lowest cost ask price)
 * and pairs it against the market with the greatest spread to sell (highest bid proceeds)
 * capturing positive net spread profit after all exchange taker fees.
 */
export function scanCrossExchangeArbitrage(
  symbol: string,
  quotes: ExchangeQuote[],
  exchanges: ExchangeConfig[],
  minProfitPercent: number = 0.02
): ArbitrageOpportunity | null {
  if (!quotes || !Array.isArray(quotes) || quotes.length < 2) return null;

  const exMap = new Map(exchanges.map((e) => [e.id, e]));

  let bestOpportunity: ArbitrageOpportunity | null = null;
  let maxNetSpreadPercent = -999;

  for (let i = 0; i < quotes.length; i++) {
    for (let j = 0; j < quotes.length; j++) {
      if (i === j) continue;

      const buyQuote = quotes[i]; // Market to buy: lowest cost Ask
      const sellQuote = quotes[j]; // Market to sell: paired against greatest spread Bid

      if (!buyQuote || !sellQuote || buyQuote.askPrice <= 0 || sellQuote.bidPrice <= 0) continue;

      const buyConfig = exMap.get(buyQuote.exchangeId);
      const sellConfig = exMap.get(sellQuote.exchangeId);

      const buyFeeRate = (buyConfig?.takerFeePercent || 0.075) / 100;
      const sellFeeRate = (sellConfig?.takerFeePercent || 0.075) / 100;

      const grossSpreadUsd = sellQuote.bidPrice - buyQuote.askPrice;
      const grossSpreadPercent = (grossSpreadUsd / (buyQuote.askPrice || 1)) * 100;

      // Net cash flow per unit: sellQuote.bidPrice * (1 - sellFee) - buyQuote.askPrice * (1 + buyFee)
      const effectiveBuyCost = buyQuote.askPrice * (1 + buyFeeRate);
      const effectiveSellProceeds = sellQuote.bidPrice * (1 - sellFeeRate);
      const netSpreadUsd = effectiveSellProceeds - effectiveBuyCost;
      const netSpreadPercent = (netSpreadUsd / (effectiveBuyCost || 1)) * 100;

      if (netSpreadPercent > maxNetSpreadPercent) {
        maxNetSpreadPercent = netSpreadPercent;
        bestOpportunity = {
          symbol,
          buyExchange: buyQuote.exchangeId,
          buyExchangeName: buyQuote.exchangeName,
          buyAskPrice: buyQuote.askPrice,
          sellExchange: sellQuote.exchangeId,
          sellExchangeName: sellQuote.exchangeName,
          sellBidPrice: sellQuote.bidPrice,
          grossSpreadUsd,
          grossSpreadPercent,
          netSpreadUsd,
          netSpreadPercent,
          estimatedProfitUsd: Math.max(0, (netSpreadPercent / 100) * 1000), // on $1k clip
          timestamp: Date.now(),
          isActionable: netSpreadPercent >= minProfitPercent, // Profitable after fees
        };
      }
    }
  }

  return bestOpportunity;
}

/**
 * Fetch real live quotes (Binance US, Coinbase, Kraken, Bybit, NonKYC) from the backend.
 * Throws on failure; there is no simulated substitute.
 */
export async function fetchLiveExchangeQuotes(symbol: string): Promise<ExchangeQuote[]> {
  const res = await fetch(`/api/market/live-quotes?symbol=${encodeURIComponent(symbol)}`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success || !Array.isArray(data.quotes) || data.quotes.length === 0) {
    throw new Error(data?.error || `Live quotes unavailable (HTTP ${res.status})`);
  }
  return data.quotes;
}

/**
 * NonKYC quote taken from the real server aggregation. Null if NonKYC returned no real quote.
 */
export async function fetchNonKYCQuote(symbol: string): Promise<ExchangeQuote | null> {
  const quotes = await fetchLiveExchangeQuotes(symbol);
  return quotes.find((q) => q.exchangeId === 'NONKYC') ?? null;
}

export interface ExecuteTradeParams {
  exchange: ExchangeId;
  symbol: string;
  side: 'BUY' | 'SELL';
  amount: number;
  notional?: number;
  price?: number;
  type?: 'MARKET' | 'LIMIT';
  isLiveRealMoney?: boolean;
}

export interface ExecuteTradeResult {
  success: boolean;
  exchange: ExchangeId;
  exchangeOrderId?: string;
  cryptographicReceipt?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  amount: number;
  executedPrice?: number;
  status: string;
  executionNote?: string;
  error?: string;
  timestamp: number;
}

/**
 * Execute an order directly on any supported exchange (including NonKYC, Kraken, Binance, Coinbase, Bybit)
 * via the server cryptographic order execution gateway.
 */
export async function executeTradeOnExchange(params: ExecuteTradeParams): Promise<ExecuteTradeResult> {
  const now = Date.now();
  try {
    const res = await fetch('/api/exchange/execute-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exchange: params.exchange,
        symbol: params.symbol,
        side: params.side,
        amount: params.amount,
        notional: params.notional || (params.price ? params.amount * params.price : undefined),
        price: params.price,
        type: params.type || 'MARKET',
        isLiveRealMoney: params.isLiveRealMoney ?? true,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        exchange: params.exchange,
        symbol: params.symbol,
        side: params.side,
        amount: params.amount,
        status: 'REJECTED',
        error: data.error || `Order rejected by ${params.exchange} matching engine.`,
        executionNote: data.diagnosticHelp || data.executionNote,
        timestamp: now,
      };
    }

    return {
      success: true,
      exchange: params.exchange,
      exchangeOrderId: data.exchangeOrderId,
      cryptographicReceipt: data.cryptographicReceipt,
      symbol: params.symbol,
      side: params.side,
      amount: params.amount,
      executedPrice: params.price,
      status: data.status || 'PLACED_ON_EXCHANGE',
      executionNote: data.executionNote || `Order executed successfully on ${params.exchange}.`,
      timestamp: data.timestamp || now,
    };
  } catch (err: any) {
    return {
      success: false,
      exchange: params.exchange,
      symbol: params.symbol,
      side: params.side,
      amount: params.amount,
      status: 'NETWORK_ERROR',
      error: err.message || `Failed to communicate with ${params.exchange} gateway.`,
      timestamp: now,
    };
  }
}

/**
 * Execute a trade specifically on the NonKYC exchange.
 * Routes the order to the NonKYC Zero-KYC Spot matching engine.
 */
export async function executeNonKYCTrade(
  params: Omit<ExecuteTradeParams, 'exchange'>
): Promise<ExecuteTradeResult> {
  return executeTradeOnExchange({
    ...params,
    exchange: 'NONKYC',
  });
}

/**
 * Smart Order Router Execution:
 * Finds the optimal exchange (including NonKYC) via routeOrderSmart,
 * and immediately executes the trade against the winning exchange.
 */
export async function routeAndExecuteTrade(params: {
  side: 'BUY' | 'SELL';
  symbol: string;
  notionalUsd: number;
  quotes: ExchangeQuote[];
  exchanges: ExchangeConfig[];
  routingMode: ExecutionRoutingMode;
  isLiveRealMoney?: boolean;
}): Promise<{ route: SmartOrderRouteResult; result: ExecuteTradeResult }> {
  const route = routeOrderSmart(
    params.side,
    params.symbol,
    params.notionalUsd,
    params.quotes,
    params.exchanges,
    params.routingMode
  );

  const amount = params.notionalUsd / (route.rawPrice || 1);

  const result = await executeTradeOnExchange({
    exchange: route.bestExchange,
    symbol: params.symbol,
    side: params.side,
    amount,
    notional: params.notionalUsd,
    price: route.rawPrice,
    type: 'MARKET',
    isLiveRealMoney: params.isLiveRealMoney,
  });

  return { route, result };
}
