export interface CryptoAsset {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  sparkline: number[];
  decimals: number;
  volatility: 'Low' | 'Medium' | 'High' | 'Extreme';
  category?: 'Major' | 'DeFi' | 'Meme' | 'Layer 1' | 'Zero-KYC' | 'All';
  supportedExchanges?: ExchangeId[];
  isCustom?: boolean;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ExchangeId = 'BINANCE' | 'COINBASE' | 'KRAKEN' | 'BYBIT' | 'NONKYC' | 'OKX';

export type ExecutionRoutingMode = 'SMART_ORDER_ROUTER' | 'BINANCE' | 'COINBASE' | 'KRAKEN' | 'BYBIT' | 'NONKYC' | 'OKX';

export interface ExchangeConfig {
  id: ExchangeId;
  name: string;
  shortName: string;
  tagColor: string;
  status: 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED';
  latencyMs: number;
  makerFeePercent: number;
  takerFeePercent: number;
  enabled: boolean;
  apiEndpoint: string;
  tier: string;
  hasApiKeyConfigured: boolean;
  volumeSharePercent: number;
}

export interface ExchangeQuote {
  exchangeId: ExchangeId;
  exchangeName: string;
  symbol: string;
  bidPrice: number;
  askPrice: number;
  lastPrice: number;
  volume24h: number;
  spreadUsd: number;
  spreadPercent: number;
  effectiveBuyPrice: number;
  effectiveSellPrice: number;
  depthBidUsd: number;
  depthAskUsd: number;
  latencyMs: number;
  timestamp: number;
}

export interface SmartOrderRouteResult {
  side: 'BUY' | 'SELL';
  symbol: string;
  bestExchange: ExchangeId;
  bestExchangeName: string;
  rawPrice: number;
  effectivePrice: number;
  takerFeePercent: number;
  feeAmountUsd: number;
  worstExchangePrice: number;
  savingsUsd: number;
  savingsPercent: number;
  quotesCompared: ExchangeQuote[];
  routeReason: string;
}

export interface ArbitrageOpportunity {
  symbol: string;
  buyExchange: ExchangeId;
  buyExchangeName: string;
  buyAskPrice: number;
  sellExchange: ExchangeId;
  sellExchangeName: string;
  sellBidPrice: number;
  grossSpreadUsd: number;
  grossSpreadPercent: number;
  netSpreadUsd: number;
  netSpreadPercent: number;
  estimatedProfitUsd: number;
  timestamp: number;
  isActionable: boolean;
}

export interface TrendConfluenceReport {
  overallBias: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH';
  confluenceScore: number; // -100 to +100
  buyConfidence: number; // 0 to 100%
  sellConfidence: number; // 0 to 100%
  summary: string;
  signals: {
    macdStatus: string;
    rsiStatus: string;
    bollingerStatus: string;
    isPrecisionBuy: boolean;
    isPrecisionSell: boolean;
    precisionBuyReason?: string;
    precisionSellReason?: string;
    recommendedAction?: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
    confluenceFactors?: string[];
    divergenceStatus?: string;
  };
  suggestedTakeProfit?: number;
  suggestedStopLoss?: number;
}

export interface TechnicalIndicators {
  rsi: number;
  macd: {
    macd: number;
    signal: number;
    histogram: number;
    prevHistogram?: number;
    isBullishCross?: boolean;
    isBearishCross?: boolean;
    isHistogramExpanding?: boolean;
  };
  ema9: number;
  ema21: number;
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
    bandwidth?: number;
    percentB?: number;
    isSqueeze?: boolean;
    isPiercingUpper?: boolean;
    isPiercingLower?: boolean;
  };
  trendAnalysis?: TrendConfluenceReport;
  history?: {
    rsiSeries: number[];
    macdSeries: Array<{ macd: number; signal: number; histogram: number }>;
    bollingerSeries: Array<{ upper: number; middle: number; lower: number; percentB: number; bandwidth: number }>;
    ema9Series: number[];
    ema21Series: number[];
  };
  atr?: number;
  atrPercent?: number;
  historicalVolatility?: number;
  dynamicSizingPreview?: {
    volatilityAdjustedMargin: number;
    volatilityAdjustedNotional: number;
    recommendedUnits: number;
    riskAmountUsd: number;
    volatilityRegime: 'LOW' | 'NORMAL' | 'ELEVATED' | 'EXTREME';
    sizingMultiplier: number;
  };
}

