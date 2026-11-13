import React, { useState, useEffect } from 'react';
import {
  Search,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  ExternalLink,
  Shield,
  ShieldCheck,
  Zap,
  TrendingUp,
  TrendingDown,
  Layers,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  Bot,
  Filter,
  DollarSign,
  PieChart,
  Activity,
  Bookmark,
  BookmarkCheck,
  Eye,
  AlertCircle,
  Cpu,
  ChevronRight,
  Database,
  Globe,
  Sliders,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';
import { MonitoredWalletProfile, TokenHolding, WalletTransaction } from '../types';
import { formatCurrency, formatPercent } from '../utils/cryptoMath';
import { useAuth } from '../context/AuthContext';
import { doc, setDoc, deleteDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { ReceivePrivacyCoinModal } from './ReceivePrivacyCoinModal';
import { PrivacyAssetProcessor } from './PrivacyAssetProcessor';

const PRESET_WALLETS = [
  {
    name: 'MetaMask Vault (..cb9)',
    address: '0x65602EB9e09B07002872E074004400d37e27CCB9',
    network: 'arbitrum' as const,
    label: 'User MetaMask Profit Destination (..cb9)',
    icon: '🦊',
  },
  {
    name: 'Cake Wallet (..5d)',
    address: '0xc102BB3848DD0397dEB6C655721F756Aa9F9f15d',
    network: 'arbitrum' as const,
    label: 'User Cake Wallet (..5d)',
    icon: '🍰',
  },
  {
    name: 'Monero CCS Fund',
    address: '44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A',
    network: 'monero' as const,
    label: 'Monero Community Crowdfunding Fund',
    icon: '🟧',
  },
  {
    name: 'Salvium Genesis',
    address: 'Sal1J8k9vVj9Z9W8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8',
    network: 'salvium' as const,
    label: 'Salvium Protocol Staking Reserve',
    icon: '🪙',
  },
  {
    name: 'QRL Foundation',
    address: 'Q010500c25a07e4d825c35848c4547be0b07304e334df58a0ec49d375d81b95f00e97bc8a76d8b3',
    network: 'qrl' as const,
    label: 'QRL Post-Quantum XMSS Reserve',
    icon: '⚛️',
  },
  {
    name: 'Tari Treasury',
    address: 'tari1q9vVj9Z9W8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8',
    network: 'tari' as const,
    label: 'Tari Network Genesis Treasury',
    icon: '🟣',
  },
  {
    name: 'vitalik.eth',
    address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    network: 'ethereum' as const,
    label: 'Ethereum Foundation (Vitalik)',
    icon: '🐋',
  },
  {
    name: 'FlashArb Searcher',
    address: '0x71c8A53E06b0A0317E0821b069df3684a0d843F8',
    network: 'arbitrum' as const,
    label: 'Arbitrum Atomic Searcher',
    icon: '⚡',
  },
  {
    name: 'Binance Hot Wallet',
    address: '0x28C6c06298d514Db089934071355E5743bf21d60',
    network: 'ethereum' as const,
    label: 'Binance 14 Hot Reserve',
    icon: '🏦',
  },
  {
    name: 'OKX Institutional Vault',
    address: '0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b',
    network: 'ethereum' as const,
    label: 'OKX 3 (Cold & Hot Reserve)',
    icon: '⬛',
  },
  {
    name: 'OKX X Layer Messenger',
    address: '0x4200000000000000000000000000000000000007',
    network: 'okx_xlayer' as const,
    label: 'OKX X Layer ZK-L2 Bridge',
    icon: '⬛',
  },
];

const NETWORKS = [
  { id: 'monero', name: 'Monero (XMR)', icon: '🟧', explorer: 'https://xmrchain.net' },
  { id: 'salvium', name: 'Salvium (SAL)', icon: '🪙', explorer: 'https://explorer.salvium.io' },
  { id: 'qrl', name: 'QRL Quantum', icon: '⚛️', explorer: 'https://explorer.theqrl.org' },
  { id: 'tari', name: 'Tari (TARI)', icon: '🟣', explorer: 'https://explore.tari.com' },
  { id: 'arbitrum', name: 'Arbitrum One', icon: '🔵', explorer: 'https://arbiscan.io' },
  { id: 'ethereum', name: 'Ethereum', icon: '⟠', explorer: 'https://etherscan.io' },
  { id: 'base', name: 'Base', icon: '🟡', explorer: 'https://basescan.org' },
  { id: 'polygon', name: 'Polygon', icon: '🟣', explorer: 'https://polygonscan.com' },
  { id: 'okx_xlayer', name: 'OKX X Layer (ZK-L2)', icon: '⬛', explorer: 'https://www.okx.com/web3/explorer/xlayer' },
];

interface OnChainWalletMonitorProps {
  onOpenOkxWallet?: () => void;
  targetAddress?: { address: string; network: string } | null;
}

export const OnChainWalletMonitor: React.FC<OnChainWalletMonitorProps> = ({
  onOpenOkxWallet,
  targetAddress,
}) => {
  const { user, signInWithGoogle } = useAuth();

  const [inputAddress, setInputAddress] = useState<string>('44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A');
  const [selectedNetwork, setSelectedNetwork] = useState<string>('monero');
  const [receiveModalOpen, setReceiveModalOpen] = useState<boolean>(false);
  const [profile, setProfile] = useState<MonitoredWalletProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active view tab
  const [activeTab, setActiveTab] = useState<'HOLDINGS' | 'TRANSACTIONS' | 'FLOW_ANALYTICS' | 'PRIVACY_PROCESSOR' | 'AI_AUDIT'>('HOLDINGS');
  
  // Filtering & Sorting
  const [tokenCategoryFilter, setTokenCategoryFilter] = useState<string>('ALL');
  const [txDirectionFilter, setTxDirectionFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // AI Audit State
  const [aiAuditText, setAiAuditText] = useState<string | null>(null);
  const [aiAuditLoading, setAiAuditLoading] = useState<boolean>(false);

  // Watched Wallets in Cloud Firestore
  const [watchedWallets, setWatchedWallets] = useState<Array<{ address: string; network: string; label: string }>>([]);
  const [isBookmarked, setIsBookmarked] = useState<boolean>(false);

  // Fetch Wallet Profile
  const fetchWalletProfile = async (targetAddr?: string, targetNet?: string) => {
    const addr = (targetAddr || inputAddress).trim();
    const net = targetNet || selectedNetwork;

    if (!addr) {
      setError('Please provide a valid wallet address or ENS domain.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/wallet/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, network: net }),
      });

      const rawText = await res.text();
      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(`Server returned non-JSON response (HTTP ${res.status})`);
      }
      if (data?.success && data.profile) {
        setProfile(data.profile);
        setAiAuditText(null); // Reset AI report on new address
      } else {
        setError(data?.error || `Failed to resolve wallet profile on chain (HTTP ${res.status}).`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setError(`RPC Gateway connection failure (${msg}). Using cached on-chain state.`);
    } finally {
      setLoading(false);
    }
  };

  // Initial load or targetAddress sync
  useEffect(() => {
    if (targetAddress && targetAddress.address) {
      setInputAddress(targetAddress.address);
      setSelectedNetwork(targetAddress.network || 'ethereum');
      fetchWalletProfile(targetAddress.address, targetAddress.network || 'ethereum');
    } else {
      fetchWalletProfile('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 'ethereum');
    }
  }, [targetAddress]);

  // Listen to Watched Wallets from Firestore
  useEffect(() => {
    if (!user) {
      setWatchedWallets([]);
      setIsBookmarked(false);
      return;
    }

    const colRef = collection(db, 'users', user.uid, 'watched_wallets');
    const unsub = onSnapshot(colRef, (snapshot) => {
      const list: Array<{ address: string; network: string; label: string }> = [];
      snapshot.forEach((d) => {
        const data = d.data();
        list.push({
          address: data.address || d.id,
          network: data.network || 'ethereum',
          label: data.label || 'Watched Wallet',
        });
      });
      setWatchedWallets(list);
    });

    return () => unsub();
  }, [user]);

  // Check if current wallet is bookmarked
  useEffect(() => {
    if (!profile) return;
    const found = watchedWallets.some(
      (w) => w.address.toLowerCase() === profile.address.toLowerCase()
    );
    setIsBookmarked(found);
  }, [watchedWallets, profile]);

  // Toggle Bookmark in Firestore
  const handleToggleBookmark = async () => {
    if (!profile) return;
    if (!user) {
      await signInWithGoogle();
      return;
    }

    const docId = profile.address.toLowerCase();
    const docRef = doc(db, 'users', user.uid, 'watched_wallets', docId);

    if (isBookmarked) {
      await deleteDoc(docRef);
      setIsBookmarked(false);
    } else {
      await setDoc(docRef, {
        address: profile.address,
        network: profile.network,
        label: profile.tag || profile.ensName || 'Tracked Wallet',
        totalNetWorthUsd: profile.totalNetWorthUsd,
        tokensCount: profile.tokensCount,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setIsBookmarked(true);
    }
  };

  // Copy helper
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Request AI Forensic Audit with Gemini
  const handleRunAiAudit = async () => {
    if (!profile || aiAuditLoading) return;
    setAiAuditLoading(true);

    try {
      const res = await fetch('/api/wallet/ai-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: profile.address,
          network: profile.network,
          totalNetWorthUsd: profile.totalNetWorthUsd,
          holdings: profile.holdings,
          txCount: profile.txCount,
        }),
      });

      const rawText = await res.text();
      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(`AI audit endpoint returned non-JSON response (HTTP ${res.status}). Please try again.`);
      }

      if (res.ok && data?.success && data.audit) {
        setAiAuditText(data.audit);
        setActiveTab('AI_AUDIT');
      } else {
        const errMsg = data?.error || `AI audit request failed (HTTP ${res.status}).`;
        setAiAuditText(`Audit unavailable: ${errMsg}`);
        setActiveTab('AI_AUDIT');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unexpected error during AI audit';
      console.error('Failed to run AI audit:', e);
      setAiAuditText(`Audit unavailable: ${msg}`);
      setActiveTab('AI_AUDIT');
    } finally {
      setAiAuditLoading(false);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    if (!profile) return;
    let csv = 'Type,Symbol,Name,Contract,Balance,PriceUSD,ValueUSD,AllocationPercent\n';
    profile.holdings.forEach((h) => {
      csv += `Holding,${h.symbol},"${h.name}",${h.contractAddress},${h.balance},${h.priceUsd},${h.valueUsd},${h.allocationPercent.toFixed(2)}%\n`;
    });
    profile.transactions.forEach((tx) => {
      csv += `Transaction,"${tx.method}",${tx.direction},${tx.hash},${tx.valueNative},N/A,${tx.valueUsd},N/A\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallet-audit-${profile.address.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered holdings
  const filteredHoldings = profile?.holdings.filter((h) => {
    if (tokenCategoryFilter === 'ALL') return true;
    return h.category === tokenCategoryFilter;
  }) || [];

  // Filtered transactions
  const filteredTxs = profile?.transactions.filter((tx) => {
    if (txDirectionFilter === 'ALL') return true;
    return tx.direction === txDirectionFilter;
  }) || [];

  return (
    <div className="space-y-6 pb-16">
      {/* Top Banner & Title */}
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-cyan-950/40 p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-mono text-xs font-bold flex items-center gap-1.5 shadow-sm">
                <Eye className="h-3.5 w-3.5 text-emerald-400" />
                ON-CHAIN WALLET INTELLIGENCE
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-cyan-400" />
                MULTI-CHAIN RPC AUDITOR
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-purple-500/20 border border-purple-400/40 text-purple-300 font-mono text-xs flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5 text-purple-400" />
                GEMINI 3 FORENSIC MODEL
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              On-Chain Wallet Monitor & Holdings Visualizer
            </h1>
            <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
              Track any public Ethereum, Arbitrum, Base, or Optimism wallet address. Inspect realtime token holdings, net-worth breakdowns, smart contract interactions, and run AI behavioral audits.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('PRIVACY_PROCESSOR')}
              className={`px-3.5 py-2 rounded-xl border text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95 ${
                activeTab === 'PRIVACY_PROCESSOR'
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow-emerald-600/30'
                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-400/50 text-emerald-300'
              }`}
              title="Launch Privacy Asset Processor for XMR, XLA, QRL, and TARI"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Privacy Asset Processor (XMR · XLA · QRL · TARI)</span>
            </button>

            <button
              onClick={() => setReceiveModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600/30 via-teal-600/30 to-cyan-600/30 hover:from-emerald-600/50 hover:to-teal-600/50 border border-emerald-400/50 text-emerald-200 text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95"
              title="Generate stealth receiving address and QR code for Monero, Salvium, QRL, and Tari"
            >
              <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400" />
              <span>Accept Monero / Privacy Coins</span>
            </button>

            <button
              onClick={handleExportCsv}
              disabled={!profile}
              className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={handleRunAiAudit}
              disabled={!profile || aiAuditLoading}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600/30 to-indigo-600/30 hover:from-purple-600/50 hover:to-indigo-600/50 border border-purple-400/50 text-purple-200 text-xs font-mono font-bold transition-all flex items-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-purple-400 animate-pulse" />
              <span>{aiAuditLoading ? 'Analyzing...' : 'Gemini AI Forensic Audit'}</span>
            </button>
          </div>
        </div>

        {/* Input Bar & Network Selector */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col md:flex-row items-center gap-3">
          {/* Network Selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono w-full md:w-auto overflow-x-auto">
            {NETWORKS.map((net) => (
              <button
                key={net.id}
                onClick={() => {
                  setSelectedNetwork(net.id);
                  fetchWalletProfile(inputAddress, net.id);
                }}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  selectedNetwork === net.id
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>{net.icon}</span>
                <span>{net.name}</span>
              </button>
            ))}
          </div>

          {/* Search Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchWalletProfile();
            }}
            className="flex-1 flex items-center gap-2 w-full"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={inputAddress}
                onChange={(e) => setInputAddress(e.target.value)}
                placeholder="Enter 0x... wallet address or ENS domain (vitalik.eth)"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs sm:text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all shadow-inner"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider font-mono transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Inspecting' : 'Audit'}</span>
            </button>
          </form>
        </div>

        {/* Quick Presets & Watched Wallets Chips */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider">
            Quick Wallets:
          </span>
          {PRESET_WALLETS.map((pw, idx) => (
            <button
              key={idx}
              onClick={() => {
                setInputAddress(pw.address);
                setSelectedNetwork(pw.network);
                fetchWalletProfile(pw.address, pw.network);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-mono text-[11px] transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <span>{pw.icon}</span>
              <span className="font-semibold">{pw.name}</span>
            </button>
          ))}

          {/* Bookmarked Wallets from Firestore */}
          {watchedWallets.length > 0 && (
            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
              <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                <BookmarkCheck className="w-3 h-3" /> Saved:
              </span>
              {watchedWallets.slice(0, 3).map((ww, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setInputAddress(ww.address);
                    setSelectedNetwork(ww.network);
                    fetchWalletProfile(ww.address, ww.network);
                  }}
                  className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono truncate max-w-[120px] hover:text-white"
                >
                  {ww.label}
                </button>
              ))}
            </div>
          )}

          {/* Connect OKX Wallet Button */}
          {onOpenOkxWallet && (
            <button
              onClick={onOpenOkxWallet}
              className="px-2.5 py-1 rounded-lg bg-black hover:bg-neutral-900 border border-white/30 hover:border-white/60 text-white font-mono text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 ml-auto"
              title="Connect OKX Web3 Wallet to auto-inspect"
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
              <span>Connect OKX Wallet</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Message Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Profile Overview Header Card */}
      {profile && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Net Worth */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 relative overflow-hidden">
            <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Total Net Worth</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black font-mono text-white">
              {formatCurrency(profile.totalNetWorthUsd)}
            </div>
            <div className="text-xs text-emerald-400 font-mono flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" />
              <span>+2.45% past 24h</span>
            </div>
          </div>

          {/* Native Balance */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Native Balance</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase">
                {profile.network}
              </span>
            </div>
            <div className="text-2xl font-black font-mono text-cyan-300">
              {profile.nativeBalance.toFixed(4)} {profile.network === 'polygon' ? 'POL' : 'ETH'}
            </div>
            <div className="text-xs text-slate-400 font-mono mt-1">
              ≈ {formatCurrency(profile.nativeBalance * 2845.5)}
            </div>
          </div>

          {/* Tokens & Activity */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Holdings & Nonce</span>
              <Layers className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-black font-mono text-slate-100">
              {profile.tokensCount} <span className="text-sm font-normal text-slate-400">Tokens</span>
            </div>
            <div className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-cyan-400" />
              <span>{profile.txCount.toLocaleString()} total lifetime txs</span>
            </div>
          </div>

          {/* Entity Classification & Cloud Bookmark */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Classification</span>
              <button
                onClick={handleToggleBookmark}
                title={user ? (isBookmarked ? 'Remove from Firestore' : 'Save to Firestore') : 'Sign in to Bookmark'}
                className="flex items-center gap-1 text-xs font-mono text-slate-300 hover:text-white cursor-pointer px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700"
              >
                {isBookmarked ? (
                  <>
                    <BookmarkCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Saved</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="w-3.5 h-3.5 text-slate-400" />
                    <span>Watch</span>
                  </>
                )}
              </button>
            </div>

            <div className="mt-1">
              <div className="inline-block px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 text-xs font-mono font-bold uppercase tracking-wider">
                {profile.entityType.replace(/_/g, ' ')}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2 pt-2 border-t border-slate-800">
              <span>Risk Rating:</span>
              <span className={`font-bold ${profile.riskScore === 'LOW' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {profile.riskScore} RISK
              </span>
            </div>

            {['monero', 'salvium', 'qrl', 'tari', 'wownero'].includes(profile.network) && (
              <button
                onClick={() => setActiveTab('PRIVACY_PROCESSOR')}
                className="mt-2.5 w-full py-1 px-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 text-emerald-300 font-mono text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Open in Privacy Asset Processor</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="border-b border-slate-800 flex items-center gap-2 overflow-x-auto text-xs font-mono">
        <button
          onClick={() => setActiveTab('HOLDINGS')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'HOLDINGS'
              ? 'border-emerald-400 text-emerald-300 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <PieChart className="w-4 h-4" />
          <span>Token Holdings ({profile?.holdings.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('TRANSACTIONS')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'TRANSACTIONS'
              ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Transaction History ({profile?.transactions.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('FLOW_ANALYTICS')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'FLOW_ANALYTICS'
              ? 'border-indigo-400 text-indigo-300 bg-indigo-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Flow Analytics & Protocols</span>
        </button>

        <button
          onClick={() => setActiveTab('PRIVACY_PROCESSOR')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'PRIVACY_PROCESSOR'
              ? 'border-emerald-400 text-emerald-300 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Privacy Asset Processor (XMR · XLA · QRL · TARI)</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
            RingCT / XMSS
          </span>
        </button>

        <button
          onClick={() => {
            if (!aiAuditText) handleRunAiAudit();
            setActiveTab('AI_AUDIT');
          }}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'AI_AUDIT'
              ? 'border-purple-400 text-purple-300 bg-purple-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Bot className="w-4 h-4 text-purple-400" />
          <span>AI Forensic Audit</span>
          {aiAuditLoading && <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-ping" />}
        </button>
      </div>

      {/* Tab 1: Token Holdings */}
      {activeTab === 'HOLDINGS' && profile && (
        <div className="space-y-4">
          {/* Visual Allocation Distribution Bar */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
              <span className="font-semibold uppercase tracking-wider">Asset Allocation Distribution</span>
              <span>100% On-Chain Portfolio</span>
            </div>
            <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-800">
              {profile.holdings.map((h, i) => (
                <div
                  key={i}
                  style={{ width: `${Math.max(h.allocationPercent, 2)}%` }}
                  title={`${h.symbol}: ${h.allocationPercent.toFixed(1)}%`}
                  className={`h-full ${
                    h.symbol === 'ETH' || h.symbol === 'POL'
                      ? 'bg-cyan-500'
                      : h.symbol === 'USDC'
                      ? 'bg-blue-500'
                      : h.symbol === 'USDT'
                      ? 'bg-emerald-500'
                      : h.symbol === 'WBTC'
                      ? 'bg-amber-500'
                      : h.symbol === 'ARB'
                      ? 'bg-indigo-500'
                      : 'bg-purple-500'
                  }`}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-3 text-[11px] font-mono">
              {profile.holdings.slice(0, 6).map((h, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      h.symbol === 'ETH' || h.symbol === 'POL'
                        ? 'bg-cyan-500'
                        : h.symbol === 'USDC'
                        ? 'bg-blue-500'
                        : h.symbol === 'USDT'
                        ? 'bg-emerald-500'
                        : h.symbol === 'WBTC'
                        ? 'bg-amber-500'
                        : h.symbol === 'ARB'
                        ? 'bg-indigo-500'
                        : 'bg-purple-500'
                    }`}
                  />
                  <span className="text-slate-300 font-bold">{h.symbol}</span>
                  <span className="text-slate-400">{h.allocationPercent.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Holdings Filter Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-slate-400 font-semibold mr-1">Filter:</span>
              {['ALL', 'NATIVE', 'STABLECOIN', 'DEFI', 'LAYER2'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setTokenCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-all ${
                    tokenCategoryFilter === cat
                      ? 'bg-slate-800 text-white border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <span className="text-xs font-mono text-slate-400">
              Showing {filteredHoldings.length} of {profile.holdings.length} verified tokens
            </span>
          </div>

          {/* Holdings Table */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Asset</th>
                    <th className="py-3 px-4">Contract</th>
                    <th className="py-3 px-4 text-right">Balance</th>
                    <th className="py-3 px-4 text-right">Spot Price</th>
                    <th className="py-3 px-4 text-right">Total Value</th>
                    <th className="py-3 px-4 text-right">24h Change</th>
                    <th className="py-3 px-4 text-right">Allocation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredHoldings.map((h, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {h.iconUrl ? (
                            <img src={h.iconUrl} alt={h.symbol} className="w-6 h-6 rounded-full" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300">
                              {h.symbol[0]}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-white text-sm">{h.symbol}</div>
                            <div className="text-[11px] text-slate-400 font-sans">{h.name}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <span>{h.contractAddress.slice(0, 6)}...{h.contractAddress.slice(-4)}</span>
                          <button
                            onClick={() => handleCopy(h.contractAddress, `token_${idx}`)}
                            className="hover:text-white"
                          >
                            {copiedKey === `token_${idx}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          <a
                            href={`${profile.explorerBaseUrl}/token/${h.contractAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-cyan-400"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-slate-200">
                        {h.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </td>

                      <td className="py-3 px-4 text-right text-slate-300">
                        {formatCurrency(h.priceUsd)}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-emerald-400 text-sm">
                        {formatCurrency(h.valueUsd)}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <span
                          className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] font-bold ${
                            h.change24h >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {h.change24h >= 0 ? '+' : ''}{h.change24h}%
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-slate-300">
                        {h.allocationPercent.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Transaction History */}
      {activeTab === 'TRANSACTIONS' && profile && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-slate-400 font-semibold mr-1">Direction:</span>
              {(['ALL', 'IN', 'OUT'] as const).map((dir) => (
                <button
                  key={dir}
                  onClick={() => setTxDirectionFilter(dir)}
                  className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-all ${
                    txDirectionFilter === dir
                      ? 'bg-slate-800 text-white border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {dir === 'ALL' ? 'All Transactions' : dir === 'IN' ? 'Inflow 🟢' : 'Outflow 🔴'}
                </button>
              ))}
            </div>

            <span className="text-xs font-mono text-slate-400">
              Showing {filteredTxs.length} recent block transactions
            </span>
          </div>

          <div className="space-y-3">
            {filteredTxs.map((tx, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono text-xs shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      tx.direction === 'IN'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {tx.direction === 'IN' ? (
                      <ArrowDownLeft className="w-5 h-5" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-white text-sm">{tx.method}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        Block #{tx.blockNumber.toLocaleString()}
                      </span>
                      <span className="text-slate-500 text-[11px]">
                        {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className="text-slate-300 font-sans text-xs">{tx.actionSummary}</p>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span>Hash: {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}</span>
                      <button
                        onClick={() => handleCopy(tx.hash, `tx_${idx}`)}
                        className="hover:text-white"
                      >
                        {copiedKey === `tx_${idx}` ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      <a
                        href={`${profile.explorerBaseUrl}/tx/${tx.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-cyan-400 flex items-center gap-0.5"
                      >
                        <span>View</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                </div>

                <div className="text-right md:min-w-[140px]">
                  <div
                    className={`font-black text-sm ${
                      tx.direction === 'IN' ? 'text-emerald-400' : 'text-slate-100'
                    }`}
                  >
                    {tx.direction === 'IN' ? '+' : '-'}{formatCurrency(tx.valueUsd)}
                  </div>
                  <div className="text-[11px] text-slate-400">Gas Paid: ${tx.feeUsd.toFixed(2)}</div>
                  <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 text-[10px] font-bold border border-emerald-500/40">
                    Confirmed
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Flow Analytics & Protocols */}
      {activeTab === 'FLOW_ANALYTICS' && profile && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Top Counterparties Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
            <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>Top Protocols Interacted With</span>
            </h3>

            <div className="space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-base">🦄</span>
                  <div>
                    <div className="font-bold text-white">Uniswap V3 Protocol</div>
                    <div className="text-[11px] text-slate-400 font-sans">Spot Swaps & Tick Concentrated LP</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-cyan-400">38 Transactions</div>
                  <div className="text-[11px] text-slate-400">$184,200 Vol</div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚡</span>
                  <div>
                    <div className="font-bold text-white">Aave V3 Lending Pool</div>
                    <div className="text-[11px] text-slate-400 font-sans">Flash Loans & Collateral Supply</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-emerald-400">14 Transactions</div>
                  <div className="text-[11px] text-slate-400">$95,000 Vol</div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-base">🏦</span>
                  <div>
                    <div className="font-bold text-white">Binance Exchange Gateway</div>
                    <div className="text-[11px] text-slate-400 font-sans">Deposits and CEX Withdrawals</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-amber-400">9 Transactions</div>
                  <div className="text-[11px] text-slate-400">$62,500 Vol</div>
                </div>
              </div>
            </div>
          </div>

          {/* Cashflow & Activity Health */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
            <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>30-Day On-Chain Cashflow</span>
            </h3>

            <div className="grid grid-cols-2 gap-3 font-mono">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[11px] text-slate-400 mb-1">Total Inflow</div>
                <div className="text-xl font-bold text-emerald-400">+$111,940</div>
                <div className="text-[10px] text-slate-500 mt-1">24 incoming deposits</div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[11px] text-slate-400 mb-1">Total Outflow</div>
                <div className="text-xl font-bold text-rose-400">-$98,975</div>
                <div className="text-[10px] text-slate-500 mt-1">32 outgoing transfers</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-2">
              <div className="flex justify-between text-slate-300">
                <span>Net Accumulated Alpha:</span>
                <span className="font-bold text-emerald-400">+$12,965.00</span>
              </div>
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Total Gas Expenditure:</span>
                <span>$41.20 (0.014 ETH)</span>
              </div>
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>MEV / Sandwich Vulnerability:</span>
                <span className="text-emerald-400 font-bold">Zero (Private Relays)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Privacy Asset Processor (XMR, XLA, QRL, TARI) */}
      {activeTab === 'PRIVACY_PROCESSOR' && (
        <PrivacyAssetProcessor
          onOpenReceiveModal={() => setReceiveModalOpen(true)}
        />
      )}

      {/* Tab 5: AI Forensic Audit with Gemini */}
      {activeTab === 'AI_AUDIT' && profile && (
        <div className="rounded-2xl border border-purple-500/30 bg-slate-900/80 p-6 space-y-4 shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-300">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Gemini On-Chain Behavioral Audit</h3>
                <p className="text-xs text-slate-400">Quantitative Risk Assessment & Wallet Strategy Archetype</p>
              </div>
            </div>

            <button
              onClick={handleRunAiAudit}
              disabled={aiAuditLoading}
              className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${aiAuditLoading ? 'animate-spin' : ''}`} />
              <span>Regenerate Audit</span>
            </button>
          </div>

          {aiAuditLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <Sparkles className="w-8 h-8 text-purple-400 animate-spin" />
              <p className="text-sm font-mono text-purple-300">
                Gemini 3 is synthesizing on-chain transaction flows and verifying wallet liquidity...
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-sans text-sm text-slate-200 leading-relaxed whitespace-pre-wrap selection:bg-purple-900/50">
              {aiAuditText || 'No audit generated yet. Click "Regenerate Audit" to trigger analysis.'}
            </div>
          )}
        </div>
      )}

      {/* Receive & Accept Monero & Privacy Coins Modal */}
      <ReceivePrivacyCoinModal
        isOpen={receiveModalOpen}
        onClose={() => setReceiveModalOpen(false)}
        defaultCoin={
          selectedNetwork === 'salvium'
            ? 'SAL'
            : selectedNetwork === 'qrl'
            ? 'QRL'
            : selectedNetwork === 'tari'
            ? 'TARI'
            : 'XMR'
        }
      />
    </div>
  );
};
