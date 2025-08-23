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
    <div className="h-full flex flex-col">
      {/* clean smart tab bar */}
      <div className="border-b border-green-500/20 p-2 bg-gradient-to-r from-green-500/5 to-blue-500/5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {["project docs", "code editor", "local server", "team chat", "calendar"].map((tab, i) => (
              <div
                key={i}
                className={`px-3 py-1.5 text-xs rounded-t border ${
                  i === 0
                    ? "bg-white border-green-500 text-green-600 font-medium"
                    : "bg-green-50 border-green-200 text-gray-600"
                }`}
              >
                {tab}
              </div>
            ))}
          </div>
          <span className="text-xs text-green-600 font-medium px-2">
            only 5 focused tabs
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-4">
            <span className="text-lg font-bold text-green-600">
              anti-procrastination os
            </span>
            
            {/* work/relax mode toggle */}
            <div className="flex items-center gap-1 bg-white/70 rounded-full p-0.5">
              <button
                onClick={() => setWorkMode("work")}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  workMode === "work" 
                    ? "bg-blue-500 text-white shadow-sm" 
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Zap className="w-3 h-3 inline mr-1" />
                work mode
              </button>
              <button
                onClick={() => setWorkMode("relax")}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  workMode === "relax" 
                    ? "bg-green-500 text-white shadow-sm" 
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Coffee className="w-3 h-3 inline mr-1" />
                relax mode
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-green-600 font-medium">
              deep focus: {Math.floor(focusedTime / 60)}m {focusedTime % 60}s
            </span>
            <span className="text-sm text-gray-500">
              {formatTime(currentTime)}
            </span>
          </div>
        </div>
      </div>

      {/* clean focused workspace */}
      <div className="flex-1 p-6 space-y-4 overflow-auto bg-gradient-to-br from-white to-green-50/30">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            the os that beats procrastination
          </h2>
          <p className="text-lg text-gray-600">
            browsers need to evolve - vibe os is the answer
          </p>
          <p className="text-sm text-green-600 mt-2 font-medium">
            focus is currency. people will pay for this.
          </p>
        </div>

        {/* hero feature */}
        <GlassEffect className="p-6 bg-gradient-to-br from-green-50/50 to-blue-50/50 border-2 border-green-500/30">
          <div className="text-center mb-4">
            <h3 className="font-bold text-xl text-green-600">intelligent tab management</h3>
            <p className="text-sm text-gray-600 mt-1">vibe os knows what you need, when you need it</p>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="text-center">
              <Brain className="w-8 h-8 text-blue-500 mx-auto mb-2" />
              <p className="text-xs font-semibold">smart grouping</p>
              <p className="text-xs text-gray-500">auto-organizes by project</p>
            </div>
            <div className="text-center">
              <Focus className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-xs font-semibold">focus mode</p>
              <p className="text-xs text-gray-500">hides irrelevant tabs</p>
            </div>
            <div className="text-center">
              <Sparkles className="w-8 h-8 text-purple-500 mx-auto mb-2" />
              <p className="text-xs font-semibold">ai-powered</p>
              <p className="text-xs text-gray-500">learns your patterns</p>
            </div>
          </div>
        </GlassEffect>

        {/* anti-procrastination features */}
        <div className="grid grid-cols-2 gap-4">
          <GlassEffect className="p-4 border-green-500/30 bg-white">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5 text-green-500" />
              <span className="font-semibold">procrastination blocker</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                <span className="text-xs">blocks time-wasting sites in work mode</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                <span className="text-xs">gentle nudges when off-track</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                <span className="text-xs">rewards focus streaks</span>
              </div>
            </div>
          </GlassEffect>

          <GlassEffect className="p-4 border-blue-500/30 bg-white">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-5 h-5 text-blue-500" />
              <span className="font-semibold">smart scheduling</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-blue-500" />
                <span className="text-xs">auto-opens tabs for meetings</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-blue-500" />
                <span className="text-xs">prepares workspace by time of day</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-blue-500" />
                <span className="text-xs">closes work tabs after hours</span>
              </div>
            </div>
          </GlassEffect>

          <GlassEffect className="p-4 border-purple-500/30 bg-white">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-purple-500" />
              <span className="font-semibold">instant context</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-purple-500" />
                <span className="text-xs">remembers where you left off</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-purple-500" />
                <span className="text-xs">saves tab states between sessions</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-purple-500" />
                <span className="text-xs">one-click workspace restore</span>
              </div>
            </div>
          </GlassEffect>

          <GlassEffect className="p-4 border-yellow-500/30 bg-white">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-yellow-500" />
              <span className="font-semibold">productivity analytics</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-yellow-500" />
                <span className="text-xs">tracks focus time vs distraction</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-yellow-500" />
                <span className="text-xs">shows productivity patterns</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-yellow-500" />
                <span className="text-xs">suggests optimal work times</span>
              </div>
            </div>
          </GlassEffect>
        </div>

        {/* the value proposition */}
        <GlassEffect className="p-6 bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-500/30">
          <h3 className="font-bold text-lg mb-4 text-center text-green-600">
            your daily wins with vibe os
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">5 tabs</div>
              <div className="text-xs text-gray-600">instead of 300+</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">2.5h</div>
              <div className="text-xs text-gray-600">saved daily</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">0</div>
              <div className="text-xs text-gray-600">procrastination loops</div>
            </div>
          </div>
          <div className="mt-4 text-center">
            <p className="text-sm font-medium text-gray-700">
              "the browser that actually helps you get shit done"
            </p>
            <p className="text-xs text-green-600 mt-2">
              join 50k+ users who beat procrastination daily
            </p>
          </div>
        </GlassEffect>

        {/* call to action */}
        {!autoPilotActive && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <Button
              onClick={() => setAutoPilotActive(true)}
              className="bg-gradient-to-r from-green-500 to-blue-500 text-white px-8 py-3 text-lg font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
            >
              <Play className="w-5 h-5 mr-2" />
              try vibe os now
            </Button>
            <p className="text-xs text-gray-500 mt-2">
              no credit card required • 14-day free trial
            </p>
          </motion.div>
        )}
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