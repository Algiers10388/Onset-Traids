import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  X,
  Bot,
  User as UserIcon,
  Search,
  ExternalLink,
  Copy,
  Check,
  RotateCcw,
  Zap,
  Terminal,
  Shield,
  Layers,
  ChevronDown,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useAuth, SavedChatSession } from '../context/AuthContext';

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  modelUsed?: string;
  groundingMetadata?: {
    webSearchQueries?: string[];
    sources?: Array<{ uri: string; title: string }>;
  };
}

interface AiTroubleshooterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
  contextData?: {
    tradingMode?: string;
    selectedSymbol?: string;
    platformHint?: string;
  };
}

type AssistantRole = 'TROUBLESHOOTING' | 'MARKET_UPDATES' | 'SMART_CONTRACT_AUDIT';
type GeminiModel = 'gemini-3.8-flash' | 'gemini-3.1-flash-lite' | 'gemini-3.1-pro-preview';

const QUICK_PROMPTS = [
  {
    icon: '📱',
    label: "Fix 'version not found in artifacts' in Termux",
    prompt: "I am running Termux on Android. How do I fix the error 'version not found in artifacts for this platform' when compiling FlashArb with Foundry?",
    role: 'TROUBLESHOOTING' as AssistantRole,
  },
  {
    icon: '⚡',
    label: 'How to run Arbitrum fork test with native solc',
    prompt: 'Show me the exact commands to run the Arbitrum fork tests in Foundry using the local native solc compiler binary in Termux, WSL, and PowerShell.',
    role: 'TROUBLESHOOTING' as AssistantRole,
  },
  {
    icon: '🌐',
    label: 'Latest Ethereum & Arbitrum live updates',
    prompt: 'Use Google Search Grounding to tell me the latest news, base gas fees, and DEX volume developments on Ethereum and Arbitrum today.',
    role: 'MARKET_UPDATES' as AssistantRole,
    search: true,
  },
  {
    icon: '🔒',
    label: 'Audit FlashArb.sol Aave V3 repayment',
    prompt: 'Audit the executeOperation function in FlashArb.sol: verify that the Aave V3 0.05% fee repayment and the minProfit requirement are mathematically secure against sandwich attacks.',
    role: 'SMART_CONTRACT_AUDIT' as AssistantRole,
  },
];

