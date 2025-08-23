"use client";

import { useState, useRef, useEffect, KeyboardEvent, useMemo } from "react";
import { api } from "@/utils/api";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Terminal as TerminalIcon, 
  X, 
  Search,
  Package,
  Database,
  Cloud,
  GitBranch,
  Play,
  Clock,
  ChevronRight,
  Sparkles,
  Zap,
  Server
} from "lucide-react";

interface Command {
  id: string;
  title: string;
  description: string;
  command: string;
  icon: React.ReactNode;
  category: "npm" | "bun" | "supabase" | "prisma" | "vercel" | "git" | "other";
}

interface HistoryItem {
  id: string;
  command: string;
  timestamp: Date;
  output?: string;
  error?: string;
  duration?: number;
}

const commandSnippets: Command[] = [
  // npm commands
  { id: "npm-install", title: "install dependencies", description: "install all project dependencies", command: "npm install", icon: <Package className="h-4 w-4" />, category: "npm" },
  { id: "npm-dev", title: "start dev server", description: "run development server", command: "npm run dev", icon: <Play className="h-4 w-4" />, category: "npm" },
  { id: "npm-build", title: "build project", description: "create production build", command: "npm run build", icon: <Package className="h-4 w-4" />, category: "npm" },
  { id: "npm-test", title: "run tests", description: "execute test suite", command: "npm test", icon: <Zap className="h-4 w-4" />, category: "npm" },
  
  // bun commands
  { id: "bun-install", title: "bun install", description: "install with bun", command: "bun install", icon: <Sparkles className="h-4 w-4" />, category: "bun" },
  { id: "bun-dev", title: "bun dev", description: "start with bun", command: "bun run dev", icon: <Sparkles className="h-4 w-4" />, category: "bun" },
  { id: "bun-add", title: "add package", description: "add new dependency", command: "bun add", icon: <Sparkles className="h-4 w-4" />, category: "bun" },
  
  // supabase commands
  { id: "supabase-start", title: "start supabase", description: "start local supabase", command: "supabase start", icon: <Database className="h-4 w-4" />, category: "supabase" },
  { id: "supabase-stop", title: "stop supabase", description: "stop local supabase", command: "supabase stop", icon: <Database className="h-4 w-4" />, category: "supabase" },
  { id: "supabase-status", title: "supabase status", description: "check supabase status", command: "supabase status", icon: <Database className="h-4 w-4" />, category: "supabase" },
  { id: "supabase-migration", title: "create migration", description: "create new migration", command: "supabase migration new", icon: <Database className="h-4 w-4" />, category: "supabase" },
  
  // prisma commands
  { id: "prisma-generate", title: "generate client", description: "generate prisma client", command: "prisma generate", icon: <Server className="h-4 w-4" />, category: "prisma" },
  { id: "prisma-migrate", title: "run migrations", description: "apply database migrations", command: "prisma migrate dev", icon: <Server className="h-4 w-4" />, category: "prisma" },
  { id: "prisma-studio", title: "open studio", description: "launch prisma studio", command: "prisma studio", icon: <Server className="h-4 w-4" />, category: "prisma" },
  { id: "prisma-push", title: "push schema", description: "push schema changes", command: "prisma db push", icon: <Server className="h-4 w-4" />, category: "prisma" },
  
  // vercel commands
  { id: "vc-dev", title: "vercel dev", description: "start vercel dev server", command: "vercel dev", icon: <Cloud className="h-4 w-4" />, category: "vercel" },
  { id: "vc-deploy", title: "deploy", description: "deploy to vercel", command: "vercel", icon: <Cloud className="h-4 w-4" />, category: "vercel" },
  { id: "vc-pull", title: "pull env", description: "pull environment variables", command: "vercel env pull", icon: <Cloud className="h-4 w-4" />, category: "vercel" },
  { id: "vc-link", title: "link project", description: "link to vercel project", command: "vercel link", icon: <Cloud className="h-4 w-4" />, category: "vercel" },
  
  // git commands
  { id: "git-status", title: "git status", description: "check git status", command: "git status", icon: <GitBranch className="h-4 w-4" />, category: "git" },
  { id: "git-pull", title: "git pull", description: "pull latest changes", command: "git pull", icon: <GitBranch className="h-4 w-4" />, category: "git" },
  { id: "git-push", title: "git push", description: "push commits", command: "git push", icon: <GitBranch className="h-4 w-4" />, category: "git" },
];

