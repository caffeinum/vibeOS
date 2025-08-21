"use client";

import type { ClaudeRequest } from "@/claude-code-handler";
import { api } from "@/utils/api";
import type { SDKMessage } from "@anthropic-ai/claude-code";
import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<SDKMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [continueSession, setContinueSession] = useState(false);
  const [maxTurns, setMaxTurns] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
          // Find the last user message we added
          const lastUserIndex = prev.findLastIndex(m => m.type === "user");
          if (lastUserIndex >= 0) {
            // Keep messages up to and including the last user message, then add new results
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
    } as any;
    
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

  const renderMessage = (msg: SDKMessage, index: number) => {
    if (msg.type === "user") {
      return (
        <div key={index} className="flex mb-3 justify-end">
          <div className="max-w-[75%] ml-12">
            <div className="px-4 py-2 rounded-2xl bg-blue-500 text-white rounded-br-md">
              <p className="text-sm">
                {msg.message?.content?.[0]?.text || "no content"}
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (msg.type === "assistant") {
      return (
        <div key={index} className="flex mb-3 justify-start">
          <div className="max-w-[75%] mr-12">
            <div className="px-4 py-2 rounded-2xl bg-gray-800/80 backdrop-blur-sm text-white rounded-bl-md">
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
                      <div className="mt-2 rounded-2xl bg-black/20 backdrop-blur-sm p-3 text-sm">
                        <div className="mb-2 text-xs text-white/60">
                          tool: {c.name}
                        </div>
                        <pre className="overflow-x-auto text-white/90 text-xs">
                          <code>{JSON.stringify(c.input, null, 2)}</code>
                        </pre>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      );
    }

    if (msg.type === "result") {
      return (
        <div key={index} className="flex mb-3 justify-center">
          <div className="px-3 py-1 rounded-full bg-green-500/20 backdrop-blur-sm">
            <div className="text-xs text-green-400">
              completed • {msg.num_turns} turns • ${msg.total_cost_usd?.toFixed(4)}
            </div>
          </div>
        </div>
      );
    }

    if (msg.type === "system") {
      return (
        <div key={index} className="flex mb-3 justify-center">
          <div className="px-3 py-1 rounded-full bg-purple-500/20 backdrop-blur-sm">
            <div className="text-xs text-purple-400">
              system • {msg.model} • {msg.tools?.length} tools
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-800">claude os</h1>
        <p className="text-gray-600">
          click the floating chat button in the bottom-right corner to interact with claude code.
        </p>
      </div>

      <div className="fixed bottom-6 right-6 z-50">
        {!isOpen ? (
          <button
            onClick={() => setIsOpen(true)}
            className="h-14 w-14 rounded-full bg-blue-500 shadow-lg hover:bg-blue-600 transition-all duration-200 flex items-center justify-center hover:scale-105"
          >
            <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4z" />
            </svg>
          </button>
        ) : (
          <div className="absolute bottom-0 right-0 w-96 h-[600px] bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/20">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">claude code</span>
                {sessionId && (
                  <span className="text-xs text-white/60">
                    {sessionId.slice(0, 8)}...
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {error && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/20 backdrop-blur-sm">
                  <p className="text-xs text-red-300">{error}</p>
                </div>
              )}
              
              {messages.map((msg, index) => renderMessage(msg, index))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="p-4 border-t border-white/20">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <div className="flex gap-2 mb-2">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={continueSession}
                        onChange={(e) => setContinueSession(e.target.checked)}
                        className="w-3 h-3"
                      />
                      <span className="text-xs text-white/60">continue</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-white/60">turns:</span>
                      <input
                        type="number"
                        value={maxTurns}
                        onChange={(e) => setMaxTurns(parseInt(e.target.value) || 20)}
                        min="1"
                        max="100"
                        className="w-12 px-1 py-0.5 text-xs bg-white/20 backdrop-blur-sm rounded text-white focus:outline-none"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="message claude code..."
                    className="w-full px-4 py-2 text-sm bg-white/20 backdrop-blur-sm rounded-full text-white placeholder-white/60 focus:outline-none"
                    disabled={isLoading}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !prompt.trim()}
                  className="px-4 py-2 bg-blue-500 text-white text-sm rounded-full hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? "..." : "send"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
