import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  Key,
  Lock,
  Network,
  RefreshCw,
  Send,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Wallet,
  Wifi,
  X,
  XCircle,
} from 'lucide-react';
import {
  CredentialsSummary,
  ExchangeConfig,
  ExchangeHealthCheckSummary,
  ExchangeHealthReport,
  ExchangeId,
  ExchangeWallet,
  ExchangeWalletTransaction,
  TradingExecutionMode,
} from '../types';
import {
  fetchExchangeWallets,
  linkExchangeWallet,
  unlinkExchangeWallet,
  executeWalletTransaction,
  fetchWalletTransactions,
  fetchExchangeHealthCheck,
} from '../services/exchangeApi';
import { ReceivePrivacyCoinModal } from './ReceivePrivacyCoinModal';

interface ExchangeManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  exchanges: ExchangeConfig[];
  onToggleExchange: (id: ExchangeId) => void;
  onUpdateExchangeFee: (id: ExchangeId, takerFee: number) => void;
  tradingMode: TradingExecutionMode;
  credentialsSummary: CredentialsSummary | null;
  onRefreshCredentials: () => void;
  onOpenOkxWallet?: () => void;
}

export const ExchangeManagerModal: React.FC<ExchangeManagerModalProps> = ({
  isOpen,
  onClose,
  exchanges,
  onToggleExchange,
  onUpdateExchangeFee,
  tradingMode,
  credentialsSummary,
  onRefreshCredentials,
  onOpenOkxWallet,
}) => {
  const [activeTab, setActiveTab] = useState<'WALLETS' | 'ROUTING' | 'HEALTH_CHECK'>('WALLETS');
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [pingSuccess, setPingSuccess] = useState(false);

  // Wallets & Live Balances State
  const [wallets, setWallets] = useState<Record<ExchangeId, ExchangeWallet> | null>(null);
  const [loadingWallets, setLoadingWallets] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  // Exchange API Health & Scope Diagnostic State
  const [healthSummary, setHealthSummary] = useState<ExchangeHealthCheckSummary | null>(null);
  const [loadingHealthCheck, setLoadingHealthCheck] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [copiedIp, setCopiedIp] = useState(false);

  // Linking Form State
  const [linkingExchange, setLinkingExchange] = useState<ExchangeId | null>(null);
  const [linkingMode, setLinkingMode] = useState<'API_KEYS' | 'PUBLIC_ADDRESS'>('API_KEYS');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiSecretInput, setApiSecretInput] = useState('');
  const [passphraseInput, setPassphraseInput] = useState('');
  const [depositAddressInput, setDepositAddressInput] = useState('');
  const [walletLabelInput, setWalletLabelInput] = useState('');
  const [linkingSubmitting, setLinkingSubmitting] = useState(false);
  const [linkingError, setLinkingError] = useState<string | null>(null);
  const [linkingSuccessMsg, setLinkingSuccessMsg] = useState<string | null>(null);

  // Transaction Drawer / Modal State
  const [txExchange, setTxExchange] = useState<ExchangeId | null>(null);
  const [txType, setTxType] = useState<'BUY_ORDER' | 'SELL_ORDER' | 'WALLET_WITHDRAWAL' | 'WALLET_TRANSFER'>('BUY_ORDER');
  const [txAsset, setTxAsset] = useState<string>('BTC/USDT');
  const [txAmount, setTxAmount] = useState<string>('');
  const [txDestination, setTxDestination] = useState<string>('');
  const [txSubmitting, setTxSubmitting] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txSuccessReceipt, setTxSuccessReceipt] = useState<ExchangeWalletTransaction | null>(null);

  // Transaction Ledger State
  const [transactions, setTransactions] = useState<ExchangeWalletTransaction[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadWallets();
      loadTransactions();
      loadHealthCheck();
    }
  }, [isOpen]);

  const loadHealthCheck = async () => {
    try {
      setLoadingHealthCheck(true);
      setHealthError(null);
      const summary = await fetchExchangeHealthCheck();
      setHealthSummary(summary);
    } catch (err: any) {
      setHealthError(err.message || 'Failed to complete exchange API health check.');
    } finally {
      setLoadingHealthCheck(false);
    }
  };

  const loadWallets = async () => {
    try {
      setLoadingWallets(true);
      const res = await fetchExchangeWallets();
      if (res && res.wallets) {
        setWallets(res.wallets);
      }
    } catch (err) {
      console.warn('Could not load wallets:', err);
    } finally {
      setLoadingWallets(false);
    }
  };

  const loadTransactions = async () => {
    try {
      const txs = await fetchWalletTransactions();
      setTransactions(txs);
    } catch {
      // Non-blocking
    }
  };

  const handleCopyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddress(addr);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleOpenLinkModal = (ex: ExchangeId) => {
    setLinkingExchange(ex);
    setLinkingMode('API_KEYS');
    setApiKeyInput('');
    setApiSecretInput('');
    setPassphraseInput('');
    setDepositAddressInput(wallets?.[ex]?.depositAddress || '');
    setWalletLabelInput(wallets?.[ex]?.walletLabel || '');
    setLinkingError(null);
    setLinkingSuccessMsg(null);
  };

  const handleSubmitLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkingExchange) return;

    if (linkingMode === 'API_KEYS' && (!apiKeyInput.trim() || !apiSecretInput.trim())) {
      setLinkingError('Both API Key and API Secret are required for direct matching engine connection.');
      return;
    }

    if (linkingMode === 'API_KEYS' && linkingExchange === 'OKX' && !passphraseInput.trim()) {
      setLinkingError('OKX API Passphrase is required by OKX V5 security specifications.');
      return;
    }

    if (linkingMode === 'PUBLIC_ADDRESS' && !depositAddressInput.trim()) {
      setLinkingError('Please enter a valid crypto deposit or public wallet address.');
      return;
    }

    try {
      setLinkingSubmitting(true);
      setLinkingError(null);
      setLinkingSuccessMsg(null);

      const res = await linkExchangeWallet({
        exchange: linkingExchange,
        apiKey: linkingMode === 'API_KEYS' ? apiKeyInput.trim() : undefined,
        apiSecret: linkingMode === 'API_KEYS' ? apiSecretInput.trim() : undefined,
        passphrase: linkingMode === 'API_KEYS' && linkingExchange === 'OKX' ? passphraseInput.trim() : undefined,
        depositAddress: depositAddressInput.trim() || undefined,
        walletLabel: walletLabelInput.trim() || undefined,
      });

      setLinkingSuccessMsg(res.verificationMessage || 'Wallet linked and verified successfully!');
      await loadWallets();
      onRefreshCredentials();
      setTimeout(() => {
        setLinkingExchange(null);
        setLinkingSuccessMsg(null);
      }, 1500);
    } catch (err: any) {
      setLinkingError(err.message || 'Failed to verify exchange credentials.');
    } finally {
      setLinkingSubmitting(false);
    }
  };

  const handleUnlink = async (ex: ExchangeId) => {
    try {
      await unlinkExchangeWallet(ex);
      await loadWallets();
      onRefreshCredentials();
    } catch (err: any) {
      console.warn('Unlink error:', err);
    }
  };

  const handleOpenTransaction = (ex: ExchangeId) => {
    setTxExchange(ex);
    setTxType('BUY_ORDER');
    setTxAsset(ex === 'KRAKEN' ? 'BTC/USD' : 'BTC/USDT');
    setTxAmount('');
    setTxDestination('');
    setTxError(null);
    setTxSuccessReceipt(null);
  };

  const handleSubmitTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txExchange) return;
    const parsedAmount = parseFloat(txAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setTxError('Please specify a valid numeric transaction amount.');
      return;
    }

    if ((txType === 'WALLET_WITHDRAWAL' || txType === 'WALLET_TRANSFER') && !txDestination.trim()) {
      setTxError('Please enter a destination crypto wallet address.');
      return;
    }

    try {
      setTxSubmitting(true);
      setTxError(null);

      const res = await executeWalletTransaction({
        exchange: txExchange,
        type: txType,
        symbolOrAsset: txAsset,
        amount: parsedAmount,
        destinationAddress: txDestination.trim() || undefined,
      });

      if (res.success && res.transaction) {
        setTxSuccessReceipt(res.transaction);
        await loadTransactions();
        await loadWallets();
      }
    } catch (err: any) {
      setTxError(err.message || 'Transaction execution failed.');
    } finally {
      setTxSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const isLiveTrading = tradingMode === 'LIVE_REAL_TRADING';

  const exchangeCards: Array<{
    id: ExchangeId;
    name: string;
    brandColor: string;
    defaultAsset: string;
    description: string;
  }> = [
    {
      id: 'NONKYC',
      name: 'NonKYC Exchange',
      brandColor: '#A855F7',
      defaultAsset: 'BTC/USDT',
      description: 'Zero-KYC Spot Order Book, High-Privacy Matching & On-Chain Crypto Settlement',
    },
    {
      id: 'KRAKEN',
      name: 'Kraken Financial',
      brandColor: '#5741D9',
      defaultAsset: 'BTC/USD',
      description: 'US Regulated Banking Rail, Spot Matching, and Native Crypto Vault',
    },
    {
      id: 'BINANCE',
      name: 'Binance Global',
      brandColor: '#F0B90B',
      defaultAsset: 'BTC/USDT',
      description: 'High-Liquidity Global Spot Order Book and Sub-Millisecond Execution',
    },
    {
      id: 'COINBASE',
      name: 'Coinbase Advanced Trade',
      brandColor: '#0052FF',
      defaultAsset: 'BTC/USD',
      description: 'Institutional Grade Custody, Advanced Trade REST/WebSocket APIs',
    },
    {
      id: 'OKX',
      name: 'OKX Institutional & Spot',
      brandColor: '#2563EB',
      defaultAsset: 'BTC/USDT',
      description: 'Institutional Tier-1 Order Book, OKX Web3 Multi-Chain Vault & X Layer ZK-L2',
    },
  ];

  const healthExchangesList: Array<{
    id: ExchangeId;
    name: string;
    brandColor: string;
    endpoint: string;
    defaultAsset: string;
    description: string;
  }> = [
    {
      id: 'KRAKEN',
      name: 'Kraken Financial',
      brandColor: '#5741D9',
      endpoint: 'https://api.kraken.com',
      defaultAsset: 'BTC/USD',
      description: 'US Regulated Banking Rails, REST V0 Matching & Funding Vault',
    },
    {
      id: 'BINANCE',
      name: 'Binance Global / US',
      brandColor: '#F0B90B',
      endpoint: 'https://api.binance.com / api.binance.us',
      defaultAsset: 'BTC/USDT',
      description: 'Global Spot Matching Engine with Sub-Millisecond Execution',
    },
    {
      id: 'NONKYC',
      name: 'NonKYC Exchange',
      brandColor: '#A855F7',
      endpoint: 'https://api.nonkyc.io',
      defaultAsset: 'BTC/USDT',
      description: 'Zero-KYC Spot Order Book & High-Privacy Cryptocurrency Settlement',
    },
    {
      id: 'OKX',
      name: 'OKX Institutional & Spot',
      brandColor: '#2563EB',
      endpoint: 'https://www.okx.com',
      defaultAsset: 'BTC/USDT',
      description: 'OKX V5 REST/WS Gateway & Web3 Self-Custody Multi-Chain Vault',
    },
    {
      id: 'COINBASE',
      name: 'Coinbase Advanced Trade',
      brandColor: '#0052FF',
      endpoint: 'https://api.exchange.coinbase.com',
      defaultAsset: 'BTC/USD',
      description: 'Institutional Grade Custody & Advanced Trade Matching',
    },
    {
      id: 'BYBIT',
      name: 'Bybit Institutional',
      brandColor: '#F7A600',
      endpoint: 'https://api.bybit.com',
      defaultAsset: 'BTC/USDT',
      description: 'Bybit V5 Unified Trading Account & Spot Matching Rails',
    },
  ];


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl rounded-2xl bg-[#0F1422] border border-cyan-500/30 shadow-2xl shadow-cyan-500/10 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-wide flex items-center gap-2">
                Exchange Wallets & Live Transaction Gateway
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                  LIVE RAILS ACTIVE
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Link NonKYC, Kraken, Binance, and Coinbase wallets, view live balances, and execute transactions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadWallets}
              disabled={loadingWallets}
              title="Sync all live wallet balances"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 text-cyan-400 ${loadingWallets ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('WALLETS')}
              className={`py-3 px-4 font-mono text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'WALLETS'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wallet className="h-3.5 w-3.5" />
              <span>Exchange Wallets ({exchangeCards.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('HEALTH_CHECK');
                if (!healthSummary && !loadingHealthCheck) {
                  loadHealthCheck();
                }
              }}
              className={`py-3 px-4 font-mono text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'HEALTH_CHECK'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>API Health & Scopes</span>
              {healthSummary && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    healthSummary.healthyCount > 0
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {healthSummary.healthyCount}/{healthSummary.totalConfigured || 0} Ready
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('ROUTING')}
              className={`py-3 px-4 font-mono text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'ROUTING'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Smart Order Routing & Fees</span>
            </button>
          </div>

          <button
            onClick={() => setPrivacyModalOpen(true)}
            className="my-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-300 font-mono text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
            title="Accept Monero (XMR), Salvium (SAL), QRL, and Tari stealth payments"
          >
            <span>🟧</span>
            <span>Accept Monero / XMR Tokens</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300 flex-1">
          {/* Mode Switch Card */}
          <div className={`p-4 rounded-xl border ${
            isLiveTrading
              ? 'bg-rose-950/30 border-rose-500/40'
              : 'bg-slate-900/80 border-slate-800'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-ping" />
                  <strong className="text-white text-sm font-sans">
                    Execution Mode: LIVE REAL TRADING (AUTHENTICATED RAILS)
                  </strong>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  100% Real Infrastructure: All transactions execute through authenticated exchange REST/WebSocket gateways and direct on-chain RPC nodes. Zero mock capital or simulated sandboxes.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="px-3.5 py-1.5 rounded-lg font-mono font-bold text-xs flex items-center gap-1.5 bg-rose-500/20 border border-rose-500/50 text-rose-300 shadow-md">
                  <Lock className="h-3.5 w-3.5 text-rose-400" />
                  <span>Live Authenticated</span>
                </div>
              </div>
            </div>
          </div>

          {activeTab === 'WALLETS' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Live Verification & Transparency Guarantee Banner */}
              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-white text-xs font-mono uppercase tracking-wider">
                        100% Real Infrastructure · Zero Mock / Zero Sandbox Guarantee
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                      All balances reflect authenticated accounts from direct exchange REST APIs or public blockchain RPC nodes. Unlinked accounts default strictly to $0.00. No simulated or mock capital is injected into any wallet.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('HEALTH_CHECK');
                      if (!healthSummary && !loadingHealthCheck) loadHealthCheck();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-all"
                    title="View live connectivity, permissions, and scope diagnostics"
                  >
                    <Activity className="h-3.5 w-3.5 text-cyan-400" />
                    <span>API Health & Scopes</span>
                    {healthSummary && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-900 text-slate-300 font-mono">
                        {healthSummary.healthyCount}/{healthSummary.totalConfigured || 0}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      loadWallets();
                      loadHealthCheck();
                    }}
                    disabled={loadingWallets || loadingHealthCheck}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-cyan-400 ${loadingWallets || loadingHealthCheck ? 'animate-spin' : ''}`} />
                    <span>{loadingWallets || loadingHealthCheck ? 'Verifying...' : 'Re-verify All'}</span>
                  </button>
                </div>
              </div>

              {/* WALLET CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {exchangeCards.map((card) => {
                  const walletData = wallets ? wallets[card.id] : null;
                  const isLinked = walletData?.isLinked || false;
                  const balances = walletData?.balances || {};

                  return (
                    <div
                      key={card.id}
                      className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all shadow-lg"
                    >
                      <div>
                        {/* Top: Header & Status */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="h-4 w-4 rounded-full shadow-sm"
                              style={{ backgroundColor: card.brandColor }}
                            />
                            <div>
                              <h3 className="font-bold text-white text-sm">{card.name}</h3>
                              <span className="text-[10px] text-slate-400 font-mono block">
                                {card.id} Exchange Wallet
                              </span>
                            </div>
                          </div>

                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                            walletData?.isVaultVerified
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : walletData?.status === 'INVALID_CREDENTIALS' || walletData?.authError
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              : walletData?.status === 'ADDRESS_LINKED'
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}>
                            {walletData?.isVaultVerified
                              ? 'LIVE VERIFIED'
                              : walletData?.status === 'INVALID_CREDENTIALS' || walletData?.authError
                              ? 'AUTH FAILED'
                              : walletData?.status === 'ADDRESS_LINKED'
                              ? 'ADDRESS LINKED'
                              : 'AWAITING LINK'}
                          </span>
                        </div>

                        {/* Balances Section */}
                        <div className="mt-4 p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                            <span>Live Asset Balances</span>
                            {walletData?.isVaultVerified ? (
                              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                                {walletData.verificationSource === 'ONCHAIN_RPC' ? 'On-Chain Verified' : 'Live API Verified'}
                              </span>
                            ) : walletData?.status === 'INVALID_CREDENTIALS' || walletData?.authError ? (
                              <span className="flex items-center gap-1 text-rose-400 font-semibold">
                                <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                                0.00 (Auth Required)
                              </span>
                            ) : (
                              <span className="text-slate-500 font-mono">Unlinked (0.00)</span>
                            )}
                          </div>

                          <div className="space-y-1 font-mono text-xs">
                            {Object.entries(balances).slice(0, 4).map(([asset, amt]) => (
                              <div key={asset} className="flex items-center justify-between text-slate-200">
                                <span className="text-slate-400">{asset}:</span>
                                <span className="font-bold text-white">{String(amt)}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Auth Error Banner if present */}
                        {walletData?.authError && (
                          <div className="mt-2.5 p-2 rounded-xl bg-rose-950/40 border border-rose-500/30 text-[10px] text-rose-300 font-mono flex items-start gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
                            <div className="overflow-hidden break-words">
                              <span className="font-bold">Auth Issue: </span>
                              {walletData.authError}
                            </div>
                          </div>
                        )}

                        {/* Deposit Address Box */}
                        <div className="mt-3 p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/60 space-y-1">
                          <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                            <span>On-Chain Deposit Address:</span>
                            {walletData?.depositAddress && (
                              <button
                                type="button"
                                onClick={() => handleCopyAddress(walletData.depositAddress || '')}
                                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                              >
                                {copiedAddress === walletData?.depositAddress ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-400" />
                                    <span className="text-emerald-400">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-300 truncate select-all">
                            {walletData?.depositAddress || 'No public address linked'}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenLinkModal(card.id)}
                            className="flex-1 py-2 px-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Key className="h-3.5 w-3.5" />
                            <span>{isLinked ? 'Update Keys / Address' : 'Link Wallet'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenTransaction(card.id)}
                            className="py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Send className="h-3.5 w-3.5" />
                            <span>Transact</span>
                          </button>

                          {isLinked && (
                            <button
                              type="button"
                              onClick={() => handleUnlink(card.id)}
                              title="Unlink Wallet"
                              className="p-2 rounded-xl bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 cursor-pointer transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {card.id === 'OKX' && onOpenOkxWallet && (
                          <button
                            type="button"
                            onClick={onOpenOkxWallet}
                            className="w-full py-2 px-3 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95"
                          >
                            <div className="w-3.5 h-3.5 rounded bg-black flex items-center justify-center p-0.5 shrink-0">
                              <div className="grid grid-cols-3 gap-0.5 w-full h-full">
                                <div className="bg-white rounded-[0.5px]" />
                                <div className="bg-black rounded-[0.5px]" />
                                <div className="bg-white rounded-[0.5px]" />
                                <div className="bg-black rounded-[0.5px]" />
                                <div className="bg-white rounded-[0.5px]" />
                                <div className="bg-black rounded-[0.5px]" />
                                <div className="bg-white rounded-[0.5px]" />
                                <div className="bg-black rounded-[0.5px]" />
                                <div className="bg-white rounded-[0.5px]" />
                              </div>
                            </div>
                            <span>Connect OKX Web3 Wallet</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* RECENT WALLET TRANSACTIONS LEDGER */}
              <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-cyan-400" />
                    <h3 className="font-bold text-white text-xs tracking-wider uppercase font-mono">
                      Exchange Wallet Transactions Ledger ({transactions.length})
                    </h3>
                  </div>
                  <button
                    onClick={loadTransactions}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Refresh History</span>
                  </button>
                </div>

                {transactions.length === 0 ? (
                  <div className="p-8 rounded-xl bg-slate-900/30 border border-dashed border-slate-800 text-center text-slate-500 font-mono">
                    No transactions executed yet. Click &quot;Transact&quot; on any linked exchange wallet above to execute a real trade or transfer.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="pb-2">Time</th>
                          <th className="pb-2">Exchange</th>
                          <th className="pb-2">Action</th>
                          <th className="pb-2">Asset / Amount</th>
                          <th className="pb-2">Destination / Note</th>
                          <th className="pb-2">Status</th>
                          <th className="pb-2 text-right">Cryptographic Receipt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {transactions.map((tx) => (
                          <tr key={tx.id} className="hover:bg-slate-900/40 transition-colors">
                            <td className="py-2.5 text-slate-400 whitespace-nowrap">
                              {new Date(tx.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="py-2.5 font-bold text-white whitespace-nowrap">
                              {tx.exchange}
                            </td>
                            <td className="py-2.5 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                tx.type.includes('BUY')
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : tx.type.includes('SELL')
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-cyan-500/20 text-cyan-300'
                              }`}>
                                {tx.type.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-2.5 font-bold text-slate-200 whitespace-nowrap">
                              {tx.amount} {tx.symbolOrAsset}
                            </td>
                            <td className="py-2.5 text-slate-400 max-w-[200px] truncate">
                              {tx.destination || tx.executionNote || 'Executed on Exchange Engine'}
                            </td>
                            <td className="py-2.5 whitespace-nowrap">
                              <span className="text-emerald-400 flex items-center gap-1 font-bold">
                                <CheckCircle2 className="h-3 w-3" />
                                {tx.status}
                              </span>
                            </td>
                            <td className="py-2.5 text-right font-mono text-cyan-400/90 whitespace-nowrap">
                              {tx.txHash ? `${tx.txHash.slice(0, 10)}...${tx.txHash.slice(-6)}` : '0xVerified'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'ROUTING' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                Smart Order Routing (SOR) Taker Fees & Status
              </span>

              {exchanges.map((ex) => (
                <div
                  key={ex.id}
                  className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  {/* Exchange Identity */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: ex.tagColor }}
                      />
                      <strong className="text-white text-sm font-sans">{ex.name}</strong>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-slate-300">
                        {ex.tier}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Wifi className="h-3 w-3" />
                        {ex.status} ({ex.latencyMs}ms)
                      </span>
                      <span>•</span>
                      <span className="text-slate-500 truncate max-w-[200px]">{ex.apiEndpoint}</span>
                    </div>
                  </div>

                  {/* Fees & Controls */}
                  <div className="flex items-center gap-4">
                    <div className="text-right font-mono text-xs">
                      <div className="text-slate-400 text-[10px]">Taker / Maker Fee</div>
                      <div className="text-white font-semibold">
                        {ex.takerFeePercent}% / {ex.makerFeePercent}%
                      </div>
                    </div>

                    <button
                      onClick={() => onToggleExchange(ex.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border transition-all ${
                        ex.enabled
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
                          : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-400'
                      }`}
                    >
                      {ex.enabled ? 'Enabled in SOR' : 'Excluded'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'HEALTH_CHECK' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Diagnostic Engine Header & Global Metrics */}
              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-cyan-400" />
                      <h3 className="font-bold text-white text-sm font-mono uppercase tracking-wider">
                        Live Exchange API & Scope Health Engine
                      </h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
                        REAL-TIME PROBES
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Real-time verification of REST/WebSocket endpoint latency, account balance read permissions, spot order write scopes, and IP geoblocking.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={loadHealthCheck}
                    disabled={loadingHealthCheck}
                    className="shrink-0 px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-300 font-mono text-xs font-bold flex items-center gap-2 cursor-pointer transition-all active:scale-95 shadow-md self-start sm:self-center"
                  >
                    <RefreshCw className={`h-4 w-4 text-cyan-400 ${loadingHealthCheck ? 'animate-spin' : ''}`} />
                    <span>{loadingHealthCheck ? 'Probing Endpoints...' : 'Run Full Health Check'}</span>
                  </button>
                </div>

                {/* Metrics Summary Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800">
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">Configured Keys</div>
                    <div className="text-base font-bold font-mono text-white mt-0.5">
                      {healthSummary ? healthSummary.totalConfigured : 0} <span className="text-xs text-slate-500 font-normal">/ 6 Exchanges</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">Healthy & Scoped</div>
                    <div className="text-base font-bold font-mono text-emerald-400 mt-0.5 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <span>{healthSummary ? healthSummary.healthyCount : 0}</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">Degraded / Read-Only</div>
                    <div className="text-base font-bold font-mono text-amber-400 mt-0.5 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                      <span>{healthSummary ? healthSummary.degradedCount : 0}</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">Regional Restricted</div>
                    <div className="text-base font-bold font-mono text-purple-400 mt-0.5 flex items-center gap-1.5">
                      <Globe className="h-4 w-4 text-purple-400" />
                      <span>{healthSummary ? healthSummary.restrictedCount : 0}</span>
                    </div>
                  </div>
                </div>

                {/* Server Egress IP Whitelisting Banner */}
                <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-mono">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Server className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                    <span className="text-slate-400">Server Egress IP (Whitelist on Exchange Settings):</span>
                    <span className="font-bold text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-700 select-all">
                      {healthSummary?.serverEgressIp || 'Unavailable'}
                    </span>
                  </div>
                  {healthSummary?.serverEgressIp && (
                    <button
                      type="button"
                      onClick={() => {
                        if (healthSummary.serverEgressIp) {
                          navigator.clipboard.writeText(healthSummary.serverEgressIp);
                          setCopiedIp(true);
                          setTimeout(() => setCopiedIp(false), 2000);
                        }
                      }}
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono text-[10px] cursor-pointer self-start sm:self-center"
                    >
                      {copiedIp ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedIp ? 'IP Copied' : 'Copy IP'}</span>
                    </button>
                  )}
                </div>

                {healthError && (
                  <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 font-mono flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                    <span>{healthError}</span>
                  </div>
                )}
              </div>

              {/* Diagnostic Cards for each Exchange */}
              <div className="space-y-4">
                {healthExchangesList.map((ex) => {
                  const report: ExchangeHealthReport | undefined = healthSummary?.reports?.[ex.id];
                  const isConfigured = report?.isConfigured || false;
                  const status = report?.status || 'NOT_CONFIGURED';

                  const getStatusBadge = () => {
                    switch (status) {
                      case 'HEALTHY':
                        return {
                          label: 'HEALTHY & TRADE-READY',
                          className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
                          icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
                        };
                      case 'DEGRADED':
                        return {
                          label: 'DEGRADED (SCOPE LIMITED)',
                          className: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                          icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />,
                        };
                      case 'LOCATION_RESTRICTED':
                        return {
                          label: 'LOCATION RESTRICTED (HTTP 451)',
                          className: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
                          icon: <Globe className="h-3.5 w-3.5 text-purple-400" />,
                        };
                      case 'INVALID_CREDENTIALS':
                        return {
                          label: 'INVALID CREDENTIALS',
                          className: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
                          icon: <AlertCircle className="h-3.5 w-3.5 text-rose-400" />,
                        };
                      case 'NOT_CONFIGURED':
                      default:
                        return {
                          label: 'NOT CONFIGURED',
                          className: 'bg-slate-800 text-slate-400 border-slate-700',
                          icon: <Lock className="h-3.5 w-3.5 text-slate-400" />,
                        };
                    }
                  };

                  const badge = getStatusBadge();

                  const getLatencyColor = (ms?: number) => {
                    if (!ms) return 'text-slate-500';
                    if (ms < 150) return 'text-emerald-400';
                    if (ms < 350) return 'text-amber-400';
                    return 'text-rose-400';
                  };

                  return (
                    <div
                      key={ex.id}
                      className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all shadow-md"
                    >
                      {/* Top Bar: Brand, Status, Latency */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-3.5 w-3.5 rounded-full shadow-sm shrink-0"
                            style={{ backgroundColor: ex.brandColor }}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-white text-sm font-sans">{ex.name}</h4>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-400">
                                {ex.endpoint}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 font-sans mt-0.5">{ex.description}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                          <div
                            className={`px-2.5 py-1 rounded-full font-mono text-[11px] font-bold border flex items-center gap-1.5 ${badge.className}`}
                          >
                            {badge.icon}
                            <span>{badge.label}</span>
                          </div>

                          <div
                            className={`px-2.5 py-1 rounded-full font-mono text-[11px] bg-slate-900 border border-slate-800 flex items-center gap-1.5 ${getLatencyColor(
                              report?.latencyMs
                            )}`}
                          >
                            <Wifi className="h-3 w-3" />
                            <span>{report?.latencyMs ? `${report.latencyMs}ms` : '--'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Scopes & Permissions Diagnostic Matrix */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800/80">
                        {/* 1. Market Data Read */}
                        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-slate-400">Market Data Read</span>
                            {report?.canReadMarket ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                            )}
                          </div>
                          <div className="text-xs font-semibold text-white">
                            {report?.canReadMarket ? 'Live Tickers & Book' : 'Unreachable'}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {report?.canReadMarket ? `Active (${report.latencyMs}ms)` : 'Public API issue'}
                          </div>
                        </div>

                        {/* 2. Account Balance Read */}
                        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-slate-400">Balance Query Scope</span>
                            {report?.canReadBalance ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            ) : isConfigured ? (
                              <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                            ) : (
                              <Lock className="h-3.5 w-3.5 text-slate-500" />
                            )}
                          </div>
                          <div className="text-xs font-semibold text-white">
                            {report?.canReadBalance
                              ? 'Balance Read Authorized'
                              : isConfigured
                              ? 'Permission Restricted'
                              : 'Keys Not Linked'}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {report?.canReadBalance
                              ? 'HMAC Verified'
                              : isConfigured
                              ? 'Check Key Permissions'
                              : 'Awaiting Credentials'}
                          </div>
                        </div>

                        {/* 3. Spot Order Execution (Trade Write) */}
                        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-slate-400">Spot Order Write Scope</span>
                            {report?.canTrade ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            ) : isConfigured ? (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                            ) : (
                              <Lock className="h-3.5 w-3.5 text-slate-500" />
                            )}
                          </div>
                          <div className="text-xs font-semibold text-white">
                            {report?.canTrade
                              ? 'Full Trade Execution Active'
                              : isConfigured
                              ? 'Read-Only Mode'
                              : 'Keys Not Linked'}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {report?.canTrade
                              ? 'Live Order Routing'
                              : isConfigured
                              ? 'Spot Trading Scope Disabled'
                              : 'Awaiting Credentials'}
                          </div>
                        </div>

                        {/* 4. IP / Regional Geoblocking Status */}
                        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-slate-400">IP & Geo Whitelist</span>
                            {report?.ipRestrictionStatus === 'RESTRICTED_US' ? (
                              <Globe className="h-3.5 w-3.5 text-purple-400" />
                            ) : (
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                            )}
                          </div>
                          <div className="text-xs font-semibold text-white">
                            {report?.ipRestrictionStatus === 'RESTRICTED_US'
                              ? 'US Cloud IP Restricted'
                              : 'Unrestricted / Allowed'}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {report?.ipRestrictionStatus === 'RESTRICTED_US'
                              ? 'HTTP 451 (Use Binance US)'
                              : 'Direct API Egress Pass'}
                          </div>
                        </div>
                      </div>

                      {/* Detected Scopes & Balances */}
                      <div className="space-y-2">
                        {report?.scopes && report.scopes.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-mono text-slate-400 mr-1">Active Scopes:</span>
                            {report.scopes.map((s, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] font-medium"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        )}

                        {report?.balanceSnapshot && Object.keys(report.balanceSnapshot).length > 0 && (
                          <div className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/80 flex flex-wrap items-center gap-2 text-[11px] font-mono">
                            <span className="text-slate-400 font-semibold">Live Balances:</span>
                            {Object.entries(report.balanceSnapshot).map(([asset, val]) => (
                              <span
                                key={asset}
                                className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700/80 text-emerald-300"
                              >
                                {asset}: <strong className="text-white">{val}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Diagnostics, Messages & Actionable Help */}
                      {report?.message && (
                        <div className="text-[11px] font-mono text-slate-400 bg-slate-900/30 p-2.5 rounded-xl border border-slate-800/60 flex items-start gap-2">
                          <Activity className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-slate-300 font-medium">Diagnostic Note: </span>
                            {report.message}
                          </div>
                        </div>
                      )}

                      {report?.diagnosticHelp && (
                        <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 text-[11px] font-mono text-amber-200 flex items-start gap-2 shadow-sm">
                          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-amber-300 uppercase tracking-wide">
                              Troubleshooting Action:{' '}
                            </span>
                            {report.diagnosticHelp}
                          </div>
                        </div>
                      )}

                      {/* Card Action Buttons */}
                      <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[10px] font-mono text-slate-500">
                          API Key:{' '}
                          <span className="text-slate-300 font-bold">{report?.keyMasked || 'None Configured'}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenLinkModal(ex.id)}
                            className="py-1.5 px-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <Key className="h-3.5 w-3.5" />
                            <span>{isConfigured ? 'Update Credentials' : 'Link API Keys'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenTransaction(ex.id)}
                            className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <Send className="h-3.5 w-3.5" />
                            <span>Order Gateway</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Security Architecture Box */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-white text-xs">
                Zero Browser Exposure & Institutional HMAC Cryptographic Signatures
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Exchange API secrets are encrypted and kept strictly on the Node.js server container. When an order or transaction is dispatched, HMAC-SHA512 / HMAC-SHA256 signatures are computed server-side directly to the Kraken, Binance, or Coinbase TLS endpoints.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-900/60">
          <span className="text-[11px] font-mono text-slate-500">
            Kraken REST API • Binance V3 Spot API • Coinbase Advanced Trade API
          </span>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 cursor-pointer transition-all"
          >
            Done
          </button>
        </div>
      </div>

      {/* MODAL: LINK EXCHANGE WALLET */}
      {linkingExchange && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl bg-[#0B0F1A] border border-cyan-500/40 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-cyan-400" />
                <h3 className="font-bold text-white text-sm">
                  Link {linkingExchange} Wallet Credentials
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLinkingExchange(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                Link your authenticated <strong className="text-white">{linkingExchange}</strong> API credentials (read/trade permissions) or on-chain deposit address. Zero sandbox or simulated data; all balances are verified directly with live exchange APIs or on-chain RPC nodes.
              </p>
            </div>

            {/* Linking Mode Selector */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => setLinkingMode('API_KEYS')}
                className={`py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  linkingMode === 'API_KEYS'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Full API Key & Secret
              </button>
              <button
                type="button"
                onClick={() => setLinkingMode('PUBLIC_ADDRESS')}
                className={`py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  linkingMode === 'PUBLIC_ADDRESS'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Public Wallet Address
              </button>
            </div>

            {linkingError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{linkingError}</span>
              </div>
            )}

            {linkingSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <span>{linkingSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmitLink} className="space-y-4">
              <div>
                <label className="text-[11px] font-mono text-slate-300 block mb-1">
                  Custom Wallet Label (Optional)
                </label>
                <input
                  type="text"
                  value={walletLabelInput}
                  onChange={(e) => setWalletLabelInput(e.target.value)}
                  placeholder={`e.g. My ${linkingExchange} Trading Vault`}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                />
              </div>

              {linkingMode === 'API_KEYS' ? (
                <>
                  <div>
                    <label className="text-[11px] font-mono text-slate-300 block mb-1">
                      {linkingExchange} API Key
                    </label>
                    <input
                      type="text"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={`Paste your ${linkingExchange} API Key`}
                      required
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-mono text-slate-300 block mb-1">
                      {linkingExchange} API Secret (HMAC Private Key)
                    </label>
                    <input
                      type="password"
                      value={apiSecretInput}
                      onChange={(e) => setApiSecretInput(e.target.value)}
                      placeholder="Paste your private API Secret"
                      required
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  {linkingExchange === 'OKX' && (
                    <div>
                      <label className="text-[11px] font-mono text-slate-300 block mb-1">
                        OKX API Passphrase (V5 Protocol Security)
                      </label>
                      <input
                        type="password"
                        value={passphraseInput}
                        onChange={(e) => setPassphraseInput(e.target.value)}
                        placeholder="Enter the passphrase created with this OKX API Key"
                        required
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-500 mt-1 font-mono">
                        Required: OKX V5 HMAC signatures hash the API passphrase with each request.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] font-mono text-slate-300 block mb-1">
                      Default Crypto Deposit / Withdrawal Address (Optional)
                    </label>
                    <input
                      type="text"
                      value={depositAddressInput}
                      onChange={(e) => setDepositAddressInput(e.target.value)}
                      placeholder="e.g. 0x... or bc1q..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-[11px] font-mono text-slate-300 block mb-1">
                    On-Chain Deposit Address / Public Wallet
                  </label>
                  <input
                    type="text"
                    value={depositAddressInput}
                    onChange={(e) => setDepositAddressInput(e.target.value)}
                    placeholder="e.g. 0x4981a3C28DfF851F56B27dE907B6E80b2A0b7C6E"
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">
                    Links this address for direct on-chain funding, transfer routing, and balance accounting.
                  </p>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setLinkingExchange(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold text-xs cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={linkingSubmitting}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 cursor-pointer transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {linkingSubmitting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Verifying with {linkingExchange}...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Verify & Link Wallet</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MAKE WALLET TRANSACTION */}
      {txExchange && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl bg-[#0B0F1A] border border-emerald-500/40 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-emerald-400" />
                <h3 className="font-bold text-white text-sm">
                  Make Transaction on {txExchange} Wallet
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTxExchange(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {txSuccessReceipt ? (
              <div className="space-y-4 text-center py-4">
                <div className="h-12 w-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-base">Transaction Dispatched Successfully!</h4>
                  <p className="text-xs text-slate-400 mt-1">{txSuccessReceipt.executionNote}</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-left font-mono text-[11px] space-y-1">
                  <div>Exchange: <span className="text-white font-bold">{txSuccessReceipt.exchange}</span></div>
                  <div>Type: <span className="text-emerald-400 font-bold">{txSuccessReceipt.type}</span></div>
                  <div>Amount: <span className="text-white font-bold">{txSuccessReceipt.amount} {txSuccessReceipt.symbolOrAsset}</span></div>
                  <div>Transaction ID / Hash: <span className="text-cyan-300 break-all">{txSuccessReceipt.txHash}</span></div>
                </div>

                <button
                  type="button"
                  onClick={() => setTxExchange(null)}
                  className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all cursor-pointer"
                >
                  Close Receipt
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitTransaction} className="space-y-4">
                {txError && (
                  <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                    <span>{txError}</span>
                  </div>
                )}

                {/* Transaction Type Picker */}
                <div>
                  <label className="text-[11px] font-mono text-slate-300 block mb-1.5">
                    Transaction Type
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setTxType('BUY_ORDER')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer border ${
                        txType === 'BUY_ORDER'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      Spot Buy
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxType('SELL_ORDER')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer border ${
                        txType === 'SELL_ORDER'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      Spot Sell
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxType('WALLET_TRANSFER')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer border ${
                        txType === 'WALLET_TRANSFER'
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      Send / Transfer
                    </button>
                  </div>
                </div>

                {/* Symbol / Asset Picker & Live Balance */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-mono text-slate-300">
                          Asset / Pair
                        </label>
                        {txExchange && wallets?.[txExchange] && (
                          <span className="text-[10px] text-cyan-400 font-mono">
                            Bal: {String(wallets[txExchange].balances[txAsset.split('/')[0]] || wallets[txExchange].balances['USD'] || wallets[txExchange].balances['USDT'] || '0.00')}
                          </span>
                        )}
                      </div>
                      <select
                        value={txAsset}
                        onChange={(e) => setTxAsset(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                      >
                        <option value="BTC/USD">BTC/USD</option>
                        <option value="BTC/USDT">BTC/USDT</option>
                        <option value="ETH/USD">ETH/USD</option>
                        <option value="ETH/USDT">ETH/USDT</option>
                        <option value="SOL/USD">SOL/USD</option>
                        <option value="SOL/USDT">SOL/USDT</option>
                        <option value="USDT">USDT (Tether)</option>
                        <option value="USD">USD (Cash)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-mono text-slate-300 block mb-1">
                        Amount (Min 0.01 / 0.000001)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.000001"
                        value={txAmount}
                        onChange={(e) => setTxAmount(e.target.value)}
                        placeholder="0.01"
                        required
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Quick Amount Preset Chips */}
                  <div>
                    <label className="text-[10px] font-mono text-slate-400 block mb-1">
                      Quick Preset Amounts:
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {['0.001', '0.01', '0.10', '1.00', '10.00', '50.00', '100.00', '500.00'].map((preset) => (
                        <button
                          key={`exchange-preset-${preset}`}
                          type="button"
                          onClick={() => setTxAmount(preset)}
                          className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-slate-800 text-[10px] font-mono cursor-pointer transition-colors"
                        >
                          {preset.includes('.') && preset.length > 4 ? `${preset} crypto` : `$${preset}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Destination Wallet Address if Transfer */}
                {txType === 'WALLET_TRANSFER' && (
                  <div>
                    <label className="text-[11px] font-mono text-slate-300 block mb-1">
                      Destination Crypto Wallet Address
                    </label>
                    <input
                      type="text"
                      value={txDestination}
                      onChange={(e) => setTxDestination(e.target.value)}
                      placeholder="e.g. 0x... or bc1q..."
                      required
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                )}

                <div className="pt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setTxExchange(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold text-xs cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={txSubmitting}
                    className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 cursor-pointer transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {txSubmitting ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Transmitting to {txExchange}...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span>Submit Live Transaction</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Receive Privacy Coin Modal */}
      <ReceivePrivacyCoinModal
        isOpen={privacyModalOpen}
        onClose={() => setPrivacyModalOpen(false)}
        defaultCoin="XMR"
      />
    </div>
  );
};
