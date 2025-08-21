"use client";

import type { ClaudeRequest } from "@/claude-code-handler";
import { api } from "@/utils/api";
import type { SDKMessage } from "@anthropic-ai/claude-code";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Copy, Bot } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface ClaudeChatProps {
  position?: "bottom-right" | "bottom-left";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ClaudeChat({ 
  position = "bottom-right", 
  size = "md",
  className 
}: ClaudeChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<SDKMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [continueSession, setContinueSession] = useState(false);
  const [maxTurns, setMaxTurns] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [copiedCode, setCopiedCode] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const sizeConfig = {
    sm: "w-80 h-96",
    md: "w-96 h-[500px]",
    lg: "w-[420px] h-[600px]"
  };

  const positionConfig = {
    "bottom-right": "bottom-6 right-6",
    "bottom-left": "bottom-6 left-6"
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const clickMutation = api.click.sendToClaudeCode.useMutation({
    onSuccess: (data) => {
      if (data.success && data.results) {
        // Append new messages to existing ones (keep user message)
        setMessages(prev => {
          const lastUserIndex = prev.findLastIndex(m => m.type === "user");
          if (lastUserIndex >= 0) {
            return [...prev.slice(0, lastUserIndex + 1), ...data.results];
          }
          return data.results;
        });
        setError("");

        // extract session id from response
        const sessionResult = data.results.find(
          (r: SDKMessage) => r.session_id
        );
        if (sessionResult) {
          setSessionId(sessionResult.session_id);
        }
      }
      setIsLoading(false);
    },
    onError: (error) => {
      setError(error.message);
      setIsLoading(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    
    // Add user message to display immediately
    const userMessage: SDKMessage = {
      type: "user" as const,
      message: {
        role: "user",
        content: [{ type: "text", text: prompt }]
      },
      session_id: sessionId || "temp",
      parent_tool_use_id: null
    } as SDKMessage;
    
    setMessages(prev => [...prev, userMessage]);
    setPrompt("");
    setIsLoading(true);

    const params: ClaudeRequest = { prompt, maxTurns };

    if (continueSession) {
      params.continueSession = true;
    } else if (sessionId) {
      params.sessionId = sessionId;
    }

    clickMutation.mutate(params);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as React.FormEvent);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(""), 2000);
  };

  const renderMessage = (msg: SDKMessage, index: number) => {
    if (msg.type === "user") {
      return (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex mb-3 justify-end"
        >
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="max-w-[75%] ml-12"
          >
            <div className="px-4 py-2 rounded-2xl bg-blue-500 text-white rounded-br-md">
              <p className="text-sm">
                {msg.message?.content?.[0]?.text || "no content"}
              </p>
            </div>
          </motion.div>
        </motion.div>
      );
    }

    if (msg.type === "assistant") {
      return (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex mb-3 justify-start"
        >
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="max-w-[75%] mr-12"
          >
            <div className="px-4 py-2 rounded-2xl bg-gray-200 text-gray-900 rounded-bl-md">
              {msg.message?.content?.map(
                (
                  c: { type: string; text: string; name: string; input: unknown },
                  i: number
                ) => (
                  <div key={i}>
                    {c.type === "text" && (
                      <p className="text-sm whitespace-pre-wrap">{c.text}</p>
                    )}
                    {c.type === "tool_use" && (
                      <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="mt-2 relative bg-gray-800/90 backdrop-blur-sm rounded-xl overflow-hidden"
                      >
                        <div className="bg-gray-700/50 px-3 py-1 text-xs text-gray-300 border-b border-gray-600/50 flex justify-between items-center">
                          <span>tool: {c.name}</span>
                          <button
                            onClick={() => copyToClipboard(JSON.stringify(c.input, null, 2))}
                            className="p-1 hover:bg-gray-600/50 rounded transition-colors"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                        <pre className="p-3 text-xs text-gray-200 overflow-x-auto">
                          <code>{JSON.stringify(c.input, null, 2)}</code>
                        </pre>
                      </motion.div>
                    )}
                  </div>
                )
              )}
            </div>
          </motion.div>
        </motion.div>
      );
    }

    if (msg.type === "result") {
      return (
        <motion.div
          key={index}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex mb-3 justify-center"
        >
          <div className="px-3 py-1 rounded-full bg-green-500/20 backdrop-blur-sm border border-green-500/30">
            <div className="text-xs text-green-600">
              ✓ completed • {msg.num_turns} turns • ${msg.total_cost_usd?.toFixed(4)}
            </div>
          </div>
        </motion.div>
      );
    }

    if (msg.type === "system") {
      return (
        <motion.div
          key={index}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex mb-3 justify-center"
        >
          <div className="px-3 py-1 rounded-full bg-purple-500/20 backdrop-blur-sm border border-purple-500/30">
            <div className="text-xs text-purple-600 flex items-center gap-1">
              <Bot className="h-3 w-3" />
              {msg.model} • {msg.tools?.length} tools
            </div>
          </div>
        </motion.div>
      );
    }

    return null;
  };

  return (
    <div className={`fixed z-50 ${positionConfig[position]} ${className || ""}`}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={chatRef}
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={`backdrop-blur-sm bg-transparent rounded-2xl flex flex-col overflow-hidden ${sizeConfig[size]}`}
          >

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200"
                >
                  <p className="text-xs text-red-600">{error}</p>
                </motion.div>
              )}
              
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <Bot className="h-12 w-12 mb-3" />
                  <p className="text-sm">start a conversation with claude code</p>
                </div>
              )}
              
              {messages.map((msg, index) => renderMessage(msg, index))}
              
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex justify-start"
                >
                  <div className="bg-gray-200 rounded-2xl px-4 py-2 rounded-bl-md">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                    </div>
                  </div>
                </motion.div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 bg-white/50">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <div className="flex gap-2 mb-2">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={continueSession}
                        onChange={(e) => setContinueSession(e.target.checked)}
                        className="w-3 h-3 rounded border-gray-300"
                      />
                      <span className="text-xs text-gray-600">continue</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-600">turns:</span>
                      <input
                        type="number"
                        value={maxTurns}
                        onChange={(e) => setMaxTurns(parseInt(e.target.value) || 20)}
                        min="1"
                        max="100"
                        className="w-12 px-1 py-0.5 text-xs bg-gray-100 rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="message claude code..."
                    className="w-full px-4 py-2 text-sm bg-gray-50 rounded-full border border-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    disabled={isLoading}
                    rows={1}
                  />
                </div>
                <motion.button
                  type="submit"
                  disabled={isLoading || !prompt.trim()}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-3 py-2 bg-blue-500 text-white text-sm rounded-full hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center h-9 w-9"
                >
                  <Send className="h-4 w-4" />
                </motion.button>
              </div>
            </form>
            
            {copiedCode && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-20 right-4 bg-gray-800 text-white text-xs px-3 py-1 rounded-lg"
              >
                copied!
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            onClick={() => setIsOpen(true)}
            className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <MessageCircle className="h-6 w-6 text-white" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}