"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Coffee, 
  Brain, 
  Target, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Focus,
  Calendar,
  TrendingUp,
  Sparkles,
  Play,
  Pause,
  ChevronRight,
  Timer,
  BarChart3,
  Zap
} from "lucide-react";
import { GlassEffect, GlassFilter } from "@/components/ui/glass-effect";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Mode = "before" | "after";
type WorkMode = "work" | "relax";

export default function ProductivityDemo() {
  const [mode, setMode] = useState<Mode>("before");
  const [workMode, setWorkMode] = useState<WorkMode>("work");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [distractedTime, setDistractedTime] = useState(0);
  const [focusedTime, setFocusedTime] = useState(0);
  const [showDistraction, setShowDistraction] = useState(false);
  const [coffeeTemp, setCoffeeTemp] = useState(100);
  const [tabs, setTabs] = useState(287);
  const [autoPilotActive, setAutoPilotActive] = useState(false);
  const [currentTabIndex, setCurrentTabIndex] = useState(0);
  const [lostTabName, setLostTabName] = useState("that important doc");
  const [procrastinationTime, setProcrastinationTime] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (mode === "before") {
      const coffeeTimer = setInterval(() => {
        setCoffeeTemp(prev => Math.max(20, prev - 1));
      }, 500);
      
      const tabTimer = setInterval(() => {
        setTabs(prev => prev + Math.floor(Math.random() * 5));
      }, 2000);
      
      const tabSwitchTimer = setInterval(() => {
        setCurrentTabIndex(prev => (prev + 1) % tabs);
      }, 1500);
      
      const procrastinationTimer = setInterval(() => {
        setProcrastinationTime(prev => prev + 1);
      }, 1000);
      
      const distractionTimer = setInterval(() => {
        setShowDistraction(true);
        const randomTabs = ["youtube", "twitter", "reddit", "news article", "shopping"];
        setLostTabName(randomTabs[Math.floor(Math.random() * randomTabs.length)]);
        setTimeout(() => setShowDistraction(false), 3000);
      }, 6000);
      
      return () => {
        clearInterval(coffeeTimer);
        clearInterval(tabTimer);
        clearInterval(tabSwitchTimer);
        clearInterval(procrastinationTimer);
        clearInterval(distractionTimer);
      };
    }
  }, [mode, tabs]);

  useEffect(() => {
    if (mode === "after" && autoPilotActive) {
      toast.success("workspace prepared for your morning routine", {
        description: "all relevant tabs opened, notifications filtered",
        icon: <Sparkles className="w-4 h-4" />
      });
      
      const focusTimer = setInterval(() => {
        setFocusedTime(prev => prev + 1);
      }, 1000);
      
      return () => clearInterval(focusTimer);
    }
  }, [mode, autoPilotActive]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const BeforeSection = () => (
    <div className="h-full flex flex-col">
      {/* browser tab bar chaos */}
      <div className="border-b border-red-500/20 p-2 bg-gradient-to-r from-red-500/10 to-orange-500/10">
        <div className="flex items-center gap-2 overflow-x-auto">
          <div className="flex items-center gap-1 flex-shrink-0">
            {[...Array(Math.min(20, tabs))].map((_, i) => (
              <div
                key={i}
                className={`px-2 py-1 text-xs rounded-t border ${
                  i === currentTabIndex % 20
                    ? "bg-white border-red-500 text-red-600"
                    : "bg-gray-100 border-gray-300 text-gray-400"
                } ${i > 10 ? "w-8" : ""}`}
              >
                {i === currentTabIndex % 20 ? "???" : "..."}
              </div>
            ))}
            <span className="text-xs text-red-600 font-bold px-2">
              +{tabs - 20} more tabs
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-4">
            <span className="text-2xl font-bold text-red-600">
              {tabs} tabs open
            </span>
            <span className="text-sm text-orange-500">
              switching every 1.5s
            </span>
            <span className="text-sm text-red-500">
              procrastinating: {Math.floor(procrastinationTime / 60)}m {procrastinationTime % 60}s
            </span>
          </div>
          <div className="text-sm text-gray-500">
            {formatTime(currentTime)}
          </div>
        </div>
      </div>

      {/* chaotic browser workspace */}
      <div className="flex-1 p-6 space-y-4 overflow-auto bg-white/50">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            the 21st century problem
          </h2>
          <p className="text-lg text-gray-600">
            you opened a tab to do something important...
          </p>
          <p className="text-sm text-red-500 mt-2">
            but now you're 47 tabs deep and forgot what it was
          </p>
        </div>

        {/* visual tab chaos */}
        <GlassEffect className="p-6 bg-red-50/30 border-2 border-red-500/30">
          <div className="text-center mb-4">
            <h3 className="font-bold text-xl text-red-600">current tab journey</h3>
            <p className="text-sm text-gray-500 mt-1">you started with: "project documentation"</p>
          </div>
          
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded text-xs">
              project docs
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400" />
            <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">
              stack overflow
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400" />
            <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded text-xs">
              youtube tutorial
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400" />
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs">
              reddit discussion
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400" />
            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-xs animate-pulse">
              {lostTabName}
            </span>
          </div>
          
          <p className="text-center text-sm text-red-600 mt-4 font-semibold">
            focus completely lost
          </p>
        </GlassEffect>

        {/* pain points grid */}
        <div className="grid grid-cols-2 gap-4">
          <GlassEffect className="p-4 border-red-500/30 bg-white/80">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-5 h-5 text-red-500" />
              <span className="font-semibold">cognitive overload</span>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-gray-600">
                • can't find that important tab
              </div>
              <div className="text-xs text-gray-600">
                • duplicate tabs everywhere
              </div>
              <div className="text-xs text-gray-600">
                • lost original task context
              </div>
            </div>
          </GlassEffect>

          <GlassEffect className="p-4 border-orange-500/30 bg-white/80">
            <div className="flex items-center gap-2 mb-3">
              <Timer className="w-5 h-5 text-orange-500" />
              <span className="font-semibold">time vampire</span>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-gray-600">
                • 2-3 hours daily searching tabs
              </div>
              <div className="text-xs text-gray-600">
                • endless context switching
              </div>
              <div className="text-xs text-gray-600">
                • procrastination loops
              </div>
            </div>
          </GlassEffect>

          <GlassEffect className="p-4 border-yellow-500/30 bg-white/80">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              <span className="font-semibold">attention hijacked</span>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-gray-600">
                • designed to keep you clicking
              </div>
              <div className="text-xs text-gray-600">
                • infinite scroll everywhere
              </div>
              <div className="text-xs text-gray-600">
                • dopamine-driven distractions
              </div>
            </div>
          </GlassEffect>

          <GlassEffect className="p-4 border-purple-500/30 bg-white/80">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5 text-purple-500" />
              <span className="font-semibold">goals forgotten</span>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-gray-600">
                • started: write code
              </div>
              <div className="text-xs text-gray-600">
                • ended: watching cat videos
              </div>
              <div className="text-xs text-gray-600">
                • result: guilt & frustration
              </div>
            </div>
          </GlassEffect>
        </div>

        {/* distraction popup */}
        <AnimatePresence>
          {showDistraction && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50"
            >
              <GlassEffect className="p-6 border-2 border-red-500 bg-red-50">
                <div className="text-center">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                  <h3 className="font-bold text-lg mb-2">you got distracted again!</h3>
                  <p className="text-sm text-gray-600">
                    now browsing: <span className="font-bold text-red-600">{lostTabName}</span>
                  </p>
                  <p className="text-xs text-red-500 mt-2">
                    20 minutes wasted...
                  </p>
                </div>
              </GlassEffect>
            </motion.div>
          )}
        </AnimatePresence>

        {/* the cost */}
        <GlassEffect className="p-6 bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-500/30">
          <h3 className="font-bold text-lg mb-4 text-center text-red-600">
            the real cost of browser chaos
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-red-600">2.5h</div>
              <div className="text-xs text-gray-600">daily time lost</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">87%</div>
              <div className="text-xs text-gray-600">feel overwhelmed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">$450B</div>
              <div className="text-xs text-gray-600">productivity loss/year</div>
            </div>
          </div>
          <p className="text-center text-sm text-gray-700 mt-4 font-medium">
            focus is the most valuable currency of the 21st century
          </p>
        </GlassEffect>
      </div>
    </div>
  );

  const AfterSection = () => (
    <div className="h-full flex flex-col bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* minimal header */}
      <div className="h-8 bg-white/50 backdrop-blur-sm border-b border-gray-100">
        <div className="h-full flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-400"></div>
            <span className="text-xs text-gray-400">{formatTime(currentTime)}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-gray-300"></div>
            <div className="w-2 h-2 rounded-full bg-gray-300"></div>
            <div className="w-2 h-2 rounded-full bg-gray-300"></div>
          </div>
        </div>
      </div>

      {/* clean empty desktop with centered logo */}
      <div className="flex-1 flex items-center justify-center relative">
        {/* subtle gradient background */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-100 to-purple-100"></div>
        </div>
        
        {/* centered content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center z-10"
        >
          {/* logo */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-8"
          >
            <div className="w-24 h-24 mx-auto bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-2xl flex items-center justify-center">
              <span className="text-white text-3xl font-bold">V</span>
            </div>
          </motion.div>
          
          {/* welcome text */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <h1 className="text-5xl font-light text-gray-800 mb-3">
              welcome to <span className="font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">vibeOS</span>
            </h1>
            <p className="text-xl text-gray-500">
              you're in control
            </p>
          </motion.div>

          {/* subtle cta */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="mt-12"
          >
            <button
              onClick={() => setAutoPilotActive(true)}
              className="px-6 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              press space to begin
            </button>
          </motion.div>
        </motion.div>

        {/* minimalist dock at bottom */}
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2"
        >
          <div className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md rounded-full shadow-lg">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200"></div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );

  return (
    <main className="h-screen w-screen overflow-hidden relative flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      <GlassFilter />
      
      {/* header */}
      <GlassEffect className="fixed top-0 left-0 right-0 h-16 z-50 rounded-none border-b">
        <div className="h-full w-full flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              vibe os
            </h1>
            <span className="text-sm text-gray-500">productivity demo</span>
          </div>
          
          {/* mode switcher */}
          <div className="flex items-center gap-2 bg-white/50 rounded-full p-1">
            <button
              onClick={() => setMode("before")}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                mode === "before" 
                  ? "bg-red-500 text-white" 
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              before: chaos mode
            </button>
            <button
              onClick={() => setMode("after")}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                mode === "after" 
                  ? "bg-green-500 text-white" 
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              after: vibe os
            </button>
          </div>
        </div>
      </GlassEffect>
      
      {/* main content */}
      <div className="flex-1 pt-16">
        <AnimatePresence mode="wait">
          {mode === "before" ? (
            <motion.div
              key="before"
              initial={{ opacity: 0, x: -100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              className="h-full"
            >
              <BeforeSection />
            </motion.div>
          ) : (
            <motion.div
              key="after"
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              className="h-full"
            >
              <AfterSection />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}