export const AiTroubleshooterModal: React.FC<AiTroubleshooterModalProps> = ({
  isOpen,
  onClose,
  initialPrompt,
  contextData,
}) => {
  const { user, signInWithGoogle, saveChatToFirestore, savedChats } = useAuth();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      content:
        "Hello! I am your **Apex AI Copilot & Compiler Diagnostics Assistant**.\n\nI can assist you with:\n- **Termux & Android compilation** (solves `version not found in artifacts for this platform` by using `pkg install -y solidity` and `--use $(which solc)`)\n- **WSL & PowerShell setup** for Foundry and the Rust searcher\n- **Live Crypto Market & News Updates** using real-time Google Search Grounding\n- **Smart Contract & Flash Loan Math Audits**\n\nHow can I help you today?",
      timestamp: Date.now(),
      modelUsed: 'gemini-3.8-flash',
    },
  ]);

  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [role, setRole] = useState<AssistantRole>('TROUBLESHOOTING');
  const [model, setModel] = useState<GeminiModel>('gemini-3.8-flash');
  const [useSearchGrounding, setUseSearchGrounding] = useState<boolean>(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>(() => 'chat_' + Date.now());
  const [savedCloudNotice, setSavedCloudNotice] = useState<boolean>(false);
  const [showSavedList, setShowSavedList] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, loading]);

  // Handle initial prompt if passed
  useEffect(() => {
    if (initialPrompt && isOpen) {
      handleSendMessage(initialPrompt);
    }
  }, [initialPrompt, isOpen]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const queryText = (textToSend || input).trim();
    if (!queryText || loading) return;

    const userMsg: Message = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: queryText,
      timestamp: Date.now(),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      // Prepare payload for server-side Gemini API
      const historyPayload = newHistory
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyPayload,
          role,
          model,
          useSearchGrounding: role === 'MARKET_UPDATES' ? true : useSearchGrounding,
          context: {
            ...contextData,
            platform: 'Termux / Android & WSL / PowerShell Multi-Target',
          },
        }),
      });

      const data = await res.json();

      if (data.success && data.reply) {
        const botMsg: Message = {
          id: 'bot_' + Date.now(),
          role: 'model',
          content: data.reply,
          timestamp: Date.now(),
          modelUsed: data.modelUsed || model,
          groundingMetadata: data.groundingMetadata,
        };

        const updatedHistory = [...newHistory, botMsg];
        setMessages(updatedHistory);

        // Auto-save to Firestore if user is authenticated
        if (user) {
          const sessionObj: SavedChatSession = {
            id: sessionId,
            title: queryText.slice(0, 40) + '...',
            modelUsed: data.modelUsed || model,
            messages: updatedHistory,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          saveChatToFirestore(sessionObj).catch(() => {});
        }
      } else {
        const errText = data.error || 'Failed to receive AI response. Please try again.';
        setMessages((prev) => [
          ...prev,
          {
            id: 'err_' + Date.now(),
            role: 'model',
            content: `⚠️ **Diagnostic Error:** ${errText}\n\n*Tip:* Switch to \`gemini-3.1-flash-lite\` or check your network connection.`,
            timestamp: Date.now(),
            modelUsed: model,
          },
        ]);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Network error';
      setMessages((prev) => [
        ...prev,
        {
          id: 'err_' + Date.now(),
          role: 'model',
          content: `⚠️ **Network Error:** Could not reach the Gemini server proxy (${errMsg}). Retrying with gemini-3.1-flash-lite is recommended.`,
          timestamp: Date.now(),
          modelUsed: 'gemini-3.1-flash-lite',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveToCloud = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }

    const sessionObj: SavedChatSession = {
      id: sessionId,
      title: messages[1]?.content?.slice(0, 45) || 'Diagnostics & Market Session',
      modelUsed: model,
      messages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveChatToFirestore(sessionObj);
    setSavedCloudNotice(true);
    setTimeout(() => setSavedCloudNotice(false), 2500);
  };

  const handleLoadSession = (session: SavedChatSession) => {
    setMessages(session.messages);
    setSessionId(session.id);
    setModel((session.modelUsed as GeminiModel) || 'gemini-3.8-flash');
    setShowSavedList(false);
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'model',
        content:
          "Thread reset. What compiler diagnostics, Termux commands, or live market update can I help you with?",
        timestamp: Date.now(),
        modelUsed: model,
      },
    ]);
    setSessionId('chat_' + Date.now());
  };

  // Simple Markdown & Code Formatter
  const renderMessageContent = (text: string, msgId: string) => {
    const codeBlockRegex = /```([a-zA-Z0-9_\-]*)\n([\s\S]*?)```/g;
    type ContentPart =
      | { type: 'code'; lang: string; code: string }
      | { type: 'text'; content: string };
    const parts: ContentPart[] = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        parts.push({
          type: 'text',
          content: text.slice(lastIndex, matchIndex),
        });
      }

      parts.push({
        type: 'code',
        lang: match[1] || 'bash',
        code: match[2].trim(),
      });

      lastIndex = matchIndex + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex),
      });
    }

    return (
      <div className="space-y-3 leading-relaxed text-sm">
        {parts.map((p, i) => {
          if (p.type === 'code') {
            const blockId = `${msgId}_code_${i}`;
            return (
              <div
                key={i}
                className="my-3 rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950 font-mono text-xs shadow-lg"
              >
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400">
                  <span className="uppercase font-bold tracking-wider text-cyan-400">
                    {p.lang || 'code'}
                  </span>
                  <button
                    onClick={() => handleCopyCode(p.code, blockId)}
                    className="flex items-center gap-1 hover:text-white px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 transition-colors"
                  >
                    {copiedId === blockId ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3.5 overflow-x-auto text-emerald-300 leading-normal selection:bg-emerald-800/40">
                  <code>{p.code}</code>
                </pre>
              </div>
            );
          }

          // Inline formatting for text
          const lines = p.content.split('\n');
          return (
            <div key={i} className="space-y-1">
              {lines.map((line, lineIdx) => {
                if (line.startsWith('# ')) {
                  return (
                    <h2 key={lineIdx} className="text-base font-bold text-white mt-2 mb-1">
                      {line.replace('# ', '')}
                    </h2>
                  );
                }
                if (line.startsWith('## ')) {
                  return (
                    <h3 key={lineIdx} className="text-sm font-bold text-cyan-300 mt-2 mb-1">
                      {line.replace('## ', '')}
                    </h3>
                  );
                }
                if (line.startsWith('- ')) {
                  return (
                    <li key={lineIdx} className="ml-4 list-disc text-slate-200">
                      {renderInlineBold(line.replace('- ', ''))}
                    </li>
                  );
                }
                if (line.trim() === '') {
                  return <div key={lineIdx} className="h-1" />;
                }
                return (
                  <p key={lineIdx} className="text-slate-200">
                    {renderInlineBold(line)}
                  </p>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const renderInlineBold = (str: string) => {
    const boldRegex = /\*\*(.*?)\*\*/g;
    const parts = [];
    let last = 0;
    let match;

    while ((match = boldRegex.exec(str)) !== null) {
      if (match.index > last) {
        parts.push(str.slice(last, match.index));
      }
      parts.push(
        <strong key={match.index} className="text-white font-semibold">
          {match[1]}
        </strong>
      );
      last = match.index + match[0].length;
    }
    if (last < str.length) {
      parts.push(str.slice(last));
    }
    return parts;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl h-[92vh] max-h-[850px] bg-[#0E131F] border border-cyan-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 p-0.5 shadow-lg shadow-cyan-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base text-white">AI Diagnostics & Market Copilot</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  Gemini 3 Series
                </span>
                {user ? (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                    <Cloud className="w-3 h-3" /> Firestore Linked
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-slate-400">
                Termux Compiler Fixes • Multi-Platform Foundry • Live Search Grounding • Smart Contract Audits
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Cloud Sync Button */}
            <button
              onClick={handleSaveToCloud}
              title={user ? 'Saved to your Firestore profile' : 'Sign in to save chat sessions'}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-750 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              <Cloud className="w-3.5 h-3.5 text-cyan-400" />
              <span>{savedCloudNotice ? 'Saved!' : user ? 'Sync Firestore' : 'Sign in to Sync'}</span>
            </button>

            {/* Clear thread */}
            <button
              onClick={handleClearChat}
              title="Reset conversation"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Controls Toolbar: Role Switcher & Model Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-slate-950/60 border-b border-slate-800/80 text-xs">
          {/* Role Mode */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            <span className="text-slate-400 font-medium mr-1 hidden sm:inline">Role:</span>
            <button
              onClick={() => setRole('TROUBLESHOOTING')}
              className={`px-3 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                role === 'TROUBLESHOOTING'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Compiler Diagnostics</span>
            </button>
            <button
              onClick={() => {
                setRole('MARKET_UPDATES');
                setUseSearchGrounding(true);
              }}
              className={`px-3 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                role === 'MARKET_UPDATES'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Live Market Analyst</span>
            </button>
            <button
              onClick={() => setRole('SMART_CONTRACT_AUDIT')}
              className={`px-3 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                role === 'SMART_CONTRACT_AUDIT'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Contract Auditor</span>
            </button>
          </div>

          {/* Model Selection & Search Grounding Toggle */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
              <span className="text-[11px] text-slate-400">Model:</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as GeminiModel)}
                className="bg-transparent text-cyan-300 font-mono text-[11px] font-semibold focus:outline-none cursor-pointer"
              >
                <option value="gemini-3.8-flash" className="bg-slate-900 text-white">
                  gemini-3.8-flash (Search Grounded)
                </option>
                <option value="gemini-3.1-flash-lite" className="bg-slate-900 text-white">
                  gemini-3.1-flash-lite (Fastest)
                </option>
                <option value="gemini-3.1-pro-preview" className="bg-slate-900 text-white">
                  gemini-3.1-pro-preview (Deep Reasoning)
                </option>
              </select>
            </div>

            {/* Search Grounding Checkbox (Active on 3.8 flash) */}
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300 hover:text-white select-none">
              <input
                type="checkbox"
                checked={useSearchGrounding}
                onChange={(e) => setUseSearchGrounding(e.target.checked)}
                className="rounded border-slate-700 text-cyan-500 focus:ring-0 bg-slate-900 cursor-pointer"
              />
              <span className="flex items-center gap-1 text-slate-300">
                <Search className="w-3 h-3 text-cyan-400" /> Google Search
              </span>
            </label>
          </div>
        </div>

        {/* Quick Action Prompt Chips */}
        <div className="px-5 py-2 border-b border-slate-800/80 bg-slate-900/40 flex items-center gap-2 overflow-x-auto scrollbar-thin">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
            <Zap className="w-3 h-3 text-amber-400" /> Prompts:
          </span>
          {QUICK_PROMPTS.map((qp, idx) => (
            <button
              key={idx}
              onClick={() => {
                setRole(qp.role);
                if (qp.search) setUseSearchGrounding(true);
                handleSendMessage(qp.prompt);
              }}
              className="px-2.5 py-1 rounded-full bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/80 text-[11px] whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>{qp.icon}</span>
              <span>{qp.label}</span>
            </button>
          ))}
        </div>

        {/* Scrollable Messages Thread */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 font-sans scroll-smooth">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3.5 ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role === 'model' && (
                <div className="w-8 h-8 rounded-lg bg-cyan-600/30 border border-cyan-500/50 flex-shrink-0 flex items-center justify-center text-cyan-300 shadow-md">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3.5 shadow-md ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-br-none'
                    : 'bg-slate-900/90 border border-slate-800 text-slate-200 rounded-bl-none'
                }`}
              >
                {/* Message Header */}
                <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400 mb-1.5 pb-1 border-b border-white/5">
                  <span className="font-semibold text-slate-300">
                    {msg.role === 'user' ? (user?.displayName || 'You') : 'Gemini AI'}
                  </span>
                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    {msg.modelUsed && (
                      <span className="px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300 border border-cyan-500/30">
                        {msg.modelUsed}
                      </span>
                    )}
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>

                {/* Content */}
                {renderMessageContent(msg.content, msg.id)}

                {/* Search Grounding Sources Drawer */}
                {msg.groundingMetadata?.sources && msg.groundingMetadata.sources.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-800 text-xs">
                    <div className="flex items-center gap-1.5 text-cyan-400 font-semibold mb-1.5 text-[11px]">
                      <Search className="w-3 h-3" />
                      <span>Google Search Grounding Sources:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.groundingMetadata.sources.map((src, srcIdx) => (
                        <a
                          key={srcIdx}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-cyan-300 text-[11px] transition-colors truncate max-w-[260px]"
                        >
                          <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                          <span className="truncate">{src.title || src.uri}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500/50 flex-shrink-0 flex items-center justify-center text-blue-300 shadow-md">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="User" className="w-7 h-7 rounded-md object-cover" />
                  ) : (
                    <UserIcon className="w-4 h-4" />
                  )}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 justify-start items-center text-slate-400 text-xs font-mono">
              <div className="w-8 h-8 rounded-lg bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-2 rounded-xl border border-slate-800">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-bounce" />
                <span>Gemini is synthesizing diagnostics & ground truth...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-slate-900 border-t border-slate-800">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about Termux solc compilation, WSL scripts, live token updates, or FlashArb..."
                disabled={loading}
                className="w-full pl-4 pr-10 py-3 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-sans"
              />
              {useSearchGrounding && (
                <div
                  title="Search Grounding Active"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-cyan-400 pointer-events-none"
                >
                  <Search className="w-4 h-4" />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm shadow-lg shadow-cyan-600/20 transition-all flex items-center gap-2 cursor-pointer flex-shrink-0"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Send</span>
                  <Send className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 px-1">
            <span>
              Powered by Google Gemini 3 API & Search Grounding • Data persistent to Firestore
            </span>
            <span>Shift + Enter for new lines</span>
          </div>
        </div>
      </div>
    </div>
  );
};
