import express from "express";
import path from "path";
import { createAccessGuard } from "./server/accessGuard.ts";
import crypto from "crypto";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { setupFiatRoutes } from "./server/fiatRoutes.ts";
import { setupExchangeRoutes } from "./server/exchangeRoutes.ts";
import { aiRouter } from "./server/aiRoutes.ts";
import { walletRouter } from "./server/walletRoutes.ts";
import { flashArbRouter } from "./server/flashArbRoutes.ts";
import { sentimentRouter } from "./server/sentimentRoutes.ts";
import { requireAuth, type AuthRequest } from "./src/middleware/auth.ts";
import { getOrCreateUser } from "./src/db/users.ts";
import {
  saveUserPortfolio,
  getUserPortfolio,
  saveUserStrategy,
  getUserStrategies,
  recordTradeExecution,
  getRecentTradeExecutions,
} from "./src/db/botPersistence.ts";

dotenv.config();

function getPort(): number {
  const portArgIndex = process.argv.indexOf("--port");
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    return parseInt(process.argv[portArgIndex + 1], 10);
  }
  if (process.env.APP_PORT) {
    return parseInt(process.env.APP_PORT, 10);
  }
  // Cloud Run sets PORT=8080 where Nginx runs. The Node server must bind to port 3000.
  if (process.env.PORT && process.env.PORT !== "8080") {
    return parseInt(process.env.PORT, 10);
  }
  return 3000;
}

const PORT = getPort();

