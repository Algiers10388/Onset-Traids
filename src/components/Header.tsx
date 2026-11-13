import React from 'react';
import {
  Activity,
  ArrowUpFromLine,
  Bot,
  BrainCircuit,
  Eye,
  Landmark,
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
  const totalEquity = portfolio.cash + unrealizedPnl;
  const { user, signInWithGoogle, signOutUser } = useAuth();
  const totalPnl = totalEquity - portfolio.startingBalance;
  const totalPnlPercent =
    portfolio.startingBalance > 0 ? (totalPnl / portfolio.startingBalance) * 100 : 0;

  const isLiveTrading = tradingMode === 'LIVE_REAL_TRADING';

  const optionTabBaseClass =
    'flex items-center gap-1.5 px-2.5 py-2 text-xs font-mono border-b-2 border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800/40 hover:border-slate-600 transition-colors cursor-pointer whitespace-nowrap shrink-0';

  return (
    <header className="border-b border-slate-800/90 bg-[#090D16] sticky top-0 z-40">
      {/* Row 1: Brand + Live Telemetry + Bot Toggle + Auth */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 min-h-12 py-1.5 flex items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg border shadow-sm ${
              isLiveTrading
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
            }`}
          >
            <Bot className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-bold tracking-tight text-white font-mono">
              APEX<span className="text-cyan-400">QUANT</span>
            </span>
            <span className="hidden sm:block text-[9px] text-slate-500 font-mono mt-0.5">
              Multi-Exchange SOR
            </span>
          </div>
        </div>

        {/* Center Telemetry */}
        <div className="hidden md:flex items-center gap-2.5 bg-slate-950/80 border border-slate-800/80 px-3 py-1 rounded-lg text-xs font-mono shrink-0 whitespace-nowrap">
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

          <span className="text-slate-700 hidden lg:inline">·</span>

          <div className="hidden lg:flex items-center gap-1">
            <span className="text-slate-500 text-[11px]">Pos:</span>
            <span className="text-cyan-400 font-semibold tabular-nums">{activePositionsCount}</span>
          </div>

          <span className="text-slate-700">·</span>

          <div className="flex items-center gap-1.5 text-rose-300 font-bold text-[10px] tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
            <span className="font-mono uppercase">{isLiveTrading ? 'LIVE REAL' : 'LIVE'}</span>
          </div>
        </div>

        {/* Right Primary Controls: Bot Status + Auth */}
        <div className="flex items-center gap-2 shrink-0">
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
            <span className="font-mono text-[11px]">
              {botRunning ? (isLiveTrading ? 'LIVE BOT' : 'BOT RUNNING') : 'BOT STANDBY'}
            </span>
          </button>

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
                className="text-[11px] text-slate-400 hover:text-rose-400 font-mono transition-colors cursor-pointer hidden sm:inline whitespace-nowrap"
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

      {/* Row 2: Full-Width Tab Rail — Views + All Tool Options as Clean Tabs */}
      <div className="border-t border-slate-800/80 bg-[#0B101B]">
        <div
          className="max-w-7xl mx-auto px-3 sm:px-4 flex items-center gap-0.5 overflow-x-auto no-scrollbar"
          role="tablist"
          aria-label="Workspace views and tools"
        >
          {onSelectTab && (
            <>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'TRADING_DESK'}
                onClick={() => onSelectTab('TRADING_DESK')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'TRADING_DESK'
                    ? 'border-cyan-400 text-white font-semibold bg-slate-800/50'
                    : 'border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800/30'
                }`}
              >
                <Zap className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                <span>Desk</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'SENTIMENT_RADAR'}
                onClick={() => onSelectTab('SENTIMENT_RADAR')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'SENTIMENT_RADAR'
                    ? 'border-pink-400 text-pink-100 font-semibold bg-pink-500/10'
                    : 'border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800/30'
                }`}
                title="AI Sentiment Analysis & Social Media Radar"
              >
                <BrainCircuit className="h-3.5 w-3.5 text-pink-400 shrink-0" />
                <span>Sentiment</span>
                {sentimentScore !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold tabular-nums leading-none ${
                      sentimentScore > 0
                        ? 'text-emerald-400 bg-emerald-950/70'
                        : sentimentScore < 0
                        ? 'text-rose-400 bg-rose-950/70'
                        : 'text-slate-400 bg-slate-800'
                    }`}
                  >
                    {sentimentScore > 0 ? `+${sentimentScore}` : sentimentScore}
                  </span>
                )}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'ETHERSCAN_INTELLIGENCE'}
                onClick={() => onSelectTab('ETHERSCAN_INTELLIGENCE')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'ETHERSCAN_INTELLIGENCE'
                    ? 'border-indigo-400 text-indigo-100 font-semibold bg-indigo-500/10'
                    : 'border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800/30'
                }`}
              >
                <Radar className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                <span>Etherscan Radar</span>
                <span className="text-[10px] text-emerald-400 font-semibold tabular-nums">
                  ({onChainSignalsCount})
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'FLASH_ARB_BOT'}
                onClick={() => onSelectTab('FLASH_ARB_BOT')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'FLASH_ARB_BOT'
                    ? 'border-cyan-400 text-cyan-100 font-semibold bg-cyan-500/10'
                    : 'border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800/30'
                }`}
              >
                <Zap className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                <span>Flash Arb</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'WALLET_MONITOR'}
                onClick={() => onSelectTab('WALLET_MONITOR')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'WALLET_MONITOR'
                    ? 'border-emerald-400 text-emerald-100 font-semibold bg-emerald-500/10'
                    : 'border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800/30'
                }`}
              >
                <Eye className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>Monitor</span>
              </button>

              <div className="h-4 w-px bg-slate-800 shrink-0 mx-1.5" aria-hidden="true" />
            </>
          )}

          {/* Option Tabs */}
          <button
            type="button"
            onClick={onOpenFiatAccount}
            className={optionTabBaseClass}
            title="Open Treasury & Bank/Card Funding Rail"
          >
            <Landmark className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>Treasury</span>
            <span className="text-emerald-300 font-bold tabular-nums">
              {formatCurrency(fiatAccountAvailableBalance)}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenExchanges}
            className={optionTabBaseClass}
            title="Exchange Wallets & Keys"
          >
            <Wallet className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <span>Exchanges</span>
          </button>

          {onOpenOkxWallet && (
            <button
              type="button"
              onClick={onOpenOkxWallet}
              className={optionTabBaseClass}
              title={
                okxConnectedAddress
                  ? `Connected OKX Wallet: ${okxConnectedAddress}`
                  : 'Connect OKX Web3 Wallet (..11)'
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                  okxConnectedAddress ? 'bg-cyan-400' : 'bg-amber-400'
                }`}
              />
              <span>
                {okxConnectedAddress
                  ? `OKX ${
                      okxConnectedAddress.toLowerCase().endsWith('11')
                        ? '..11'
                        : `${okxConnectedAddress.slice(0, 4)}..${okxConnectedAddress.slice(-2)}`
                    }`
                  : 'OKX ..11'}
              </span>
            </button>
          )}

          {onOpenCakeWallet && (
            <button
              type="button"
              onClick={onOpenCakeWallet}
              className={optionTabBaseClass}
              title="Cake Wallet (..5d)"
            >
              <span className="text-xs leading-none">🍰</span>
              <span>Cake ..5d</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenBacktest}
            className={optionTabBaseClass}
            title="Open Backtest Lab"
          >
            <Activity className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <span>Backtest</span>
          </button>

          <button
            type="button"
            onClick={onOpenAudit}
            className={optionTabBaseClass}
            title="Run AI Risk Audit"
          >
            <Sparkles className="h-3.5 w-3.5 text-purple-400 shrink-0" />
            <span>AI Audit</span>
          </button>

          {onOpenAiTroubleshooter && (
            <button
              type="button"
              onClick={onOpenAiTroubleshooter}
              className={optionTabBaseClass}
              title="AI Strategy Copilot & Quant Diagnostics"
            >
              <Bot className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
              <span>Copilot</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenWithdraw}
            className={optionTabBaseClass}
            title="Withdraw Capital"
          >
            <ArrowUpFromLine className="h-3.5 w-3.5 text-rose-400 shrink-0" />
            <span>Withdraw</span>
          </button>

          <button
            type="button"
            onClick={onResetPortfolio}
            className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-mono border-b-2 border-transparent text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30 hover:border-emerald-500/60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Sync & Refresh Live Ledger"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
            <span>Sync</span>
          </button>
        </div>
      </div>
    </header>
  );
};
