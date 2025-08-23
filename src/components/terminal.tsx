"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { api } from "@/utils/api";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal as TerminalIcon, X, Minimize2, Maximize2 } from "lucide-react";

interface TerminalLine {
  id: string;
  type: "input" | "output" | "error";
  content: string;
  timestamp: Date;
}

export function Terminal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<TerminalLine[]>([
    {
      id: "welcome",
      type: "output",
      content: "claude os terminal v1.0.0\ntype 'help' for available commands\n",
      timestamp: new Date()
    }
  ]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const executeMutation = api.terminal.execute.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setHistory(prev => [...prev, {
          id: `output-${Date.now()}`,
          type: data.stderr ? "error" : "output",
          content: data.stdout || data.stderr || "",
          timestamp: new Date()
        }]);
      } else {
        setHistory(prev => [...prev, {
          id: `error-${Date.now()}`,
          type: "error",
          content: data.error || "command failed",
          timestamp: new Date()
        }]);
      }
    },
    onError: (error) => {
      setHistory(prev => [...prev, {
        id: `error-${Date.now()}`,
        type: "error",
        content: `error: ${error.message}`,
        timestamp: new Date()
      }]);
    }
  });

  const handleCommand = (cmd: string) => {
    if (!cmd.trim()) return;

    // add to history
    setHistory(prev => [...prev, {
      id: `input-${Date.now()}`,
      type: "input",
      content: `$ ${cmd}`,
      timestamp: new Date()
    }]);

    // add to command history
    setCommandHistory(prev => [...prev, cmd]);
    setHistoryIndex(-1);

    // handle built-in commands
    if (cmd === "clear") {
      setHistory([{
        id: "cleared",
        type: "output",
        content: "terminal cleared\n",
        timestamp: new Date()
      }]);
      return;
    }

    if (cmd === "help") {
      setHistory(prev => [...prev, {
        id: `help-${Date.now()}`,
        type: "output",
        content: `available commands:
  clear     - clear terminal output
  help      - show this help message
  exit      - close terminal
  
all other commands are executed via shell`,
        timestamp: new Date()
      }]);
      return;
    }

    if (cmd === "exit") {
      setIsOpen(false);
      return;
    }

    // execute via api
    executeMutation.mutate({ command: cmd });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleCommand(input);
      setInput("");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex < commandHistory.length - 1 
          ? historyIndex + 1 
          : commandHistory.length - 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[commandHistory.length - 1 - newIndex] || "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[commandHistory.length - 1 - newIndex] || "");
      } else {
        setHistoryIndex(-1);
        setInput("");
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setHistory([{
        id: "cleared",
        type: "output",
        content: "terminal cleared\n",
        timestamp: new Date()
      }]);
    }
  };

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [history]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sizeClass = isMaximized 
    ? "fixed inset-4 z-50" 
    : "fixed bottom-6 right-6 w-[600px] h-[400px] z-50";

  return (
    <>
      {/* floating button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 left-6 w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center z-50 shadow-lg"
          >
            <TerminalIcon className="h-6 w-6 text-white" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* terminal window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              y: 0,
              height: isMinimized ? "auto" : undefined
            }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={`${sizeClass} bg-gray-900 rounded-lg shadow-2xl flex flex-col overflow-hidden border border-gray-700`}
          >
            {/* header */}
            <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
              <div className="flex items-center gap-2">
                <TerminalIcon className="h-4 w-4 text-green-400" />
                <span className="text-sm text-gray-300 font-mono">terminal</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-1 hover:bg-gray-700 rounded transition-colors"
                >
                  <Minimize2 className="h-4 w-4 text-gray-400" />
                </button>
                <button
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="p-1 hover:bg-gray-700 rounded transition-colors"
                >
                  <Maximize2 className="h-4 w-4 text-gray-400" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-gray-700 rounded transition-colors"
                >
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>
            </div>

            {/* terminal content */}
            {!isMinimized && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div 
                  ref={terminalRef}
                  className="flex-1 overflow-y-auto p-4 font-mono text-sm scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
                  onClick={() => inputRef.current?.focus()}
                >
                  {history.map((line) => (
                    <div
                      key={line.id}
                      className={`whitespace-pre-wrap ${
                        line.type === "input" 
                          ? "text-green-400" 
                          : line.type === "error" 
                          ? "text-red-400" 
                          : "text-gray-300"
                      }`}
                    >
                      {line.content}
                    </div>
                  ))}
                  
                  {/* current input line */}
                  <div className="flex items-center gap-2 text-green-400">
                    <span>$</span>
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="flex-1 bg-transparent outline-none text-gray-300"
                      spellCheck={false}
                      autoComplete="off"
                      disabled={executeMutation.isPending}
                    />
                    {executeMutation.isPending && (
                      <motion.span
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                        className="text-gray-500"
                      >
                        ●
                      </motion.span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}