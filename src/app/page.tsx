"use client";

import type { ClaudeRequest } from "@/claude-code-handler";
import { api } from "@/utils/api";
import type { SDKMessage } from "@anthropic-ai/claude-code";
import { useState } from "react";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<SDKMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [continueSession, setContinueSession] = useState(false);
  const [maxTurns, setMaxTurns] = useState(3);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const clickMutation = api.click.sendToClaudeCode.useMutation({
    onSuccess: (data) => {
      if (data.success && data.results) {
        setMessages(data.results);
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
    const baseClasses = "p-4 rounded-lg mb-2";

    if (msg.type === "user") {
      return (
        <div
          key={index}
          className={`${baseClasses} bg-gray-700 ml-auto max-w-3xl`}
        >
          <div className="text-xs text-gray-400 mb-1">user</div>
          <div className="text-white">
            {msg.message?.content?.[0]?.text || "no content"}
          </div>
        </div>
      );
    }

    if (msg.type === "assistant") {
      return (
        <div
          key={index}
          className={`${baseClasses} bg-blue-900/30 mr-auto max-w-3xl`}
        >
          <div className="text-xs text-blue-400 mb-1">assistant</div>
          <div className="text-white">
            {msg.message?.content?.map(
              (
                c: { type: string; text: string; name: string; input: unknown },
                i: number
              ) => (
                <div key={i}>
                  {c.type === "text" && (
                    <div className="whitespace-pre-wrap">{c.text}</div>
                  )}
                  {c.type === "tool_use" && (
                    <div className="bg-gray-800 p-2 rounded mt-2">
                      <div className="text-xs text-yellow-400">
                        tool: {c.name}
                      </div>
                      <pre className="text-xs text-gray-400 mt-1">
                        {JSON.stringify(c.input, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      );
    }

    if (msg.type === "result") {
      return (
        <div
          key={index}
          className={`${baseClasses} bg-green-900/30 border border-green-700`}
        >
          <div className="text-xs text-green-400 mb-1">
            result ({msg.subtype})
          </div>

          <div className="text-xs text-gray-400 mt-2">
            <div>turns: {msg.num_turns}</div>
            <div>cost: ${msg.total_cost_usd?.toFixed(4)}</div>
            <div>session: {msg.session_id?.slice(0, 8)}...</div>
          </div>
        </div>
      );
    }

    if (msg.type === "system") {
      return (
        <div
          key={index}
          className={`${baseClasses} bg-purple-900/20 border border-purple-700`}
        >
          <div className="text-xs text-purple-400 mb-1">system init</div>
          <div className="text-xs text-gray-300">
            <div>model: {msg.model}</div>
            <div>cwd: {msg.cwd}</div>
            <div>tools: {msg.tools?.length} available</div>
          </div>
        </div>
      );
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">claude os</h1>

        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex flex-col gap-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="enter a prompt for claude code..."
              className="w-full p-4 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 min-h-[150px]"
            />

            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={continueSession}
                  onChange={(e) => setContinueSession(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">continue last session</span>
              </label>

              <div className="flex items-center gap-2">
                <label className="text-sm">max turns:</label>
                <input
                  type="number"
                  value={maxTurns}
                  onChange={(e) => setMaxTurns(parseInt(e.target.value) || 3)}
                  min="1"
                  max="10"
                  className="w-16 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm"
                />
              </div>

              {sessionId && !continueSession && (
                <div className="text-sm text-gray-400">
                  session: {sessionId.slice(0, 8)}...
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || !prompt}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              {isLoading ? "processing..." : "send to claude code"}
            </button>
          </div>
        </form>

        {error && (
          <div className="bg-red-900/30 border border-red-700 p-4 rounded-lg mb-4">
            <div className="text-red-400 text-sm">error: {error}</div>
          </div>
        )}

        {messages.length > 0 && (
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">conversation:</h2>
            <div className="space-y-2">
              {messages.map((msg, index) => renderMessage(msg, index))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
