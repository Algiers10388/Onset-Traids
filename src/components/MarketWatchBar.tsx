import React, { useState, useMemo } from 'react';
import { CryptoAsset } from '../types';
import { formatCurrency, formatPercent } from '../utils/cryptoMath';
import { TrendingDown, TrendingUp, Search, Plus, Sparkles, X, Layers } from 'lucide-react';

interface MarketWatchBarProps {
  assets: CryptoAsset[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onAddCustomSymbol?: (symbol: string) => void;
}

type CategoryFilter = 'ALL' | 'MAJOR' | 'LAYER1' | 'DEFI' | 'MEME' | 'ZEROKYC';

export const MarketWatchBar: React.FC<MarketWatchBarProps> = ({
  assets,
  selectedSymbol,
  onSelectSymbol,
  onAddCustomSymbol,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('ALL');
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customInput, setCustomInput] = useState('');

  // Filter assets based on search query and category
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        asset.symbol.toLowerCase().includes(q) ||
        asset.name.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (selectedCategory === 'ALL') return true;
      if (selectedCategory === 'MAJOR') return asset.category === 'Major';
      if (selectedCategory === 'LAYER1') return asset.category === 'Layer 1';
      if (selectedCategory === 'DEFI') return asset.category === 'DeFi';
      if (selectedCategory === 'MEME') return asset.category === 'Meme';
      if (selectedCategory === 'ZEROKYC') return asset.category === 'Zero-KYC' || asset.supportedExchanges?.includes('NONKYC');

      return true;
    });
  }, [assets, searchQuery, selectedCategory]);

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;

    let clean = customInput.trim().toUpperCase();
    if (!clean.includes('/')) {
      if (clean.includes('_')) {
        clean = clean.replace('_', '/');
      } else if (clean.endsWith('USDT')) {
        clean = `${clean.slice(0, -4)}/USDT`;
      } else if (clean.endsWith('USD')) {
        clean = `${clean.slice(0, -3)}/USD`;
      } else {
        clean = `${clean}/USDT`;
      }
    }

    if (onAddCustomSymbol) {
      onAddCustomSymbol(clean);
    } else {
      onSelectSymbol(clean);
    }

    setCustomInput('');
    setShowAddCustom(false);
  };

  return (
    <div className="border-b border-slate-800/80 bg-[#0B0F17]/80 backdrop-blur-md py-2 px-3 sm:px-4 flex flex-col gap-2">
      {/* Top Filter & Search Controls */}
      <div className="max-w-7xl mx-auto w-full flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
            <Layers className="h-3 w-3 text-cyan-400" />
            <span>Markets:</span>
          </span>

          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedCategory === 'ALL'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            All Coins ({assets.length})
          </button>

          <button
            onClick={() => setSelectedCategory('MAJOR')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedCategory === 'MAJOR'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Majors
          </button>

          <button
            onClick={() => setSelectedCategory('LAYER1')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedCategory === 'LAYER1'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Layer 1
          </button>

          <button
            onClick={() => setSelectedCategory('DEFI')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedCategory === 'DEFI'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            DeFi
          </button>

          <button
            onClick={() => setSelectedCategory('MEME')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedCategory === 'MEME'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Memes
          </button>

          <button
            onClick={() => setSelectedCategory('ZEROKYC')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedCategory === 'ZEROKYC'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            ⚡ NonKYC / DePIN
          </button>
        </div>

        {/* Search & Custom Coin Adder */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search coin..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-2.5 py-1 bg-slate-900/90 border border-slate-700/80 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 w-32 sm:w-44 font-mono transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {!showAddCustom ? (
            <button
              onClick={() => setShowAddCustom(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
              title="Add or trade any market cryptocurrency pair"
            >
              <Plus className="h-3 w-3 text-cyan-400" />
              <span className="hidden sm:inline">Add Custom Coin</span>
              <span className="sm:hidden">Add</span>
            </button>
          ) : (
            <form onSubmit={handleAddCustom} className="flex items-center gap-1.5 animate-in fade-in">
              <input
                type="text"
                placeholder="e.g. KAS/USDT, ZEPH..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                autoFocus
                className="px-2 py-1 bg-slate-900 border border-cyan-500/80 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none font-mono w-36 uppercase"
              />
              <button
                type="submit"
                className="px-2.5 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg text-xs transition-all cursor-pointer"
              >
                Trade
              </button>
              <button
                type="button"
                onClick={() => setShowAddCustom(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Horizontal Carousel of Coins */}
      <div className="max-w-7xl mx-auto w-full overflow-x-auto no-scrollbar py-1">
        <div className="flex items-center gap-2 min-w-max">
          {filteredAssets.map((asset) => {
            const isSelected = asset.symbol === selectedSymbol;
            const isUp = asset.change24h >= 0;

            // SVG sparkline
            const min = Math.min(...(asset.sparkline || [asset.price * 0.98, asset.price]));
            const max = Math.max(...(asset.sparkline || [asset.price, asset.price * 1.02]));
            const range = max - min || 1;
            const points = (asset.sparkline || [asset.price, asset.price])
              .map((val, idx) => {
                const len = (asset.sparkline && asset.sparkline.length > 1) ? asset.sparkline.length - 1 : 1;
                const x = (idx / len) * 50;
                const y = 18 - ((val - min) / range) * 16;
                return `${x},${y}`;
              })
              .join(' ');

            return (
              <button
                key={asset.symbol}
                onClick={() => onSelectSymbol(asset.symbol)}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-left transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-slate-800 border-cyan-500/70 shadow-sm shadow-cyan-500/20 ring-1 ring-cyan-500/50'
                    : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-850 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-white font-mono">{asset.symbol}</span>
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded font-medium ${
                        asset.category === 'Zero-KYC'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : asset.category === 'Meme'
                          ? 'bg-rose-500/20 text-rose-300'
                          : asset.category === 'DeFi'
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {asset.category || asset.volatility}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-200 font-mono mt-0.5">
                    {formatCurrency(asset.price, asset.decimals)}
                  </div>
                </div>

                {/* Mini Sparkline */}
                <div className="w-10 h-4.5">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 50 20">
                    <polyline
                      fill="none"
                      stroke={isUp ? '#10B981' : '#F43F5E'}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={points}
                    />
                  </svg>
                </div>

                {/* Change % */}
                <div
                  className={`flex items-center text-[11px] font-semibold font-mono ${
                    isUp ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isUp ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                  {formatPercent(asset.change24h)}
                </div>
              </button>
            );
          })}

          {filteredAssets.length === 0 && (
            <div className="text-xs text-slate-400 py-2 px-3 flex items-center gap-2 bg-slate-900/60 rounded-xl border border-slate-800">
              <span>No coins matching &quot;{searchQuery}&quot;.</span>
              <button
                onClick={() => {
                  let clean = searchQuery.toUpperCase();
                  if (!clean.includes('/')) clean = `${clean}/USDT`;
                  if (onAddCustomSymbol) onAddCustomSymbol(clean);
                  else onSelectSymbol(clean);
                }}
                className="text-cyan-400 hover:underline font-bold"
              >
                Trade {searchQuery.toUpperCase()} anyway →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