export type TriggerType =
  | 'TRIPLE_CONFLUENCE_PRO'
  | 'BOLLINGER_MACD_SQUEEZE'
  | 'RSI_DIVERGENCE_REVERSAL'
  | 'MOMENTUM_COMBO'
  | 'RSI_OVERSOLD'
  | 'MACD_CROSSOVER'
  | 'BOLLINGER_BOUNCE'
  | 'EMA_BREAKOUT'
  | 'CROSS_EXCHANGE_ARBITRAGE';

export interface StrategyParameters {
  id: string;
  name: string;
  symbol: string;
  timeframe: '1m' | '5m' | '15m' | '1h';
  triggerType: TriggerType;
  rsiBuyThreshold: number;
  rsiSellThreshold: number;
  takeProfitPercent: number;
  stopLossPercent: number;
  trailingStopEnabled: boolean;
  trailingStopPercent: number;
  orderSizePercent: number;
  leverage: number;
  slippagePercent: number;
  maxPositions: number;
  cooldownSeconds: number;
  routingMode: ExecutionRoutingMode;
  arbitrageScannerEnabled: boolean;
  minArbitrageProfitPercent: number;
  enabledExchanges: ExchangeId[];
  // Advanced Risk Management & Dynamic Volatility Sizing
  dynamicPositionSizing?: boolean;
  positionSizingModel?: 'VOLATILITY_ATR' | 'FIXED_PERCENT' | 'KELLY_CRITERION';
  riskPerTradePercent?: number; // % of capital risked per trade (e.g. 2%)
  atrMultiplier?: number; // multiplier for ATR volatility stop buffer (e.g. 2.0x)
  takeProfitType?: 'PERCENT' | 'RISK_REWARD_RATIO';
  riskRewardRatio?: number; // e.g. 2.0x TP to SL distance
  dailyLossLimitUsd?: number; // Daily loss limit circuit breaker in USD
  circuitBreakerActive?: boolean;
  // Advanced Technical Indicators Configuration (MACD, RSI, Bollinger Bands)
  macdFastPeriod?: number; // default 12
  macdSlowPeriod?: number; // default 26
  macdSignalPeriod?: number; // default 9
  rsiPeriod?: number; // default 14
  bollingerPeriod?: number; // default 20
  bollingerStdDev?: number; // default 2
  autoSellEnabled?: boolean; // default true - enables automated selling / exiting on technical sell signals
  // AI Sentiment Analysis & Social Media Integration
  sentimentIntegrationEnabled?: boolean; // default true - enables AI sentiment to influence trading decisions
  sentimentMode?: 'CONFIRMATORY' | 'WEIGHTED_CONFLUENCE' | 'CONTRARIAN' | 'OFF'; // default 'CONFIRMATORY'
  minSentimentThreshold?: number; // threshold e.g. +15 for buy, -15 for sell
  sentimentWeightPercent?: number; // weight % e.g. 30% sentiment, 70% technicals in WEIGHTED_CONFLUENCE
}


export interface Order {
  id: string;
  timestamp: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'TAKE_PROFIT' | 'STOP_LOSS' | 'TRAILING_STOP' | 'LIQUIDATION' | 'MANUAL_CLOSE' | 'ARBITRAGE' | 'TECHNICAL_EXIT';
  price: number;
  amount: number;
  notional: number;
  fee: number;
  exchange: ExchangeId;
  exchangeName: string;
  savingsUsd?: number;
  savingsPercent?: number;
  routedViaSOR?: boolean;
  pnl?: number;
  pnlPercent?: number;
  reason: string;
}

export interface Position {
  id: string;
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  amount: number;
  margin: number;
  leverage: number;
  notional: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  highestPrice: number;
  liquidationPrice: number;
  openTime: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  strategyTrigger: string;
  exchange: ExchangeId;
  exchangeName: string;
  savingsUsd?: number;
  // Advanced Risk Tracking
  volatilityAtEntry?: number;
  isDynamicSized?: boolean;
  riskRewardRatio?: number;
  stopLossDistanceUsd?: number;
  targetProfitUsd?: number;
}

