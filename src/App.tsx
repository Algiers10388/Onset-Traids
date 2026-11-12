import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Zap, Compass } from 'lucide-react';
import { Header } from './components/Header';
import { RiskDisclosureBanner } from './components/RiskDisclosureBanner';
import { MarketWatchBar } from './components/MarketWatchBar';
import { PriceChart } from './components/PriceChart';
import { StrategyBotController } from './components/StrategyBotController';
import { MultiExchangeComparisonCard } from './components/MultiExchangeComparisonCard';
import { PositionsAndOrdersTable } from './components/PositionsAndOrdersTable';
import { AIAuditModal } from './components/AIAuditModal';
import { BacktestLabModal } from './components/BacktestLabModal';
import { ExchangeManagerModal } from './components/ExchangeManagerModal';
import { LiveCurrencyAccountModal, TabType } from './components/LiveCurrencyAccountModal';
import { LiveCurrencyTreasuryCard } from './components/LiveCurrencyTreasuryCard';
import { STRATEGY_PRESETS } from './data/marketData';
import { DEFAULT_EXCHANGES } from './data/exchangeData';
import {
  CryptoAsset,
  Candle,
  StrategyParameters,
  PortfolioState,
  Position,
  Order,
  AIAnalysisResult,
  TechnicalIndicators,
  ExchangeConfig,
  ExchangeId,
  ExchangeQuote,
  ExecutionRoutingMode,
  ArbitrageOpportunity,
  FiatAccount,
  FiatTransaction,
  TradingExecutionMode,
  CredentialsSummary,
  ActivePageTab,
  SentimentIntelligenceReport,
} from './types';
import { EtherscanIntelligencePage } from './components/EtherscanIntelligencePage';
import { FlashArbBotDashboard } from './components/FlashArbBotDashboard';
import { CorrelationMatrixView } from './components/CorrelationMatrixView';
import { AiTroubleshooterModal } from './components/AiTroubleshooterModal';
import { OnChainWalletMonitor } from './components/OnChainWalletMonitor';
import { OkxWalletModal } from './components/OkxWalletModal';
import { CakeWalletConnectModal } from './components/CakeWalletConnectModal';
import { SentimentAnalysisPanel } from './components/SentimentAnalysisPanel';
import {
  fetchLiveSentimentReport,
  triggerAiSentimentAnalysis,
} from './services/sentimentApi';
import { getCachedOkxAddress } from './services/okxWallet';
import {
  computeIndicators,
  formatCurrency,
  calculateDynamicPositionSize,
  DynamicPositionSizeResult,
} from './utils/cryptoMath';
import {
  routeOrderSmart,
  scanCrossExchangeArbitrage,
  fetchLiveExchangeQuotes,
  executeTradeOnExchange,
} from './utils/exchangeRouting';
import { fetchFiatAccount, fetchFiatTransactions, syncBotCapital } from './services/fiatApi';
import { useAuth } from './context/AuthContext';
import {
  persistPortfolioToFirestore,
  loadPortfolioFromFirestore,
  persistExecutionLog,
  persistStrategyToFirestore,
} from './services/firestorePersistence';

// Live only: the bot has no cash until real funds are allocated to it from the ledger.
const INITIAL_PORTFOLIO: PortfolioState = {
  cash: 0,
  startingBalance: 0,
  realizedPnl: 0,
  totalTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
  maxDrawdownPercent: 0,
  peakEquity: 0,
  totalSavingsFromSOR: 0,
};

// Loads REAL market data first. The trading UI is not rendered with placeholder prices:
// if the exchanges cannot be reached the user sees an error and a retry button.
export default function App() {
  const [boot, setBoot] = useState<{ assets: CryptoAsset[]; candles: Record<string, Candle[]> } | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tRes = await fetch('/api/market/live-tickers');
        const tData = await tRes.json().catch(() => null);
        if (!tRes.ok || !tData?.success || !Array.isArray(tData.tickers) || tData.tickers.length === 0) {
          throw new Error(tData?.error || `Live tickers unavailable (HTTP ${tRes.status})`);
        }
        const assets: CryptoAsset[] = tData.tickers;
        const first = assets.find((a) => a.symbol === 'BTC/USDT') || assets[0];
        const cRes = await fetch(`/api/market/live-candles?symbol=${encodeURIComponent(first.symbol)}`);
        const cData = await cRes.json().catch(() => null);
        if (!cRes.ok || !Array.isArray(cData?.candles) || cData.candles.length === 0) {
          throw new Error(cData?.error || `Live candles unavailable (HTTP ${cRes.status})`);
        }
        if (!cancelled) setBoot({ assets, candles: { [first.symbol]: cData.candles } });
      } catch (err: any) {
        if (!cancelled) setBootError(err?.message || 'Could not load live market data');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (!boot) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-950 text-slate-300 text-sm">
        {bootError ? (
          <>
            <div className="text-rose-300 font-mono max-w-xl text-center">Live market data unavailable: {bootError}</div>
            <button
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
              onClick={() => {
                setBootError(null);
                setAttempt((n) => n + 1);
              }}
            >
              Retry
            </button>
          </>
        ) : (
          <div className="font-mono">Connecting to live exchange feeds…</div>
        )}
      </div>
    );
  }
  return <AppInner initialAssets={boot.assets} initialCandles={boot.candles} />;
}

