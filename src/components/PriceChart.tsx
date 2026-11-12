import React, { useState, useRef } from 'react';
import { Candle, TechnicalIndicators, Order } from '../types';
import { formatCurrency, formatPercent } from '../utils/cryptoMath';
import {
  BarChart2,
  LineChart,
  Zap,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Gauge,
  Sliders,
  Sparkles,
} from 'lucide-react';

interface PriceChartProps {
  symbol: string;
  candles: Candle[];
  indicators: TechnicalIndicators;
  orders: Order[];
  decimals: number;
}

export const PriceChart: React.FC<PriceChartProps> = ({
  symbol,
  candles,
  indicators,
  orders,
  decimals,
}) => {
  const [activeSubChart, setActiveSubChart] = useState<'RSI' | 'MACD' | 'BOLLINGER_B'>('MACD');
  const [showEMA, setShowEMA] = useState(true);
  const [showBollinger, setShowBollinger] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  if (!candles || candles.length === 0) {
    return (
      <div className="h-[380px] flex items-center justify-center bg-slate-900/50 rounded-xl border border-slate-800 text-slate-500 text-xs">
        Loading chart stream...
      </div>
    );
  }

  // Display the last 50 candles for high fidelity
  const visibleCandles = candles.slice(-50);
  const minPrice = Math.min(...visibleCandles.map((c) => c.low));
  const maxPrice = Math.max(...visibleCandles.map((c) => c.high));
  const priceRange = maxPrice - minPrice || 1;
  const paddingY = priceRange * 0.08;
  const chartMin = minPrice - paddingY;
  const chartMax = maxPrice + paddingY;
  const chartRange = chartMax - chartMin;

  // Chart Dimensions
  const svgWidth = 800;
  const mainChartHeight = 250;
  const subChartHeight = 85;
  const totalHeight = mainChartHeight + subChartHeight + 35;

  const candleWidth = (svgWidth - 65) / visibleCandles.length;

  const getY = (price: number) => {
    return mainChartHeight - ((price - chartMin) / chartRange) * (mainChartHeight - 20) - 10;
  };

  const getSubY = (val: number, min: number, max: number) => {
    const range = max - min || 1;
    const clamped = Math.max(min, Math.min(max, val));
    return mainChartHeight + 30 + subChartHeight - ((clamped - min) / range) * subChartHeight;
  };

  const hoveredCandle =
    hoverIndex !== null && visibleCandles[hoverIndex]
      ? visibleCandles[hoverIndex]
      : visibleCandles[visibleCandles.length - 1];
  const lastCandle = visibleCandles[visibleCandles.length - 1];

  // Extract real historical series aligned with visible candles
  const totalCandlesCount = candles.length;
  const offset = totalCandlesCount - visibleCandles.length;

  const ema9Points: string[] = [];
  const ema21Points: string[] = [];
  const bollingerUpperPoints: string[] = [];
  const bollingerLowerPoints: string[] = [];
  const bollingerMiddlePoints: string[] = [];

  visibleCandles.forEach((c, i) => {
    const globalIdx = offset + i;
    const x = i * candleWidth + candleWidth / 2;

    const e9 = indicators.history?.ema9Series[globalIdx] ?? indicators.ema9;
    const e21 = indicators.history?.ema21Series[globalIdx] ?? indicators.ema21;
    const bb = indicators.history?.bollingerSeries[globalIdx] ?? indicators.bollinger;

    ema9Points.push(`${x},${getY(e9)}`);
    ema21Points.push(`${x},${getY(e21)}`);

    bollingerUpperPoints.push(`${x},${getY(bb.upper)}`);
    bollingerLowerPoints.push(`${x},${getY(bb.lower)}`);
    bollingerMiddlePoints.push(`${x},${getY(bb.middle)}`);
  });

  const bollingerPolygonPoints = [
    ...bollingerUpperPoints,
    ...bollingerLowerPoints.slice().reverse(),
  ].join(' ');

  // Filter orders related to visible timeframe
  const visibleStartTime = visibleCandles[0].time;
  const recentOrders = orders.filter(
    (o) => o.symbol === symbol && o.timestamp >= visibleStartTime
  );

  // Subchart data bounds
  const visibleRsi = visibleCandles.map((_, i) => {
    const globalIdx = offset + i;
    return indicators.history?.rsiSeries[globalIdx] ?? indicators.rsi;
  });

  const visibleMacd = visibleCandles.map((_, i) => {
    const globalIdx = offset + i;
    return indicators.history?.macdSeries[globalIdx] ?? indicators.macd;
  });

  const visiblePercentB = visibleCandles.map((_, i) => {
    const globalIdx = offset + i;
    return indicators.history?.bollingerSeries[globalIdx]?.percentB ?? indicators.bollinger.percentB ?? 0.5;
  });

  // Calculate MACD bounds
  const macdMin = Math.min(...visibleMacd.map((m) => Math.min(m.macd, m.signal, m.histogram)), -1);
  const macdMax = Math.max(...visibleMacd.map((m) => Math.max(m.macd, m.signal, m.histogram)), 1);
  const macdSpan = Math.max(Math.abs(macdMin), Math.abs(macdMax)) * 1.15;

  const trend = indicators.trendAnalysis;

  return (
    <div className="rounded-2xl bg-slate-900/70 border border-slate-800/80 p-4 shadow-xl backdrop-blur-sm flex flex-col gap-3">
      {/* Chart Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-white font-mono">{symbol}</span>
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                1m Dynamic Feeds
              </span>
              {trend && (
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border flex items-center gap-1 ${
                    trend.overallBias.includes('BULLISH')
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : trend.overallBias.includes('BEARISH')
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      trend.overallBias.includes('BULLISH')
                        ? 'bg-emerald-400 animate-ping'
                        : trend.overallBias.includes('BEARISH')
                        ? 'bg-rose-400'
                        : 'bg-slate-400'
                    }`}
                  />
                  {trend.overallBias.replace('_', ' ')} ({trend.confluenceScore > 0 ? `+${trend.confluenceScore}%` : `${trend.confluenceScore}%`})
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mt-0.5">
              <span>O: <strong className="text-slate-200">{formatCurrency(hoveredCandle.open, decimals)}</strong></span>
              <span>H: <strong className="text-slate-200">{formatCurrency(hoveredCandle.high, decimals)}</strong></span>
              <span>L: <strong className="text-slate-200">{formatCurrency(hoveredCandle.low, decimals)}</strong></span>
              <span>C: <strong className={hoveredCandle.close >= hoveredCandle.open ? 'text-emerald-400' : 'text-rose-400'}>
                {formatCurrency(hoveredCandle.close, decimals)}
              </strong></span>
            </div>
          </div>
        </div>

        {/* Indicators Overlay & Subchart Toggles */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => setShowEMA(!showEMA)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-mono transition-all cursor-pointer ${
              showEMA
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 font-bold'
                : 'bg-slate-850 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            EMA (9/21)
          </button>

          <button
            onClick={() => setShowBollinger(!showBollinger)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-mono transition-all cursor-pointer ${
              showBollinger
                ? 'bg-purple-500/15 border-purple-500/40 text-purple-300 font-bold'
                : 'bg-slate-850 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Bollinger (20,2)
          </button>

          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          {/* Sub-Chart Selector */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs font-mono">
            <button
              onClick={() => setActiveSubChart('MACD')}
              className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                activeSubChart === 'MACD' ? 'bg-purple-600/30 text-purple-200 font-bold border border-purple-500/40' : 'text-slate-400 hover:text-white'
              }`}
            >
              MACD (12,26,9)
            </button>
            <button
              onClick={() => setActiveSubChart('RSI')}
              className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                activeSubChart === 'RSI' ? 'bg-cyan-600/30 text-cyan-200 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-white'
              }`}
            >
              RSI (14)
            </button>
            <button
              onClick={() => setActiveSubChart('BOLLINGER_B')}
              className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                activeSubChart === 'BOLLINGER_B' ? 'bg-indigo-600/30 text-indigo-200 font-bold border border-indigo-500/40' : 'text-slate-400 hover:text-white'
              }`}
            >
              BB %B
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Multi-Indicator Confluence Ribbon */}
      {trend && (
        <div className="flex flex-col gap-2 font-mono text-[11px]">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 p-2 rounded-xl bg-slate-950/70 border border-slate-800/80">
            {/* 1. Overall Bias & Confluence Score */}
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 flex items-center gap-1.5 font-bold">
                <Gauge className="h-3.5 w-3.5 text-purple-400" />
                Confluence:
              </span>
              <span
                className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                  trend.confluenceScore >= 30
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : trend.confluenceScore <= -30
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {trend.confluenceScore > 0 ? `+${trend.confluenceScore}%` : `${trend.confluenceScore}%`} ({trend.overallBias})
              </span>
            </div>

            {/* 2. MACD Trend */}
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 truncate">
              <span className="text-slate-400 flex items-center gap-1.5 font-bold shrink-0">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                MACD:
              </span>
              <span className={`font-semibold truncate text-[10px] ml-1 ${indicators.macd.histogram >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {trend.signals.macdStatus}
              </span>
            </div>

            {/* 3. RSI Status */}
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 truncate">
              <span className="text-slate-400 flex items-center gap-1.5 font-bold shrink-0">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                RSI: {indicators.rsi.toFixed(1)}
              </span>
              <span className={`font-semibold truncate text-[10px] ml-1 ${indicators.rsi <= 35 ? 'text-emerald-400' : indicators.rsi >= 68 ? 'text-rose-400' : 'text-cyan-300'}`}>
                {trend.signals.divergenceStatus && trend.signals.divergenceStatus !== 'None'
                  ? trend.signals.divergenceStatus
                  : trend.signals.rsiStatus}
              </span>
            </div>

            {/* 4. Bollinger Bands State */}
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 truncate">
              <span className="text-slate-400 flex items-center gap-1.5 font-bold shrink-0">
                <span className="h-2 w-2 rounded-full bg-purple-400" />
                Bollinger:
              </span>
              <span className="text-purple-300 font-semibold truncate text-[10px] ml-1">
                {trend.signals.bollingerStatus}
              </span>
            </div>
          </div>

          {/* Precision Signal Highlight Banner if Active */}
          {(trend.signals.isPrecisionBuy || trend.signals.isPrecisionSell) && (
            <div
              className={`px-3 py-1.5 rounded-lg border flex items-center justify-between gap-2 text-xs font-mono animate-pulse ${
                trend.signals.isPrecisionBuy
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                  : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="h-2 w-2 rounded-full bg-current animate-ping" />
                <span className="font-bold">
                  {trend.signals.isPrecisionBuy ? '⚡ HIGH-PRECISION BUY SIGNAL DETECTED' : '⚠️ HIGH-PRECISION SELL / EXIT SIGNAL DETECTED'}
                </span>
                <span className="opacity-80 truncate text-[11px]">
                  — {trend.signals.isPrecisionBuy ? trend.signals.precisionBuyReason : trend.signals.precisionSellReason}
                </span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-black/40 shrink-0">
                {trend.signals.isPrecisionBuy ? `${trend.buyConfidence}% Confidence` : `${trend.sellConfidence}% Confidence`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* SVG Canvas */}
      <div
        ref={containerRef}
        className="w-full relative select-none overflow-x-auto"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <svg
          viewBox={`0 0 ${svgWidth} ${totalHeight}`}
          className="w-full h-auto min-w-[620px]"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseX = ((e.clientX - rect.left) / rect.width) * svgWidth;
            const idx = Math.floor(mouseX / candleWidth);
            if (idx >= 0 && idx < visibleCandles.length) {
              setHoverIndex(idx);
            }
          }}
        >
          <defs>
            <linearGradient id="bollingerGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#A855F7" stopOpacity="0.18" />
              <stop offset="50%" stopColor="#818CF8" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#A855F7" stopOpacity="0.18" />
            </linearGradient>
            <linearGradient id="rsiZoneGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.12" />
              <stop offset="50%" stopColor="#06B6D4" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.12" />
            </linearGradient>
          </defs>

          {/* Grid lines & Price Axis */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const price = chartMin + chartRange * pct;
            const y = getY(price);
            return (
              <g key={pct}>
                <line
                  x1="0"
                  y1={y}
                  x2={svgWidth - 65}
                  y2={y}
                  stroke="#1E293B"
                  strokeDasharray="3 3"
                  strokeWidth="0.8"
                />
                <text
                  x={svgWidth - 60}
                  y={y + 3}
                  fill="#64748B"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {formatCurrency(price, decimals)}
                </text>
              </g>
            );
          })}

          {/* Bollinger Bands Shaded Ribbon & Curves */}
          {showBollinger && bollingerUpperPoints.length > 1 && (
            <g>
              <polygon points={bollingerPolygonPoints} fill="url(#bollingerGradient)" />
              <polyline
                fill="none"
                stroke="#A855F7"
                strokeWidth="1.2"
                strokeDasharray="3 2"
                points={bollingerUpperPoints.join(' ')}
                strokeOpacity="0.85"
              />
              <polyline
                fill="none"
                stroke="#818CF8"
                strokeWidth="1"
                strokeDasharray="2 2"
                points={bollingerMiddlePoints.join(' ')}
                strokeOpacity="0.65"
              />
              <polyline
                fill="none"
                stroke="#A855F7"
                strokeWidth="1.2"
                strokeDasharray="3 2"
                points={bollingerLowerPoints.join(' ')}
                strokeOpacity="0.85"
              />
            </g>
          )}

          {/* EMA Lines */}
          {showEMA && ema9Points.length > 1 && (
            <g>
              <polyline
                fill="none"
                stroke="#06B6D4"
                strokeWidth="1.6"
                points={ema9Points.join(' ')}
                strokeOpacity="0.9"
              />
              <polyline
                fill="none"
                stroke="#EC4899"
                strokeWidth="1.6"
                points={ema21Points.join(' ')}
                strokeOpacity="0.9"
              />
            </g>
          )}

          {/* Candlesticks */}
          {visibleCandles.map((c, i) => {
            const isUp = c.close >= c.open;
            const x = i * candleWidth + candleWidth * 0.15;
            const width = candleWidth * 0.7;
            const openY = getY(c.open);
            const closeY = getY(c.close);
            const highY = getY(c.high);
            const lowY = getY(c.low);
            const bodyY = Math.min(openY, closeY);
            const bodyHeight = Math.max(Math.abs(closeY - openY), 1.5);
            const wickX = x + width / 2;

            const color = isUp ? '#10B981' : '#F43F5E';

            return (
              <g key={c.time} className="transition-opacity hover:opacity-80">
                {/* Upper and Lower Wick */}
                <line
                  x1={wickX}
                  y1={highY}
                  x2={wickX}
                  y2={lowY}
                  stroke={color}
                  strokeWidth="1.2"
                />
                {/* Candle Body */}
                <rect
                  x={x}
                  y={bodyY}
                  width={width}
                  height={bodyHeight}
                  fill={color}
                  rx="1"
                />
              </g>
            );
          })}

          {/* Executed Orders Markers Overlay */}
          {recentOrders.map((ord) => {
            const candleIdx = visibleCandles.findIndex((c) => Math.abs(c.time - ord.timestamp) < 60000);
            if (candleIdx === -1) return null;

            const cx = candleIdx * candleWidth + candleWidth / 2;
            const cy = getY(ord.price);
            const isBuy = ord.side === 'BUY';

            return (
              <g key={ord.id} className="cursor-pointer">
                <circle
                  cx={cx}
                  cy={cy}
                  r="5"
                  fill={isBuy ? '#10B981' : '#F43F5E'}
                  stroke="#0F172A"
                  strokeWidth="1.5"
                  className="animate-pulse"
                />
                <text
                  x={cx}
                  y={isBuy ? cy + 14 : cy - 8}
                  fill={isBuy ? '#10B981' : '#F43F5E'}
                  fontSize="8"
                  fontWeight="bold"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {isBuy ? '▲ BUY' : '▼ SELL'}
                </text>
              </g>
            );
          })}

          {/* Hover crosshair */}
          {hoverIndex !== null && (
            <g>
              <line
                x1={hoverIndex * candleWidth + candleWidth / 2}
                y1="0"
                x2={hoverIndex * candleWidth + candleWidth / 2}
                y2={totalHeight}
                stroke="#64748B"
                strokeDasharray="2 2"
                strokeWidth="1"
              />
              <line
                x1="0"
                y1={getY(hoveredCandle.close)}
                x2={svgWidth - 65}
                y2={getY(hoveredCandle.close)}
                stroke="#64748B"
                strokeDasharray="2 2"
                strokeWidth="1"
              />
              <rect
                x={svgWidth - 64}
                y={getY(hoveredCandle.close) - 9}
                width="60"
                height="18"
                fill="#1E293B"
                rx="3"
              />
              <text
                x={svgWidth - 34}
                y={getY(hoveredCandle.close) + 3}
                fill="#F8FAFC"
                fontSize="9"
                fontWeight="bold"
                textAnchor="middle"
                fontFamily="monospace"
              >
                {formatCurrency(hoveredCandle.close, decimals)}
              </text>
            </g>
          )}

          {/* Separator Line */}
          <line
            x1="0"
            y1={mainChartHeight + 20}
            x2={svgWidth}
            y2={mainChartHeight + 20}
            stroke="#1E293B"
            strokeWidth="1.2"
          />

          {/* SUB-CHART 1: RSI (14) */}
          {activeSubChart === 'RSI' && (
            <g>
              <rect
                x="0"
                y={mainChartHeight + 25}
                width={svgWidth - 65}
                height={subChartHeight}
                fill="url(#rsiZoneGradient)"
              />

              <text
                x="10"
                y={mainChartHeight + 40}
                fill="#06B6D4"
                fontSize="11"
                fontWeight="bold"
                fontFamily="monospace"
              >
                RSI (14): {indicators.rsi.toFixed(1)} {indicators.rsi <= 30 ? '• OVERSOLD' : indicators.rsi >= 70 ? '• OVERBOUGHT' : ''}
              </text>

              {/* Overbought (70) and Oversold (30) Reference Lines */}
              <line
                x1="0"
                y1={getSubY(70, 0, 100)}
                x2={svgWidth - 65}
                y2={getSubY(70, 0, 100)}
                stroke="#F43F5E"
                strokeDasharray="3 3"
                strokeWidth="1"
                strokeOpacity="0.7"
              />
              <text
                x={svgWidth - 60}
                y={getSubY(70, 0, 100) + 3}
                fill="#F43F5E"
                fontSize="9"
                fontFamily="monospace"
              >
                70 OB
              </text>

              {/* 50 Center reference */}
              <line
                x1="0"
                y1={getSubY(50, 0, 100)}
                x2={svgWidth - 65}
                y2={getSubY(50, 0, 100)}
                stroke="#334155"
                strokeDasharray="2 2"
                strokeWidth="0.8"
              />

              <line
                x1="0"
                y1={getSubY(30, 0, 100)}
                x2={svgWidth - 65}
                y2={getSubY(30, 0, 100)}
                stroke="#10B981"
                strokeDasharray="3 3"
                strokeWidth="1"
                strokeOpacity="0.7"
              />
              <text
                x={svgWidth - 60}
                y={getSubY(30, 0, 100) + 3}
                fill="#10B981"
                fontSize="9"
                fontFamily="monospace"
              >
                30 OS
              </text>

              {/* True Historical RSI Polyline */}
              {visibleCandles.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#06B6D4"
                  strokeWidth="2"
                  points={visibleRsi
                    .map((val, i) => {
                      const x = i * candleWidth + candleWidth / 2;
                      return `${x},${getSubY(val, 0, 100)}`;
                    })
                    .join(' ')}
                />
              )}
            </g>
          )}

          {/* SUB-CHART 2: MACD (12, 26, 9) */}
          {activeSubChart === 'MACD' && (
            <g>
              <text
                x="10"
                y={mainChartHeight + 40}
                fill="#A855F7"
                fontSize="11"
                fontWeight="bold"
                fontFamily="monospace"
              >
                MACD (12, 26, 9) | Line: {indicators.macd.macd.toFixed(2)} | Sig: {indicators.macd.signal.toFixed(2)} | Hist:{' '}
                <tspan fill={indicators.macd.histogram >= 0 ? '#10B981' : '#F43F5E'}>
                  {indicators.macd.histogram.toFixed(2)}
                </tspan>
              </text>

              {/* Zero line */}
              <line
                x1="0"
                y1={getSubY(0, -macdSpan, macdSpan)}
                x2={svgWidth - 65}
                y2={getSubY(0, -macdSpan, macdSpan)}
                stroke="#475569"
                strokeWidth="1"
              />
              <text
                x={svgWidth - 60}
                y={getSubY(0, -macdSpan, macdSpan) + 3}
                fill="#64748B"
                fontSize="8"
                fontFamily="monospace"
              >
                0.00
              </text>

              {/* Real MACD Histogram Bars */}
              {visibleMacd.map((m, i) => {
                const x = i * candleWidth + candleWidth * 0.15;
                const width = candleWidth * 0.7;
                const zeroY = getSubY(0, -macdSpan, macdSpan);
                const barY = getSubY(m.histogram, -macdSpan, macdSpan);
                const isPos = m.histogram >= 0;
                const height = Math.max(Math.abs(zeroY - barY), 1);

                // Tiered colors: expanding vs fading
                const prevHist = i > 0 ? visibleMacd[i - 1].histogram : m.histogram;
                const isExpanding = isPos ? m.histogram >= prevHist : m.histogram <= prevHist;

                const color = isPos
                  ? isExpanding
                    ? '#10B981' // Bright green expanding
                    : '#0D9488' // Teal fading
                  : isExpanding
                  ? '#F43F5E' // Bright red expanding
                  : '#E11D48'; // Muted rose fading

                return (
                  <rect
                    key={i}
                    x={x}
                    y={isPos ? barY : zeroY}
                    width={width}
                    height={height}
                    fill={color}
                    opacity="0.85"
                    rx="0.5"
                  />
                );
              })}

              {/* Real MACD Line (Cyan) */}
              <polyline
                fill="none"
                stroke="#06B6D4"
                strokeWidth="1.6"
                points={visibleMacd
                  .map((m, i) => {
                    const x = i * candleWidth + candleWidth / 2;
                    return `${x},${getSubY(m.macd, -macdSpan, macdSpan)}`;
                  })
                  .join(' ')}
              />

              {/* Real Signal Line (Amber) */}
              <polyline
                fill="none"
                stroke="#F59E0B"
                strokeWidth="1.4"
                points={visibleMacd
                  .map((m, i) => {
                    const x = i * candleWidth + candleWidth / 2;
                    return `${x},${getSubY(m.signal, -macdSpan, macdSpan)}`;
                  })
                  .join(' ')}
                strokeDasharray="3 1.5"
              />
            </g>
          )}

          {/* SUB-CHART 3: BOLLINGER %B & SQUEEZE */}
          {activeSubChart === 'BOLLINGER_B' && (
            <g>
              <text
                x="10"
                y={mainChartHeight + 40}
                fill="#818CF8"
                fontSize="11"
                fontWeight="bold"
                fontFamily="monospace"
              >
                Bollinger %B: {(indicators.bollinger.percentB ?? 0.5).toFixed(2)} | Bandwidth:{' '}
                {(((indicators.bollinger.bandwidth ?? 0.04) * 100)).toFixed(1)}%{' '}
                {indicators.bollinger.isSqueeze ? '• ⚡ SQUEEZE DETECTED' : ''}
              </text>

              {/* Upper threshold (1.0) and Lower threshold (0.0) */}
              <line
                x1="0"
                y1={getSubY(1.0, -0.2, 1.2)}
                x2={svgWidth - 65}
                y2={getSubY(1.0, -0.2, 1.2)}
                stroke="#A855F7"
                strokeDasharray="3 2"
                strokeWidth="0.8"
              />
              <text x={svgWidth - 60} y={getSubY(1.0, -0.2, 1.2) + 3} fill="#A855F7" fontSize="8" fontFamily="monospace">
                1.00 (Upper)
              </text>

              <line
                x1="0"
                y1={getSubY(0.5, -0.2, 1.2)}
                x2={svgWidth - 65}
                y2={getSubY(0.5, -0.2, 1.2)}
                stroke="#475569"
                strokeDasharray="2 2"
                strokeWidth="0.8"
              />
              <text x={svgWidth - 60} y={getSubY(0.5, -0.2, 1.2) + 3} fill="#64748B" fontSize="8" fontFamily="monospace">
                0.50 (Mid)
              </text>

              <line
                x1="0"
                y1={getSubY(0.0, -0.2, 1.2)}
                x2={svgWidth - 65}
                y2={getSubY(0.0, -0.2, 1.2)}
                stroke="#A855F7"
                strokeDasharray="3 2"
                strokeWidth="0.8"
              />
              <text x={svgWidth - 60} y={getSubY(0.0, -0.2, 1.2) + 3} fill="#A855F7" fontSize="8" fontFamily="monospace">
                0.00 (Lower)
              </text>

              {/* %B Polyline */}
              <polyline
                fill="none"
                stroke="#818CF8"
                strokeWidth="2"
                points={visiblePercentB
                  .map((val, i) => {
                    const x = i * candleWidth + candleWidth / 2;
                    return `${x},${getSubY(val, -0.2, 1.2)}`;
                  })
                  .join(' ')}
              />
            </g>
          )}
        </svg>
      </div>

      {/* Footer Legend Bar */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80 font-mono">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-cyan-400 inline-block" /> EMA 9: {formatCurrency(indicators.ema9, decimals)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-pink-400 inline-block" /> EMA 21: {formatCurrency(indicators.ema21, decimals)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-purple-400 inline-block" /> BB Upper: {formatCurrency(indicators.bollinger.upper, decimals)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-indigo-400 inline-block" /> BB Lower: {formatCurrency(indicators.bollinger.lower, decimals)}
          </span>
        </div>

        <div className="text-slate-500 font-mono">
          Last tick: {new Date(lastCandle.time).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};
