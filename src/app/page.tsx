"use client";

import { ClaudeChat } from "@/components/claude-chat";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-4 text-gray-800">claude os</h1>
        <p className="text-gray-600 mb-8">
          click the floating chat button in the bottom-right corner to interact with claude code.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-700">features</h2>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>• ai-powered code assistance</li>
              <li>• session management & continuity</li>
              <li>• real-time code execution</li>
              <li>• syntax highlighted responses</li>
              <li>• copy code functionality</li>
              <li>• smooth animations</li>
              <li>• responsive design</li>
            </ul>
          </div>
          
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-700">usage</h2>
            <div className="text-sm text-gray-600 space-y-2">
              <p>the chatbox appears in the bottom right corner by default.</p>
              <p>you can continue previous sessions or start new ones.</p>
              <p>messages support both text and code blocks with copy functionality.</p>
              <p>adjust max turns to control conversation length.</p>
            </div>
          </div>
        </div>

        <div className="mt-12 p-6 bg-white/50 backdrop-blur-sm rounded-2xl shadow-sm">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">quick tips</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
            <div className="flex items-start gap-2">
              <span className="text-blue-500">💡</span>
              <p>use shift+enter for multi-line messages</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500">🔄</span>
              <p>check &quot;continue&quot; to resume last session</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-500">📋</span>
              <p>click code blocks to copy content</p>
            </div>
          </div>
        </div>
      </div>
      
      <ClaudeChat position="bottom-right" size="lg" />
    </main>
  );
}