export interface PortfolioState {
  cash: number;
  startingBalance: number;
  realizedPnl: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  maxDrawdownPercent: number;
  peakEquity: number;
  totalSavingsFromSOR: number;
}

export interface AIAnalysisResult {
  marketTrendSummary: string;
  strategyCritique: string;
  riskScore: number;
  riskLevel: 'Low' | 'Moderate' | 'High' | 'Extreme';
  recommendedAdjustments: string[];
  shortTermProfitOutlook: string;
}

// ==========================================
// Live Currency Account & Banking Data Types
// ==========================================

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'USDC';

export interface LinkedBankAccount {
  id: string;
  bankName: string;
  institutionLogo?: string;
  accountType: 'CHECKING' | 'SAVINGS' | 'BUSINESS';
  routingNumber: string; // e.g. "•••• 0210" or full ABA
  accountNumberMasked: string; // e.g. "•••• 8921"
  accountHolderName: string;
  status: 'VERIFIED' | 'PENDING_VERIFICATION';
  isDefault: boolean;
  currency: CurrencyCode;
  connectedVia: 'PLAID_OPEN_BANKING' | 'MANUAL_ACH_ROUTING' | 'FEDNOW_WIRE';
  addedAt: number;
  tokenizedId?: string;
  isAbaChecksumVerified?: boolean;
  hsmKeyFingerprint?: string;
}

export interface BotSecuritySettings {
  emergencyFreezeActive: boolean;
  twoFactorEnforced: boolean;
  threeDsEnforced?: boolean;
  maxSingleOrderUsd: number;
  maxDailyLossUsd: number;
  slippageTolerancePercent: number;
  ipWhitelistEnabled: boolean;
  withdrawalAddressWhitelistOnly: boolean;
  lastSecurityAuditTimestamp: number;
  securityGrade: 'FORTRESS_A_PLUS' | 'A_TIER' | 'GUARDED';
  activeThreatLevel: 'NOMINAL' | 'ELEVATED' | 'CRITICAL';
}

export interface ThreeDSChallengeSession {
  sessionId: string;
  amount: number;
  currency: string;
  merchantName: string;
  cardBrand: 'VISA' | 'MASTERCARD' | 'AMEX' | 'DISCOVER';
  cardLast4: string;
  cardholderName: string;
  protocolVersion: '2.2.0';
  authMethod: 'SMS_OTP' | 'PUSH_NOTIFICATION' | 'BIOMETRIC_PASSKEY';
  maskedPhoneNumber: string;
  expiresAt: number;
  eci: string;
  dsTransId: string;
  threeDsServerTransId: string;
  acsTransId: string;
  directToBot: boolean;
  depositType: 'CARD' | 'BANK';
  targetBankId?: string;
  targetCardId?: string;
}

export interface ThreeDSVerificationResult {
  verified: boolean;
  cavv: string;
  eci: string;
  liabilityShift: 'ISSUER_LIABLE' | 'MERCHANT_LIABLE';
  authTimestamp: number;
  status: 'AUTHENTICATED' | 'REJECTED';
  message: string;
  transaction?: FiatTransaction;
  account?: FiatAccount;
}

export interface SecurityAuditReport {
  overallScore: number; // 0 - 100
  securityGrade: string;
  vaultEncryption: string;
  twoFactorActive: boolean;
  emergencyFreezeActive: boolean;
  totalLinkedBanks: number;
  allBanksChecksumVerified: boolean;
  zeroPlaintextGuarantee: boolean;
  pciDssLevel1Compliant: boolean;
  fdicCustodyInsured: boolean;
  botOrderCapUsd: number;
  dailyLossLimitUsd: number;
  circuitBreakerActive: boolean;
  lastAuditTimestamp: number;
  verifiedChecks: {
    title: string;
    description: string;
    status: 'PASSED' | 'WARNING' | 'CRITICAL';
    category: 'BANKING_RAILS' | 'BOT_TREASURY' | 'ENCRYPTION' | 'ACCESS_CONTROL';
  }[];
}

export interface LinkedDebitCard {
  id: string;
  brand: 'VISA' | 'MASTERCARD' | 'AMEX' | 'DISCOVER';
  last4: string;
  expMonth: number;
  expYear: number;
  cardholderName: string;
  isDefault: boolean;
  tokenizedId: string;
  issuerCountry: string;
  supportInstantPayout: boolean;
  addedAt: number;
}

