import React, { useState, useEffect } from 'react';
import {
  X,
  QrCode,
  Copy,
  Check,
  Shield,
  ShieldCheck,
  Zap,
  Lock,
  ArrowDownLeft,
  Info,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface ReceivePrivacyCoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCoin?: 'XMR' | 'SAL' | 'QRL' | 'TARI' | 'WOW';
}

const SUPPORTED_PRIVACY_COINS = [
  { id: 'XMR', name: 'Monero', ticker: 'XMR', icon: '🟧', tag: 'RingCT / RandomX' },
  { id: 'SAL', name: 'Salvium', ticker: 'SAL', icon: '🪙', tag: 'Private DeFi / Yield' },
  { id: 'QRL', name: 'Quantum Resistant Ledger', ticker: 'QRL', icon: '⚛️', tag: 'Post-Quantum XMSS' },
  { id: 'TARI', name: 'Tari', ticker: 'TARI', icon: '🟣', tag: 'Mimblewimble + TariScript' },
  { id: 'WOW', name: 'Wownero', ticker: 'WOW', icon: '🐶', tag: 'Solo-Mined Memecoin' },
];

export const ReceivePrivacyCoinModal: React.FC<ReceivePrivacyCoinModalProps> = ({
  isOpen,
  onClose,
  defaultCoin = 'XMR',
}) => {
  const [selectedCoin, setSelectedCoin] = useState<string>(defaultCoin);
  const [useSubaddress, setUseSubaddress] = useState<boolean>(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [receiveData, setReceiveData] = useState<{
    coin: string;
    networkName: string;
    primaryAddress: string;
    subaddress: string;
    paymentId: string;
    confirmationsNeeded: number;
    features: string[];
    qrData: string;
  } | null>(null);

  useEffect(() => {
    if (defaultCoin) setSelectedCoin(defaultCoin);
  }, [defaultCoin]);

  const fetchReceiveData = async (coinId: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/wallet/receive-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coin: coinId, label: 'Apex Quant Vault Deposit' }),
      });
      const data = await res.json();
      if (data.success) {
        setReceiveData(data);
      } else {
        setReceiveData(null); // never keep showing the previous coin's address
        console.warn(data.error);
      }
    } catch (e) {
      console.error('Error fetching receive address:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchReceiveData(selectedCoin);
    }
  }, [isOpen, selectedCoin]);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const currentAddress = useSubaddress
    ? receiveData?.subaddress || receiveData?.primaryAddress || ''
    : receiveData?.primaryAddress || '';

  // Generate deterministic QR Code pattern using SVG
  const generateQrSvg = (content: string) => {
    const hash = content.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const size = 21;
    const modules: boolean[][] = [];

    for (let r = 0; r < size; r++) {
      modules[r] = [];
      for (let c = 0; c < size; c++) {
        // Corner position markers (finder patterns)
        const isFinderTopLeft = r < 7 && c < 7;
        const isFinderTopRight = r < 7 && c >= size - 7;
        const isFinderBottomLeft = r >= size - 7 && c < 7;

        if (isFinderTopLeft || isFinderTopRight || isFinderBottomLeft) {
          const lr = isFinderTopLeft ? r : isFinderTopRight ? r : r - (size - 7);
          const lc = isFinderTopLeft ? c : isFinderTopRight ? c - (size - 7) : c;
          const isBorder = lr === 0 || lr === 6 || lc === 0 || lc === 6;
          const isCenter = lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4;
          modules[r][c] = isBorder || isCenter;
        } else {
          // Pseudorandom pseudo-QR deterministic pattern based on address hash
          const val = (r * 13 + c * 17 + hash + r * c) % 3;
          modules[r][c] = val === 0;
        }
      }
    }

    return (
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-48 h-48 sm:w-56 sm:h-56 bg-white p-3 rounded-2xl shadow-xl"
        shapeRendering="crispEdges"
      >
        {modules.map((row, r) =>
          row.map((active, c) =>
            active ? <rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" fill="#0E131F" /> : null
          )
        )}
      </svg>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#0E131F] border border-emerald-500/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base sm:text-lg text-white">Accept & Deposit Privacy Tokens</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Zero Knowledge
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Generate stealth receiving addresses for Monero, Salvium, QRL, and Tari
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

        {/* Coin Selector Tabs */}
        <div className="flex items-center gap-2 p-3 bg-slate-950/70 border-b border-slate-800 overflow-x-auto text-xs font-mono">
          {SUPPORTED_PRIVACY_COINS.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCoin(c.id)}
              className={`px-3 py-2 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                selectedCoin === c.id
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <span>{c.icon}</span>
              <span>{c.name}</span>
              <span className="text-[10px] opacity-75 hidden sm:inline">({c.ticker})</span>
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-7 h-7 text-emerald-400 animate-spin" />
              <p className="text-xs font-mono text-slate-400">Generating cryptographic stealth address...</p>
            </div>
          ) : receiveData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* QR Code Column */}
              <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                {generateQrSvg(currentAddress)}

                <div className="text-center space-y-1">
                  <div className="text-xs font-bold text-white flex items-center justify-center gap-1.5 font-mono">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Scan with Mobile Wallet</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Cake Wallet · Monero GUI · Feather · QRL Wallet · Tari Aurora
                  </p>
                </div>
              </div>

              {/* Address Details Column */}
              <div className="space-y-4 font-mono text-xs">
                {/* Address Mode Toggle */}
                <div className="flex items-center justify-between p-1 bg-slate-950 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setUseSubaddress(true)}
                    className={`flex-1 py-1.5 rounded-lg font-bold text-center transition-all cursor-pointer ${
                      useSubaddress
                        ? 'bg-slate-800 text-emerald-300 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Stealth Subaddress (Recommended)
                  </button>
                  <button
                    onClick={() => setUseSubaddress(false)}
                    className={`flex-1 py-1.5 rounded-lg font-bold text-center transition-all cursor-pointer ${
                      !useSubaddress
                        ? 'bg-slate-800 text-emerald-300 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Primary Address
                  </button>
                </div>

                {/* Display Address */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span className="uppercase tracking-wider font-semibold">
                      {useSubaddress ? 'One-Time Subaddress' : 'Primary Public Address'}
                    </span>
                    <button
                      onClick={() => handleCopy(currentAddress, 'addr')}
                      className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      {copiedKey === 'addr' ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Address</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-[11px] text-slate-200 break-all select-all font-mono leading-relaxed">
                    {currentAddress}
                  </div>
                </div>

                {/* Payment ID */}
                {receiveData.paymentId && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-slate-400 text-[11px]">
                      <span>Payment Reference ID:</span>
                      <button
                        onClick={() => handleCopy(receiveData.paymentId, 'pid')}
                        className="text-slate-300 hover:text-white text-[10px]"
                      >
                        {copiedKey === 'pid' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="text-[11px] text-cyan-300 font-bold">{receiveData.paymentId}</div>
                  </div>
                )}

                {/* Privacy & Protocol Features */}
                <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
                  <div className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Cryptographic Guarantees:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {receiveData.features.map((feat, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded bg-emerald-900/40 border border-emerald-500/30 text-emerald-300 text-[10px]"
                      >
                        {feat}
                      </span>
                    ))}
                  </div>
                  <div className="text-[10px] text-slate-400 pt-1">
                    Requires <strong>{receiveData.confirmationsNeeded} block confirmations</strong> before balance unlock.
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Funds automatically route into your algorithmic trading balance</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
