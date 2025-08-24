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
import { MacOSDock } from "@/components/macos-dock";
import { FinderIcon, SafariIcon, MessagesIcon, TerminalIcon as MacTerminalIcon, SystemPreferencesIcon, DownloadsIcon, CloudIcon, DedalusIcon, NotesIcon } from "@/components/macos-icons";
import { GlassEffect, GlassWindow, GlassFilter } from "@/components/ui/glass-effect";
import { Toaster } from "@/components/ui/sonner";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Apple, Wifi, Battery, Search, ChevronDown, Monitor, Layers, Focus, Sparkles } from "lucide-react";
import Image from "next/image";

type DesktopMode = "default" | "cluttered" | "focused" | "welcome";

export default function Home() {
  const [activeApp, setActiveApp] = useState<string | null>(null);
  const [useEnhancedBrowser] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showClaude, setShowClaude] = useState(false);
  const [showDedalus, setShowDedalus] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showNativeTerminal, setShowNativeTerminal] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [, setDarkMode] = useState(false);
  const [browserInitialized, setBrowserInitialized] = useState(false);
  const [desktopMode, setDesktopMode] = useState<DesktopMode>("default");
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [clutteredWindows, setClutteredWindows] = useState<Array<{id: string, type: string, position: {x: number, y: number}}>>([]);
  const [showWelcome, setShowWelcome] = useState(false);
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize browser immediately when page loads
  useEffect(() => {
    setBrowserInitialized(true);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showModeDropdown) {
        setShowModeDropdown(false);
      }
    };

    if (showModeDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showModeDropdown]);

  // Handle mode changes
  useEffect(() => {
    if (desktopMode === "cluttered") {
      // create 10+ messy windows
      const windows = [];
      const types = ["finder", "downloads", "gcp", "finder", "downloads"];
      for (let i = 0; i < 12; i++) {
        windows.push({
          id: `window-${i}`,
          type: types[i % types.length],
          position: {
            x: Math.random() * (window.innerWidth - 400),
            y: Math.random() * (window.innerHeight - 300) + 30
          }
        });
      }
      setClutteredWindows(windows);
      setActiveApp(null);
      setShowBrowser(false);
      setShowClaude(false);
      setShowTerminal(false);
      setShowNativeTerminal(false);
      setShowWelcome(false);
    } else if (desktopMode === "focused") {
      // show only browser with yc application
      setClutteredWindows([]);
      setActiveApp(null);
      setShowBrowser(true);
      setShowClaude(false);
      setShowTerminal(false);
      setShowNativeTerminal(false);
      setShowWelcome(false);
    } else if (desktopMode === "welcome") {
      // show welcome window
      setClutteredWindows([]);
      setActiveApp(null);
      setShowBrowser(false);
      setShowClaude(false);
      setShowTerminal(false);
      setShowNativeTerminal(false);
      setShowWelcome(true);
    } else {
      // default mode - clean slate
      setClutteredWindows([]);
      setShowBrowser(false);
      setShowWelcome(false);
    }
  }, [desktopMode]);

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
    { id: 'dedalus', name: 'Dedalus AI', icon: <DedalusIcon /> },
    { id: 'notes', name: 'Notes', icon: <NotesIcon /> },
    { id: 'terminal', name: 'Command Palette', icon: <MacTerminalIcon /> },
    { id: 'native-terminal', name: 'Terminal', icon: <MacTerminalIcon /> },
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
      <GlassEffect className="fixed top-0 left-0 right-0 h-7 z-[100] rounded-none overflow-visible">
        <div className="h-full w-full flex items-center justify-between px-4 text-white text-xs font-medium overflow-visible">
          <div className="flex items-center gap-4">
            <Apple className="w-4 h-4" />
            <span className="font-semibold">Vibe OS</span>
            <span className="text-white/70">File</span>
            <span className="text-white/70">Edit</span>
            <span className="text-white/70">View</span>
            <span className="text-white/70">Window</span>
            <span className="text-white/70">Help</span>
          </div>
          <div className="flex items-center gap-3 overflow-visible">
            {/* Mode Switcher */}
            <div className="relative overflow-visible">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowModeDropdown(!showModeDropdown);
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
              >
                {desktopMode === "default" && <Monitor className="w-3.5 h-3.5" />}
                {desktopMode === "cluttered" && <Layers className="w-3.5 h-3.5" />}
                {desktopMode === "focused" && <Focus className="w-3.5 h-3.5" />}
                {desktopMode === "welcome" && <Sparkles className="w-3.5 h-3.5" />}
                <span className="capitalize">{desktopMode}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              
              {showModeDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-full right-0 mt-1 bg-white backdrop-blur-md rounded-lg shadow-xl overflow-hidden min-w-[180px] z-[200]"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
                >
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setDesktopMode("default");
                        setShowModeDropdown(false);
                      }}
                      className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-100 transition-colors ${
                        desktopMode === "default" ? "bg-blue-50 text-blue-600" : "text-gray-700"
                      }`}
                    >
                      <Monitor className="w-4 h-4" />
                      <span className="text-sm">Default</span>
                      {desktopMode === "default" && <div className="ml-auto w-2 h-2 bg-blue-600 rounded-full" />}
                    </button>
                    
                    <button
                      onClick={() => {
                        setDesktopMode("cluttered");
                        setShowModeDropdown(false);
                      }}
                      className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-100 transition-colors ${
                        desktopMode === "cluttered" ? "bg-red-50 text-red-600" : "text-gray-700"
                      }`}
                    >
                      <Layers className="w-4 h-4" />
                      <span className="text-sm">Cluttered</span>
                      {desktopMode === "cluttered" && <div className="ml-auto w-2 h-2 bg-red-600 rounded-full" />}
                    </button>
                    
                    <button
                      onClick={() => {
                        setDesktopMode("focused");
                        setShowModeDropdown(false);
                      }}
                      className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-100 transition-colors ${
                        desktopMode === "focused" ? "bg-green-50 text-green-600" : "text-gray-700"
                      }`}
                    >
                      <Focus className="w-4 h-4" />
                      <span className="text-sm">Focused</span>
                      {desktopMode === "focused" && <div className="ml-auto w-2 h-2 bg-green-600 rounded-full" />}
                    </button>
                    
                    <button
                      onClick={() => {
                        setDesktopMode("welcome");
                        setShowModeDropdown(false);
                      }}
                      className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-100 transition-colors ${
                        desktopMode === "welcome" ? "bg-purple-50 text-purple-600" : "text-gray-700"
                      }`}
                    >
                      <Sparkles className="w-4 h-4" />
                      <span className="text-sm">Welcome</span>
                      {desktopMode === "welcome" && <div className="ml-auto w-2 h-2 bg-purple-600 rounded-full" />}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
            
            <Search className="w-3.5 h-3.5" />
            <Wifi className="w-3.5 h-3.5" />
            <Battery className="w-3.5 h-3.5" />
            <span>{formatTime(currentTime)}</span>
          </div>
        </div>
      </GlassEffect>
      
      {/* Desktop */}
      <div className="flex-1 relative overflow-hidden">
        
        {/* Cluttered Mode Windows */}
        {desktopMode === "cluttered" && clutteredWindows.map((window, index) => (
          <motion.div
            key={window.id}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.05 }}
            className="absolute"
            style={{ 
              left: window.position.x, 
              top: window.position.y,
              zIndex: 10 + index
            }}
          >
            <GlassWindow 
              title={window.type === "finder" ? "Finder" : window.type === "downloads" ? "Downloads" : "GCP VMs"}
              onClose={() => {}}
              className={window.type === "finder" ? "w-[600px]" : window.type === "downloads" ? "w-[500px]" : "w-[700px]"}
            >
              {window.type === "finder" && (useEnhancedBrowser ? <FileBrowserEnhanced /> : <FileBrowser />)}
              {window.type === "downloads" && <DownloadTinder />}
              {window.type === "gcp" && <GCPVMList />}
            </GlassWindow>
          </motion.div>
        ))}
        
        {/* Default Mode Windows */}
        {desktopMode === "default" && (
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
        )}
      </div>
      
      {/* macOS Dock */}
      <MacOSDock
        items={dockApps}
        activeItem={activeApp || (showClaude ? 'claude' : showTerminal ? 'terminal' : showNativeTerminal ? 'native-terminal' : showBrowser ? 'browser' : null)}
        onItemClick={(item) => {
          if (item.id === 'claude') {
            setShowClaude(prev => !prev);
          } else if (item.id === 'dedalus') {
            setActiveApp('dedalus');
          } else if (item.id === 'notes') {
            setActiveApp('notes');
          } else if (item.id === 'terminal') {
            setShowTerminal(true);
          } else if (item.id === 'native-terminal') {
            setShowNativeTerminal(true);
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
      <NativeTerminal
        isOpen={showNativeTerminal}
        onClose={() => setShowNativeTerminal(false)}
      />
      
      {/* Browser - centered in focused mode */}
      {desktopMode === "focused" ? (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="fixed inset-0 flex items-center justify-center z-30 pointer-events-none"
          style={{ paddingTop: '60px', paddingBottom: '80px' }}
        >
          <div className="pointer-events-auto">
            <Browser
              isOpen={showBrowser}
              onClose={() => {
                setShowBrowser(false);
                setDesktopMode("default");
              }}
              initialized={browserInitialized}
              defaultUrl="https://apply.ycombinator.com"
            />
          </div>
        </motion.div>
      ) : (
        <Browser
          isOpen={showBrowser}
          onClose={() => setShowBrowser(false)}
          initialized={browserInitialized}
        />
      )}
      
      {/* Welcome Window */}
      {showWelcome && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          className="fixed inset-0 flex items-center justify-center z-30 pointer-events-none"
          style={{ paddingTop: '60px', paddingBottom: '80px' }}
        >
          <div className="pointer-events-auto">
            <GlassWindow 
              title="Welcome to Vibe OS" 
              onClose={() => {
                setShowWelcome(false);
                setDesktopMode("default");
              }}
              className="w-[600px]"
            >
              <div className="h-[400px] p-12 flex flex-col items-center justify-center bg-gradient-to-br from-white via-purple-50/30 to-indigo-50/30">
                <div className="relative w-48 h-48 mb-8">
                  <Image 
                    src="/assets/vibe-logo.png" 
                    alt="vibe os logo" 
                    fill
                    className="object-contain"
                  />
                </div>
                
                <h1 className="text-4xl font-light mb-4" style={{ 
                  fontFamily: 'Helvetica Neue, Helvetica, sans-serif',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}>
                  Welcome to vibeOS
                </h1>
                
                <p className="text-xl text-gray-600" style={{ 
                  fontFamily: 'Helvetica Neue, Helvetica, sans-serif' 
                }}>
                  you&apos;re in control
                </p>
              </div>
            </GlassWindow>
          </div>
        </motion.div>
      )}
      
      <div style={{ display: 'none' }}>
        <DarkModeToggle />
      </div>
      
      {/* Toast Notifications */}
      <Toaster position="top-center" />
    </main>
  );
}