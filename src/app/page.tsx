"use client";

import { ClaudeChat } from "@/components/claude-chat";
import { FileBrowser } from "@/components/file-browser";
import { FileBrowserEnhanced } from "@/components/file-browser-enhanced";
import { DownloadTinder } from "@/components/download-tinder";
import { GCPVMList } from "@/components/gcp-vm-list";
import { DarkModeToggle } from "@/components/dark-mode-toggle";
import { Terminal } from "@/components/terminal";
import { useState } from "react";

export default function Home() {
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [showDownloadTinder, setShowDownloadTinder] = useState(false);
  const [showGCPVMs, setShowGCPVMs] = useState(false);
  const [useEnhancedBrowser, setUseEnhancedBrowser] = useState(true);

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-4xl font-bold text-gray-800">claude os</h1>
          <DarkModeToggle />
        </div>
        <p className="text-gray-600 mb-8">
          click the floating chat button in the bottom-right corner to interact with claude code,
          or use the terminal in the bottom-left corner to execute commands.
        </p>
        
        <div className="mb-8 flex gap-4 flex-wrap">
          <button
            onClick={() => {
              setShowFileBrowser(!showFileBrowser);
              setShowDownloadTinder(false);
              setShowGCPVMs(false);
            }}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all duration-200 transform hover:scale-105"
          >
            {showFileBrowser ? 'hide' : 'show'} file browser
          </button>
          
          <button
            onClick={() => {
              setShowDownloadTinder(!showDownloadTinder);
              setShowFileBrowser(false);
              setShowGCPVMs(false);
            }}
            className="px-6 py-3 bg-gradient-to-r from-pink-500 to-red-500 text-white rounded-lg hover:shadow-lg transition-all duration-200 transform hover:scale-105"
          >
            {showDownloadTinder ? 'hide' : 'clean'} downloads
          </button>
          
          <button
            onClick={() => {
              setShowGCPVMs(!showGCPVMs);
              setShowFileBrowser(false);
              setShowDownloadTinder(false);
            }}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition-all duration-200 transform hover:scale-105"
          >
            {showGCPVMs ? 'hide' : 'show'} gcp vms
          </button>
          
          {showFileBrowser && (
            <button
              onClick={() => setUseEnhancedBrowser(!useEnhancedBrowser)}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-lg hover:shadow-lg transition-all duration-200 transform hover:scale-105"
            >
              use {useEnhancedBrowser ? 'simple' : 'enhanced'} view
            </button>
          )}
        </div>

        {showFileBrowser && (
          <div className="mb-8">
            {useEnhancedBrowser ? <FileBrowserEnhanced /> : <FileBrowser />}
          </div>
        )}
        
        {showDownloadTinder && (
          <div className="mb-8">
            <DownloadTinder />
          </div>
        )}
        
        {showGCPVMs && (
          <div className="mb-8">
            <GCPVMList />
          </div>
        )}
        
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
      <Terminal />
    </main>
  );
}