export type FiatTransactionType =
  | 'DEBIT_CARD_LOAD'
  | 'BANK_ACH_DEPOSIT'
  | 'BANK_WIRE_DEPOSIT'
  | 'CHECK_MOBILE_DEPOSIT'
  | 'WITHDRAW_TO_BANK'
  | 'WITHDRAW_TO_DEBIT_CARD'
  | 'WITHDRAW_TO_PAYPAL'
  | 'WITHDRAW_FROM_BOT'
  | 'TRANSFER_TO_BOT_CAPITAL'
  | 'TRANSFER_FROM_BOT_CAPITAL';

export interface CheckDepositRecord {
  id: string;
  checkNumber: string;
  payerName: string;
  issuingBank: string;
  routingNumberMasked: string;
  accountNumberMasked: string;
  amount: number;
  fee: number;
  netAmount: number;
  settlementSpeed: 'INSTANT' | 'STANDARD_CLEARING';
  status: 'CLEARED_INSTANT' | 'PENDING_CLEARING' | 'REJECTED';
  frontImageUrl?: string;
  backImageUrl?: string;
  endorsementConfirmed: boolean;
  destination: 'BOT_MARGIN' | 'TREASURY_VAULT';
  referenceHash: string;
  submittedAt: number;
  clearedAt?: number;
  micrRaw?: string;
}

export interface FiatTransaction {
  id: string;
  timestamp: number;
  type: FiatTransactionType;
  amount: number;
  currency: CurrencyCode;
  fee: number;
  netAmount: number;
  status: 'COMPLETED' | 'PROCESSING' | 'PENDING' | 'FAILED';
  sourceName: string;
  destinationName: string;
  referenceHash: string;
  rail:
    | 'DEBIT_PULL'
    | 'ACH_TRANSFER'
    | 'FEDNOW_INSTANT'
    | 'INTERNAL_TRANSFER'
    | 'VISA_DIRECT_PUSH'
    | 'FEDNOW_WITHDRAWAL'
    | 'WIRE_TRANSFER'
    | 'MOBILE_CHECK_RDC'
    | 'INSTANT_CHECK_CLEARING'
    | 'PAYPAL_PAYOUT';
  /** Processor-side id (e.g. PayPal payout_batch_id) used to reconcile status. */
  externalId?: string;
}

export interface FiatAccount {
  accountId: string;
  accountNumberMasked: string;
  routingNumberMasked: string;
  accountHolder: string;
  currency: CurrencyCode;
  availableBalance: number;
  pendingBalance: number;
  allocatedToTrading: number;
  dailyDepositLimit: number;
  dailyDepositUsed: number;
  kycTier: 'TIER_1_STANDARD' | 'TIER_2_ENHANCED_PRO';
  twoFactorEnabled: boolean;
  vaultEncryption: 'AES_256_GCM' | 'NONE';
  fdicCustodyInsured: boolean;
  linkedBanks: LinkedBankAccount[];
  linkedCards: LinkedDebitCard[];
}

export type TradingExecutionMode = 'LIVE_REAL_TRADING'; // live only: there is no paper/simulation mode

export interface ExchangeCredentialStatus {
  configured: boolean;
  keyMasked: string | null;
  hasSecret: boolean;
  status: 'READY_FOR_LIVE_TRADING' | 'AUTHENTICATED' | 'NOT_CONFIGURED' | 'AUTHENTICATION_FAILED';
  supportedTrading?: string;
  supportedServices?: string;
  clientIdMasked?: string | null;
  passphraseMasked?: string | null;
  authError?: string;
}

export interface CredentialsSummary {
  KRAKEN: ExchangeCredentialStatus;
  COINBASE: ExchangeCredentialStatus;
  BINANCE: ExchangeCredentialStatus;
  NONKYC: ExchangeCredentialStatus;
  PLAID: ExchangeCredentialStatus;
  OKX?: ExchangeCredentialStatus;
}

export interface OkxWalletState {
  isConnected: boolean;
  address: string | null;
  chainId: string | null;
  networkName: string;
  balanceEth: number;
  balanceUsd: number;
  isExtensionDetected: boolean;
  lastConnectedAt?: number;
}

