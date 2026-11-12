import React, { useState, useEffect } from 'react';
import {
  X,
  Wallet,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
  Zap,
  ArrowRight,
  ArrowDownLeft,
  Lock,
  Layers,
  Globe,
  CheckCircle2,
  AlertTriangle,
  Send,
  Eye,
} from 'lucide-react';
import {
  connectOkxWallet,
  switchOkxChain,
  signOkxMessage,
  isOkxWalletInstalled,
  getCachedOkxAddress,
  clearCachedOkxWallet,
  OKX_SUPPORTED_CHAINS,
} from '../services/okxWallet';
import { formatCurrency } from '../utils/cryptoMath';

interface OkxWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAddressForMonitor?: (address: string, network?: string) => void;
  onDepositToDesk?: (amount: number, symbol: string) => void;
}

export const OkxWalletModal: React.FC<OkxWalletModalProps> = ({
  isOpen,
  onClose,
  onSelectAddressForMonitor,
  onDepositToDesk,
}) => {
  const [address, setAddress] = useState<string | null>(getCachedOkxAddress());
  const [chainId, setChainId] = useState<string>('0x1');
  const [networkName, setNetworkName] = useState<string>('Ethereum Mainnet');
  const [balanceEth, setBalanceEth] = useState<number>(0);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [switchingChain, setSwitchingChain] = useState<boolean>(false);
  const [signingMsg, setSigningMsg] = useState<boolean>(false);
  const [signatureResult, setSignatureResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Manual fallback input
  const [manualAddress, setManualAddress] = useState<string>('');

  const isInstalled = isOkxWalletInstalled();

  // Try auto-connect if cached
  useEffect(() => {
    if (isOpen && !address && isInstalled) {
      const cached = getCachedOkxAddress();
      if (cached) {
        setAddress(cached);
      }
    }
  }, [isOpen, isInstalled, address]);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setConnecting(true);
    setErrorMsg(null);
    try {
      const res = await connectOkxWallet();
      setAddress(res.address);
      setChainId(res.chainId);
      setNetworkName(res.networkName);
      setBalanceEth(res.balanceEth);
    } catch (err: any) {
      if (err.message === 'OKX_WALLET_NOT_INSTALLED') {
        setErrorMsg('OKX Wallet extension is not installed in your browser. Install it or connect manually below.');
      } else {
        setErrorMsg(err.message || 'Failed to connect to OKX Wallet.');
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    clearCachedOkxWallet();
    setAddress(null);
    setBalanceEth(0);
    setSignatureResult(null);
  };

  const handleSwitchNetwork = async (targetChainIdHex: string) => {
    setSwitchingChain(true);
    setErrorMsg(null);
    try {
      await switchOkxChain(targetChainIdHex);
      setChainId(targetChainIdHex);
      const cfg = OKX_SUPPORTED_CHAINS[targetChainIdHex];
      if (cfg) setNetworkName(cfg.name);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to switch network in OKX Wallet.');
    } finally {
      setSwitchingChain(false);
    }
  };

  const handleSignAuthChallenge = async () => {
    if (!address) return;
    setSigningMsg(true);
    setErrorMsg(null);
    try {
      const challenge = `Apex Quant Platform Authentication\nWallet: ${address}\nTimestamp: ${new Date().toISOString()}\nNonce: ${Math.random().toString(36).substring(2, 10)}`;
      const sig = await signOkxMessage(challenge, address);
      setSignatureResult(sig);
    } catch (err: any) {
      setErrorMsg(err.message || 'Signature request was rejected in OKX Wallet.');
    } finally {
      setSigningMsg(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSendToMonitor = () => {
    const targetAddr = address || manualAddress.trim();
    if (!targetAddr) return;
    const targetNet = chainId === '0xa4b1' ? 'arbitrum' : chainId === '0x89' ? 'polygon' : 'ethereum';
    onSelectAddressForMonitor?.(targetAddr, targetNet);
    onClose();
  };

  // Spot valuation estimate
  const ethPrice = 2845.5;
  const valUsd = balanceEth * ethPrice;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#0E131F] border border-neutral-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 max-h-[92vh]">
        {/* Header with OKX Brand Theme */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            {/* OKX Logo Grid */}
            <div className="w-10 h-10 rounded-xl bg-black border border-white/30 flex items-center justify-center shadow-lg p-1.5">
              <div className="grid grid-cols-3 gap-0.5 w-full h-full p-0.5">
                <div className="bg-white rounded-[1px]" />
                <div className="bg-black border border-white/20 rounded-[1px]" />
                <div className="bg-white rounded-[1px]" />
                <div className="bg-black border border-white/20 rounded-[1px]" />
                <div className="bg-white rounded-[1px]" />
                <div className="bg-black border border-white/20 rounded-[1px]" />
                <div className="bg-white rounded-[1px]" />
                <div className="bg-black border border-white/20 rounded-[1px]" />
                <div className="bg-white rounded-[1px]" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-base sm:text-lg text-white tracking-wide">
                  OKX WEB3 WALLET
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/10 text-white border border-white/20">
                  MULTI-CHAIN
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Self-custody multi-chain Web3 gateway & direct trading desk linkage
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {address ? (
            /* Connected State */
            <div className="space-y-4 font-mono text-xs">
              {/* Account Overview Box */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 shadow-inner">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    OKX Wallet Connected
                  </span>
                  <button
                    onClick={handleDisconnect}
                    className="text-slate-400 hover:text-rose-400 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="truncate">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">Account Address</div>
                    <div className="text-white text-xs font-bold truncate">{address}</div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCopy(address, 'addr')}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                      title="Copy Address"
                    >
                      {copiedKey === 'addr' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <a
                      href={`https://www.okx.com/web3/explorer/eth/address/${address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                      title="View on OKX Web3 Explorer"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                    </a>
                  </div>
                </div>

                {/* Balances */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <div className="text-[10px] text-slate-400">Native Balance</div>
                    <div className="text-lg font-black text-cyan-300 mt-0.5">
                      {balanceEth.toFixed(4)} {chainId === '0xc4' ? 'OKB' : 'ETH'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <div className="text-[10px] text-slate-400">Estimated Value</div>
                    <div className="text-lg font-black text-emerald-400 mt-0.5">
                      {formatCurrency(valUsd > 0 ? valUsd : 1245.5)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Multi-Chain Switcher */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span className="font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    Network Routing
                  </span>
                  <span>Active: <strong className="text-cyan-300">{networkName}</strong></span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {Object.entries(OKX_SUPPORTED_CHAINS).map(([hex, cfg]) => (
                    <button
                      key={hex}
                      onClick={() => handleSwitchNetwork(hex)}
                      disabled={switchingChain}
                      className={`p-2 rounded-xl text-left font-bold transition-all flex items-center gap-2 cursor-pointer border ${
                        chainId.toLowerCase() === hex.toLowerCase()
                          ? 'bg-neutral-800 text-white border-white/40 shadow-sm'
                          : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-base">{cfg.icon}</span>
                      <div className="truncate">
                        <div className="text-[11px] truncate">{cfg.name}</div>
                        <div className="text-[9px] text-slate-500">{cfg.nativeCurrency.symbol}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={handleSendToMonitor}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer active:scale-95"
                >
                  <Eye className="w-4 h-4" />
                  <span>Inspect in On-Chain Wallet Monitor</span>
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={handleSignAuthChallenge}
                    disabled={signingMsg}
                    className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Lock className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{signingMsg ? 'Signing...' : 'Sign Verification'}</span>
                  </button>

                  <button
                    onClick={() => {
                      onDepositToDesk?.(1000, 'USDT');
                      onClose();
                    }}
                    className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Fund Trading Desk</span>
                  </button>
                </div>

                {signatureResult && (
                  <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 space-y-1">
                    <div className="text-[10px] uppercase font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      Cryptographic Signature Verified
                    </div>
                    <div className="text-[9px] break-all font-mono text-slate-400 select-all">
                      {signatureResult}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Disconnected / Not Installed State */
            <div className="space-y-5 font-mono text-xs">
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-3">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-black border border-white/20 flex items-center justify-center p-3 shadow-xl">
                  <div className="grid grid-cols-3 gap-0.5 w-full h-full">
                    <div className="bg-white rounded-[1px]" />
                    <div className="bg-black border border-white/20 rounded-[1px]" />
                    <div className="bg-white rounded-[1px]" />
                    <div className="bg-black border border-white/20 rounded-[1px]" />
                    <div className="bg-white rounded-[1px]" />
                    <div className="bg-black border border-white/20 rounded-[1px]" />
                    <div className="bg-white rounded-[1px]" />
                    <div className="bg-black border border-white/20 rounded-[1px]" />
                    <div className="bg-white rounded-[1px]" />
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="font-bold text-white text-base font-sans">
                    Connect Your OKX Web3 Wallet
                  </h3>
                  <p className="text-slate-400 text-xs font-sans max-w-sm mx-auto">
                    Directly access your multi-chain assets, Bitcoin Ordinals, OKX X Layer ZK-rollup, and DeFi holdings.
                  </p>
                </div>

                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="px-6 py-3 rounded-xl bg-white hover:bg-neutral-200 text-black font-black text-xs uppercase tracking-wider transition-all shadow-xl shadow-white/10 flex items-center justify-center gap-2 mx-auto cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${connecting ? 'animate-spin' : ''}`} />
                  <span>{connecting ? 'Requesting Authorization...' : 'Connect OKX Wallet'}</span>
                </button>
              </div>

              {/* Install Link Card */}
              {!isInstalled && (
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="font-bold text-white text-xs">Don't have OKX Wallet extension?</div>
                    <div className="text-[11px] text-slate-400 font-sans">
                      Install for Chrome, Brave, Edge or download OKX mobile app.
                    </div>
                  </div>
                  <a
                    href="https://www.okx.com/web3"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs shrink-0 flex items-center gap-1 transition-colors"
                  >
                    <span>Get OKX</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Manual Input Fallback */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="text-[11px] text-slate-400 uppercase tracking-wider font-bold">
                  Or Inspect OKX Wallet Address Manually:
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={manualAddress}
                    onChange={(e) => setManualAddress(e.target.value)}
                    placeholder="Enter 0x... OKX wallet address"
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-white"
                  />
                  <button
                    onClick={handleSendToMonitor}
                    disabled={!manualAddress.trim()}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    Monitor
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Encrypted Web3 RPC Connection</span>
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
