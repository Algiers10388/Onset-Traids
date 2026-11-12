import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// Users table authenticated via Firebase Auth
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// User Trading Strategies
export const strategies = pgTable('strategies', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .references(() => users.uid)
    .notNull(),
  name: text('name').notNull(),
  symbol: text('symbol').notNull(),
  triggerType: text('trigger_type').notNull(),
  timeframe: text('timeframe').notNull(),
  orderSizePercent: integer('order_size_percent').default(25),
  leverage: integer('leverage').default(1),
  cooldownSeconds: integer('cooldown_seconds').default(6),
  minArbitrageProfitPercent: text('min_arbitrage_profit_percent').default('0.02'),
  parametersJson: text('parameters_json'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Completed Trade & Arbitrage Executions
export const tradeExecutions = pgTable('trade_executions', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => users.uid),
  tradeId: text('trade_id').notNull().unique(),
  symbol: text('symbol').notNull(),
  side: text('side').notNull(),
  type: text('type').notNull(),
  buyExchange: text('buy_exchange'),
  sellExchange: text('sell_exchange'),
  buyPrice: text('buy_price'),
  sellPrice: text('sell_price'),
  grossSpreadPercent: text('gross_spread_percent'),
  netSpreadPercent: text('net_spread_percent'),
  netProfitUsd: text('net_profit_usd'),
  notionalUsd: text('notional_usd'),
  route: text('route'),
  status: text('status').default('COMPLETED'),
  executedAt: timestamp('executed_at').defaultNow(),
});

// Live Portfolio Snapshots
export const portfolios = pgTable('portfolios', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .references(() => users.uid)
    .notNull()
    .unique(),
  cash: text('cash').default('5000'),
  startingBalance: text('starting_balance').default('5000'),
  realizedPnl: text('realized_pnl').default('0'),
  totalTrades: integer('total_trades').default(0),
  winningTrades: integer('winning_trades').default(0),
  losingTrades: integer('losing_trades').default(0),
  totalSavingsFromSOR: text('total_savings_from_sor').default('0'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  strategies: many(strategies),
  tradeExecutions: many(tradeExecutions),
  portfolio: one(portfolios, {
    fields: [users.uid],
    references: [portfolios.userId],
  }),
}));

export const strategiesRelations = relations(strategies, ({ one }) => ({
  user: one(users, {
    fields: [strategies.userId],
    references: [users.uid],
  }),
}));

export const tradeExecutionsRelations = relations(tradeExecutions, ({ one }) => ({
  user: one(users, {
    fields: [tradeExecutions.userId],
    references: [users.uid],
  }),
}));

export const portfoliosRelations = relations(portfolios, ({ one }) => ({
  user: one(users, {
    fields: [portfolios.userId],
    references: [users.uid],
  }),
}));