export interface ExchangeWallet {
  exchange: ExchangeId;
  exchangeName: string;
  isLinked: boolean;
  status: 'CONNECTED' | 'AWAITING_KEYS' | 'INVALID_CREDENTIALS' | 'ADDRESS_LINKED';
  apiKeyMasked?: string | null;
  hasSecret?: boolean;
  depositAddress?: string;
  walletLabel?: string;
  balances: Record<string, string | number>;
  lastSynced?: number;
  capabilities: string[];
  isVaultVerified?: boolean;
  verificationSource?: 'EXCHANGE_API' | 'ONCHAIN_RPC' | 'UNLINKED' | 'AUTH_ERROR';
  authError?: string;
  verifiedAt?: number;
  rawStatusNote?: string;
}

export interface ExchangeWalletTransaction {
  id: string;
  timestamp: number;
  exchange: ExchangeId;
  type: 'BUY_ORDER' | 'SELL_ORDER' | 'WALLET_WITHDRAWAL' | 'WALLET_TRANSFER';
  symbolOrAsset: string;
  amount: number;
  price?: number;
  totalUsd?: number;
  destination?: string;
  status: 'COMPLETED' | 'TRANSMITTED' | 'FAILED';
  txHash: string;
  executionNote?: string;
}

export type HealthStatusType = 'HEALTHY' | 'DEGRADED' | 'INVALID_CREDENTIALS' | 'LOCATION_RESTRICTED' | 'NOT_CONFIGURED';

export interface ExchangeHealthReport {
  exchange: ExchangeId;
  exchangeName: string;
  isConfigured: boolean;
  status: HealthStatusType;
  latencyMs: number;
  canReadBalance: boolean;
  canReadMarket: boolean;
  canTrade: boolean;
  scopes: string[];
  ipRestrictionStatus: 'RESTRICTED_US' | 'ALLOWED' | 'UNRESTRICTED' | 'NOT_CONFIGURED';
  detectedIp?: string;
  balanceSnapshot?: Record<string, string>;
  lastChecked: number;
  message: string;
  diagnosticHelp?: string;
  keyMasked?: string | null;
}

export interface ExchangeHealthCheckSummary {
  timestamp: number;
  totalConfigured: number;
  healthyCount: number;
  degradedCount: number;
  restrictedCount: number;
  serverEgressIp?: string;
  reports: Record<ExchangeId, ExchangeHealthReport>;
}


// ==========================================
// Etherscan On-Chain Intelligence & Agent Swarm
// ==========================================

export type ActivePageTab = 'TRADING_DESK' | 'SENTIMENT_RADAR' | 'ETHERSCAN_INTELLIGENCE' | 'FLASH_ARB_BOT' | 'WALLET_MONITOR';

// ==========================================
// AI Sentiment Analysis & Social Media Intelligence
// ==========================================

export type SentimentCategory = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export type SentimentMarketImpact = 'HIGH' | 'MEDIUM' | 'LOW';

export type SentimentTradingBias = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';

export type StrategyConfig = StrategyParameters;

export type SentimentBotMode = 'CONFIRMATORY' | 'WEIGHTED_CONFLUENCE' | 'CONTRARIAN' | 'OFF';

export interface SentimentFeedItem {
  id: string;
  source: 'TWITTER' | 'REDDIT' | 'COINDESK' | 'COINTELEGRAPH' | 'BLOOMBERG' | 'DECRYPT' | 'TELEGRAM' | 'NEWS';
  sourceName: string;
  author: string;
  authorHandle?: string;
  title: string;
  content: string;
  url?: string;
  timestamp: number;
  sentiment: SentimentCategory;
  score: number; // -100 (Extreme Fear / Bearish) to +100 (Extreme Greed / Bullish)
  confidence: number; // 0 to 100%
  relatedAssets: string[]; // e.g. ['BTC', 'ETH']
  keyTopics: string[]; // e.g. ['Spot ETF Inflows', 'Fed Rate Cut', 'Liquidation Cascade']
  marketImpact: SentimentMarketImpact;
  tradingRecommendation: 'BUY_BIAS' | 'SELL_BIAS' | 'NEUTRAL_WAIT';
  upvotesOrLikes?: number;
  sharesOrRetweets?: number;
}

