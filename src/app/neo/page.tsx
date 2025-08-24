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
import { Apple, Wifi, Battery, Search, Zap, Shield, Gamepad2, Cpu, HardDrive, Network, Settings, MessageSquare, FileText, Globe, Terminal as LucideTerminal, Download } from "lucide-react";

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
    { id: 'finder', name: 'SYSTEM', icon: <HardDrive className="w-8 h-8" />, color: 'from-red-600 to-red-800', borderColor: 'border-red-500' },
    { id: 'browser', name: 'NETWORK', icon: <Globe className="w-8 h-8" />, color: 'from-red-500 to-red-700', borderColor: 'border-red-400' },
    { id: 'claude', name: 'COMMS', icon: <MessageSquare className="w-8 h-8" />, color: 'from-red-700 to-red-900', borderColor: 'border-red-600' },
    { id: 'dedalus', name: 'AI CORE', icon: <Cpu className="w-8 h-8" />, color: 'from-red-800 to-black', borderColor: 'border-red-700' },
    { id: 'notes', name: 'LOG', icon: <FileText className="w-8 h-8" />, color: 'from-red-600 to-red-800', borderColor: 'border-red-500' },
    { id: 'terminal', name: 'CONSOLE', icon: <LucideTerminal className="w-8 h-8" />, color: 'from-gray-800 to-black', borderColor: 'border-gray-600' },
    { id: 'native-terminal', name: 'SHELL', icon: <LucideTerminal className="w-8 h-8" />, color: 'from-gray-700 to-gray-900', borderColor: 'border-gray-500' },
    { id: 'downloads', name: 'CACHE', icon: <Download className="w-8 h-8" />, color: 'from-red-500 to-red-700', borderColor: 'border-red-400' },
    { id: 'gcp', name: 'CLOUD', icon: <Network className="w-8 h-8" />, color: 'from-red-600 to-red-800', borderColor: 'border-red-500' },
    { id: 'settings', name: 'CONFIG', icon: <Settings className="w-8 h-8" />, color: 'from-gray-600 to-gray-800', borderColor: 'border-gray-500' },
  ];

  return (
    <main className="h-screen w-screen overflow-hidden relative flex flex-col bg-black" 
      style={{
        background: `
          radial-gradient(circle at 20% 80%, rgba(220, 38, 38, 0.3) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, rgba(185, 28, 28, 0.4) 0%, transparent 50%),
          radial-gradient(circle at 40% 40%, rgba(239, 68, 68, 0.2) 0%, transparent 50%),
          radial-gradient(circle at 90% 90%, rgba(220, 38, 38, 0.3) 0%, transparent 50%),
          linear-gradient(135deg, #000000 0%, #1a0000 50%, #000000 100%)
        `,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Hackers-style Grid Background */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(220, 38, 38, 0.15) 1px, transparent 1px),
            linear-gradient(90deg, rgba(220, 38, 38, 0.15) 1px, transparent 1px),
            radial-gradient(circle at 25% 25%, rgba(220, 38, 38, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 75% 75%, rgba(220, 38, 38, 0.1) 0%, transparent 50%)
          `,
          backgroundSize: '30px 30px, 30px 30px, 200px 200px, 200px 200px'
        }} />
      </div>
      
      {/* Additional Cyberpunk Grid Lines */}
      <div className="absolute inset-0 opacity-15">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(45deg, rgba(220, 38, 38, 0.08) 1px, transparent 1px),
            linear-gradient(-45deg, rgba(220, 38, 38, 0.08) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px'
        }} />
      </div>
      
      {/* Scattered Data Points */}
      <div className="absolute inset-0">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-red-500/40 animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${1 + Math.random()}s`
            }}
          />
        ))}
      </div>
      
      {/* Matrix-style Falling Characters */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="absolute text-red-500/20 font-mono text-xs animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `-20px`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 2}s`
            }}
          >
            {['01', '10', '11', '00', 'FF', 'AA', '55', 'CC'][Math.floor(Math.random() * 8)]}
          </div>
        ))}
      </div>
      
      {/* Status Bar */}
      <div className="fixed top-0 left-0 right-0 h-12 z-50 bg-gradient-to-r from-black via-red-900/80 to-black border-b-2 border-red-600/50 backdrop-blur-sm">
        <div className="h-full w-full flex items-center justify-between px-6 text-red-400 text-sm font-mono">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-red-500 animate-pulse" />
              <span className="font-bold text-lg text-red-400 tracking-wider">NEO-OS</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-red-500" />
              <span className="text-xs">SECURE</span>
            </div>
            <div className="flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-red-500" />
              <span className="text-xs">GAMING</span>
            </div>
            <Wifi className="w-4 h-4 text-red-500" />
            <Battery className="w-4 h-4 text-red-500" />
            <span className="font-mono font-semibold text-red-400 border border-red-600/50 px-2 py-1 rounded">
              {formatTime(currentTime)}
            </span>
          </div>
        </div>
      </div>
      
      {/* App Grid */}
      <div className="flex-1 relative overflow-hidden pt-16">
        <div className="h-full p-8">
          <div className="grid grid-cols-4 gap-8 max-w-none">
            {appIcons.map((app, index) => (
                              <motion.div
                  key={app.id}
                  initial={{ scale: 0, opacity: 0, y: 50, x: Math.random() * 100 - 50 }}
                  animate={{ scale: 1, opacity: 1, y: 0, x: 0 }}
                  transition={{ 
                    delay: index * 0.1,
                    type: "spring",
                    stiffness: 300,
                    damping: 25
                  }}
                  whileHover={{ 
                    scale: 1.15,
                    y: -10,
                    transition: { duration: 0.2 }
                  }}
                  whileTap={{ scale: 0.95 }}
                  className="flex flex-col items-center"
                  style={{
                    transform: `translate(${Math.sin(index) * 20}px, ${Math.cos(index) * 15}px)`
                  }}
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
                    w-28 h-28 rounded-2xl shadow-2xl 
                    bg-gradient-to-br ${app.color}
                    flex items-center justify-center
                    transform transition-all duration-300
                    hover:shadow-red-500/50 hover:shadow-2xl
                    border-2 ${app.borderColor}
                    backdrop-blur-sm
                    relative overflow-hidden
                    group
                  `}
                  style={{
                    boxShadow: `0 0 30px rgba(220, 38, 38, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                  }}
                >
                  {/* Glow effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  
                  {/* Icon */}
                  <div className="w-10 h-10 text-red-100 relative z-10 group-hover:text-white transition-colors duration-300">
                    {app.icon}
                  </div>
                  
                  {/* Scan line effect */}
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-pulse" />
                </motion.button>
                
                <motion.div 
                  className="mt-4 text-center"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 + 0.2 }}
                >
                  <span className="text-red-400 font-mono font-bold text-sm tracking-wider drop-shadow-lg">
                    {app.name}
                  </span>
                  <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent mx-auto mt-2 opacity-60" />
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
        
        {/* App Windows */}
        <AnimatePresence>
          {activeApp === 'finder' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 50 }}
              className="absolute top-10 left-10 z-20"
            >
              <GlassWindow 
                title="SYSTEM" 
                onClose={() => setActiveApp(null)}
                className="w-[800px] border-2 border-red-600/50"
              >
                {useEnhancedBrowser ? <FileBrowserEnhanced /> : <FileBrowser />}
              </GlassWindow>
            </motion.div>
          )}
          
          {activeApp === 'downloads' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 50 }}
              className="absolute top-10 left-10 z-20"
            >
              <GlassWindow 
                title="CACHE" 
                onClose={() => setActiveApp(null)}
                className="w-[600px] border-2 border-red-600/50"
              >
                <DownloadTinder />
              </GlassWindow>
            </motion.div>
          )}
          
          {activeApp === 'gcp' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 50 }}
              className="absolute top-10 left-10 z-20"
            >
              <GlassWindow 
                title="CLOUD" 
                onClose={() => setActiveApp(null)}
                className="w-[900px] border-2 border-red-600/50"
              >
                <GCPVMList />
              </GlassWindow>
            </motion.div>
          )}
          
          {activeApp === 'dedalus' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 50 }}
              className="absolute top-10 left-10 z-20"
            >
              <GlassWindow 
                title="AI CORE" 
                onClose={() => setActiveApp(null)}
                className="w-[700px] border-2 border-red-600/50"
              >
                <div className="h-[500px]">
                  <DedalusChat />
                </div>
              </GlassWindow>
            </motion.div>
          )}
          
          {activeApp === 'notes' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 50 }}
              className="absolute top-10 left-10 z-20"
            >
              <GlassWindow 
                title="LOG" 
                onClose={() => setActiveApp(null)}
                className="w-[1200px] h-[700px] border-2 border-red-600/50"
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