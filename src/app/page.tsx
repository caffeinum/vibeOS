"use client";

import { ClaudeChat } from "@/components/claude-chat";
import { FileBrowser } from "@/components/file-browser";
import { FileBrowserEnhanced } from "@/components/file-browser-enhanced";
import { DownloadTinder } from "@/components/download-tinder";
import { GCPVMList } from "@/components/gcp-vm-list";
import { DarkModeToggle } from "@/components/dark-mode-toggle";
import { Terminal } from "@/components/terminal";
import { CryptoTracker } from "@/components/crypto-tracker";
import { Browser } from "@/components/browser";
import { MacOSDock } from "@/components/macos-dock";
import { FinderIcon, SafariIcon, MessagesIcon, TerminalIcon as MacTerminalIcon, SystemPreferencesIcon, DownloadsIcon, CloudIcon } from "@/components/macos-icons";
import { GlassEffect, GlassWindow, GlassDock, GlassButton, GlassFilter } from "@/components/ui/glass-effect";
import { Toaster } from "@/components/ui/sonner";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Folder, Download, Cloud, Settings, MessageCircle, Terminal as TerminalIcon, Apple, Wifi, Battery, Search, Globe } from "lucide-react";

export default function Home() {
  const [activeApp, setActiveApp] = useState<string | null>(null);
  const [useEnhancedBrowser] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showClaude, setShowClaude] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
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
  
  const dockApps = [
    { id: 'finder', name: 'Finder', icon: <FinderIcon /> },
    { id: 'browser', name: 'Safari', icon: <SafariIcon /> },
    { id: 'claude', name: 'Messages', icon: <MessagesIcon /> },
    { id: 'terminal', name: 'Terminal', icon: <MacTerminalIcon /> },
    { id: 'downloads', name: 'Downloads', icon: <DownloadsIcon /> },
    { id: 'gcp', name: 'Cloud', icon: <CloudIcon /> },
    { id: 'settings', name: 'System Preferences', icon: <SystemPreferencesIcon /> },
  ];

  return (
    <main className="h-screen w-screen overflow-hidden relative flex flex-col" 
      style={{
        backgroundImage: `linear-gradient(to bottom, rgba(147, 112, 219, 0.3), rgba(255, 192, 203, 0.3)), url('https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=2940')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <GlassFilter />
      
      {/* macOS Menu Bar */}
      <div className="fixed top-0 left-0 right-0 h-7 z-50">
        <GlassEffect className="h-full rounded-none">
          <div className="h-full flex items-center justify-between px-4 text-white text-xs font-medium">
            <div className="flex items-center gap-4">
              <Apple className="w-4 h-4" />
              <span className="font-semibold">Claude OS</span>
              <span className="text-white/70">File</span>
              <span className="text-white/70">Edit</span>
              <span className="text-white/70">View</span>
              <span className="text-white/70">Window</span>
              <span className="text-white/70">Help</span>
            </div>
            <div className="flex items-center gap-3">
              <Search className="w-3.5 h-3.5" />
              <Wifi className="w-3.5 h-3.5" />
              <Battery className="w-3.5 h-3.5" />
              <span>{formatTime(currentTime)}</span>
            </div>
          </div>
        </GlassEffect>
      </div>
      
      {/* Desktop */}
      <div className="flex-1 relative overflow-hidden">
        
        {/* Crypto Tracker Widget */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="absolute top-4 right-4 z-10 w-[500px]"
        >
          <CryptoTracker />
        </motion.div>
        
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
        </AnimatePresence>
      </div>
      
      {/* macOS Dock */}
      <MacOSDock
        items={dockApps}
        activeItem={activeApp || (showClaude ? 'claude' : showTerminal ? 'terminal' : showBrowser ? 'browser' : null)}
        onItemClick={(item) => {
          if (item.id === 'claude') {
            setShowClaude(prev => !prev);
          } else if (item.id === 'terminal') {
            setShowTerminal(true);
          } else if (item.id === 'browser') {
            setShowBrowser(true);
          } else if (item.id === 'settings') {
            setDarkMode(prev => !prev);
          } else {
            const newActiveApp = activeApp === item.id ? null : item.id;
            setActiveApp(newActiveApp);
          }
        }}
      />
      
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