export interface AssetSentimentSummary {
  symbol: string;
  sentiment: SentimentCategory;
  score: number; // -100 to +100
  sampleCount: number;
  bullishPercent: number;
  bearishPercent: number;
  neutralPercent: number;
  bias: SentimentTradingBias;
  velocity: 'HIGH' | 'NORMAL' | 'SURGING';
  topHeadline: string;
  lastUpdated: number;
}

export interface SentimentIntelligenceReport {
  timestamp: number;
  compositeScore: number; // -100 to +100
  overallSentiment: SentimentCategory;
  fearGreedIndex: number; // 0 to 100
  fearGreedLabel: 'EXTREME_FEAR' | 'FEAR' | 'NEUTRAL' | 'GREED' | 'EXTREME_GREED';
  socialVelocityPostsPerMin: number;
  bullishSignalsCount: number;
  bearishSignalsCount: number;
  neutralSignalsCount: number;
  topTrendingTopics: Array<{ topic: string; count: number; sentiment: SentimentCategory }>;
  assetBreakdown: Record<string, AssetSentimentSummary>;
  feed: SentimentFeedItem[];
  tradingDirective: {
    bias: SentimentTradingBias;
    confidencePercent: number;
    reasoning: string;
    recommendedPositionMultiplier: number; // 0.6x to 1.4x
    sentimentGateStatus: 'ALLOW_BUY' | 'SUPPRESS_BUY' | 'FORCE_SELL_RISK' | 'HOLD_NEUTRAL';
  };
  aiModelUsed: string;
  isAiAnalyzed: boolean;
}


export interface TokenHolding {
  symbol: string;
  name: string;
  contractAddress: string;
  balance: number;
  priceUsd: number;
  valueUsd: number;
  change24h: number;
  allocationPercent: number;
  category: 'NATIVE' | 'STABLECOIN' | 'DEFI' | 'LAYER2' | 'MEME';
  iconUrl?: string;
}

export interface WalletTransaction {
  hash: string;
  blockNumber: number;
  timestamp: number;
  from: string;
  to: string;
  direction: 'IN' | 'OUT' | 'SELF';
  method: string;
  actionSummary: string;
  valueNative: number;
  valueUsd: number;
  feeUsd: number;
  status: 'SUCCESS' | 'FAILED';
  tokenTransfers?: Array<{
    symbol: string;
    amount: number;
    valueUsd: number;
  }>;
}

export interface MonitoredWalletProfile {
  address: string;
  ensName?: string;
  network: 'ethereum' | 'arbitrum' | 'base' | 'optimism' | 'polygon' | 'okx_xlayer' | 'monero' | 'salvium' | 'qrl' | 'tari' | string;
  tag?: string;
  totalNetWorthUsd: number;
  nativeBalance: number;
  tokensCount: number;
  txCount: number;
  firstSeenDays: number;
  lastActiveBlock: number;
  riskScore: 'LOW' | 'MEDIUM' | 'HIGH';
  entityType: 'INDIVIDUAL_WHALE' | 'SMART_MONEY' | 'MEV_SEARCHER' | 'EXCHANGE_HOT_WALLET' | 'DEX_LIQUIDITY_POOL';
  holdings: TokenHolding[];
  transactions: WalletTransaction[];
  explorerBaseUrl?: string;
}

// ==========================================
// Privacy Asset Processor Types (XMR, XLA, QRL, TARI)
// ==========================================

export type PrivacyAssetType = 'XMR' | 'XLA' | 'QRL' | 'TARI';

export interface PrivacyDecoyInput {
  index: number;
  keyImage: string;
  ringSize: number;
  decoyPublicKeys: string[];
  realIndexHint?: number;
  isSpent: boolean;
}

export interface PrivacyOutput {
  index: number;
  stealthPublicKey: string;
  commitmentPedersen: string;
  isViewKeyMatch: boolean;
  decryptedAmount?: number;
  maskedAmountString: string;
}

