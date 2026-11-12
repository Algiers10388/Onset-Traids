import React, { useState } from 'react';
import { Position, Order } from '../types';
import { formatCurrency, formatPercent } from '../utils/cryptoMath';
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  History,
  Layers,
  Radio,
  XCircle,
} from 'lucide-react';

interface PositionsAndOrdersTableProps {
  positions: Position[];
  orders: Order[];
  onClosePosition: (positionId: string) => void;
  botLogs: string[];
}

export const PositionsAndOrdersTable: React.FC<PositionsAndOrdersTableProps> = ({
  positions,
  orders,
  onClosePosition,
  botLogs,
}) => {
  const [activeTab, setActiveTab] = useState<'POSITIONS' | 'ORDERS' | 'LOGS'>('POSITIONS');

  return (
    <div className="rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-xl backdrop-blur-sm overflow-hidden flex flex-col">
      {/* Tab Switcher Header */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('POSITIONS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'POSITIONS'
                ? 'bg-slate-800 text-cyan-300 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Open Positions</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-900 text-[10px] font-mono text-slate-300 border border-slate-700">
              {positions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ORDERS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'ORDERS'
                ? 'bg-slate-800 text-cyan-300 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Trade Execution Log</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-900 text-[10px] font-mono text-slate-300 border border-slate-700">
              {orders.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('LOGS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'LOGS'
                ? 'bg-slate-800 text-cyan-300 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            <span>Agent Telemetry</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 overflow-x-auto min-h-[220px] max-h-[360px] overflow-y-auto">
        {/* Active Positions Tab */}
        {activeTab === 'POSITIONS' && (
          <div>
            {positions.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No active positions open. The automated trading agent will open positions when indicator parameters trigger.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase font-mono tracking-wider">
                    <th className="pb-2">Asset / Lev</th>
                    <th className="pb-2">Size</th>
                    <th className="pb-2">Entry Price</th>
                    <th className="pb-2">Mark Price</th>
                    <th className="pb-2">Liq Price</th>
                    <th className="pb-2">TP / SL</th>
                    <th className="pb-2">Unrealized PnL</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {positions.map((pos) => {
                    const isProfit = pos.unrealizedPnl >= 0;
                    return (
                      <tr key={pos.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5">
                          <div className="font-bold text-white flex items-center gap-1.5">
                            {pos.symbol}
                            <span
                              className={`text-[10px] px-1 py-0.2 rounded font-semibold ${
                                pos.leverage > 2
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-cyan-500/20 text-cyan-300'
                              }`}
                            >
                              {pos.leverage}x
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700">
                              {pos.exchangeName || pos.exchange || 'Binance'}
                            </span>
                            {pos.isDynamicSized && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono border border-purple-500/30">
                                ATR Sized
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                            {pos.strategyTrigger}
                          </div>
                        </td>

                        <td className="py-2.5">
                          <div className="text-slate-200">
                            {pos.amount.toFixed(4)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Margin: {formatCurrency(pos.margin)}
                          </div>
                        </td>

                        <td className="py-2.5 text-slate-300">
                          {formatCurrency(pos.entryPrice)}
                        </td>

                        <td className="py-2.5 font-bold text-white">
                          {formatCurrency(pos.currentPrice)}
                        </td>

                        <td className="py-2.5 text-rose-400/90">
                          {formatCurrency(pos.liquidationPrice)}
                        </td>

                        <td className="py-2.5 text-[11px]">
                          {(() => {
                            const distToTpPct = pos.takeProfitPrice > 0
                              ? ((pos.takeProfitPrice - pos.currentPrice) / pos.currentPrice) * 100
                              : 0;
                            const distToSlPct = pos.stopLossPrice > 0
                              ? ((pos.currentPrice - pos.stopLossPrice) / pos.currentPrice) * 100
                              : 0;
                            return (
                              <>
                                <div className="flex items-center gap-1 text-emerald-400 font-bold">
                                  <span>TP: {formatCurrency(pos.takeProfitPrice)}</span>
                                  <span className="text-[9px] text-emerald-500 font-normal font-mono">
                                    (+{Math.max(0, distToTpPct).toFixed(1)}%)
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 text-rose-400 font-bold">
                                  <span>SL: {formatCurrency(pos.stopLossPrice)}</span>
                                  <span className="text-[9px] text-rose-500 font-normal font-mono">
                                    (-{Math.max(0, distToSlPct).toFixed(1)}%)
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </td>

                        <td className="py-2.5 font-bold">
                          <div
                            className={`flex items-center ${
                              isProfit ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isProfit ? (
                              <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" />
                            ) : (
                              <ArrowDownRight className="h-3.5 w-3.5 mr-0.5" />
                            )}
                            {formatCurrency(pos.unrealizedPnl)} (
                            {formatPercent(pos.unrealizedPnlPercent)})
                          </div>
                        </td>

                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => onClosePosition(pos.id)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer text-xs font-sans"
                          >
                            Close
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Trade History Tab */}
        {activeTab === 'ORDERS' && (
          <div>
            {orders.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No orders executed yet. Launch the bot to start algorithmic trades.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase font-mono tracking-wider">
                    <th className="pb-2">Time</th>
                    <th className="pb-2">Pair</th>
                    <th className="pb-2">Exchange</th>
                    <th className="pb-2">Side / Type</th>
                    <th className="pb-2">Price</th>
                    <th className="pb-2">Fee / Slip</th>
                    <th className="pb-2">Realized PnL</th>
                    <th className="pb-2">Trigger Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {orders.map((ord) => {
                    const isBuy = ord.side === 'BUY';
                    return (
                      <tr key={ord.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2 text-slate-400">
                          {new Date(ord.timestamp).toLocaleTimeString()}
                        </td>

                        <td className="py-2 font-bold text-white">
                          {ord.symbol}
                        </td>

                        <td className="py-2">
                          <div className="flex items-center gap-1">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-200 border border-slate-700">
                              {ord.exchangeName || ord.exchange || 'Binance'}
                            </span>
                            {ord.savingsUsd && ord.savingsUsd > 0 && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                                +${ord.savingsUsd.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isBuy
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {ord.side} · {ord.type}
                          </span>
                        </td>

                        <td className="py-2 text-slate-200">
                          {formatCurrency(ord.price)}
                        </td>

                        <td className="py-2 text-slate-400 text-[11px]">
                          -{formatCurrency(ord.fee)}
                        </td>

                        <td className="py-2 font-bold">
                          {ord.pnl !== undefined ? (
                            <span
                              className={
                                ord.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }
                            >
                              {formatCurrency(ord.pnl)} ({formatPercent(ord.pnlPercent || 0)})
                            </span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>

                        <td className="py-2 text-slate-300 text-[11px] truncate max-w-[220px]">
                          {ord.reason}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Agent Telemetry & Signals Log */}
        {activeTab === 'LOGS' && (
          <div className="font-mono text-xs space-y-1 text-slate-400">
            {botLogs.length === 0 ? (
              <div className="py-8 text-center text-slate-600">
                Awaiting telemetry events...
              </div>
            ) : (
              botLogs.slice(0, 35).map((log, i) => (
                <div key={i} className="flex items-start gap-2 py-0.5">
                  <span className="text-cyan-500 font-semibold select-none">&gt;</span>
                  <span className="text-slate-300 leading-relaxed">{log}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
