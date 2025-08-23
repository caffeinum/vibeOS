"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, User, RefreshCw, Sparkles, AlertCircle, Terminal, FileText, Edit } from "lucide-react";
import { api } from "@/utils/api";
import { GlassEffect } from "@/components/ui/glass-effect";

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export function DedalusChat() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("openai/gpt-4o-mini");
  const [useLocalTools, setUseLocalTools] = useState(true);
  const [mcpServers, setMcpServers] = useState<string[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // create session mutation
  const createSession = api.dedalus.createSession.useMutation({
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setMessages([]);
    },
  });

  // send message mutation (non-streaming)
  const sendMessage = api.dedalus.sendMessage.useMutation({
    onSuccess: (data) => {
      // Replace the loading message with the actual response
      setMessages(prev => {
        const newMessages = [...prev];
        // Remove the loading message (last message)
        if (newMessages[newMessages.length - 1]?.isStreaming) {
          newMessages[newMessages.length - 1] = data.message;
        } else {
          newMessages.push(data.message);
        }
        return newMessages;
      });
      setIsLoading(false);
    },
    onError: (error) => {
      console.error("failed to send message:", error);
      // Remove the loading message on error
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages[newMessages.length - 1]?.isStreaming) {
          newMessages.pop();
        }
        return newMessages;
      });
      setIsLoading(false);
    },
  });

  // state for current streaming message  
  const [currentStreamMessage, setCurrentStreamMessage] = useState("");

  // check status query
  const { data: statusData } = api.dedalus.checkStatus.useQuery();

  // auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // create initial session on mount
  useEffect(() => {
    if (!sessionId) {
      createSession.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update streaming message display
  useEffect(() => {
    if (streamingContent && messages[messages.length - 1]?.isStreaming) {
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          ...newMessages[newMessages.length - 1],
          content: streamingContent,
        };
        return newMessages;
      });
    }
  }, [streamingContent, messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !sessionId || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const messageToSend = inputMessage;
    setInputMessage("");
    setIsLoading(true);

    // Add a loading message placeholder
    const loadingMessage: Message = {
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };
    setMessages(prev => [...prev, loadingMessage]);

    // use non-streaming mutation for now
    sendMessage.mutate({
      sessionId,
      message: messageToSend,
      model: selectedModel,
      mcpServers,
      useLocalTools,
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleNewSession = () => {
    createSession.mutate();
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const toggleMcpServer = (server: string) => {
    setMcpServers(prev => 
      prev.includes(server) 
        ? prev.filter(s => s !== server)
        : [...prev, server]
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* header */}
      <div className="p-6 pb-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                dedalus ai
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {statusData?.connected ? 
                  <span className="text-green-600 dark:text-green-400">● connected</span> : 
                  <span className="text-yellow-600 dark:text-yellow-400">● api key required</span>
                }
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleNewSession}
              className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </motion.button>
          </div>
        </div>

        {/* tools and model selection */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="px-3 py-1 text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="openai/gpt-4o-mini">gpt-4o-mini</option>
            <option value="openai/gpt-4o">gpt-4o</option>
            <option value="anthropic/claude-3-5-sonnet">claude-3.5-sonnet</option>
            <option value="google/gemini-pro">gemini-pro</option>
          </select>

          <button
            onClick={() => setUseLocalTools(!useLocalTools)}
            className={`px-3 py-1 text-sm rounded-lg flex items-center gap-1 transition-colors ${
              useLocalTools 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-gray-100 dark:bg-gray-800/30 text-gray-600 dark:text-gray-400'
            }`}
          >
            <Terminal className="h-3 w-3" />
            local tools
          </button>

          <button
            onClick={() => toggleMcpServer('tsion/brave-search-mcp')}
            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
              mcpServers.includes('tsion/brave-search-mcp')
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'bg-gray-100 dark:bg-gray-800/30 text-gray-600 dark:text-gray-400'
            }`}
          >
            brave search
          </button>
        </div>
      </div>

      {/* messages area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="h-12 w-12 text-gray-400 dark:text-gray-600 mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              start a conversation with dedalus ai
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              streaming enabled • local tools available
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {messages.map((message, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                )}
                
                <div className={`max-w-[70%] ${
                  message.role === 'user' 
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100' 
                    : 'bg-white/70 dark:bg-gray-800/70 text-gray-900 dark:text-gray-100'
                } backdrop-blur-sm rounded-2xl px-4 py-3 border ${
                  message.role === 'user'
                    ? 'border-blue-200 dark:border-blue-800'
                    : 'border-gray-200 dark:border-gray-700'
                }`}>
                  <p className="text-sm whitespace-pre-wrap">
                    {message.content || (message.isStreaming && (
                      <span className="flex items-center gap-1">
                        <span className="text-gray-500 dark:text-gray-400">thinking</span>
                        <span className="flex gap-1">
                          <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      </span>
                    ))}
                  </p>
                  {!message.isStreaming && (
                    <p className="text-xs opacity-50 mt-2">
                      {formatTime(message.timestamp)}
                    </p>
                  )}
                </div>
                
                {message.role === 'user' && (
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4 text-white" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* api status warning */}
      {statusData && !statusData.connected && (
        <div className="mx-6 mb-2 px-4 py-2 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-yellow-800 dark:text-yellow-200">
            <AlertCircle className="h-4 w-4" />
            <span>{statusData.message}</span>
          </div>
        </div>
      )}

      {/* input area */}
      <div className="p-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="type your message..."
            disabled={isLoading || !sessionId}
            autoFocus
            className="flex-1 px-4 py-3 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 disabled:opacity-50"
          />
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleSendMessage()}
            disabled={!inputMessage.trim() || isLoading || !sessionId}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-medium hover:from-purple-600 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
            send
          </motion.button>
        </div>
      </div>
    </div>
  );
}