export interface PrivacyParsedTx {
  txHash: string;
  asset: PrivacyAssetType;
  networkName: string;
  scheme: string;
  blockHeight: number;
  timestamp: number;
  confirmations: number;
  unlockStatus: {
    spendable: boolean;
    blocksRemaining: number;
    unlockHeight: number;
    minConfirmationsRequired: number;
  };
  inputs: PrivacyDecoyInput[];
  outputs: PrivacyOutput[];
  fee: number;
  feeUsd: number;
  ringSize: number;
  bulletproofValid: boolean;
  extraProtocolData: {
    label: string;
    value: string;
    detail?: string;
  }[];
}

export interface PrivacyAssetBalanceItem {
  asset: PrivacyAssetType;
  name: string;
  ticker: string;
  icon: string;
  totalBalance: number;
  unlockedBalance: number;
  lockedBalance: number;
  priceUsd: number;
  totalValueUsd: number;
  unlockedValueUsd: number;
  lockedValueUsd: number;
  change24h: number;
  privacyScore: number;
  protocolSpecs: {
    consensus: string;
    signatureScheme: string;
    lockRule: string;
    uniqueFeature: string;
  };
}

export interface PrivacyAggregationSummary {
  assets: PrivacyAssetBalanceItem[];
  totalPortfolioUsd: number;
  totalPortfolioBtc: number;
  unlockedPortfolioUsd: number;
  lockedPortfolioUsd: number;
  stealthAllocationPercent: number;
  quantumSafePercent: number;
  lastUpdated: number;
}

export interface UserCustomPrivacyWallet {
  id: string;
  asset: PrivacyAssetType;
  address: string;
  viewKey?: string;
  label: string;
  customBalance: number;
  unlockedPercent?: number;
  addedAt: number;
}

export interface OnChainTransaction {
  hash: string;
  blockNumber: number;
  from: string;
  fromLabel?: string;
  to: string;
  toLabel?: string;
  valueEth: number;
  valueUsd: number;
  tokenSymbol?: string;
  tokenAmount?: number;
  gasPriceGwei: number;
  gasUsed?: number;
  timestamp: number;
  etherscanUrl: string;
  patternType: 'WHALE_TRANSFER' | 'DEX_SWAP' | 'MEV_BUNDLE' | 'LIQUIDITY_ACTION' | 'SMART_ACCUMULATION';
  significance: 'HIGH' | 'CRITICAL' | 'MEDIUM';
  description: string;
}

export interface OnChainTradePattern {
  id: string;
  title: string;
  type: 'WHALE_ACCUMULATION' | 'DEX_CEX_ARBITRAGE' | 'MEV_OPPORTUNITY' | 'VELOCITY_SURGE' | 'GAS_TIMING';
  targetAsset: string;
  side: 'BUY' | 'SELL';
  expectedProfitPercent: number;
  winProbability: number;
  recommendedExchange: 'NONKYC' | 'KRAKEN' | 'BINANCE' | 'COINBASE' | 'BYBIT' | 'UNISWAP_DEX';
  reason: string;
  evidenceTxHash: string;
  etherscanUrl: string;
  netExpectedProfitUsd: number;
  status: 'DETECTED' | 'EXECUTING' | 'EXECUTED' | 'EXPIRED';
  timestamp: number;
  agentAuthor: string;
}

export interface EtherscanAgent {
  id: string;
  name: string;
  role: string;
  status: 'ACTIVE' | 'SCANNING' | 'SYNTHESIZING' | 'IDLE';
  currentFocus: string;
  lastInsight: string;
  signalsFoundCount: number;
  specialty: string;
}

export interface OnChainBlockState {
  blockNumber: number;
  baseFeeGwei: number;
  priorityFeeGwei: number;
  builderName: string;
  txCount: number;
  ethPriceUsd: number;
  lastUpdated: number;
  syncSource: string;
}

export interface EtherscanIntelligenceState {
  blockSnapshot: OnChainBlockState | null;
  error?: string | null;
  liveTransactions: OnChainTransaction[];
  tradePatterns: OnChainTradePattern[];
  agents: EtherscanAgent[];
  autoExecutionEnabled: boolean;
  minProfitThresholdPercent: number;
  executedSignalsCount: number;
  executedSignalsLog: Array<{
    signalId: string;
    targetAsset: string;
    exchange: string;
    profitEst: number;
    receipt: string;
    timestamp: number;
  }>;
  timestamp: number;
}


