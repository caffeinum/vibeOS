"use client";

import { ClaudeChat } from "@/components/claude-chat";
import { FileBrowser } from "@/components/file-browser";
import { FileBrowserEnhanced } from "@/components/file-browser-enhanced";
import { DownloadTinder } from "@/components/download-tinder";
import { GCPVMList } from "@/components/gcp-vm-list";
import { DarkModeToggle } from "@/components/dark-mode-toggle";
import { Terminal } from "@/components/terminal";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Folder, Download, Cloud, Settings, MessageCircle, Terminal as TerminalIcon, Apple, Wifi, Battery, Search } from "lucide-react";

export default function Home() {
  const [activeApp, setActiveApp] = useState<string | null>(null);
  const [useEnhancedBrowser, setUseEnhancedBrowser] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showClaude, setShowClaude] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
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
    { id: 'finder', name: 'Finder', icon: <Folder className="w-8 h-8" />, color: 'from-blue-400 to-blue-600' },
    { id: 'downloads', name: 'Downloads', icon: <Download className="w-8 h-8" />, color: 'from-pink-400 to-red-600' },
    { id: 'gcp', name: 'GCP VMs', icon: <Cloud className="w-8 h-8" />, color: 'from-cyan-400 to-blue-600' },
    { id: 'claude', name: 'Claude Chat', icon: <MessageCircle className="w-8 h-8" />, color: 'from-purple-400 to-purple-600' },
    { id: 'terminal', name: 'Terminal', icon: <TerminalIcon className="w-8 h-8" />, color: 'from-gray-700 to-gray-900' },
    { id: 'settings', name: 'Settings', icon: <Settings className="w-8 h-8" />, color: 'from-gray-400 to-gray-600' },
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
      {/* macOS Menu Bar */}
      <div className="bg-black/40 backdrop-blur-2xl h-7 flex items-center justify-between px-4 text-white text-xs font-medium z-50 border-b border-white/10">
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
      
      {/* Desktop */}
      <div className="flex-1 relative overflow-hidden">
        
        {/* App Windows */}
        <AnimatePresence>
          {activeApp === 'finder' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute top-10 left-10 z-20"
            >
              <div className="bg-white/95 backdrop-blur-xl rounded-lg shadow-2xl overflow-hidden w-[800px]">
                <div className="bg-gray-200 h-7 flex items-center px-3 gap-2">
                  <button onClick={() => setActiveApp(null)} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600" />
                  <button className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600" />
                  <button className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600" />
                  <span className="ml-2 text-xs font-medium">Finder</span>
                </div>
                <div className="p-4">
                  {useEnhancedBrowser ? <FileBrowserEnhanced /> : <FileBrowser />}
                </div>
              </div>
            </motion.div>
          )}
          
          {activeApp === 'downloads' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute top-10 left-10 z-20"
            >
              <div className="bg-white/95 backdrop-blur-xl rounded-lg shadow-2xl overflow-hidden w-[600px]">
                <div className="bg-gray-200 h-7 flex items-center px-3 gap-2">
                  <button onClick={() => setActiveApp(null)} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600" />
                  <button className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600" />
                  <button className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600" />
                  <span className="ml-2 text-xs font-medium">Downloads</span>
                </div>
                <div className="p-4">
                  <DownloadTinder />
                </div>
              </div>
            </motion.div>
          )}
          
          {activeApp === 'gcp' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute top-10 left-10 z-20"
            >
              <div className="bg-white/95 backdrop-blur-xl rounded-lg shadow-2xl overflow-hidden w-[900px]">
                <div className="bg-gray-200 h-7 flex items-center px-3 gap-2">
                  <button onClick={() => setActiveApp(null)} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600" />
                  <button className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600" />
                  <button className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600" />
                  <span className="ml-2 text-xs font-medium">GCP VMs</span>
                </div>
                <div className="p-4">
                  <GCPVMList />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* macOS Dock */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40">
        <div className="bg-white/10 backdrop-blur-3xl rounded-2xl p-2 flex gap-1 shadow-2xl border border-white/30">
          {dockApps.map((app) => (
            <motion.button
              key={app.id}
              onClick={() => {
                if (app.id === 'claude') {
                  setShowClaude(true);
                } else if (app.id === 'terminal') {
                  setShowTerminal(true);
                } else if (app.id === 'settings') {
                  setDarkMode(prev => !prev);
                } else {
                  setActiveApp(activeApp === app.id ? null : app.id);
                }
              }}
              whileHover={{ scale: 1.3, y: -10 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="relative group"
            >
              <div className={`w-14 h-14 bg-gradient-to-br ${app.color} rounded-xl flex items-center justify-center text-white shadow-lg`}>
                {app.icon}
              </div>
              <motion.div
                initial={{ opacity: 0, y: 0 }}
                whileHover={{ opacity: 1, y: -5 }}
                className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap"
              >
                {app.name}
              </motion.div>
              {activeApp === app.id && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
              )}
            </motion.button>
          ))}
        </div>
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
      <div style={{ display: 'none' }}>
        <DarkModeToggle />
      </div>
    </main>
  );
}