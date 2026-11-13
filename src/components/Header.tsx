import React, { useState } from 'react';
import {
  Activity,
  ArrowUpFromLine,
  Bot,
  BrainCircuit,
  Eye,
  Key,
  Landmark,
  MoreVertical,
  Radar,
  RotateCcw,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react';
import { ActivePageTab, CredentialsSummary, PortfolioState, TradingExecutionMode } from '../types';
import { formatCurrency, formatPercent } from '../utils/cryptoMath';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  portfolio: PortfolioState;
  unrealizedPnl: number;
  botRunning: boolean;
  onToggleBot: () => void;
  onResetPortfolio: () => void;
  onOpenAudit: () => void;
  onOpenBacktest: () => void;
  onOpenExchanges: () => void;
  onOpenFiatAccount: () => void;
  onOpenWithdraw: () => void;
  onOpenAiTroubleshooter?: () => void;
  fiatAccountAvailableBalance: number;
  simSpeed: number;
  onSetSimSpeed: (speed: number) => void;
  activePositionsCount: number;
  tradingMode: TradingExecutionMode;
  isLiveMarketConnected: boolean;
  credentialsSummary?: CredentialsSummary | null;
  activeTab?: ActivePageTab;
  onSelectTab?: (tab: ActivePageTab) => void;
  onChainSignalsCount?: number;
  sentimentScore?: number;
  onOpenOkxWallet?: () => void;
  okxConnectedAddress?: string | null;
  onOpenCakeWallet?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  portfolio,
  unrealizedPnl,
  botRunning,
  onToggleBot,
  onResetPortfolio,
  onOpenAudit,
  onOpenBacktest,
  onOpenExchanges,
  onOpenFiatAccount,
  onOpenWithdraw,
  onOpenAiTroubleshooter,
  onOpenOkxWallet,
  okxConnectedAddress,
  onOpenCakeWallet,
  fiatAccountAvailableBalance,
  activePositionsCount,
  tradingMode,
  activeTab = 'TRADING_DESK',
  onSelectTab,
  onChainSignalsCount = 5,
  sentimentScore,
}) => {
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const totalEquity = portfolio.cash + unrealizedPnl;
  const { user, signInWithGoogle, signOutUser } = useAuth();
  const totalPnl = totalEquity - portfolio.startingBalance;
  const totalPnlPercent =
    portfolio.startingBalance > 0 ? (totalPnl / portfolio.startingBalance) * 100 : 0;

  const isLiveTrading = tradingMode === 'LIVE_REAL_TRADING';

  return (
    <header className="border-b border-slate-800/90 bg-[#090D16]/95 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2 sm:gap-3">
        {/* LEFT: Brand + Primary Navigation */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg border shadow-sm ${
                isLiveTrading
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                  : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
              }`}
            >
              <Bot className="h-4 w-4" />
            </div>
            <div className="hidden 2xl:flex flex-col leading-none">
              <span className="text-sm font-bold tracking-tight text-white font-mono">
                APEX<span className="text-cyan-400">QUANT</span>
              </span>
              <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                Multi-Exchange SOR
              </span>
            </div>
          </div>

          {onSelectTab && (
            <nav className="flex items-center p-0.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs font-mono overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => onSelectTab('TRADING_DESK')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'TRADING_DESK'
                    ? 'bg-slate-800 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="h-3 w-3 text-cyan-400 shrink-0" />
                <span>Desk</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('SENTIMENT_RADAR')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'SENTIMENT_RADAR'
                    ? 'bg-pink-600/30 text-pink-200 font-semibold shadow-sm border border-pink-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="AI Sentiment Analysis & Social Media Radar"
              >
                <BrainCircuit className="h-3 w-3 text-pink-400 shrink-0" />
                <span>Sentiment</span>
                {sentimentScore !== undefined && (
                  <span
                    className={`text-[10px] ml-0.5 px-1 rounded font-bold tabular-nums ${
                      sentimentScore > 0
                        ? 'text-emerald-400 bg-emerald-950/60'
                        : sentimentScore < 0
                        ? 'text-rose-400 bg-rose-950/60'
                        : 'text-slate-400'
                    }`}
                  >
                    {sentimentScore > 0 ? `+${sentimentScore}` : sentimentScore}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('ETHERSCAN_INTELLIGENCE')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'ETHERSCAN_INTELLIGENCE'
                    ? 'bg-indigo-600/30 text-indigo-200 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Radar className="h-3 w-3 text-indigo-400 shrink-0" />
                <span className="hidden xl:inline">Etherscan</span>
                <span>Radar</span>
                <span className="text-[10px] text-emerald-400 tabular-nums">({onChainSignalsCount})</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('FLASH_ARB_BOT')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'FLASH_ARB_BOT'
                    ? 'bg-cyan-500/20 text-cyan-200 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="h-3 w-3 text-cyan-400 shrink-0" />
                <span>Flash Arb</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('WALLET_MONITOR')}
                className={`hidden md:flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'WALLET_MONITOR'
                    ? 'bg-emerald-500/20 text-emerald-200 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="h-3 w-3 text-emerald-400 shrink-0" />
                <span>Monitor</span>
              </button>
            </nav>
          )}
        </div>

        {/* CENTER: Compact Portfolio Telemetry */}
        <div className="hidden xl:flex items-center gap-2.5 bg-slate-950/70 border border-slate-800/80 px-3 py-1 rounded-lg text-xs font-mono shrink-0 whitespace-nowrap">
          <div className="flex items-center gap-1">
            <span className="text-slate-500 text-[11px]">Equity:</span>
            <span className="text-white font-bold tabular-nums">{formatCurrency(totalEquity)}</span>
          </div>

          <span className="text-slate-700">·</span>

          <div className="flex items-center gap-1">
            <span className="text-slate-500 text-[11px]">PnL:</span>
            <span
              className={`font-semibold tabular-nums ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
            >
              {totalPnl >= 0 ? '+' : ''}
              {formatCurrency(totalPnl)} ({formatPercent(totalPnlPercent)})
            </span>
          </div>

          <span className="text-slate-700">·</span>

          <div className="flex items-center gap-1">
            <span className="text-slate-500 text-[11px]">Pos:</span>
            <span className="text-cyan-400 font-semibold tabular-nums">{activePositionsCount}</span>
          </div>

          <span className="text-slate-700">·</span>

          <div className="flex items-center gap-1.5 text-rose-300 font-bold text-[10px] tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
            <span className="font-mono uppercase">LIVE</span>
          </div>
        </div>

        {/* RIGHT: Primary Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleBot}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm whitespace-nowrap shrink-0 ${
              botRunning
                ? isLiveTrading
                  ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
            title={botRunning ? 'Click to Pause Trading Bot' : 'Click to Activate Trading Bot'}
          >
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                botRunning
                  ? isLiveTrading
                    ? 'bg-white animate-pulse'
                    : 'bg-slate-950 animate-pulse'
                  : 'bg-slate-400'
              }`}
            />
            <span className="font-mono text-[11px] hidden sm:inline">
              {botRunning ? (isLiveTrading ? 'LIVE BOT' : 'BOT RUNNING') : 'BOT STANDBY'}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenFiatAccount}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-emerald-500/30 text-emerald-300 text-xs font-mono transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Open Treasury & Bank/Card Funding Rail"
          >
            <Landmark className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="font-bold text-white text-[11px] tabular-nums">
              {formatCurrency(fiatAccountAvailableBalance)}
            </span>
          </button>

          {onOpenOkxWallet && (
            <button
              type="button"
              onClick={onOpenOkxWallet}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                okxConnectedAddress
                  ? 'bg-neutral-900 border-white/40 text-white hover:border-white shadow-sm'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title={
                okxConnectedAddress
                  ? `Connected OKX Wallet: ${okxConnectedAddress}`
                  : 'Connect OKX Web3 Wallet (..11)'
              }
            >
              <div className="w-3 h-3 rounded-[2px] bg-black border border-white/40 grid grid-cols-2 gap-0.5 p-0.5 shrink-0">
                <div className="bg-white rounded-[0.5px]" />
                <div className="bg-black" />
              </div>
              <span className="hidden sm:inline text-[11px] font-bold">
                {okxConnectedAddress
                  ? `OKX ${
                      okxConnectedAddress.toLowerCase().endsWith('11')
                        ? '..11'
                        : `${okxConnectedAddress.slice(0, 4)}..${okxConnectedAddress.slice(-2)}`
                    }`
                  : 'OKX ..11'}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                  okxConnectedAddress ? 'bg-cyan-400' : 'bg-amber-400'
                }`}
              />
            </button>
          )}

          {onOpenAiTroubleshooter && (
            <button
              type="button"
              onClick={onOpenAiTroubleshooter}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-cyan-500/40 text-cyan-300 text-xs font-mono transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="AI Strategy Copilot & Quant Diagnostics"
            >
              <Bot className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
              <span className="hidden lg:inline text-[11px]">Copilot</span>
            </button>
          )}

          {/* Tools & Utilities Dropdown Menu */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowToolsMenu(!showToolsMenu)}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer flex items-center justify-center ${
                showToolsMenu
                  ? 'bg-slate-800 text-white border-slate-600'
                  : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800 hover:border-slate-700'
              }`}
              title="More Tools: Exchanges, Cake Wallet, Backtest Lab, AI Risk Audit, Withdrawals"
              aria-label="More tools menu"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            {showToolsMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowToolsMenu(false)} />
                <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-1.5 z-50 text-xs font-mono flex flex-col gap-0.5 animate-in fade-in-50 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      setShowToolsMenu(false);
                      onOpenExchanges();
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors w-full text-left cursor-pointer"
                  >
                    <Wallet className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Exchange Wallets & Keys</span>
                  </button>

                  {onOpenCakeWallet && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowToolsMenu(false);
                        onOpenCakeWallet();
                      }}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors w-full text-left cursor-pointer"
                    >
                      <span className="text-xs">🍰</span>
                      <span>Cake Wallet (..5d)</span>
                    </button>
                  )}

                  {onOpenOkxWallet && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowToolsMenu(false);
                        onOpenOkxWallet();
                      }}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors w-full text-left cursor-pointer"
                    >
                      <Key className="h-3.5 w-3.5 text-amber-400" />
                      <span>
                        {okxConnectedAddress
                          ? `OKX: ${okxConnectedAddress.slice(0, 6)}...`
                          : 'Connect OKX Wallet (..11)'}
                      </span>
                    </button>
                  )}

                  <div className="h-px bg-slate-800 my-1" />

                  <button
                    type="button"
                    onClick={() => {
                      setShowToolsMenu(false);
                      onOpenBacktest();
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors w-full text-left cursor-pointer"
                  >
                    <Activity className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Backtest Lab</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowToolsMenu(false);
                      onOpenAudit();
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors w-full text-left cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                    <span>AI Risk Audit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowToolsMenu(false);
                      onOpenWithdraw();
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors w-full text-left cursor-pointer"
                  >
                    <ArrowUpFromLine className="h-3.5 w-3.5 text-rose-400" />
                    <span>Withdraw Capital</span>
                  </button>

                  <div className="h-px bg-slate-800 my-1" />

                  <button
                    type="button"
                    onClick={() => {
                      setShowToolsMenu(false);
                      onResetPortfolio();
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30 transition-colors w-full text-left cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Sync & Refresh Live Ledger</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* User Profile / Auth */}
          {user ? (
            <div className="flex items-center gap-1.5 pl-1 shrink-0">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="Avatar"
                  className="w-6 h-6 rounded-full object-cover ring-1 ring-slate-700"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-cyan-600 flex items-center justify-center text-[10px] text-white font-bold">
                  {user.displayName?.[0] || 'U'}
                </div>
              )}
              <button
                type="button"
                onClick={signOutUser}
                className="text-[10px] text-slate-400 hover:text-rose-400 font-mono transition-colors cursor-pointer hidden sm:inline whitespace-nowrap"
                title="Sign Out"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={signInWithGoogle}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-mono font-medium cursor-pointer transition-colors whitespace-nowrap shrink-0"
              title="Sign in with Google to synchronize configurations"
            >
              <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span className="hidden sm:inline text-[11px]">Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