interface TerminalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Terminal({ isOpen: externalIsOpen, onClose }: TerminalProps = {}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showOutput, setShowOutput] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const executeMutation = api.terminal.execute.useMutation({
    onSuccess: (data) => {
      const historyItem: HistoryItem = {
        id: `cmd-${Date.now()}`,
        command: input,
        timestamp: new Date(),
        output: data.stdout,
        error: data.stderr,
        duration: Date.now() - startTime.current
      };
      
      setHistory(prev => [historyItem, ...prev].slice(0, 50)); // keep last 50 items
      setShowOutput(data.stdout || data.stderr || "command completed");
      setIsExecuting(false);
    },
    onError: (error) => {
      const historyItem: HistoryItem = {
        id: `cmd-${Date.now()}`,
        command: input,
        timestamp: new Date(),
        error: error.message,
        duration: Date.now() - startTime.current
      };
      
      setHistory(prev => [historyItem, ...prev].slice(0, 50));
      setShowOutput(`error: ${error.message}`);
      setIsExecuting(false);
    }
  });

  const startTime = useRef(0);

  const filteredCommands = useMemo(() => {
    if (!input) return commandSnippets;
    
    const searchTerm = input.toLowerCase();
    return commandSnippets.filter(cmd => 
      cmd.title.toLowerCase().includes(searchTerm) ||
      cmd.command.toLowerCase().includes(searchTerm) ||
      cmd.description.toLowerCase().includes(searchTerm) ||
      cmd.category.toLowerCase().includes(searchTerm)
    );
  }, [input]);

  const recentCommands = useMemo(() => {
    const uniqueCommands = new Map<string, HistoryItem>();
    history.forEach(item => {
      if (!uniqueCommands.has(item.command)) {
        uniqueCommands.set(item.command, item);
      }
    });
    return Array.from(uniqueCommands.values()).slice(0, 5);
  }, [history]);

  const handleExecute = (command: string) => {
    if (!command.trim()) return;
    
    setIsExecuting(true);
    setShowOutput(null);
    startTime.current = Date.now();
    setInput(command);
    
    // execute via api
    executeMutation.mutate({ command });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const selected = filteredCommands[selectedIndex];
      if (selected) {
        handleExecute(selected.command);
      } else if (input) {
        handleExecute(input);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Escape") {
      if (showOutput) {
        setShowOutput(null);
      } else {
        if (onClose) onClose();
        else setInternalIsOpen(false);
      }
    }
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [input]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const formatDuration = (ms?: number) => {
    if (!ms) return "";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  return (
    <>
      {/* floating button - only show if not controlled externally */}
      {externalIsOpen === undefined && (
        <AnimatePresence>
          {!isOpen && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setInternalIsOpen(true)}
              className="fixed bottom-6 left-6 w-14 h-14 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center z-50 shadow-lg shadow-purple-500/25"
            >
              <TerminalIcon className="h-6 w-6 text-white" />
            </motion.button>
          )}
        </AnimatePresence>
      )}

      {/* command palette overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (onClose) onClose();
                else setInternalIsOpen(false);
              }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />

            {/* command palette */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="fixed top-[20%] left-1/2 -translate-x-1/2 w-[640px] max-h-[500px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-50 overflow-hidden"
            >
              {/* search input */}
              <div className="border-b border-gray-200 dark:border-gray-800 p-4">
                <div className="flex items-center gap-3">
                  <Search className="h-5 w-5 text-gray-400" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="type a command or search..."
                    className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 text-base placeholder:text-gray-400"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {isExecuting && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="h-4 w-4 border-2 border-purple-500 border-t-transparent rounded-full"
                    />
                  )}
                  <button
                    onClick={() => {
                if (onClose) onClose();
                else setInternalIsOpen(false);
              }}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* output display */}
              {showOutput && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950"
                >
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">output</span>
                      <button
                        onClick={() => setShowOutput(null)}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        close
                      </button>
                    </div>
                    <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans max-h-32 overflow-y-auto">
                      {showOutput}
                    </pre>
                  </div>
                </motion.div>
              )}

              {/* suggestions */}
              <div className="overflow-y-auto max-h-[350px]">
                {/* recent commands */}
                {recentCommands.length > 0 && !input && (
                  <div className="p-2">
                    <div className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      recent
                    </div>
                    {recentCommands.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleExecute(item.command)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                            <span className="text-gray-900 dark:text-gray-100">{item.command}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            {item.duration && <span>{formatDuration(item.duration)}</span>}
                            <span>{formatTime(item.timestamp)}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* command snippets */}
                <div className="p-2">
                  {!input && (
                    <div className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
                      snippets
                    </div>
                  )}
                  {filteredCommands.map((cmd, index) => (
                    <button
                      key={cmd.id}
                      onClick={() => handleExecute(cmd.command)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group ${
                        selectedIndex === index 
                          ? "bg-purple-50 dark:bg-purple-900/20" 
                          : "hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`${
                          selectedIndex === index ? "text-purple-500" : "text-gray-400"
                        }`}>
                          {cmd.icon}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${
                              selectedIndex === index 
                                ? "text-purple-900 dark:text-purple-100" 
                                : "text-gray-900 dark:text-gray-100"
                            }`}>
                              {cmd.title}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                              {cmd.category}
                            </span>
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {cmd.description}
                          </div>
                        </div>
                        <code className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                          {cmd.command}
                        </code>
                      </div>
                    </button>
                  ))}
                  
                  {filteredCommands.length === 0 && (
                    <div className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                      <div className="text-sm">no matching commands</div>
                      <div className="text-xs mt-1">press enter to run &quot;{input}&quot;</div>
                    </div>
                  )}
                </div>
              </div>

              {/* footer */}
              <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-2">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">↑↓</kbd>
                      navigate
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">enter</kbd>
                      run
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">esc</kbd>
                      close
                    </span>
                  </div>
                  <span className="text-gray-400">
                    powered by claude os
                  </span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}