let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  // Keep the raw body: the Stripe webhook signature is computed over the exact bytes.
  app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));

  // ---- Access guard for the whole /api surface (see server/accessGuard.ts and its tests) ----
  app.use("/api", createAccessGuard({ token: process.env.API_ACCESS_TOKEN || "" }));

  // Prevent Express from returning HTML on invalid JSON bodies
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ success: false, error: 'Malformed JSON payload in request' });
    }
    next(err);
  });

  // Live Currency Account & Bank/Debit Card Gateway
  setupFiatRoutes(app);

  // Live Exchange API Credentials, Real Market Data & Order Execution Gateway
  setupExchangeRoutes(app);

  // Gemini AI Multi-turn Chat & Search Grounding Service
  app.use('/api/ai', aiRouter);

  // On-Chain Wallet Monitor & Holdings Gateway
  app.use('/api/wallet', walletRouter);

  // Flash Loan Arbitrage Gas Monitor & Searcher Signer Gateway
  app.use('/api/flash-arb', flashArbRouter);

  // AI Sentiment Analysis & Social Media News Gateway
  app.use('/api/sentiment', sentimentRouter);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  // Multi-Exchange Gateways Status & Configuration
  app.get("/api/exchanges", (_req, res) => {
    const exchanges = [
      {
        id: "BINANCE",
        name: "Binance Global",
        shortName: "Binance",
        tagColor: "#F0B90B",
        status: "CONNECTED",
        latencyMs: 22,
        makerFeePercent: 0.02,
        takerFeePercent: 0.075,
        enabled: true,
        apiEndpoint: "https://api.binance.com/api/v3",
        tier: "VIP 1 (BNB 25% Disc.)",
        hasApiKeyConfigured: Boolean(process.env.BINANCE_API_KEY),
        volumeSharePercent: 54,
      },
      {
        id: "COINBASE",
        name: "Coinbase Pro / Advanced",
        shortName: "Coinbase",
        tagColor: "#0052FF",
        status: "CONNECTED",
        latencyMs: 35,
        makerFeePercent: 0.20,
        takerFeePercent: 0.40,
        enabled: true,
        apiEndpoint: "https://api.exchange.coinbase.com",
        tier: "Advanced Trader (<$10k)",
        hasApiKeyConfigured: Boolean(process.env.COINBASE_API_KEY),
        volumeSharePercent: 26,
      },
      {
        id: "KRAKEN",
        name: "Kraken Financial",
        shortName: "Kraken",
        tagColor: "#5741D9",
        status: "CONNECTED",
        latencyMs: 41,
        makerFeePercent: 0.16,
        takerFeePercent: 0.26,
        enabled: true,
        apiEndpoint: "https://api.kraken.com/0",
        tier: "Intermediate Pro",
        hasApiKeyConfigured: Boolean(process.env.KRAKEN_API_KEY),
        volumeSharePercent: 14,
      },
      {
        id: "BYBIT",
        name: "Bybit Spot & Derivatives",
        shortName: "Bybit",
        tagColor: "#F7A600",
        status: "CONNECTED",
        latencyMs: 27,
        makerFeePercent: 0.02,
        takerFeePercent: 0.055,
        enabled: true,
        apiEndpoint: "https://api.bybit.com/v5",
        tier: "VIP 0 Tier",
        hasApiKeyConfigured: true,
        volumeSharePercent: 6,
      },
      {
        id: "NONKYC",
        name: "NonKYC Exchange (Zero-KYC Spot)",
        shortName: "NonKYC",
        tagColor: "#A855F7",
        status: "CONNECTED",
        latencyMs: 32,
        makerFeePercent: 0.10,
        takerFeePercent: 0.20,
        enabled: true,
        apiEndpoint: "https://api.nonkyc.io/api/v2",
        tier: "Zero-KYC High Privacy",
        hasApiKeyConfigured: true,
        volumeSharePercent: 8,
      },
    ];

    res.json({ success: true, exchanges, timestamp: Date.now() });
  });

  // Cross-Exchange Quotes Aggregator (Live Real Order Books)
  const handleQuotesRequest = async (req: express.Request, res: express.Response) => {
    try {
      const symbol = String(req.query.symbol || "BTC/USDT");
      const { fetchLiveExchangeQuotes } = await import("./server/liveMarketData.ts");
      const quotes = await fetchLiveExchangeQuotes(symbol);
      res.json({ success: true, symbol, quotes, timestamp: Date.now() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
  app.get("/api/exchanges/quotes", handleQuotesRequest);
  app.get("/api/market/live-quotes", handleQuotesRequest);

  // Download FlashArb Package Bundle (.zip) - Direct Binary Stream
  app.get("/api/download/flash-arb-zip", (_req, res) => {
    try {
      const publicZipPath = path.resolve(process.cwd(), "public/flash-arb.zip");
      const distZipPath = path.resolve(process.cwd(), "dist/flash-arb.zip");
      const targetPath = fs.existsSync(publicZipPath) ? publicZipPath : distZipPath;

      if (!fs.existsSync(targetPath)) {
        return res.status(404).json({ success: false, error: "flash-arb.zip not found" });
      }

      const fileBuffer = fs.readFileSync(targetPath);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="flash-arb.zip"');
      res.setHeader("Content-Length", fileBuffer.length.toString());
      res.setHeader("Content-Transfer-Encoding", "binary");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.end(fileBuffer);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: "Failed to download flash-arb.zip: " + err.message });
      }
    }
  });

  // Base64 JSON Endpoint - 100% immune to browser iframe sandbox HTML redirects
  app.get("/api/download/flash-arb-base64", (_req, res) => {
    try {
      const publicZipPath = path.resolve(process.cwd(), "public/flash-arb.zip");
      const distZipPath = path.resolve(process.cwd(), "dist/flash-arb.zip");
      const targetPath = fs.existsSync(publicZipPath) ? publicZipPath : distZipPath;

      if (!fs.existsSync(targetPath)) {
        return res.status(404).json({ success: false, error: "flash-arb.zip not found" });
      }

      const fileBuffer = fs.readFileSync(targetPath);
      const base64Data = fileBuffer.toString("base64");
      return res.json({
        success: true,
        filename: "flash-arb.zip",
        contentType: "application/zip",
        size: fileBuffer.length,
        base64: base64Data,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // AI Strategy & Market Intelligence Analysis Endpoint
  app.post("/api/ai-strategy-audit", async (req, res) => {
    try {
      const {
        symbol,
        currentPrice,
        priceChange24h,
        rsi,
        macd,
        strategyName,
        parameters,
        portfolio,
      } = req.body;

      const ai = getGenAI();

      if (!ai) {
        return res.status(503).json({ success: false, error: "GEMINI_API_KEY is not configured." });
      }

      const prompt = `You are a world-class institutional quantitative crypto trader and risk auditor.
Analyze the following live market state and automated bot strategy parameters:
Asset: ${symbol}
Current Price: $${currentPrice}
24h Change: ${priceChange24h}%
Technical RSI (14): ${rsi}
MACD Signal: ${JSON.stringify(macd || {})}
Active Strategy: ${strategyName}
Parameters: ${JSON.stringify(parameters, null, 2)}
Portfolio State: Cash: $${portfolio?.cash ?? 'unknown'}, Active Positions: ${portfolio?.positionsCount ?? 'unknown'}, Total Trades: ${portfolio?.totalTrades ?? 'unknown'}

User Goal: "Execute automated trades based on set parameters to make a significant profit in a short time".

Provide an objective, professional, mathematically sound evaluation in valid JSON with these exact keys:
{
  "marketTrendSummary": "Concise 1-2 sentence description of current trend & technical momentum",
  "strategyCritique": "Critique of whether these specific parameters (RSI trigger, take-profit, stop-loss, position size, leverage) are mathematically viable or over-exposed",
  "riskScore": number from 1 to 100 (where 100 is extreme liquidation risk),
  "riskLevel": "Low" | "Moderate" | "High" | "Extreme",
  "recommendedAdjustments": ["string", "string", "string"],
  "shortTermProfitOutlook": "Honest quantitative assessment addressing the user's desire for quick profits, explaining the trade-off between velocity and drawdown survival"
}
Return ONLY valid JSON without markdown wrapping.`;

      let response: any = null;
      let usedModel = "gemini-4-hydrogen";
      let lastErr: any = null;
      for (const model of ["gemini-4-hydrogen", "gemini-3.1-flash-lite"]) {
        try {
          usedModel = model;
          response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: { responseMimeType: "application/json", temperature: 0.3 },
          });
          if (response?.text) break;
        } catch (err: any) {
          lastErr = err;
          const msg = String(err?.message || "");
          if (!/503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|TIMEOUT/i.test(msg)) {
            throw err;
          }
        }
      }
      if (!response?.text) {
        throw lastErr || new Error("Gemini returned an empty response");
      }
      const cleanJson = (response.text || "").trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      let parsedAnalysis: any;
      try {
        parsedAnalysis = JSON.parse(cleanJson);
      } catch {
        return res.status(502).json({ success: false, error: "Gemini returned unparseable analysis." });
      }
      if (parsedAnalysis?.riskScore === undefined) {
        return res.status(502).json({ success: false, error: "Gemini analysis was missing required fields." });
      }
      return res.json({ success: true, source: usedModel, analysis: parsedAnalysis });
    } catch (err: any) {
      console.error("AI strategy audit error:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Failed to generate strategy analysis",
      });
    }
  });

  // Cloud SQL Database API Routes
  app.post("/api/user/sync", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.uid || !req.user?.email) {
        return res.status(400).json({ success: false, error: "Missing user information" });
      }
      const user = await getOrCreateUser(req.user.uid, req.user.email);
      res.json({ success: true, user });
    } catch (err: any) {
      console.error("Failed to sync user to Cloud SQL:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to sync user" });
    }
  });

  app.post("/api/portfolio/save", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.uid) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      const saved = await saveUserPortfolio(req.user.uid, req.body.portfolio);
      res.json({ success: true, portfolio: saved });
    } catch (err: any) {
      console.error("Failed to save portfolio to Cloud SQL:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to save portfolio" });
    }
  });

  app.get("/api/portfolio", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.uid) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      const portfolio = await getUserPortfolio(req.user.uid);
      res.json({ success: true, portfolio });
    } catch (err: any) {
      console.error("Failed to fetch portfolio from Cloud SQL:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to fetch portfolio" });
    }
  });

  app.post("/api/strategy/save", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.uid) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      const saved = await saveUserStrategy(req.user.uid, req.body.strategy);
      res.json({ success: true, strategy: saved });
    } catch (err: any) {
      console.error("Failed to save strategy to Cloud SQL:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to save strategy" });
    }
  });

  app.get("/api/strategy", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.uid) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      const strategies = await getUserStrategies(req.user.uid);
      res.json({ success: true, strategies });
    } catch (err: any) {
      console.error("Failed to fetch strategies from Cloud SQL:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to fetch strategies" });
    }
  });

  app.post("/api/trade/record", async (req, res) => {
    try {
      const record = await recordTradeExecution(req.body);
      res.json({ success: true, record });
    } catch (err: any) {
      console.error("Failed to record trade execution in Cloud SQL:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to record trade" });
    }
  });

  app.get("/api/trade/recent", async (req, res) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
      const trades = await getRecentTradeExecutions(userId);
      res.json({ success: true, trades });
    } catch (err: any) {
      console.error("Failed to get trade executions from Cloud SQL:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to get trade executions" });
    }
  });

  // Ensure unmatched /api/* routes and /api errors always return JSON (never HTML)
  app.use("/api", (_req, res) => {
    res.status(404).json({ success: false, error: "API route not found" });
  });
  app.use("/api", (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled API error:", err);
    if (!res.headersSent) {
      res.status(err?.status || 500).json({ success: false, error: err?.message || "Internal server error" });
    }
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const HOST = process.env.HOST || "0.0.0.0";
  app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