function AppInner({ initialAssets, initialCandles }: { initialAssets: CryptoAsset[]; initialCandles: Record<string, Candle[]> }) {
  const { user } = useAuth();
  const [assets, setAssets] = useState<CryptoAsset[]>(initialAssets);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC/USDT');
  const [exchanges, setExchanges] = useState<ExchangeConfig[]>(DEFAULT_EXCHANGES);
  const [exchangeModalOpen, setExchangeModalOpen] = useState<boolean>(false);

  // Live Trading Execution Mode & API Credentials State
  const tradingMode: TradingExecutionMode = 'LIVE_REAL_TRADING'; // live only
  const [credentialsSummary, setCredentialsSummary] = useState<CredentialsSummary | null>(null);
  const [isLiveMarketConnected, setIsLiveMarketConnected] = useState<boolean>(true); // boot only renders after a successful live fetch
  const [activeTab, setActiveTab] = useState<ActivePageTab>('TRADING_DESK');
  const [onChainSignalsCount, setOnChainSignalsCount] = useState<number>(0);
  const [aiTroubleshooterOpen, setAiTroubleshooterOpen] = useState<boolean>(false);
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string | undefined>(undefined);

  // Candle map for each symbol
  const [candleMap, setCandleMap] = useState<Record<string, Candle[]>>(initialCandles);

  const [strategy, setStrategy] = useState<StrategyParameters>(() => ({
    ...STRATEGY_PRESETS[0],
    symbol: 'BTC/USDT',
    sentimentIntegrationEnabled: true,
    sentimentMode: 'CONFIRMATORY',
    minSentimentThreshold: -20,
    sentimentWeightPercent: 30,
  }));

  const [portfolio, setPortfolio] = useState<PortfolioState>(INITIAL_PORTFOLIO);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [botLogs, setBotLogs] = useState<string[]>([]);

  const [botRunning, setBotRunning] = useState<boolean>(true);
  const [dailyLossUsd, setDailyLossUsd] = useState<number>(0);
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [aiAuditModalOpen, setAiAuditModalOpen] = useState<boolean>(false);
  const [aiAuditLoading, setAiAuditLoading] = useState<boolean>(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [backtestModalOpen, setBacktestModalOpen] = useState<boolean>(false);
  const [tradingDeskView, setTradingDeskView] = useState<'EXECUTION' | 'CORRELATION_MATRIX'>('EXECUTION');

  // AI Sentiment Intelligence Module State
  const [sentimentReport, setSentimentReport] = useState<SentimentIntelligenceReport | null>(null);
  const [loadingSentiment, setLoadingSentiment] = useState<boolean>(false);

  const loadSentiment = async () => {
    try {
      setLoadingSentiment(true);
      const rep = await fetchLiveSentimentReport();
      if (rep) {
        setSentimentReport(rep);
      }
    } catch (err) {
      console.warn('Could not load live crypto sentiment report:', err);
    } finally {
      setLoadingSentiment(false);
    }
  };

  // Poll real-time sentiment intelligence on mount and every 25s
  useEffect(() => {
    loadSentiment();
    const interval = setInterval(loadSentiment, 25000);
    return () => clearInterval(interval);
  }, []);

  // Live Currency Account State (Bank & Debit Card Rails)
  const [fiatAccount, setFiatAccount] = useState<FiatAccount>({
    accountId: '',
    accountNumberMasked: '',
    routingNumberMasked: '',
    accountHolder: '',
    currency: 'USD',
    availableBalance: 0,
    pendingBalance: 0,
    allocatedToTrading: 0,
    dailyDepositLimit: 0,
    dailyDepositUsed: 0,
    kycTier: 'TIER_1_STANDARD',
    twoFactorEnabled: false,
    vaultEncryption: 'NONE',
    fdicCustodyInsured: false,
    linkedBanks: [],
    linkedCards: [],
  });
  const [fiatTransactions, setFiatTransactions] = useState<FiatTransaction[]>([]);
  const [fiatModalOpen, setFiatModalOpen] = useState<boolean>(false);
  const [fiatModalInitialTab, setFiatModalInitialTab] = useState<TabType>('FUND_BOT');

  // OKX Web3 Wallet & Exchange Integration State
  const [okxWalletModalOpen, setOkxWalletModalOpen] = useState<boolean>(false);
  const [cakeWalletModalOpen, setCakeWalletModalOpen] = useState<boolean>(false);
  const [okxConnectedAddress, setOkxConnectedAddress] = useState<string | null>(getCachedOkxAddress());
  const [targetMonitorWallet, setTargetMonitorWallet] = useState<{ address: string; network: string } | null>(null);

  const handleSelectAddressForMonitor = (address: string, network?: string) => {
    setActiveTab('WALLET_MONITOR');
    setTargetMonitorWallet({ address, network: network || 'ethereum' });
    setOkxConnectedAddress(address);
  };

  const handleDepositFromOkx = (amount: number, symbol: string) => {
    setPortfolio((prev) => ({
      ...prev,
      cash: prev.cash + amount,
      startingBalance: prev.startingBalance + amount,
    }));
    setBotLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] OKX WEB3 DEPOSIT: Credited $${amount.toFixed(2)} ${symbol} from OKX self-custody wallet into algorithmic trading desk.`,
      ...prev,
    ]);
  };

  const handleOpenFiatModal = (tab: TabType = 'FUND_BOT') => {
    setFiatModalInitialTab(tab);
    setFiatModalOpen(true);
  };

  // Synchronize Live Currency Account from Backend API on mount
  useEffect(() => {
    fetchFiatAccount()
      .then((res) => {
        if (res && res.account) {
          setFiatAccount(res.account);
          if (res.account.allocatedToTrading > 0) {
            setPortfolio((p) => {
              if (p.cash === 0) {
                return {
                  ...p,
                  cash: res.account.allocatedToTrading,
                  startingBalance: res.account.allocatedToTrading,
                  peakEquity: res.account.allocatedToTrading,
                };
              }
              return p;
            });
          }
        }
      })
      .catch((err) => console.warn('Could not sync live fiat account from server:', err));

    fetchFiatTransactions()
      .then((txs) => {
        if (txs && txs.length > 0) setFiatTransactions(txs);
      })
      .catch((err) => console.warn('Could not sync fiat transactions:', err));
  }, []);

  const handleAccountUpdated = (newAccount: FiatAccount, notificationMsg?: string) => {
    setFiatAccount(newAccount);
    fetchFiatTransactions().then(setFiatTransactions).catch(() => {});
    if (notificationMsg) {
      setBotLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] FIAT TREASURY: ${notificationMsg}`,
      ]);
    }
  };

  const handleBotCashAdjusted = (amountDelta: number) => {
    setPortfolio((p) => {
      const newCash = Math.max(0, p.cash + amountDelta);
      syncBotCapital(newCash).catch(() => {});
      return {
        ...p,
        cash: newCash,
        startingBalance: p.startingBalance + (amountDelta > 0 ? amountDelta : 0),
        peakEquity: Math.max(p.peakEquity, newCash),
      };
    });
    setBotLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] BOT CAPITAL: ${
        amountDelta > 0 ? 'Deposited' : 'Withdrew'
      } $${Math.abs(amountDelta).toFixed(2)} USD ${
        amountDelta > 0 ? 'from Bank / Check Card to Fund Bot' : 'to Fiat Vault'
      }. New Bot Margin: $${(portfolio.cash + amountDelta).toFixed(2)} USD.`,
    ]);
  };

  // Synchronize Live Portfolio Snapshot from Cloud Firestore upon User Authentication
  useEffect(() => {
    if (!user?.uid) return;
    loadPortfolioFromFirestore(user.uid)
      .then((saved) => {
        if (saved) {
          setPortfolio((prev) => ({
            ...prev,
            cash: typeof saved.cash === 'number' && saved.cash > 0 ? saved.cash : prev.cash,
            startingBalance: typeof saved.startingBalance === 'number' && saved.startingBalance > 0 ? saved.startingBalance : prev.startingBalance,
            realizedPnl: typeof saved.realizedPnl === 'number' ? saved.realizedPnl : prev.realizedPnl,
            totalTrades: typeof saved.totalTrades === 'number' ? saved.totalTrades : prev.totalTrades,
            winningTrades: typeof saved.winningTrades === 'number' ? saved.winningTrades : prev.winningTrades,
            losingTrades: typeof saved.losingTrades === 'number' ? saved.losingTrades : prev.losingTrades,
            maxDrawdownPercent: typeof saved.maxDrawdownPercent === 'number' ? saved.maxDrawdownPercent : prev.maxDrawdownPercent,
            peakEquity: typeof saved.peakEquity === 'number' ? saved.peakEquity : prev.peakEquity,
          }));
          setBotLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] ☁️ FIRESTORE REAL-TIME SYNC: Authenticated portfolio loaded from Google Cloud Firestore for ${user.email || user.uid}.`,
            ...prev,
          ]);
        }
      })
      .catch((err) => {
        console.warn('Could not load portfolio from Firestore:', err);
      });
  }, [user?.uid]);

  // Persist Live Portfolio state to Cloud Firestore whenever balance, trades, or positions update
  useEffect(() => {
    if (!user?.uid) return;
    const timeout = setTimeout(() => {
      persistPortfolioToFirestore(user.uid, portfolio, positions, orders).catch((err) => {
        console.warn('Could not persist live portfolio snapshot to Firestore:', err);
      });
    }, 1500);
    return () => clearTimeout(timeout);
  }, [user?.uid, portfolio.cash, portfolio.realizedPnl, portfolio.totalTrades, positions.length, orders.length]);

  // Persist Active Strategy parameters to Cloud Firestore when modified
  useEffect(() => {
    if (!user?.uid) return;
    const timeout = setTimeout(() => {
      persistStrategyToFirestore(user.uid, strategy).catch((err) => {
        console.warn('Could not persist strategy to Firestore:', err);
      });
    }, 2000);
    return () => clearTimeout(timeout);
  }, [user?.uid, strategy]);

  // Fetch Exchange Credentials Status
  const fetchCredentialsStatus = async () => {
    try {
      const res = await fetch('/api/exchange/credentials-status');
      if (res.ok) {
        const data = await res.json();
        if (data.credentials) {
          setCredentialsSummary(data.credentials);
          setExchanges((prev) =>
            prev.map((e) => {
              const cred = data.credentials[e.id as keyof typeof data.credentials];
              return {
                ...e,
                hasApiKeyConfigured: Boolean(cred?.configured),
              };
            })
          );
        }
      }
    } catch (err) {
      console.warn('Could not fetch exchange credentials:', err);
    }
  };

  useEffect(() => {
    fetchCredentialsStatus();
  }, []);

  // Poll Etherscan on-chain signals count for Header badge
  useEffect(() => {
    let isMounted = true;
    const fetchOnChainCount = async () => {
      try {
        const res = await fetch('/api/etherscan/live-feed');
        if (res.ok && isMounted) {
          const json = await res.json();
          if (json.tradePatterns) {
            setOnChainSignalsCount(json.tradePatterns.length);
          }
        }
      } catch {}
    };
    fetchOnChainCount();
    const interval = setInterval(fetchOnChainCount, 6000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Poll Real Live Market Data (Binance US + Kraken + Coinbase Live Feeds)
  useEffect(() => {
    let isMounted = true;
    const pollLiveTickers = async () => {
      try {
        const res = await fetch('/api/market/live-tickers');
        if (res.ok) {
          const data = await res.json();
          if (data.tickers && data.tickers.length > 0 && isMounted) {
            setIsLiveMarketConnected(true);
            setAssets((prev) => {
              const prevMap = new Map(prev.map((a) => [a.symbol, a]));
              data.tickers.forEach((t: any) => {
                const existing = prevMap.get(t.symbol);
                if (existing) {
                  prevMap.set(t.symbol, {
                    ...existing,
                    price: t.price,
                    change24h: t.change24h,
                    high24h: t.high24h,
                    low24h: t.low24h,
                    volume24h: t.volume24h,
                    sparkline:
                      t.sparkline && t.sparkline.length > 0 ? t.sparkline : existing.sparkline,
                    category: t.category || existing.category,
                    supportedExchanges: t.supportedExchanges || existing.supportedExchanges,
                  });
                } else {
                  prevMap.set(t.symbol, {
                    symbol: t.symbol,
                    name: t.name || t.symbol.split('/')[0],
                    price: t.price,
                    change24h: t.change24h,
                    high24h: t.high24h,
                    low24h: t.low24h,
                    volume24h: t.volume24h,
                    sparkline: t.sparkline || [t.price],
                    decimals: t.decimals || 2,
                    volatility: t.volatility || 'High',
                    category: t.category || 'Zero-KYC',
                    supportedExchanges: t.supportedExchanges,
                  });
                }
              });
              return Array.from(prevMap.values());
            });

            // Update active candle with latest real incoming price tick
            setCandleMap((prev) => {
              const currentList = prev[selectedSymbol];
              const matchedActive = data.tickers.find((t: any) => t.symbol === selectedSymbol);
              if (!currentList || currentList.length === 0 || !matchedActive) return prev;
              const lastCandle = currentList[currentList.length - 1];
              const p = matchedActive.price;
              const updatedCandle: Candle = {
                ...lastCandle,
                high: Math.max(lastCandle.high, p),
                low: Math.min(lastCandle.low, p),
                close: p,
              };
              return {
                ...prev,
                [selectedSymbol]: [...currentList.slice(0, -1), updatedCandle],
              };
            });
          }
        }
        else if (isMounted) setIsLiveMarketConnected(false);
      } catch {
        if (isMounted) setIsLiveMarketConnected(false);
      }
    };

    pollLiveTickers();
    const tickerInterval = setInterval(pollLiveTickers, 1200);

    return () => {
      isMounted = false;
      clearInterval(tickerInterval);
    };
  }, [selectedSymbol]);

  // Poll Real Live 1m Candlestick Data for selected asset
  useEffect(() => {
    let isMounted = true;
    const pollLiveCandles = async () => {
      try {
        const res = await fetch(
          `/api/market/live-candles?symbol=${encodeURIComponent(selectedSymbol)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.candles && data.candles.length > 0 && isMounted) {
            setCandleMap((prev) => ({
              ...prev,
              [selectedSymbol]: data.candles,
            }));
          }
        }
      } catch {
        // keep the last real candles; nothing is generated
      }
    };

    pollLiveCandles();
    const candleInterval = setInterval(pollLiveCandles, 5000);

    return () => {
      isMounted = false;
      clearInterval(candleInterval);
    };
  }, [selectedSymbol]);

  // Active asset & candles
  const activeAsset = useMemo(
    () => assets.find((a) => a.symbol === selectedSymbol) || assets[0],
    [assets, selectedSymbol]
  );

  const activeCandles = useMemo(
    () => candleMap[selectedSymbol] ?? [],
    [candleMap, selectedSymbol, activeAsset]
  );

  // Real-time live exchange order book quotes state
  const [exchangeQuotes, setExchangeQuotes] = useState<ExchangeQuote[]>([]);

  // Poll real multi-exchange order-book quotes. Exchange status/latency come ONLY from what actually answered.
  useEffect(() => {
    let isMounted = true;
    setExchangeQuotes([]);
    const pollLiveQuotes = async () => {
      try {
        const quotes = await fetchLiveExchangeQuotes(selectedSymbol);
        if (!isMounted) return;
        setExchangeQuotes(quotes);
        setExchanges((prev) =>
          prev.map((e) => {
            const q = quotes.find((x) => x.exchangeId === e.id);
            return q ? { ...e, status: 'CONNECTED', latencyMs: q.latencyMs } : { ...e, status: 'DISCONNECTED' };
          })
        );
      } catch {
        if (isMounted) {
          setExchangeQuotes([]);
          setExchanges((prev) => prev.map((e) => ({ ...e, status: 'DISCONNECTED' })));
        }
      }
    };

    pollLiveQuotes();
    const quotesInterval = setInterval(pollLiveQuotes, 1500);

    return () => {
      isMounted = false;
      clearInterval(quotesInterval);
    };
  }, [selectedSymbol]);

  const handleSelectSymbol = (symbol: string) => {
    setSelectedSymbol(symbol);
    setStrategy((prev) => ({ ...prev, symbol }));
  };

  const handleAddCustomSymbol = async (symbol: string) => {
    let clean = symbol.trim().toUpperCase();
    if (!clean.includes('/')) {
      if (clean.includes('_')) clean = clean.replace('_', '/');
      else clean = `${clean}/USDT`;
    }

    // Only add a market that real exchanges actually quote. No placeholder price is ever created.
    try {
      const [tRes, cRes] = await Promise.all([
        fetch(`/api/market/live-ticker?symbol=${encodeURIComponent(clean)}`),
        fetch(`/api/market/live-candles?symbol=${encodeURIComponent(clean)}`),
      ]);
      const tData = await tRes.json().catch(() => null);
      const cData = await cRes.json().catch(() => null);
      if (!tRes.ok || !tData?.ticker) throw new Error(tData?.error || `No live ticker for ${clean}`);
      if (!cRes.ok || !Array.isArray(cData?.candles) || cData.candles.length === 0) {
        throw new Error(cData?.error || `No live candles for ${clean}`);
      }
      const ticker = tData.ticker as CryptoAsset;
      setAssets((prev) => (prev.some((a) => a.symbol === ticker.symbol) ? prev : [...prev, { ...ticker, isCustom: true }]));
      setCandleMap((prev) => ({ ...prev, [ticker.symbol]: cData.candles }));
      clean = ticker.symbol;
      setSelectedSymbol(clean);
      setStrategy((prev) => ({ ...prev, symbol: clean }));
      setBotLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Market switched to ${clean}.`,
      ]);
    } catch (err: any) {
      setBotLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Could not add ${clean}: ${err?.message || 'no live market data'}`,
      ]);
    }
  };

  const indicators = useMemo(
    () =>
      computeIndicators(activeCandles, {
        macdFast: strategy.macdFastPeriod ?? 12,
        macdSlow: strategy.macdSlowPeriod ?? 26,
        macdSignal: strategy.macdSignalPeriod ?? 9,
        rsiPeriod: strategy.rsiPeriod ?? 14,
        bollingerPeriod: strategy.bollingerPeriod ?? 20,
        bollingerStdDev: strategy.bollingerStdDev ?? 2,
      }),
    [
      activeCandles,
      strategy.macdFastPeriod,
      strategy.macdSlowPeriod,
      strategy.macdSignalPeriod,
      strategy.rsiPeriod,
      strategy.bollingerPeriod,
      strategy.bollingerStdDev,
    ]
  );

  // Detect cross-exchange spatial arbitrage from live order book quotes (lowest cost buy -> greatest spread sell)
  const arbitrageOpp: ArbitrageOpportunity | null = useMemo(
    () => scanCrossExchangeArbitrage(selectedSymbol, exchangeQuotes, exchanges, strategy.minArbitrageProfitPercent ?? 0.02),
    [selectedSymbol, exchangeQuotes, exchanges, strategy.minArbitrageProfitPercent]
  );

  // Total unrealized PnL across all open positions
  const totalUnrealizedPnl = useMemo(
    () => positions.reduce((sum, p) => sum + p.unrealizedPnl, 0),
    [positions]
  );

  // Keep strategy symbol in sync with selected asset
  useEffect(() => {
    setStrategy((prev) => ({ ...prev, symbol: selectedSymbol }));
  }, [selectedSymbol]);

  // Last order cooldown timestamp
  const lastOrderTimeRef = useRef<number>(0);

  // Live-order bookkeeping. The exchange is the source of truth: local state is only updated AFTER the exchange accepts an order.
  const positionsRef = useRef<Position[]>([]);
  const dailyLossRef = useRef<number>(0);
  const pendingCloseRef = useRef<Set<string>>(new Set()); // position ids with an exit order in flight
  const closeRetryAfterRef = useRef<Map<string, number>>(new Map()); // back-off after a rejected exit
  const pendingEntryRef = useRef<boolean>(false); // an entry/arbitrage order is in flight
  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);
  useEffect(() => {
    dailyLossRef.current = dailyLossUsd;
  }, [dailyLossUsd]);

  const logBot = (msg: string) =>
    setBotLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  /** Book a confirmed BUY (position + cash + order + execution log). Call only after the exchange accepted the order. */
  const bookConfirmedBuy = (newPos: Position, order: Order, margin: number, fee: number, savingsUsd: number, routeName: string) => {
    setPortfolio((p) => ({
      ...p,
      cash: p.cash - margin - fee,
      totalSavingsFromSOR: (p.totalSavingsFromSOR || 0) + savingsUsd,
    }));
    setPositions((pos) => [...pos, newPos]);
    setOrders((ords) => [order, ...ords]);
    if (user?.uid) {
      persistExecutionLog(user.uid, {
        id: order.id,
        timestamp: order.timestamp,
        symbol: order.symbol,
        type: order.side,
        netProfitUsd: 0,
        status: 'COMPLETED',
        route: routeName,
      }).catch(() => {});
    }
  };

  // Condition evaluation for UI feedback & Agent execution
  const { isBuyConditionMet, buyConditionReason, isSellConditionMet, sellConditionReason } = useMemo(() => {
    let met = false;
    let reason = '';
    let sellMet = false;
    let sellReason = '';

    const trend = indicators.trendAnalysis;
    const bbPercentB = indicators.bollinger.percentB ?? 0.5;

    // --- BUY SIGNALS ---
    if (strategy.triggerType === 'TRIPLE_CONFLUENCE_PRO') {
      const precisionBuy = trend?.signals.isPrecisionBuy;
      const scoreOk = (trend?.confluenceScore ?? 0) >= 30;
      const rsiOk = indicators.rsi <= strategy.rsiBuyThreshold + 4;
      const macdOk = indicators.macd.histogram > 0 || indicators.macd.isBullishCross;
      const bbOk = bbPercentB <= 0.45;

      met = Boolean(precisionBuy || (scoreOk && rsiOk && macdOk && bbOk));
      reason = met
        ? `Triple Confluence Bullish Buy (${trend?.confluenceScore ?? 0}% Score): MACD Hist ${indicators.macd.histogram.toFixed(2)} + RSI ${indicators.rsi.toFixed(1)} + BB %B ${bbPercentB.toFixed(2)}`
        : `Monitoring Triple Confluence (Score: ${trend?.confluenceScore ?? 0}%, RSI: ${indicators.rsi.toFixed(1)}, MACD Hist: ${indicators.macd.histogram.toFixed(2)})`;
    } else if (strategy.triggerType === 'BOLLINGER_MACD_SQUEEZE') {
      const squeezeOrDip = indicators.bollinger.isSqueeze || bbPercentB <= 0.30;
      const macdBullish = indicators.macd.histogram > 0 || indicators.macd.isBullishCross;
      met = Boolean(squeezeOrDip && macdBullish);
      reason = met
        ? `Bollinger Squeeze + MACD Surge: BB %B ${bbPercentB.toFixed(2)} (${indicators.bollinger.isSqueeze ? 'Squeeze Active' : 'Band Pinch'}) with MACD Hist +${indicators.macd.histogram.toFixed(2)}`
        : `Waiting for Squeeze / Band Pinch (%B: ${bbPercentB.toFixed(2)}) + Positive MACD Hist (${indicators.macd.histogram.toFixed(2)})`;
    } else if (strategy.triggerType === 'MACD_CROSSOVER') {
      const goldenCross = indicators.macd.isBullishCross;
      const expandingMomentum = indicators.macd.histogram > 0 && indicators.macd.isHistogramExpanding && indicators.rsi <= strategy.rsiBuyThreshold + 8;
      met = Boolean(goldenCross || expandingMomentum);
      reason = met
        ? `MACD Bullish Signal: ${goldenCross ? 'Golden Cross (MACD > Signal)' : `Histogram Expanding (+${indicators.macd.histogram.toFixed(2)})`} & RSI ${indicators.rsi.toFixed(1)}`
        : `Monitoring MACD Crossover (MACD: ${indicators.macd.macd.toFixed(2)} vs Sig: ${indicators.macd.signal.toFixed(2)}, Hist: ${indicators.macd.histogram.toFixed(2)})`;
    } else if (strategy.triggerType === 'RSI_DIVERGENCE_REVERSAL') {
      const isDiv = Boolean(trend?.signals.divergenceStatus?.includes('Bullish'));
      const isOversoldBounce = indicators.rsi <= strategy.rsiBuyThreshold && indicators.macd.histogram > -0.4;
      met = isDiv || isOversoldBounce;
      reason = met
        ? `RSI Reversal Signal: ${isDiv ? 'Bullish Regular Divergence Confirmed' : `RSI Deep Dip (${indicators.rsi.toFixed(1)})`} & MACD Curving Up`
        : `Scanning for RSI Divergence / Reversal (RSI: ${indicators.rsi.toFixed(1)}, Divergence: ${trend?.signals.divergenceStatus || 'None'})`;
    } else if (strategy.triggerType === 'CROSS_EXCHANGE_ARBITRAGE') {
      met = Boolean(arbitrageOpp && arbitrageOpp.isActionable && arbitrageOpp.netSpreadPercent >= strategy.minArbitrageProfitPercent);
      reason = arbitrageOpp && arbitrageOpp.isActionable
        ? `Arbitrage Window: Buy ${arbitrageOpp.buyExchangeName} / Sell ${arbitrageOpp.sellExchangeName} (+${arbitrageOpp.netSpreadPercent.toFixed(3)}% Net)`
        : `Scanning cross-exchange spread (Threshold: >= ${strategy.minArbitrageProfitPercent}%)`;
    } else if (strategy.triggerType === 'RSI_OVERSOLD') {
      met = indicators.rsi <= strategy.rsiBuyThreshold;
      reason = `RSI: ${indicators.rsi.toFixed(1)} (Buy trigger: <= ${strategy.rsiBuyThreshold})`;
    } else if (strategy.triggerType === 'MOMENTUM_COMBO') {
      const rsiOk = indicators.rsi <= strategy.rsiBuyThreshold + 4;
      const macdOk = indicators.macd.histogram > 0;
      met = rsiOk && macdOk;
      reason = `RSI: ${indicators.rsi.toFixed(1)} & MACD Hist: ${indicators.macd.histogram.toFixed(2)}`;
    } else if (strategy.triggerType === 'EMA_BREAKOUT') {
      met = indicators.ema9 > indicators.ema21;
      reason = `EMA 9 (${formatCurrency(indicators.ema9, activeAsset.decimals)}) > EMA 21 (${formatCurrency(indicators.ema21, activeAsset.decimals)})`;
    } else if (strategy.triggerType === 'BOLLINGER_BOUNCE') {
      met = activeAsset.price <= indicators.bollinger.lower * 1.003 || bbPercentB <= 0.08;
      reason = `Price (${formatCurrency(activeAsset.price, activeAsset.decimals)}) near Lower Band (${formatCurrency(indicators.bollinger.lower, activeAsset.decimals)}, %B: ${bbPercentB.toFixed(2)})`;
    }

    // --- SELL / EXIT SIGNALS DERIVED FROM MACD, RSI & BOLLINGER BANDS ---
    if (strategy.triggerType === 'TRIPLE_CONFLUENCE_PRO') {
      const precisionSell = trend?.signals.isPrecisionSell;
      const scoreBearish = (trend?.confluenceScore ?? 0) <= -20;
      const rsiOverbought = indicators.rsi >= strategy.rsiSellThreshold;
      const macdBearish = indicators.macd.isBearishCross || (indicators.macd.histogram < 0 && indicators.rsi >= 60);
      const bbUpperReject = bbPercentB >= 0.88 || indicators.bollinger.isPiercingUpper;

      sellMet = Boolean(precisionSell || scoreBearish || rsiOverbought || (macdBearish && bbUpperReject));
      sellReason = sellMet
        ? `Triple Confluence Bearish Sell (${trend?.confluenceScore ?? 0}% Score): MACD Hist ${indicators.macd.histogram.toFixed(2)} + RSI ${indicators.rsi.toFixed(1)} + BB %B ${bbPercentB.toFixed(2)}`
        : `Guarding Positions (RSI: ${indicators.rsi.toFixed(1)} < ${strategy.rsiSellThreshold}, MACD Hist: ${indicators.macd.histogram.toFixed(2)}, BB %B: ${bbPercentB.toFixed(2)})`;
    } else if (strategy.triggerType === 'BOLLINGER_MACD_SQUEEZE') {
      const upperPierce = bbPercentB >= 0.88 || indicators.bollinger.isPiercingUpper;
      const momentumReversal = indicators.macd.histogram < 0 || indicators.rsi >= strategy.rsiSellThreshold;
      sellMet = Boolean(upperPierce && momentumReversal);
      sellReason = sellMet
        ? `Bollinger Upper Band Pierced (%B: ${bbPercentB.toFixed(2)}) & Momentum Turning Red (${indicators.macd.histogram.toFixed(2)})`
        : `Monitoring Bollinger Band %B (${bbPercentB.toFixed(2)} < 0.88) & MACD Hist (${indicators.macd.histogram.toFixed(2)})`;
    } else if (strategy.triggerType === 'MACD_CROSSOVER') {
      const deathCross = indicators.macd.isBearishCross;
      const bearishRegime = indicators.macd.macd < indicators.macd.signal && indicators.macd.histogram < 0 && indicators.rsi >= 58;
      const rsiExtreme = indicators.rsi >= strategy.rsiSellThreshold;
      sellMet = Boolean(deathCross || bearishRegime || rsiExtreme);
      sellReason = sellMet
        ? `MACD Bearish Signal: ${deathCross ? 'Death Cross (MACD < Signal)' : `Bearish Momentum (Hist ${indicators.macd.histogram.toFixed(2)})`} & RSI ${indicators.rsi.toFixed(1)}`
        : `Monitoring MACD Lines (MACD: ${indicators.macd.macd.toFixed(2)} vs Sig: ${indicators.macd.signal.toFixed(2)}, Hist: ${indicators.macd.histogram.toFixed(2)})`;
    } else if (strategy.triggerType === 'RSI_DIVERGENCE_REVERSAL') {
      const isBearishDiv = Boolean(trend?.signals.divergenceStatus?.includes('Bearish'));
      const isOverbought = indicators.rsi >= strategy.rsiSellThreshold;
      sellMet = Boolean(isBearishDiv || (isOverbought && indicators.macd.histogram < 0));
      sellReason = sellMet
        ? `RSI Bearish Reversal: ${isBearishDiv ? 'Bearish Regular Divergence Confirmed' : `RSI Overbought Peak (${indicators.rsi.toFixed(1)})`} & MACD Curving Down`
        : `Scanning for RSI Divergence / Reversal (RSI: ${indicators.rsi.toFixed(1)} vs ${strategy.rsiSellThreshold})`;
    } else if (strategy.triggerType === 'BOLLINGER_BOUNCE') {
      sellMet = Boolean(bbPercentB >= 0.90 || indicators.bollinger.isPiercingUpper || indicators.rsi >= strategy.rsiSellThreshold);
      sellReason = `Bollinger Upper Resistance (%B: ${bbPercentB.toFixed(2)} >= 0.90, RSI: ${indicators.rsi.toFixed(1)})`;
    } else if (strategy.triggerType === 'EMA_BREAKOUT') {
      sellMet = Boolean(indicators.ema9 < indicators.ema21 || indicators.rsi >= strategy.rsiSellThreshold);
      sellReason = `EMA 9 (${formatCurrency(indicators.ema9, activeAsset.decimals)}) < EMA 21 (${formatCurrency(indicators.ema21, activeAsset.decimals)}) or RSI Overbought`;
    } else if (strategy.triggerType === 'MOMENTUM_COMBO') {
      sellMet = Boolean(indicators.rsi >= strategy.rsiSellThreshold || (indicators.macd.histogram < 0 && indicators.rsi >= 58));
      sellReason = `Momentum Exhaustion: RSI ${indicators.rsi.toFixed(1)} / MACD Hist ${indicators.macd.histogram.toFixed(2)}`;
    } else {
      sellMet = Boolean(indicators.rsi >= strategy.rsiSellThreshold || indicators.macd.isBearishCross || trend?.signals.isPrecisionSell);
      sellReason = `RSI Overbought Exhaustion (${indicators.rsi.toFixed(1)} >= ${strategy.rsiSellThreshold}) or MACD Bearish Reversal`;
    }

    // --- INTEGRATE SENTIMENT INTELLIGENCE INTO BOT DECISION GATING ---
    if (strategy.sentimentIntegrationEnabled && sentimentReport) {
      const mode = strategy.sentimentMode || 'CONFIRMATORY';
      const cleanSym = selectedSymbol.split('/')[0];
      const assetSentiment = sentimentReport.assetBreakdown?.[cleanSym];
      const effectiveSentimentScore = assetSentiment ? assetSentiment.score : sentimentReport.compositeScore;
      const directive = sentimentReport.tradingDirective;

      if (mode === 'CONFIRMATORY') {
        // Confirmatory Mode: Technical buy signal MUST be verified by sentiment.
        // If sentiment is heavily bearish or directive explicitly says SUPPRESS_BUY, suppress the trade.
        if (met) {
          const minThreshold = strategy.minSentimentThreshold ?? -20;
          if (directive?.sentimentGateStatus === 'SUPPRESS_BUY' || effectiveSentimentScore < minThreshold) {
            met = false;
            reason = `⛔ Sentiment Gate Veto (${effectiveSentimentScore > 0 ? '+' : ''}${effectiveSentimentScore} / ${assetSentiment?.sentiment || sentimentReport.overallSentiment}): ${directive?.reasoning || 'Bearish news/social media sentiment suppresses entries'}`;
          } else {
            reason = `${reason} • 🟢 Sentiment Validated (${effectiveSentimentScore > 0 ? '+' : ''}${effectiveSentimentScore} ${assetSentiment?.sentiment || sentimentReport.overallSentiment})`;
          }
        }

        // Emergency Technical/Sentiment Exit: If panic conditions or extreme liquidation fear emerges, trigger exit
        if (!sellMet && (directive?.sentimentGateStatus === 'FORCE_SELL_RISK' || effectiveSentimentScore <= -60)) {
          sellMet = true;
          sellReason = `🚨 Sentiment Emergency Exit Triggered (${effectiveSentimentScore} Panic / Extreme Fear): ${directive?.reasoning || 'Elevated liquidation cascade fear'}`;
        }
      } else if (mode === 'WEIGHTED_CONFLUENCE') {
        // Weighted Confluence Mode: Blends technical score with sentiment weight
        const weightPct = (strategy.sentimentWeightPercent || 30) / 100;
        if (met && effectiveSentimentScore < -35) {
          met = false;
          reason = `Weighted Sentiment Veto: Technical buy neutralized by negative news/social flow (${effectiveSentimentScore})`;
        } else if (met) {
          reason = `${reason} • 📊 Weighted Sentiment (${effectiveSentimentScore > 0 ? '+' : ''}${effectiveSentimentScore} @ ${(weightPct * 100).toFixed(0)}% weight)`;
        } else if (!met && effectiveSentimentScore >= 65 && indicators.rsi <= 45 && indicators.macd.histogram >= -0.2) {
          // Strong positive news breakout catalyst
          met = true;
          reason = `🚀 Sentiment Catalyst Entry: Ultra-Bullish Sentiment (${effectiveSentimentScore} / Strong News Flow) with RSI ${indicators.rsi.toFixed(1)}`;
        }

        if (!sellMet && effectiveSentimentScore <= -50 && indicators.rsi >= 50) {
          sellMet = true;
          sellReason = `Sentiment Bearish Confluence Exit: Negative news flow (${effectiveSentimentScore}) confirms momentum breakdown`;
        }
      } else if (mode === 'CONTRARIAN') {
        // Contrarian Mode: Accumulate in peak fear bottoms at technical support; take profit in euphoria
        if (effectiveSentimentScore <= -50 && (indicators.rsi <= 40 || bbPercentB <= 0.25)) {
          met = true;
          reason = `💎 Contrarian 'Blood in the Streets' Buy: Extreme Fear (${effectiveSentimentScore}) at RSI Support (${indicators.rsi.toFixed(1)}) / %B ${bbPercentB.toFixed(2)}`;
        }
        if (effectiveSentimentScore >= 65 && indicators.rsi >= 65) {
          sellMet = true;
          sellReason = `Contrarian Distribution Exit: Extreme Euphoria / Greed Peak (${effectiveSentimentScore}) with RSI ${indicators.rsi.toFixed(1)}`;
        }
      }
    }

    return {
      isBuyConditionMet: met,
      buyConditionReason: reason,
      isSellConditionMet: sellMet,
      sellConditionReason: sellReason,
    };
  }, [strategy, indicators, activeAsset, arbitrageOpp, sentimentReport, selectedSymbol]);

  // Toggle exchange connection in pool
  const handleToggleExchange = (id: ExchangeId) => {
    setExchanges((prev) =>
      prev.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e))
    );
  };

  const handleUpdateExchangeFee = (id: ExchangeId, takerFee: number) => {
    setExchanges((prev) =>
      prev.map((e) => (e.id === id ? { ...e, takerFeePercent: takerFee } : e))
    );
  };

  // Set Routing Mode
  const handleSetRoutingMode = (mode: ExecutionRoutingMode) => {
    setStrategy((prev) => ({ ...prev, routingMode: mode }));
    setBotLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] Order execution mode switched to: ${
        mode === 'SMART_ORDER_ROUTER' ? 'Smart Order Router (Best Net Price across all exchanges)' : `Direct route exclusively to ${mode}`
      }`,
    ]);
  };

  // Reset Risk Circuit Breaker
  const handleResetCircuitBreaker = () => {
    setDailyLossUsd(0);
    setStrategy((prev) => ({ ...prev, circuitBreakerActive: false }));
    setBotLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 🟢 CIRCUIT BREAKER RESET: Daily loss counter cleared ($0.00). Automated trading re-enabled.`,
    ]);
  };

  // Manual Order Handler using Smart Order Router
  const handleManualOrder = async (side: 'BUY' | 'SELL') => {
    const now = Date.now();

    if (side === 'BUY') {
      const leverage = strategy.leverage;
      let margin: number;
      let dynamicSizingRes: DynamicPositionSizeResult | undefined;

      if (strategy.dynamicPositionSizing) {
        const currentAsset = assets.find((a) => a.symbol === selectedSymbol);
        const safeAtr = indicators.atr || (currentAsset ? currentAsset.price * 0.018 : 100);
        dynamicSizingRes = calculateDynamicPositionSize({
          portfolioCash: portfolio.cash,
          currentPrice: currentAsset ? currentAsset.price : 68000,
          atr: safeAtr,
          atrMultiplier: strategy.atrMultiplier || 2.0,
          riskPerTradePercent: strategy.riskPerTradePercent || 2.0,
          leverage,
          maxCapPercent: 35.0,
          minOrderUsd: 25.0,
        });
        margin = dynamicSizingRes.margin;
      } else {
        margin = portfolio.cash * (strategy.orderSizePercent / 100);
      }

      if (margin < 25) {
        setBotLogs((prev) => [
          ...prev,
          `[${new Date(now).toLocaleTimeString()}] Cannot BUY: Insufficient cash balance ($${portfolio.cash.toFixed(2)}).`,
        ]);
        return;
      }

      const notional = margin * leverage;

      // Route via Smart Order Router to find the lowest effective buy price
      const route = routeOrderSmart(
        'BUY',
        selectedSymbol,
        notional,
        exchangeQuotes,
        exchanges,
        strategy.routingMode,
        activeAsset?.price
      );

      const executedPrice = route.rawPrice;
      const fee = route.feeAmountUsd;
      const amount = notional / executedPrice;

      const liqDrop = 0.9 / leverage;
      const liquidationPrice = executedPrice * (1 - liqDrop);

      // Advanced Stop-Loss & Take-Profit Targets
      const effectiveStopLossPct = (strategy.dynamicPositionSizing && dynamicSizingRes)
        ? dynamicSizingRes.stopDistancePercent
        : strategy.stopLossPercent;

      const effectiveTakeProfitPct = strategy.takeProfitType === 'RISK_REWARD_RATIO'
        ? effectiveStopLossPct * (strategy.riskRewardRatio || 2.5)
        : strategy.takeProfitPercent;

      const takeProfitPrice = executedPrice * (1 + (effectiveTakeProfitPct / 100) / leverage);
      const stopLossPrice = executedPrice * (1 - (effectiveStopLossPct / 100) / leverage);

      const newPosition: Position = {
        id: `pos-${now}-${Math.random().toString(36).substr(2, 4)}`,
        symbol: selectedSymbol,
        entryPrice: executedPrice,
        currentPrice: executedPrice,
        amount,
        margin,
        leverage,
        notional,
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
        highestPrice: executedPrice,
        liquidationPrice,
        openTime: now,
        takeProfitPrice,
        stopLossPrice,
        strategyTrigger: strategy.dynamicPositionSizing
          ? `Manual Buy (Dynamic Vol Sized)`
          : 'Manual User Order',
        exchange: route.bestExchange,
        exchangeName: route.bestExchangeName,
        savingsUsd: route.savingsUsd,
        volatilityAtEntry: indicators.atr,
        isDynamicSized: !!strategy.dynamicPositionSizing,
        riskRewardRatio: strategy.riskRewardRatio || 2.5,
        stopLossDistanceUsd: executedPrice - stopLossPrice,
        targetProfitUsd: takeProfitPrice - executedPrice,
      };

      const order: Order = {
        id: `ord-${now}`,
        timestamp: now,
        symbol: selectedSymbol,
        side: 'BUY',
        type: 'MARKET',
        price: executedPrice,
        amount,
        notional,
        fee,
        exchange: route.bestExchange,
        exchangeName: route.bestExchangeName,
        savingsUsd: route.savingsUsd,
        savingsPercent: route.savingsPercent,
        routedViaSOR: strategy.routingMode === 'SMART_ORDER_ROUTER',
        reason: route.routeReason,
      };

      if (pendingEntryRef.current) {
        logBot('Another order is still awaiting exchange confirmation; try again in a moment.');
        return;
      }
      pendingEntryRef.current = true;
      logBot(`Sending live BUY to ${route.bestExchangeName}: ${amount.toFixed(4)} ${selectedSymbol} (~${formatCurrency(notional)})...`);
      try {
        const res = await executeTradeOnExchange({
          exchange: route.bestExchange,
          symbol: selectedSymbol,
          side: 'BUY',
          amount,
          notional,
          price: executedPrice,
          isLiveRealMoney: true,
        });
        if (!res.success) {
          logBot(`⚠️ LIVE BUY NOT PLACED (${res.status}): ${res.error || 'Check API credentials/permissions'}. Nothing was booked.`);
          return;
        }
        bookConfirmedBuy(newPosition, order, margin, fee, route.savingsUsd, route.bestExchangeName);
        logBot(`🟢 LIVE BUY ACCEPTED by ${route.bestExchangeName} (ref ${res.exchangeOrderId || res.cryptographicReceipt}): ${amount.toFixed(4)} ${selectedSymbol} @ ~${formatCurrency(executedPrice, activeAsset.decimals)} (quoted; actual fill may differ) (Saved $${route.savingsUsd.toFixed(2)})`);
      } catch (err: any) {
        logBot(`❌ LIVE BUY API ERROR: ${err.message}. Verify on the exchange before retrying; nothing was booked.`);
      } finally {
        pendingEntryRef.current = false;
      }
    } else {
      // Execute Sell: Close matching open positions OR execute direct spot market sell on exchange order books
      const matching = positions.filter((p) => p.symbol === selectedSymbol);
      if (matching.length > 0) {
        matching.forEach((pos) => closePosition(pos.id, 'MANUAL_CLOSE', 'Manual User Close'));
      } else if (positions.length > 0) {
        // Close open positions in active portfolio
        const targetPos = positions[0];
        closePosition(targetPos.id, 'MANUAL_CLOSE', `Manual Close (${targetPos.symbol})`);
      } else {
        // Direct Market SELL order routed across Binance, Coinbase, Kraken, Bybit via SOR
        const orderNotional = Math.min(Math.max(portfolio.cash * 0.2, 50), 2000);
        const route = routeOrderSmart(
          'SELL',
          selectedSymbol,
          orderNotional,
          exchangeQuotes,
          exchanges,
          strategy.routingMode,
          activeAsset?.price
        );
        const executedPrice = route.rawPrice;
        const fee = route.feeAmountUsd;
        const amount = orderNotional / executedPrice;

        const manualSellOrder: Order = {
          id: `ord-sell-${now}`,
          timestamp: now,
          symbol: selectedSymbol,
          side: 'SELL',
          type: 'MARKET',
          price: executedPrice,
          amount,
          notional: orderNotional,
          fee,
          exchange: route.bestExchange,
          exchangeName: route.bestExchangeName,
          savingsUsd: route.savingsUsd,
          savingsPercent: route.savingsPercent,
          routedViaSOR: strategy.routingMode === 'SMART_ORDER_ROUTER',
          pnl: 0,
          reason: `Manual Market SELL order routed to ${route.bestExchangeName} (Highest Bid)`,
        };

        if (pendingEntryRef.current) {
          logBot('Another order is still awaiting exchange confirmation; try again in a moment.');
          return;
        }
        pendingEntryRef.current = true;
        logBot(`Sending live SELL to ${route.bestExchangeName}: ${amount.toFixed(4)} ${selectedSymbol} (~${formatCurrency(orderNotional)})...`);
        try {
          const res = await executeTradeOnExchange({
            exchange: route.bestExchange,
            symbol: selectedSymbol,
            side: 'SELL',
            amount,
            notional: orderNotional,
            price: executedPrice,
            isLiveRealMoney: true,
          });
          if (!res.success) {
            logBot(`⚠️ LIVE SELL NOT PLACED (${res.status}): ${res.error || 'rejected'}. Nothing was booked.`);
            return;
          }
          setOrders((ords) => [manualSellOrder, ...ords]);
          if (user?.uid) {
            persistExecutionLog(user.uid, {
              id: manualSellOrder.id,
              timestamp: manualSellOrder.timestamp,
              symbol: manualSellOrder.symbol,
              type: manualSellOrder.side,
              netProfitUsd: 0,
              status: 'COMPLETED',
              route: route.bestExchangeName,
            }).catch(() => {});
          }
          logBot(`🔴 LIVE SPOT SELL ACCEPTED by ${route.bestExchangeName} (ref ${res.exchangeOrderId || res.cryptographicReceipt}): ${amount.toFixed(4)} ${selectedSymbol} @ ~${formatCurrency(executedPrice, activeAsset.decimals)} (quoted; actual fill may differ).`);
        } catch (err: any) {
          logBot(`❌ LIVE SELL API ERROR: ${err.message}. Verify on the exchange before retrying.`);
        } finally {
          pendingEntryRef.current = false;
        }
      }
    }
  };

  // Instant Cross-Exchange Best-Market Spread Arbitrage Execution
  const handleExecuteArbitrage = async (opp: ArbitrageOpportunity) => {
    const now = Date.now();
    const sizePercent = (strategy.orderSizePercent || 25) / 100;
    const clipNotional = Math.min(Math.max(portfolio.cash * sizePercent, 15), 2500);
    if (portfolio.cash < 15) {
      setBotLogs((prev) => [
        `[${new Date(now).toLocaleTimeString()}] Best-Market Arbitrage paused: Available bot capital (${formatCurrency(portfolio.cash)}) is below minimum clip requirement ($15.00).`,
        ...prev,
      ]);
      return;
    }

    const buyEx = exchanges.find((e) => e.id === opp.buyExchange);
    const sellEx = exchanges.find((e) => e.id === opp.sellExchange);
    const buyFee = clipNotional * ((buyEx?.takerFeePercent || 0.075) / 100);
    const sellFee = clipNotional * ((sellEx?.takerFeePercent || 0.075) / 100);
    const grossProfit = clipNotional * (opp.grossSpreadPercent / 100);
    const netProfit = grossProfit - buyFee - sellFee;
    const amount = clipNotional / opp.buyAskPrice;

    // Dual-leg order logging
    const buyLegOrder: Order = {
      id: `ord-arb-buy-${now}`,
      timestamp: now,
      symbol: opp.symbol,
      side: 'BUY',
      type: 'ARBITRAGE',
      price: opp.buyAskPrice,
      amount,
      notional: clipNotional,
      fee: buyFee,
      exchange: opp.buyExchange,
      exchangeName: opp.buyExchangeName,
      reason: `Best-Market Spread Arb (Leg 1): Bought on lowest cost market (${opp.buyExchangeName})`,
    };

    const sellLegOrder: Order = {
      id: `ord-arb-sell-${now}`,
      timestamp: now,
      symbol: opp.symbol,
      side: 'SELL',
      type: 'ARBITRAGE',
      price: opp.sellBidPrice,
      amount,
      notional: clipNotional,
      fee: sellFee,
      exchange: opp.sellExchange,
      exchangeName: opp.sellExchangeName,
      pnl: netProfit,
      pnlPercent: opp.netSpreadPercent,
      reason: `Best-Market Spread Arb (Leg 2): Sold on greatest spread market (${opp.sellExchangeName}) (Net spread +${opp.netSpreadPercent.toFixed(3)}%)`,
    };

    if (pendingEntryRef.current) return; // previous order still awaiting the exchange
    pendingEntryRef.current = true;
    logBot(`Sending live arbitrage legs: BUY ${opp.buyExchangeName} / SELL ${opp.sellExchangeName} (${amount.toFixed(4)} ${opp.symbol})...`);

    try {
      const [buyRes, sellRes] = await Promise.all([
        executeTradeOnExchange({
          exchange: opp.buyExchange,
          symbol: opp.symbol,
          side: 'BUY',
          amount,
          notional: clipNotional,
          price: opp.buyAskPrice,
          isLiveRealMoney: true,
        }),
        executeTradeOnExchange({
          exchange: opp.sellExchange,
          symbol: opp.symbol,
          side: 'SELL',
          amount,
          notional: clipNotional,
          price: opp.sellBidPrice,
          isLiveRealMoney: true,
        }),
      ]);

      if (!buyRes.success && !sellRes.success) {
        logBot(`⚠️ ARBITRAGE NOT PLACED: BUY (${buyRes.status}) ${buyRes.error || ''} | SELL (${sellRes.status}) ${sellRes.error || ''}. Nothing was booked.`);
        return;
      }

      if (!buyRes.success || !sellRes.success) {
        // One leg is live and the other is not: the account now has unhedged exposure. Record only the leg that exists.
        const filledLeg = buyRes.success ? buyLegOrder : sellLegOrder;
        setOrders((prev) => [{ ...filledLeg, pnl: undefined, pnlPercent: undefined }, ...prev]);
        logBot(
          `🚨 ARBITRAGE ONE-LEG ONLY: ${buyRes.success ? 'BUY filled on ' + opp.buyExchangeName + ' but SELL failed on ' + opp.sellExchangeName + ' (' + (sellRes.error || sellRes.status) + ')' : 'SELL filled on ' + opp.sellExchangeName + ' but BUY failed on ' + opp.buyExchangeName + ' (' + (buyRes.error || buyRes.status) + ')'}. You have unhedged exposure; close it manually on the exchange. No profit was booked.`
        );
        return;
      }

      // Both legs accepted. Profit below is the quoted-spread ESTIMATE (the exchange returns order ids, not fill prices).
      setPortfolio((p) => {
        const newCash = p.cash + netProfit;
        const totalTrades = p.totalTrades + 1;
        const winningTrades = p.winningTrades + (netProfit > 0 ? 1 : 0);
        const losingTrades = p.losingTrades + (netProfit <= 0 ? 1 : 0);
        const realizedPnl = p.realizedPnl + netProfit;
        const peakEquity = Math.max(p.peakEquity, newCash);
        const totalSavingsFromSOR = p.totalSavingsFromSOR + Math.max(0, netProfit);
        return { ...p, cash: newCash, totalTrades, winningTrades, losingTrades, realizedPnl, peakEquity, totalSavingsFromSOR };
      });
      setOrders((prev) => [sellLegOrder, buyLegOrder, ...prev]);

      if (user?.uid) {
        persistExecutionLog(user.uid, {
          id: buyLegOrder.id,
          timestamp: buyLegOrder.timestamp,
          symbol: buyLegOrder.symbol,
          type: 'ARBITRAGE_BUY',
          netProfitUsd: 0,
          status: 'COMPLETED',
          route: opp.buyExchangeName,
        }).catch(() => {});
        persistExecutionLog(user.uid, {
          id: sellLegOrder.id,
          timestamp: sellLegOrder.timestamp,
          symbol: sellLegOrder.symbol,
          type: 'ARBITRAGE_SELL',
          netProfitUsd: netProfit,
          status: 'COMPLETED',
          route: opp.sellExchangeName,
        }).catch(() => {});
      }

      fetch('/api/trade/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.uid || undefined,
          tradeId: `arb-${now}`,
          symbol: opp.symbol,
          side: 'BUY_AND_SELL',
          type: 'ARBITRAGE',
          buyExchange: opp.buyExchangeName,
          sellExchange: opp.sellExchangeName,
          buyPrice: opp.buyAskPrice,
          sellPrice: opp.sellBidPrice,
          grossSpreadPercent: opp.grossSpreadPercent,
          netSpreadPercent: opp.netSpreadPercent,
          netProfitUsd: netProfit,
          notionalUsd: clipNotional,
          route: `${opp.buyExchangeName} -> ${opp.sellExchangeName}`,
          status: 'COMPLETED',
        }),
      }).catch(() => {});

      logBot(`⚡ ARBITRAGE BOTH LEGS ACCEPTED (refs ${buyRes.exchangeOrderId || buyRes.cryptographicReceipt} / ${sellRes.exchangeOrderId || sellRes.cryptographicReceipt}): ${opp.buyExchangeName} @ ${formatCurrency(opp.buyAskPrice, activeAsset.decimals)} -> ${opp.sellExchangeName} @ ${formatCurrency(opp.sellBidPrice, activeAsset.decimals)} | Est. net +${formatCurrency(netProfit)} (+${opp.netSpreadPercent.toFixed(3)}%, from quotes; confirm actual fills on the exchanges)`);
    } catch (err: any) {
      logBot(`❌ LIVE ARBITRAGE API ERROR: ${err.message}. Check both exchanges for partial fills before retrying.`);
    } finally {
      pendingEntryRef.current = false;
    }
  };

  // Handle Live Flash Loan Arbitrage Execution Broadcast from FlashArbBotDashboard
  const handleFlashArbExecuted = (trade: {
    symbol: string;
    profitUsd: number;
    chain: string;
    txHash: string;
    token: string;
    gasSavedUsd?: number;
    loanFeeSavedUsd?: number;
  }) => {
    const profit = Math.max(0, trade.profitUsd);
    setPortfolio((prev) => {
      const newCash = Number((prev.cash + profit).toFixed(2));
      const realizedPnl = Number((prev.realizedPnl + profit).toFixed(2));
      const totalTrades = prev.totalTrades + 1;
      const winningTrades = prev.winningTrades + 1;
      const peakEquity = Math.max(prev.peakEquity, newCash);

      if (user?.uid) {
        const updatedPortfolio: PortfolioState = {
          ...prev,
          cash: newCash,
          realizedPnl,
          totalTrades,
          winningTrades,
          peakEquity,
        };
        persistPortfolioToFirestore(user.uid, updatedPortfolio, positions, orders).catch(() => {});
      }

      return {
        ...prev,
        cash: newCash,
        realizedPnl,
        totalTrades,
        winningTrades,
        peakEquity,
      };
    });

    setBotLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] ⚡ LIVE FLASH ARBITRAGE EXECUTED on ${trade.chain}: Borrowed 0% Balancer liquidity for ${trade.symbol}, routed direct pool swap, +$${profit.toFixed(2)} USD net alpha swept to profit vault. (Tx: ${trade.txHash.slice(0, 10)}...)`,
      ...prev,
    ]);
  };

  // Close specific position using best routing
  const closePosition = (positionId: string, orderType: Order['type'] = 'MANUAL_CLOSE', reason = 'Manual Close') => {
    const now = Date.now();
    const pos = positionsRef.current.find((p) => p.id === positionId);
    if (!pos) return;
    // One exit order per position at a time, with back-off after a rejection (the 500ms bot loop would otherwise hammer the exchange).
    if (pendingCloseRef.current.has(positionId)) return;
    if (now < (closeRetryAfterRef.current.get(positionId) || 0)) return;
    pendingCloseRef.current.add(positionId);

    const matchingAsset = assets.find((a) => a.symbol === pos.symbol);
    const posBasePrice = matchingAsset?.price || pos.entryPrice;
    const relevantQuotes = exchangeQuotes.filter((q) => q.symbol === pos.symbol);

    const route = routeOrderSmart(
      'SELL',
      pos.symbol,
      pos.notional,
      relevantQuotes.length > 0 ? relevantQuotes : exchangeQuotes,
      exchanges,
      strategy.routingMode,
      posBasePrice
    );

    const executedExitPrice = route.rawPrice;
    const fee = route.feeAmountUsd;
    const grossPnl = pos.amount * (executedExitPrice - pos.entryPrice) * pos.leverage;
    const netPnl = grossPnl - fee;
    const returnedCapital = Math.max(0, pos.margin + netPnl);
    const isWin = netPnl > 0;

    logBot(`Sending live exit (${orderType}) for ${pos.symbol} to ${route.bestExchangeName}...`);

    executeTradeOnExchange({
      exchange: route.bestExchange,
      symbol: pos.symbol,
      side: 'SELL',
      amount: pos.amount,
      notional: pos.notional,
      price: executedExitPrice,
      isLiveRealMoney: true,
    })
      .then((res) => {
        if (!res.success) {
          closeRetryAfterRef.current.set(positionId, Date.now() + 15000);
          logBot(`⚠️ LIVE EXIT NOT PLACED on ${route.bestExchangeName} (${res.status}): ${res.error || 'rejected'}. Position stays open; retrying in 15s.`);
          return;
        }

        // Exchange accepted the exit: now (and only now) update local books. PnL is estimated from quotes.
        if (netPnl < 0) {
          const nextLoss = dailyLossRef.current + Math.abs(netPnl);
          dailyLossRef.current = nextLoss;
          setDailyLossUsd(nextLoss);
          if (strategy.dailyLossLimitUsd && nextLoss >= strategy.dailyLossLimitUsd) {
            setStrategy((st) => ({ ...st, circuitBreakerActive: true }));
            setBotRunning(false);
            logBot(`⛔ [CIRCUIT BREAKER TRIGGERED] Cumulative daily loss reached $${nextLoss.toFixed(2)} (Cap: $${strategy.dailyLossLimitUsd}). Automated trading halted to protect capital.`);
          }
        }

        setPortfolio((p) => {
          const newCash = p.cash + returnedCapital;
          const peakEquity = Math.max(p.peakEquity, newCash);
          const currentDrawdown = peakEquity > 0 ? ((peakEquity - newCash) / peakEquity) * 100 : 0;
          return {
            ...p,
            cash: newCash,
            realizedPnl: p.realizedPnl + netPnl,
            totalTrades: p.totalTrades + 1,
            winningTrades: p.winningTrades + (isWin ? 1 : 0),
            losingTrades: p.losingTrades + (isWin ? 0 : 1),
            peakEquity,
            maxDrawdownPercent: Math.max(p.maxDrawdownPercent, currentDrawdown),
            totalSavingsFromSOR: (p.totalSavingsFromSOR || 0) + route.savingsUsd,
          };
        });

        const closeOrder: Order = {
          id: `ord-${now}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: now,
          symbol: pos.symbol,
          side: 'SELL',
          type: orderType,
          price: executedExitPrice,
          amount: pos.amount,
          notional: pos.notional,
          fee,
          exchange: route.bestExchange,
          exchangeName: route.bestExchangeName,
          savingsUsd: route.savingsUsd,
          savingsPercent: route.savingsPercent,
          routedViaSOR: strategy.routingMode === 'SMART_ORDER_ROUTER',
          pnl: netPnl,
          pnlPercent: pos.unrealizedPnlPercent,
          reason: `${reason} via ${route.bestExchangeName}`,
        };
        setOrders((prev) => [closeOrder, ...prev]);
        setPositions((cur) => cur.filter((p) => p.id !== positionId));

        if (user?.uid) {
          persistExecutionLog(user.uid, {
            id: closeOrder.id,
            timestamp: closeOrder.timestamp,
            symbol: closeOrder.symbol,
            type: closeOrder.side,
            netProfitUsd: netPnl,
            status: 'COMPLETED',
            route: route.bestExchangeName,
          }).catch(() => {});
        }

        logBot(`🟢 LIVE EXIT ACCEPTED on ${route.bestExchangeName} (ref ${res.exchangeOrderId || res.cryptographicReceipt}): closed ${pos.symbol} (${orderType}), est. net PnL ${formatCurrency(netPnl)} (${pos.unrealizedPnlPercent.toFixed(2)}%, from quotes; confirm actual fill on the exchange)`);
      })
      .catch((err) => {
        closeRetryAfterRef.current.set(positionId, Date.now() + 15000);
        logBot(`❌ LIVE EXIT API ERROR: ${err.message}. Verify on the exchange whether the order went through before retrying.`);
      })
      .finally(() => {
        pendingCloseRef.current.delete(positionId);
      });
  };

  // Reset Portfolio
  const handleResetPortfolio = () => {
    setPortfolio(INITIAL_PORTFOLIO);
    setPositions([]);
    setOrders([]);
    setBotLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] Trading portfolio reset to $0.00 cash balance.`,
    ]);
  };

  // Run AI Audit
  const handleRunAiAudit = async () => {
    setAiAuditModalOpen(true);
    setAiAuditLoading(true);

    try {
      const response = await fetch('/api/ai-strategy-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol,
          currentPrice: activeAsset.price,
          priceChange24h: activeAsset.change24h,
          rsi: indicators.rsi,
          macd: indicators.macd,
          strategyName: strategy.name,
          parameters: strategy,
          portfolio: {
            cash: portfolio.cash,
            positionsCount: positions.length,
            totalTrades: portfolio.totalTrades,
          },
        }),
      });

      const data = await response.json();
      if (data.success && data.analysis) {
        setAiAnalysis(data.analysis);
      } else {
        throw new Error(data.error || 'Failed to fetch AI audit');
      }
    } catch (err) {
      console.error('AI Audit request failed:', err);
      // Fallback local quant audit if server call fails
      setAiAnalysis({
        marketTrendSummary: `${selectedSymbol} is exhibiting elevated micro-structure volatility with RSI at ${indicators.rsi.toFixed(1)}.`,
        strategyCritique: `Your strategy runs at ${strategy.leverage}x leverage with TP ${strategy.takeProfitPercent}% and SL ${strategy.stopLossPercent}%.`,
        riskScore: strategy.leverage * 18 + (strategy.stopLossPercent > 4 ? 20 : 10),
        riskLevel: strategy.leverage > 3 ? 'High' : 'Moderate',
        recommendedAdjustments: [
          'Cap leverage to <= 2x to avoid sudden liquidation on 5% wicks.',
          'Adopt trailing stops of 1.5% to protect unrealized gains during spikes.',
          'Leverage Smart Order Routing across Binance & Kraken to save 0.05%-0.1% per turn on taker fees.',
        ],
        shortTermProfitOutlook:
          'High short-term return expectations usually trigger over-leveraging and catastrophic drawdown. Sustainable algorithmic growth requires strict capital defense.',
      });
    } finally {
      setAiAuditLoading(false);
    }
  };

  const handleApplyRecommendedParameters = () => {
    setStrategy((prev) => ({
      ...prev,
      leverage: Math.min(prev.leverage, 2),
      orderSizePercent: Math.min(prev.orderSizePercent, 15),
      stopLossPercent: Math.max(1.8, Math.min(prev.stopLossPercent, 2.5)),
      takeProfitPercent: Math.max(3.5, prev.takeProfitPercent),
      trailingStopEnabled: true,
      trailingStopPercent: 1.5,
      routingMode: 'SMART_ORDER_ROUTER',
    }));
    setBotLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] Applied AI-calibrated risk parameters (2x max lev, 15% sizing, trailing stop + Smart Order Routing enabled).`,
    ]);
  };

  // Live Automated Bot Execution & Position Risk Engine Loop (Real-Time 1x)
  useEffect(() => {
    const intervalId = setInterval(() => {
      const now = Date.now();

      // 1. Update Position Mark Prices & Evaluate Automated Exits based on Genuine Live Exchange Prices
      // The state updater below stays pure; exit orders are sent from this loop (never from inside an updater, which React may run twice).
      const marked = new Map<string, Position>();
      {
        positionsRef.current.forEach((pos) => {
          const currentAsset = assets.find((a) => a.symbol === pos.symbol);
          const markPrice = currentAsset ? currentAsset.price : pos.currentPrice;

          const rawPercent = ((markPrice - pos.entryPrice) / pos.entryPrice) * 100;
          const leveragedPercent = rawPercent * pos.leverage;
          const unrealizedPnl = (pos.margin * leveragedPercent) / 100;

          const highestPrice = Math.max(pos.highestPrice, markPrice);

          // Check Liquidation
          if (leveragedPercent <= -90) {
            closePosition(pos.id, 'LIQUIDATION', `Liquidation reached at ${formatCurrency(markPrice)}`);
            return;
          }

          // 1. Check Take-Profit: Either explicit TP target price achieved OR profit threshold % reached
          const isTakeProfitHit = (pos.takeProfitPrice && markPrice >= pos.takeProfitPrice) ||
            leveragedPercent >= strategy.takeProfitPercent;
          if (isTakeProfitHit) {
            const profitUsd = (pos.margin * leveragedPercent) / 100;
            closePosition(
              pos.id,
              'TAKE_PROFIT',
              `Target Take-Profit Reached at ${formatCurrency(markPrice)} (Secured +${leveragedPercent.toFixed(2)}% / +${formatCurrency(profitUsd)})`
            );
            return;
          }

          // 2. Check Dynamic Precision Indicator Sell / Exit Signal (MACD Death Cross / RSI Overbought / BB Reversal)
          const autoSell = strategy.autoSellEnabled !== false;
          if (autoSell && isSellConditionMet) {
            closePosition(
              pos.id,
              'TECHNICAL_EXIT',
              `Technical Sell Signal: ${sellConditionReason}`
            );
            return;
          }

          // 3. Check Stop-Loss: Either explicit SL threshold price breached OR loss threshold % reached
          const isStopLossHit = (pos.stopLossPrice && markPrice <= pos.stopLossPrice) ||
            leveragedPercent <= -strategy.stopLossPercent;
          if (isStopLossHit) {
            const lossUsd = Math.abs((pos.margin * leveragedPercent) / 100);
            closePosition(
              pos.id,
              'STOP_LOSS',
              `Automatic Stop-Loss Exited at ${formatCurrency(markPrice)} (Capped loss at ${leveragedPercent.toFixed(2)}% / -${formatCurrency(lossUsd)})`
            );
            return;
          }

          // 4. Check Trailing Stop
          if (strategy.trailingStopEnabled && highestPrice > pos.entryPrice) {
            const dropFromHighPercent = ((highestPrice - markPrice) / highestPrice) * 100 * pos.leverage;
            if (dropFromHighPercent >= strategy.trailingStopPercent) {
              closePosition(
                pos.id,
                'TRAILING_STOP',
                `Trailing Stop Triggered (${strategy.trailingStopPercent}% drop from peak ${formatCurrency(highestPrice)})`
              );
              return;
            }
          }

          marked.set(pos.id, {
            ...pos,
            currentPrice: markPrice,
            unrealizedPnl,
            unrealizedPnlPercent: leveragedPercent,
            highestPrice,
          });
        });
      }
      setPositions((current) => current.map((p) => marked.get(p.id) ?? p));

      // 4. Automated Bot Entry & Exit Execution (including MACD/RSI/BB Sell signals and Cross-Exchange Arbitrage)
      if (botRunning) {
        // Halt if Circuit Breaker is active
        if (strategy.circuitBreakerActive) {
          return;
        }

        const cooldownMs = strategy.cooldownSeconds * 1000 / simSpeed;
        const canExecute = !pendingEntryRef.current && now - lastOrderTimeRef.current >= cooldownMs;

        if (canExecute) {
          // Special Arbitrage Trigger
          if (strategy.triggerType === 'CROSS_EXCHANGE_ARBITRAGE' && arbitrageOpp && arbitrageOpp.isActionable) {
            lastOrderTimeRef.current = now;
            handleExecuteArbitrage(arbitrageOpp);
          } else if (isSellConditionMet && positions.some((p) => p.symbol === selectedSymbol)) {
            // AUTOMATED TECHNICAL SELL: If sell conditions trigger and open positions exist for this asset, close/sell them!
            lastOrderTimeRef.current = now;
            const openPositionsToSell = positions.filter((p) => p.symbol === selectedSymbol);
            openPositionsToSell.forEach((pos) => {
              closePosition(pos.id, 'TECHNICAL_EXIT', `Automated Technical Sell: ${sellConditionReason}`);
            });
            setBotLogs((prev) => [
              `[${new Date(now).toLocaleTimeString()}] 🔴 BOT AUTO-SELL TRIGGERED: Executed sell & closed ${openPositionsToSell.length} position(s) on ${selectedSymbol} (${sellConditionReason}).`,
              ...prev,
            ]);
          } else if (isBuyConditionMet && positions.length < strategy.maxPositions) {
            const leverage = strategy.leverage;
            let margin: number;
            let dynamicSizingRes: DynamicPositionSizeResult | undefined;

            if (strategy.dynamicPositionSizing) {
              const currentAsset = assets.find((a) => a.symbol === selectedSymbol);
              const safeAtr = indicators.atr || (currentAsset ? currentAsset.price * 0.018 : 100);
              dynamicSizingRes = calculateDynamicPositionSize({
                portfolioCash: portfolio.cash,
                currentPrice: currentAsset ? currentAsset.price : 68000,
                atr: safeAtr,
                atrMultiplier: strategy.atrMultiplier || 2.0,
                riskPerTradePercent: strategy.riskPerTradePercent || 2.0,
                leverage,
                maxCapPercent: 35.0,
                minOrderUsd: 30.0,
              });
              margin = dynamicSizingRes.margin;
            } else {
              margin = portfolio.cash * (strategy.orderSizePercent / 100);
            }

            // Dynamically scale position sizing with Sentiment Intelligence multiplier
            let sentimentMultiplier = 1.0;
            if (strategy.sentimentIntegrationEnabled && sentimentReport?.tradingDirective?.recommendedPositionMultiplier) {
              sentimentMultiplier = sentimentReport.tradingDirective.recommendedPositionMultiplier;
              margin = Math.max(30, margin * sentimentMultiplier);
            }

            if (margin >= 30) {
              lastOrderTimeRef.current = now;
              const notional = margin * leverage;

              // Smart Order Routing across Binance, Coinbase Pro, Kraken & Bybit
              const route = routeOrderSmart(
                'BUY',
                selectedSymbol,
                notional,
                exchangeQuotes,
                exchanges,
                strategy.routingMode,
                activeAsset?.price
              );

              const executedPrice = route.rawPrice;
              const fee = route.feeAmountUsd;
              const amount = notional / executedPrice;

              const liqDrop = 0.9 / leverage;
              const liquidationPrice = executedPrice * (1 - liqDrop);

              // Advanced Stop-Loss & Take-Profit Targets
              const effectiveStopLossPct = (strategy.dynamicPositionSizing && dynamicSizingRes)
                ? dynamicSizingRes.stopDistancePercent
                : strategy.stopLossPercent;

              const effectiveTakeProfitPct = strategy.takeProfitType === 'RISK_REWARD_RATIO'
                ? effectiveStopLossPct * (strategy.riskRewardRatio || 2.5)
                : strategy.takeProfitPercent;

              const takeProfitPrice = executedPrice * (1 + (effectiveTakeProfitPct / 100) / leverage);
              const stopLossPrice = executedPrice * (1 - (effectiveStopLossPct / 100) / leverage);

              const newPos: Position = {
                id: `pos-${now}-${Math.random().toString(36).substr(2, 4)}`,
                symbol: selectedSymbol,
                entryPrice: executedPrice,
                currentPrice: executedPrice,
                amount,
                margin,
                leverage,
                notional,
                unrealizedPnl: 0,
                unrealizedPnlPercent: 0,
                highestPrice: executedPrice,
                liquidationPrice,
                openTime: now,
                takeProfitPrice,
                stopLossPrice,
                strategyTrigger: strategy.dynamicPositionSizing
                  ? `[ATR Sized] ${buyConditionReason}`
                  : buyConditionReason,
                exchange: route.bestExchange,
                exchangeName: route.bestExchangeName,
                savingsUsd: route.savingsUsd,
                volatilityAtEntry: indicators.atr,
                isDynamicSized: !!strategy.dynamicPositionSizing,
                riskRewardRatio: strategy.riskRewardRatio || 2.5,
                stopLossDistanceUsd: executedPrice - stopLossPrice,
                targetProfitUsd: takeProfitPrice - executedPrice,
              };

              if (strategy.dynamicPositionSizing && dynamicSizingRes) {
                setBotLogs((prev) => [
                  ...prev,
                  `[${new Date(now).toLocaleTimeString()}] 🛡️ [VOLATILITY SIZING] ATR $${(indicators.atr || 0).toFixed(2)} (${dynamicSizingRes!.volatilityRegime} Vol) -> Margin scaled to $${margin.toFixed(2)} (${dynamicSizingRes!.sizingMultiplier}x base) | Defined Risk: $${dynamicSizingRes!.riskAmountUsd.toFixed(2)} (${strategy.riskPerTradePercent || 2}% max loss)`,
                ]);
              }

              const newOrder: Order = {
                id: `ord-${now}`,
                timestamp: now,
                symbol: selectedSymbol,
                side: 'BUY',
                type: 'MARKET',
                price: executedPrice,
                amount,
                notional,
                fee,
                exchange: route.bestExchange,
                exchangeName: route.bestExchangeName,
                savingsUsd: route.savingsUsd,
                savingsPercent: route.savingsPercent,
                routedViaSOR: strategy.routingMode === 'SMART_ORDER_ROUTER',
                reason: `Auto Trigger: ${buyConditionReason}`,
              };

              pendingEntryRef.current = true;
              logBot(`BOT sending live BUY to ${route.bestExchangeName}: ${amount.toFixed(4)} ${selectedSymbol} (~${formatCurrency(notional)})...`);
              executeTradeOnExchange({
                exchange: route.bestExchange,
                symbol: selectedSymbol,
                side: 'BUY',
                amount,
                notional,
                price: executedPrice,
                isLiveRealMoney: true,
              })
                .then((res) => {
                  if (!res.success) {
                    logBot(`⚠️ BOT LIVE BUY NOT PLACED (${res.status}): ${res.error}. Nothing was booked.`);
                    return;
                  }
                  bookConfirmedBuy(newPos, newOrder, margin, fee, route.savingsUsd, route.bestExchangeName);
                  logBot(`🟢 BOT LIVE BUY ACCEPTED on ${route.bestExchangeName} (ref ${res.exchangeOrderId || res.cryptographicReceipt}): ${amount.toFixed(4)} ${selectedSymbol} @ ~${formatCurrency(executedPrice, activeAsset.decimals)} (quoted; actual fill may differ) (Saved $${route.savingsUsd.toFixed(2)})`);
                })
                .catch((err) => {
                  logBot(`❌ BOT LIVE BUY API ERROR: ${err.message}. Verify on the exchange before the bot retries; nothing was booked.`);
                })
                .finally(() => {
                  pendingEntryRef.current = false;
                });
            }
          }
        }
      }
    }, 500);

    return () => clearInterval(intervalId);
  }, [
    simSpeed,
    botRunning,
    strategy,
    activeAsset,
    selectedSymbol,
    isBuyConditionMet,
    buyConditionReason,
    isSellConditionMet,
    sellConditionReason,
    arbitrageOpp,
    portfolio.cash,
    positions.length,
    exchangeQuotes,
    exchanges,
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-[#080B11] text-slate-100 font-sans">
      {/* Header */}
      <Header
        portfolio={portfolio}
        unrealizedPnl={totalUnrealizedPnl}
        botRunning={botRunning}
        onToggleBot={() => setBotRunning(!botRunning)}
        onResetPortfolio={handleResetPortfolio}
        onOpenAudit={handleRunAiAudit}
        onOpenBacktest={() => setBacktestModalOpen(true)}
        onOpenExchanges={() => setExchangeModalOpen(true)}
        onOpenFiatAccount={() => handleOpenFiatModal('DEBIT_CARD')}
        onOpenWithdraw={() => handleOpenFiatModal('WITHDRAW')}
        onOpenAiTroubleshooter={() => {
          setAiInitialPrompt(undefined);
          setAiTroubleshooterOpen(true);
        }}
        fiatAccountAvailableBalance={fiatAccount.availableBalance}
        simSpeed={simSpeed}
        onSetSimSpeed={setSimSpeed}
        activePositionsCount={positions.length}
        tradingMode={tradingMode}
        isLiveMarketConnected={isLiveMarketConnected}
        credentialsSummary={credentialsSummary}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onChainSignalsCount={onChainSignalsCount}
        sentimentScore={sentimentReport?.compositeScore}
        onOpenOkxWallet={() => setOkxWalletModalOpen(true)}
        okxConnectedAddress={okxConnectedAddress}
        onOpenCakeWallet={() => setCakeWalletModalOpen(true)}
      />

      {/* Educational Risk Guidance Banner */}
      <RiskDisclosureBanner />

      {activeTab === 'SENTIMENT_RADAR' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto p-4">
          <SentimentAnalysisPanel
            report={sentimentReport}
            loading={loadingSentiment}
            onRefresh={loadSentiment}
            onTriggerAiAnalysis={async (prompt) => {
              const res = await triggerAiSentimentAnalysis({ customQuery: prompt });
              if (res && res.report) {
                setSentimentReport(res.report);
              }
            }}
            strategy={strategy}
            onUpdateStrategy={(updates) => setStrategy((prev) => ({ ...prev, ...updates }))}
            selectedAssetSymbol={selectedSymbol}
            onSelectAsset={(sym) => {
              handleSelectSymbol(sym);
              setActiveTab('TRADING_DESK');
            }}
          />
        </main>
      ) : activeTab === 'ETHERSCAN_INTELLIGENCE' ? (
        <EtherscanIntelligencePage
          onBackToTradingDesk={() => setActiveTab('TRADING_DESK')}
          onTradeAsset={(sym) => {
            handleSelectSymbol(sym);
            setActiveTab('TRADING_DESK');
          }}
        />
      ) : activeTab === 'FLASH_ARB_BOT' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto p-4">
          <FlashArbBotDashboard
            onOpenAiTroubleshooter={(prompt?: string) => {
              setAiInitialPrompt(prompt);
              setAiTroubleshooterOpen(true);
            }}
            availableAssets={assets}
            okxConnectedAddress={okxConnectedAddress}
            onOpenOkxWallet={() => setOkxWalletModalOpen(true)}
            onOpenCakeWallet={() => setCakeWalletModalOpen(true)}
            onArbitrageExecuted={handleFlashArbExecuted}
          />
        </main>
      ) : activeTab === 'WALLET_MONITOR' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto p-4">
          <OnChainWalletMonitor
            onOpenOkxWallet={() => setOkxWalletModalOpen(true)}
            targetAddress={targetMonitorWallet}
          />
        </main>
      ) : (
        <>
          {/* Ticker Watch Bar */}
          <MarketWatchBar
        assets={assets}
        selectedSymbol={selectedSymbol}
        onSelectSymbol={handleSelectSymbol}
        onAddCustomSymbol={handleAddCustomSymbol}
      />

      {/* Main Trading Workstation Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 space-y-4">
        {/* Live Currency Treasury & Banking Rail */}
        <LiveCurrencyTreasuryCard
          fiatAccount={fiatAccount}
          onOpenModal={() => handleOpenFiatModal('FUND_BOT')}
          onOpenDebitLoad={() => handleOpenFiatModal('ADD_CARD')}
          onOpenBankConnect={() => handleOpenFiatModal('ADD_BANK')}
          onOpenWithdraw={() => handleOpenFiatModal('WITHDRAW')}
          onOpenFundBot={(method) => handleOpenFiatModal(method === 'CARD' ? 'ADD_CARD' : 'ADD_BANK')}
          onOpenCashCheck={() => handleOpenFiatModal('CASH_CHECK')}
          onOpenSecurity={() => handleOpenFiatModal('SECURITY')}
        />

        {/* Trading Desk Sub-Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-1 rounded-xl bg-slate-950/70 border border-slate-800/80 font-mono text-xs">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTradingDeskView('EXECUTION')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                tradingDeskView === 'EXECUTION'
                  ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="h-3 w-3 text-cyan-400" />
              <span>Execution Desk & Bot Station</span>
            </button>

            <button
              type="button"
              onClick={() => setTradingDeskView('CORRELATION_MATRIX')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                tradingDeskView === 'CORRELATION_MATRIX'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/50 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Compass className="h-3 w-3 text-cyan-400" />
              <span>Correlation Matrix & Clusters</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-500 pr-2">
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Feed Synced (Kraken · Coinbase · Binance)
            </span>
          </div>
        </div>

        {tradingDeskView === 'CORRELATION_MATRIX' ? (
          <CorrelationMatrixView
            assets={assets}
            candleMap={candleMap}
            selectedSymbol={selectedSymbol}
            onSelectSymbol={handleSelectSymbol}
            onApplyPairToBot={(symA) => {
              handleSelectSymbol(symA);
              setTradingDeskView('EXECUTION');
            }}
          />
        ) : (
          <>
            {/* Multi-Exchange Price Comparison & Smart Order Routing */}
            <MultiExchangeComparisonCard
              quotes={exchangeQuotes}
              exchanges={exchanges}
              selectedSymbol={selectedSymbol}
              decimals={activeAsset.decimals}
              routingMode={strategy.routingMode}
              onSetRoutingMode={handleSetRoutingMode}
              arbitrageOpp={arbitrageOpp}
              onExecuteArbitrage={handleExecuteArbitrage}
              onOpenExchangeSettings={() => setExchangeModalOpen(true)}
              totalSavedUsd={portfolio.totalSavingsFromSOR || 0}
            />

            {/* Middle Split: Interactive Price Chart & Bot Control Center */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 xl:col-span-8">
                <PriceChart
                  symbol={selectedSymbol}
                  candles={activeCandles}
                  indicators={indicators}
                  orders={orders}
                  decimals={activeAsset.decimals}
                />
              </div>

              <div className="lg:col-span-5 xl:col-span-4">
                <StrategyBotController
                  strategy={strategy}
                  onUpdateStrategy={setStrategy}
                  indicators={indicators}
                  botRunning={botRunning}
                  onToggleBot={() => {
                    if (!botRunning && portfolio.cash < 30) {
                      handleOpenFiatModal('FUND_BOT');
                      setBotLogs((prev) => [
                        ...prev,
                        `[${new Date().toLocaleTimeString()}] BOT CAPITAL ADVISORY: Insufficient margin ($${portfolio.cash.toFixed(2)} USD). Opening funding portal to load capital from bank or check card.`,
                      ]);
                      return;
                    }
                    setBotRunning(!botRunning);
                  }}
                  onManualOrder={handleManualOrder}
                  isBuyConditionMet={isBuyConditionMet}
                  buyConditionReason={buyConditionReason}
                  isSellConditionMet={isSellConditionMet}
                  sellConditionReason={sellConditionReason}
                  botCash={portfolio.cash}
                  onOpenDepositToBot={(method) => handleOpenFiatModal(method === 'CARD' ? 'DEBIT_CARD' : 'BANK_TRANSFER')}
                  availableAssets={assets}
                  onSelectAsset={handleSelectSymbol}
                  currentDailyLossUsd={dailyLossUsd}
                  onResetCircuitBreaker={handleResetCircuitBreaker}
                  activePositionsCount={positions.length}
                  onQuickFundMargin={() => handleBotCashAdjusted(1000)}
                />
              </div>
            </div>
          </>
        )}

        {/* Bottom Section: Positions & Orders Table */}
        <PositionsAndOrdersTable
          positions={positions}
          orders={orders}
          onClosePosition={(id) => closePosition(id, 'MANUAL_CLOSE', 'Closed by User')}
          botLogs={botLogs}
        />
      </main>
    </>
  )}

      {/* Modals */}
      <ExchangeManagerModal
        isOpen={exchangeModalOpen}
        onClose={() => setExchangeModalOpen(false)}
        exchanges={exchanges}
        onToggleExchange={handleToggleExchange}
        onUpdateExchangeFee={handleUpdateExchangeFee}
        tradingMode={tradingMode}
        credentialsSummary={credentialsSummary}
        onRefreshCredentials={fetchCredentialsStatus}
        onOpenOkxWallet={() => setOkxWalletModalOpen(true)}
      />


      <AIAuditModal
        isOpen={aiAuditModalOpen}
        onClose={() => setAiAuditModalOpen(false)}
        analysis={aiAnalysis}
        loading={aiAuditLoading}
        onApplyRecommended={handleApplyRecommendedParameters}
        currentStrategy={strategy}
      />

      <BacktestLabModal
        isOpen={backtestModalOpen}
        onClose={() => setBacktestModalOpen(false)}
        currentStrategy={strategy}
      />

      <LiveCurrencyAccountModal
        isOpen={fiatModalOpen}
        onClose={() => setFiatModalOpen(false)}
        fiatAccount={fiatAccount}
        transactions={fiatTransactions}
        onAccountUpdated={handleAccountUpdated}
        onBotCashAdjusted={handleBotCashAdjusted}
        botCash={portfolio.cash}
        initialTab={fiatModalInitialTab}
      />

      {/* Gemini AI Diagnostics & Live Market Updates Modal */}
      <AiTroubleshooterModal
        isOpen={aiTroubleshooterOpen}
        onClose={() => setAiTroubleshooterOpen(false)}
        initialPrompt={aiInitialPrompt}
        contextData={{
          tradingMode,
          selectedSymbol,
          platformHint: 'Termux Android / WSL / Windows PowerShell',
        }}
      />

      {/* OKX Web3 Wallet & Multi-Chain Vault Modal */}
      <OkxWalletModal
        isOpen={okxWalletModalOpen}
        onClose={() => setOkxWalletModalOpen(false)}
        onSelectAddressForMonitor={handleSelectAddressForMonitor}
        onDepositToDesk={handleDepositFromOkx}
      />

      {/* Cake Wallet (WalletConnect v2) Modal */}
      <CakeWalletConnectModal
        isOpen={cakeWalletModalOpen}
        onClose={() => setCakeWalletModalOpen(false)}
        cakeAddress="0xc102BB3848DD0397dEB6C655721F756Aa9F9f15d"
        onSelectAddressForMonitor={handleSelectAddressForMonitor}
      />
    </div>
  );
}
