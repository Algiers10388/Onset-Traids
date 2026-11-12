import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';

export const aiRouter = express.Router();

const ai = new GoogleGenAI();

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

interface GroundingMetadataSource {
  uri: string;
  title: string;
}

async function callWithTimeout<T>(fn: () => Promise<T>, timeoutMs = 30000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('GEMINI_CALL_TIMEOUT')), timeoutMs);
  });
  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const SYSTEM_INSTRUCTIONS: Record<string, string> = {
  TROUBLESHOOTING: `You are the Apex Quant System & Compiler Diagnostics Engineer for the Crypto Trading Agent & FlashArb engine.
Your mission is to provide immediate, actionable, and accurate solutions to developers and traders running the FlashArb DeFi Bot, Foundry smart contracts, and multi-exchange trading agents across Termux on Android, WSL (Windows Subsystem for Linux), and Windows PowerShell.

CRITICAL EXPERTISE & ACCURACY RULES:
1. TERMUX ON ANDROID:
   - The package name to install in Termux APT/pkg is 'solidity' (command: \`pkg update && pkg install -y solidity\`).
   - The binary installed into $PATH is 'solc' (\`which solc\` -> /data/data/com.termux/files/usr/bin/solc).
   - Solves the error "version not found in artifacts for this platform": Ethereum does NOT publish pre-compiled binaries for Android aarch64 (bionic libc), so Foundry's svm-rs cannot download remote artifacts.
   - The solution: instruct Foundry to use the native compiler directly: \`forge test --use $(which solc) --fork-url https://arb1.arbitrum.io/rpc --fork-block-number 225000000 -vvv\` (or execute \`./run_termux.sh\`).
2. WSL (WINDOWS SUBSYSTEM FOR LINUX):
   - WSL runs native Ubuntu/Debian x86_64, where Foundry and standard Linux artifacts work out of the box with \`forge test\`.
3. WINDOWS POWERSHELL:
   - Use native Windows solc (via \`winget install Ethereum.Solidity\` or \`npm install -g solc\`) or run via WSL for maximum speed.
4. FLASHARB SMART CONTRACTS:
   - Contracts: FlashArb.sol integrates Aave V3 FlashLoanSimple (0.05% fee), Uniswap V3 (exactInputSingle), Uniswap V2 / Camelot, and Curve.
   - Invariant: Zero funds held in contract storage; sweeps 100% of profit to the recipient atomically. Reverts unless profit >= minProfit.
Always be concise, precise, and provide exact copy-pasteable shell or Solidity commands.`,

  MARKET_UPDATES: `You are the Apex Live Market Intelligence & Quantitative News Analyst.
You provide up-to-the-minute updates on cryptocurrency markets, institutional spot flows, exchange liquidity announcements (Binance, Coinbase, Kraken, NonKYC, OKX), Ethereum base gas fee dynamics, and Layer-2 rollups (Arbitrum, Base, Optimism, OKX X Layer).
When Search Grounding is enabled, use current Google Search data to deliver factual, real-time market facts, regulatory developments, and exchange updates.`,

  SMART_CONTRACT_AUDIT: `You are a Principal DeFi Security Architect and Formal Verification Expert.
You specialize in inspecting Flash Loan arbitrage transactions, verifying atomic execution, checking reentrancy protections, validating Uniswap V3 sqrtPriceX96 tick calculations, and ensuring zero residual balance invariants.`,
};

aiRouter.post('/chat', async (req: Request, res: Response) => {
  try {
    const {
      messages = [],
      role = 'TROUBLESHOOTING',
      model = 'gemini-3.8-flash',
      useSearchGrounding = false,
      context = {},
    } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'Messages array is required.' });
    }

    const systemInstruction = SYSTEM_INSTRUCTIONS[role] || SYSTEM_INSTRUCTIONS.TROUBLESHOOTING;

    // Build context prefix if provided
    let contextNote = '';
    if (context && Object.keys(context).length > 0) {
      contextNote = `\n[RUNTIME CONTEXT: Platform: ${context.platform ?? 'unspecified'}, Trading Mode: ${context.tradingMode ?? 'unspecified'}, Selected Token: ${context.selectedSymbol ?? 'unspecified'}]\n`;
    }

    // Convert messages to @google/genai format
    const contents = messages.map((m: ChatMessage, idx: number) => {
      let text = m.content;
      if (idx === messages.length - 1 && contextNote) {
        text = `${m.content}\n${contextNote}`;
      }
      return {
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text }],
      };
    });

    // Map to supported model names based on official @google/genai SDK catalog
    let selectedModel = model;
    if (selectedModel !== 'gemini-3.1-pro-preview' && selectedModel !== 'gemini-3.1-flash-lite') {
      selectedModel = 'gemini-3.8-flash';
    }

    let responseText = '';
    const groundingSources: GroundingMetadataSource[] = [];
    let webSearchQueries: string[] = [];
    const modelUsed = selectedModel;

    const config: Record<string, unknown> = { systemInstruction };
    if (useSearchGrounding && selectedModel === 'gemini-3.8-flash') {
      config.tools = [{ googleSearch: {} }];
    }

    // Single call to the requested model. If it fails, the error is returned to the caller as-is:
    // no alternate model, no canned/"offline" answer.
    const response = await callWithTimeout(
      () => ai.models.generateContent({ model: selectedModel, contents, config }),
      30000
    );
    responseText = response.text || '';

    const grounding = response.candidates?.[0]?.groundingMetadata;
    if (grounding) {
      if (Array.isArray(grounding.webSearchQueries)) webSearchQueries = grounding.webSearchQueries;
      if (Array.isArray(grounding.groundingChunks)) {
        grounding.groundingChunks.forEach((chunk: { web?: { uri?: string; title?: string } }) => {
          if (chunk.web?.uri) groundingSources.push({ uri: chunk.web.uri, title: chunk.web.title || chunk.web.uri });
        });
      }
    }

    return res.json({
      success: true,
      reply: responseText,
      modelUsed,
      groundingMetadata: {
        webSearchQueries,
        sources: groundingSources,
      },
    });
  } catch (error: unknown) {
    console.error('Gemini Chat API Error:', error);
    const msg = error instanceof Error ? error.message : 'AI service error';
    const quota = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.toLowerCase().includes('quota');
    return res.status(quota ? 429 : 502).json({ success: false, error: msg });
  }
});

