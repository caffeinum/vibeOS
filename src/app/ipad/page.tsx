"use client";

import { ClaudeChat } from "@/components/claude-chat";
import { FileBrowser } from "@/components/file-browser";
import { FileBrowserEnhanced } from "@/components/file-browser-enhanced";
import { DownloadTinder } from "@/components/download-tinder";
import { GCPVMList } from "@/components/gcp-vm-list";
import { DarkModeToggle } from "@/components/dark-mode-toggle";
import { Terminal } from "@/components/terminal";
import NativeTerminal from "@/components/NativeTerminal";
import { Browser } from "@/components/browser";
import { DedalusChat } from "@/components/dedalus-chat";
import { NotesApp } from "@/components/notes-app";
import { FinderIcon, SafariIcon, MessagesIcon, TerminalIcon as MacTerminalIcon, SystemPreferencesIcon, DownloadsIcon, CloudIcon, DedalusIcon, NotesIcon } from "@/components/macos-icons";
import { GlassEffect, GlassWindow, GlassFilter } from "@/components/ui/glass-effect";
import { Toaster } from "@/components/ui/sonner";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Apple, Wifi, Battery, Search } from "lucide-react";

export default function Home() {
  const [activeApp, setActiveApp] = useState<string | null>(null);
  const [useEnhancedBrowser] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showClaude, setShowClaude] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showNativeTerminal, setShowNativeTerminal] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [, setDarkMode] = useState(false);
  const [browserInitialized, setBrowserInitialized] = useState(false);
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize browser immediately when page loads
  useEffect(() => {
    setBrowserInitialized(true);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };
  
  const appIcons = [
    { id: 'finder', name: 'Finder', icon: <FinderIcon />, color: 'from-blue-400 to-blue-600' },
    { id: 'browser', name: 'Safari', icon: <SafariIcon />, color: 'from-cyan-400 to-blue-500' },
    { id: 'claude', name: 'Messages', icon: <MessagesIcon />, color: 'from-green-400 to-green-600' },
    { id: 'dedalus', name: 'Dedalus AI', icon: <DedalusIcon />, color: 'from-purple-400 to-purple-600' },
    { id: 'notes', name: 'Notes', icon: <NotesIcon />, color: 'from-yellow-400 to-orange-500' },
    { id: 'terminal', name: 'Command Palette', icon: <MacTerminalIcon />, color: 'from-gray-600 to-gray-800' },
    { id: 'native-terminal', name: 'Terminal', icon: <MacTerminalIcon />, color: 'from-gray-500 to-gray-700' },
    { id: 'downloads', name: 'Downloads', icon: <DownloadsIcon />, color: 'from-blue-500 to-blue-700' },
    { id: 'gcp', name: 'Cloud', icon: <CloudIcon />, color: 'from-sky-400 to-blue-500' },
    { id: 'settings', name: 'System Preferences', icon: <SystemPreferencesIcon />, color: 'from-gray-400 to-gray-600' },
  ];

  return (
    <main className="h-screen w-screen overflow-hidden relative flex flex-col" 
      style={{
        background: `
          radial-gradient(circle at 20% 80%, rgba(255, 182, 193, 0.8) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, rgba(147, 112, 219, 0.8) 0%, transparent 50%),
          radial-gradient(circle at 40% 40%, rgba(255, 218, 185, 0.6) 0%, transparent 50%),
          radial-gradient(circle at 90% 90%, rgba(173, 216, 230, 0.6) 0%, transparent 50%),
          linear-gradient(135deg, #667eea 0%, #764ba2 100%)
        `,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <GlassFilter />
      
      {/* iPad-style Status Bar */}
      <GlassEffect className="fixed top-0 left-0 right-0 h-8 z-50 rounded-none">
        <div className="h-full w-full flex items-center justify-between px-6 text-white text-sm font-medium">
          <div className="flex items-center gap-4">
            <Apple className="w-5 h-5" />
            <span className="font-bold text-lg">Vibe OS</span>
          </div>
          <div className="flex items-center gap-4">
            <Search className="w-4 h-4" />
            <Wifi className="w-4 h-4" />
            <Battery className="w-4 h-4" />
            <span className="font-semibold">{formatTime(currentTime)}</span>
          </div>
        </div>
      </GlassEffect>
      
      {/* iPad-style App Grid */}
      <div className="flex-1 relative overflow-hidden pt-12">
        <div className="h-full flex items-center justify-center">
          <div className="grid grid-cols-3 gap-8 p-8 max-w-4xl">
            {appIcons.map((app, index) => (
              <motion.div
                key={app.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ 
                  delay: index * 0.1,
                  type: "spring",
                  stiffness: 200,
                  damping: 20
                }}
                whileHover={{ 
                  scale: 1.1,
                  rotate: [0, -5, 5, 0],
                  transition: { duration: 0.3 }
                }}
                whileTap={{ scale: 0.95 }}
                className="flex flex-col items-center"
              >
                <motion.button
                  onClick={() => {
                    if (app.id === 'claude') {
                      setShowClaude(prev => !prev);
                    } else if (app.id === 'dedalus') {
                      setActiveApp('dedalus');
                    } else if (app.id === 'notes') {
                      setActiveApp('notes');
                    } else if (app.id === 'terminal') {
                      setShowTerminal(true);
                    } else if (app.id === 'native-terminal') {
                      setShowNativeTerminal(true);
                    } else if (app.id === 'browser') {
                      setShowBrowser(true);
                    } else if (app.id === 'settings') {
                      setDarkMode(prev => !prev);
                    } else {
                      const newActiveApp = activeApp === app.id ? null : app.id;
                      setActiveApp(newActiveApp);
                    }
                  }}
                  className={`
                    w-24 h-24 rounded-3xl shadow-2xl 
                    bg-gradient-to-br ${app.color}
                    flex items-center justify-center
                    transform transition-all duration-300
                    hover:shadow-3xl hover:shadow-black/30
                    border-4 border-white/20
                    backdrop-blur-sm
                  `}
                >
                  <div className="w-12 h-12 text-white">
                    {app.icon}
                  </div>
                </motion.button>
                <motion.span 
                  className="mt-3 text-white font-bold text-lg drop-shadow-lg"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 + 0.2 }}
                >
                  {app.name}
                </motion.span>
              </motion.div>
            ))}
          </div>
        </div>
        
        {/* App Windows */}
        <AnimatePresence>
          {activeApp === 'finder' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute top-10 left-10 z-20"
            >
              <GlassWindow 
                title="Finder" 
                onClose={() => setActiveApp(null)}
                className="w-[800px]"
              >
                {useEnhancedBrowser ? <FileBrowserEnhanced /> : <FileBrowser />}
              </GlassWindow>
            </motion.div>
          )}
          
          {activeApp === 'downloads' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute top-10 left-10 z-20"
            >
              <GlassWindow 
                title="Downloads" 
                onClose={() => setActiveApp(null)}
                className="w-[600px]"
              >
                <DownloadTinder />
              </GlassWindow>
            </motion.div>
          )}
          
          {activeApp === 'gcp' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute top-10 left-10 z-20"
            >
              <GlassWindow 
                title="GCP VMs" 
                onClose={() => setActiveApp(null)}
                className="w-[900px]"
              >
                <GCPVMList />
              </GlassWindow>
            </motion.div>
          )}
          
          {activeApp === 'dedalus' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute top-10 left-10 z-20"
            >
              <GlassWindow 
                title="Dedalus AI Chat" 
                onClose={() => setActiveApp(null)}
                className="w-[700px]"
              >
                <div className="h-[500px]">
                  <DedalusChat />
                </div>
              </GlassWindow>
            </motion.div>
          )}
          
          {activeApp === 'notes' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute top-10 left-10 z-20"
            >
              <GlassWindow 
                title="Notes" 
                onClose={() => setActiveApp(null)}
                className="w-[1200px] h-[700px]"
              >
                <div className="h-[600px]">
                  <NotesApp />
                </div>
              </GlassWindow>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Controlled Components */}
      <ClaudeChat
        position="bottom-right"
        size="lg"
        isOpen={showClaude}
        onClose={() => setShowClaude(false)}
      />
      <Terminal
        isOpen={showTerminal}
        onClose={() => setShowTerminal(false)}
      />
      <NativeTerminal
        isOpen={showNativeTerminal}
        onClose={() => setShowNativeTerminal(false)}
      />
      <Browser
        isOpen={showBrowser}
        onClose={() => setShowBrowser(false)}
        initialized={browserInitialized}
      />
      <div style={{ display: 'none' }}>
        <DarkModeToggle />
      </div>
      
      {/* Toast Notifications */}
      <Toaster position="top-center" />
    </main>
  );
}