'use client';

import { useState } from 'react';
import { api } from '@/utils/api';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [continueSession, setContinueSession] = useState(false);
  const [maxTurns, setMaxTurns] = useState(3);
  const [isLoading, setIsLoading] = useState(false);

  const clickMutation = api.click.sendToClaudeCode.useMutation({
    onSuccess: (data) => {
      setResponse(JSON.stringify(data, null, 2));
      
      // extract session id from response
      if (data.success && data.results) {
        const sessionResult = data.results.find((r: any) => r.session_id);
        if (sessionResult) {
          setSessionId(sessionResult.session_id);
        }
      }
      
      setIsLoading(false);
    },
    onError: (error) => {
      setResponse(`Error: ${error.message}`);
      setIsLoading(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    const params: any = { prompt, maxTurns };
    
    if (continueSession) {
      params.continueSession = true;
    } else if (sessionId) {
      params.sessionId = sessionId;
    }
    
    clickMutation.mutate(params);
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
              {isLoading ? 'processing...' : 'send to claude code'}
            </button>
          </div>
        </form>

        {response && (
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">response:</h2>
            <pre className="whitespace-pre-wrap text-sm text-gray-300 overflow-x-auto">{response}</pre>
          </div>
        )}
      </div>
    </main>
  );
}