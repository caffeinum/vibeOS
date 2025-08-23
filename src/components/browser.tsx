"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Home,
  Search,
  Globe,
  Bookmark,
  X,
  Minimize2,
  Maximize2,
  MoreVertical,
  Star,
  History,
  Settings,
  Lock,
  Shield,
  Wifi
} from "lucide-react";

interface BrowserProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface Tab {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading?: boolean;
}

interface Bookmark {
  id: string;
  title: string;
  url: string;
  favicon?: string;
}

// Utility function to get page title from URL
const getPageTitle = (url: string): string => {
  try {
    if (url === "about:blank" || !url) {
      return "New Tab";
    }

    const urlObj = new URL(url);
    const domain = urlObj.hostname.toLowerCase();

    // Common website titles
    const titleMap: Record<string, string> = {
      'google.com': 'Google',
      'www.google.com': 'Google',
      'wikipedia.org': 'Wikipedia',
      'www.wikipedia.org': 'Wikipedia',
      'github.com': 'GitHub',
      'www.github.com': 'GitHub',
      'youtube.com': 'YouTube',
      'www.youtube.com': 'YouTube',
      'facebook.com': 'Facebook',
      'www.facebook.com': 'Facebook',
      'twitter.com': 'Twitter',
      'www.twitter.com': 'Twitter',
      'reddit.com': 'Reddit',
      'www.reddit.com': 'Reddit',
      'stackoverflow.com': 'Stack Overflow',
      'developer.mozilla.org': 'MDN Web Docs',
      'example.com': 'Example Domain',
      'httpbin.org': 'HTTPBin',
      'jsonplaceholder.typicode.com': 'JSONPlaceholder',
      'dedaluslabs.ai': 'Dedalus Labs',
      'www.dedaluslabs.ai': 'Dedalus Labs'
    };

    // Return mapped title if available
    if (titleMap[domain]) {
      return titleMap[domain];
    }

    // For other domains, create a readable title from the domain
    const cleanDomain = domain.replace(/^www\./, '');
    const parts = cleanDomain.split('.');
    const mainPart = parts.length > 1 ? parts[parts.length - 2] : parts[0];

    // Capitalize first letter
    return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);

  } catch {
    return "New Tab";
  }
};

// Test function for title generation (can be removed in production)
// console.log("Title tests:");
// console.log("https://www.google.com ->", getPageTitle("https://www.google.com"));
// console.log("https://wikipedia.org ->", getPageTitle("https://wikipedia.org"));
// console.log("https://github.com ->", getPageTitle("https://github.com"));
// console.log("https://example.com ->", getPageTitle("https://example.com"));

export function Browser({ isOpen: externalIsOpen, onClose }: BrowserProps = {}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const [currentUrl, setCurrentUrl] = useState("https://www.dedaluslabs.ai/");
  const [searchQuery, setSearchQuery] = useState("");
  const [inputUrl, setInputUrl] = useState("https://www.dedaluslabs.ai/");
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: "1",
      title: getPageTitle("https://www.dedaluslabs.ai/"),
      url: "https://www.dedaluslabs.ai/",
      isLoading: false
    }
  ]);
  const [activeTabId, setActiveTabId] = useState("1");
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [iframeTimeout, setIframeTimeout] = useState<NodeJS.Timeout | null>(null);

  const addressInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const bookmarks: Bookmark[] = [
    { id: "1", title: "Wikipedia", url: "https://www.wikipedia.org", favicon: "📚" },
    { id: "2", title: "MDN Web Docs", url: "https://developer.mozilla.org", favicon: "📖" },
    { id: "3", title: "Example.com", url: "https://example.com", favicon: "🌐" },
    { id: "4", title: "HTTPBin", url: "https://httpbin.org", favicon: "🧪" },
    { id: "5", title: "JSONPlaceholder", url: "https://jsonplaceholder.typicode.com", favicon: "📋" }
  ];

  const quickActions = [
    { icon: <Star className="w-4 h-4" />, label: "Bookmarks", action: () => setShowBookmarks(!showBookmarks) },
    { icon: <History className="w-4 h-4" />, label: "History", action: () => setShowHistory(!showHistory) },
    { icon: <Settings className="w-4 h-4" />, label: "Settings", action: () => console.log("Settings") }
  ];

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (iframeTimeout) {
        clearTimeout(iframeTimeout);
      }
    };
  }, [iframeTimeout]);

  const checkIframeCompatibility = useCallback(async (url: string): Promise<boolean> => {
    try {
      // For common blocked sites, return false immediately
      const blockedDomains = [
        'google.com', 'youtube.com', 'facebook.com', 'twitter.com',
        'instagram.com', 'linkedin.com', 'github.com', 'stackoverflow.com',
        'reddit.com', 'amazon.com', 'netflix.com', 'discord.com'
      ];

      const urlObj = new URL(url);
      const isBlockedDomain = blockedDomains.some(domain =>
        urlObj.hostname.includes(domain) || urlObj.hostname === domain
      );

      if (isBlockedDomain) {
        return false;
      }

      // Try to fetch the page with HEAD request to check headers
      const response = await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors'
      });

      // If we get here, the site is likely accessible
      return true;
    } catch (error) {
      // If fetch fails, assume the site might be blocked
      return false;
    }
  }, []);

  const handleIframeError = useCallback(() => {
    if (iframeTimeout) {
      clearTimeout(iframeTimeout);
      setIframeTimeout(null);
    }
    setIframeError(true);
    setIsLoading(false);
    if (activeTab) {
      updateTab(activeTab.id, { isLoading: false });
    }
  }, [iframeTimeout, activeTab]);

  const handleIframeLoad = useCallback(() => {
    if (iframeTimeout) {
      clearTimeout(iframeTimeout);
      setIframeTimeout(null);
    }
    setIframeError(false);
    setIsLoading(false);
    if (activeTab) {
      updateTab(activeTab.id, { isLoading: false });
    }
  }, [iframeTimeout, activeTab]);

  const updateNavigationButtons = useCallback(() => {
    setCanGoBack(historyIndex > 0);
    setCanGoForward(historyIndex < history.length - 1);
  }, [historyIndex, history.length]);

  const startIframeTimeout = useCallback(() => {
    const timeout = setTimeout(() => {
      setIframeError(true);
      setIsLoading(false);
      if (activeTab) {
        updateTab(activeTab.id, { isLoading: false });
      }
    }, 8000); // 8 second timeout

    setIframeTimeout(timeout);
  }, [activeTab]);

  const navigateToUrl = useCallback(async (url: string) => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('.') && !url.includes(' ')) {
        url = 'https://' + url;
      } else {
        url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
      }
    }

    setIsLoading(true);
    setIframeError(false);
    setCurrentUrl(url);
    setInputUrl(url);

    // Check if the URL can be loaded in an iframe
    const isCompatible = await checkIframeCompatibility(url);

    if (!isCompatible) {
      setIframeError(true);
      setIsLoading(false);
      if (activeTab) {
        updateTab(activeTab.id, { isLoading: false });
      }
      return;
    }

    // Start timeout for iframe loading
    startIframeTimeout();

    // Add to history
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(url);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    updateNavigationButtons();

    // Simulate loading
    setTimeout(() => {
      setIsLoading(false);
      if (activeTab) {
        updateTab(activeTab.id, { title: getPageTitle(url), url, isLoading: false });
      }
    }, 1500);
  }, [activeTab, checkIframeCompatibility, startIframeTimeout, history, historyIndex, updateNavigationButtons]);



  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigateToUrl(searchQuery.trim());
      setSearchQuery("");
    }
  };

  const goBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setCurrentUrl(history[newIndex]);
      setInputUrl(history[newIndex]);
      updateNavigationButtons();
      if (activeTab) {
        updateTab(activeTab.id, { title: getPageTitle(history[newIndex]), url: history[newIndex] });
      }
    }
  };

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setCurrentUrl(history[newIndex]);
      setInputUrl(history[newIndex]);
      updateNavigationButtons();
      if (activeTab) {
        updateTab(activeTab.id, { title: getPageTitle(history[newIndex]), url: history[newIndex] });
      }
    }
  };

  const refresh = () => {
    if (activeTab) {
      updateTab(activeTab.id, { isLoading: true });
      setIsLoading(true);
      setTimeout(() => {
        setIsLoading(false);
        updateTab(activeTab.id, { isLoading: false });
      }, 1000);
    }
  };

  const goHome = () => {
    navigateToUrl("https://www.dedaluslabs.ai/");
  };



  const updateTab = (tabId: string, updates: Partial<Tab>) => {
    setTabs(prev => prev.map(tab =>
      tab.id === tabId ? { ...tab, ...updates } : tab
    ));
  };

  const addNewTab = () => {
    const newTab: Tab = {
      id: Date.now().toString(),
      title: "New Tab",
      url: "about:blank",
      isLoading: false
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setCurrentUrl("");
    setInputUrl("");
    setIframeError(false);
  };

  const closeTab = (tabId: string) => {
    if (tabs.length === 1) return; // Don't close the last tab

    setTabs(prev => prev.filter(tab => tab.id !== tabId));

    // If we're closing the active tab, switch to another tab
    if (activeTabId === tabId) {
      const remainingTabs = tabs.filter(tab => tab.id !== tabId);
      setActiveTabId(remainingTabs[0].id);
      setCurrentUrl(remainingTabs[0].url);
      setInputUrl(remainingTabs[0].url);
      setIframeError(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setCurrentUrl(inputUrl);
      navigateToUrl(inputUrl);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed inset-4 z-50"
        >
          <div className="bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl overflow-hidden h-full flex flex-col border border-white/20">
            {/* Browser Header */}
            <div className="bg-gray-100/80 backdrop-blur-sm border-b border-gray-200/50 px-3 py-2">
              <div className="flex items-center gap-2">
                {/* Window Controls */}
                <div className="flex gap-1">
                  <button
                    onClick={onClose}
                    className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                  />
                  <button className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors" />
                  <button className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors" />
                </div>

                {/* Browser Title */}
                <div className="flex-1 text-center">
                  <span className="text-xs font-medium text-gray-700 truncate">
                    {activeTab?.title || "Browser"}
                  </span>
                </div>
              </div>
            </div>

            {/* Tab Bar */}
            <div className="bg-gray-50/80 backdrop-blur-sm border-b border-gray-200/50 px-2 py-1 flex gap-1 overflow-x-auto">
              {tabs.map((tab) => (
                <motion.div
                  key={tab.id}
                  layoutId={tab.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all min-w-[120px] max-w-[200px] group ${
                    activeTabId === tab.id
                      ? 'bg-white shadow-sm border border-gray-200'
                      : 'hover:bg-white/50'
                  }`}
                  onClick={() => {
                    setActiveTabId(tab.id);
                    setCurrentUrl(tab.url);
                    setInputUrl(tab.url);
                    setIframeError(false);
                  }}
                >
                  <div className="flex-1 flex items-center gap-2 truncate">
                    {tab.isLoading ? (
                      <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
                    ) : (
                      <Globe className="w-3 h-3 text-gray-400" />
                    )}
                    <span className="text-xs font-medium truncate text-gray-700">
                      {tab.title}
                    </span>
                  </div>
                  {tabs.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:bg-gray-200 rounded p-0.5 transition-opacity"
                    >
                      <X className="w-3 h-3 text-gray-400" />
                    </button>
                  )}
                </motion.div>
              ))}

              {/* Add Tab Button */}
              <button
                onClick={addNewTab}
                className="px-2 py-1.5 rounded-lg hover:bg-white/50 transition-colors"
              >
                <span className="text-lg font-light text-gray-500">+</span>
              </button>
            </div>

            {/* Navigation Bar */}
            <div className="bg-white border-b border-gray-200/50 px-4 py-2 flex items-center gap-2">
              {/* Navigation Buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={goBack}
                  disabled={!canGoBack}
                  className={`p-1.5 rounded-md transition-colors ${
                    canGoBack
                      ? 'hover:bg-gray-100 text-gray-700'
                      : 'text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={goForward}
                  disabled={!canGoForward}
                  className={`p-1.5 rounded-md transition-colors ${
                    canGoForward
                      ? 'hover:bg-gray-100 text-gray-700'
                      : 'text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={refresh}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={goHome}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                >
                  <Home className="w-4 h-4" />
                </button>
              </div>

              {/* Address Bar */}
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    {currentUrl.startsWith('https://') ? (
                      <Lock className="w-4 h-4 text-green-600" />
                    ) : (
                      <Globe className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  <input
                    ref={addressInputRef}
                    type="text"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg bg-gray-50/50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="Search or enter website URL"
                  />
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-1">
                {quickActions.map((action, index) => (
                  <button
                    key={index}
                    onClick={action.action}
                    className="p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                    title={action.label}
                  >
                    {action.icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Bookmarks Bar */}
            <AnimatePresence>
              {showBookmarks && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-gray-50/80 border-b border-gray-200/50 px-4 py-2"
                >
                  <div className="flex items-center gap-4 overflow-x-auto">
                    {bookmarks.map((bookmark) => (
                      <button
                        key={bookmark.id}
                        onClick={() => navigateToUrl(bookmark.url)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white transition-colors whitespace-nowrap"
                      >
                        <span className="text-sm">{bookmark.favicon}</span>
                        <span className="text-sm font-medium">{bookmark.title}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Browser Content */}
            <div className="flex-1 relative bg-white">
              {currentUrl && currentUrl !== "about:blank" ? (
                iframeError ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <Shield className="w-16 h-16 mb-4 opacity-50" />
                    <h2 className="text-lg font-medium mb-2">Site Not Compatible</h2>
                    <p className="text-sm text-center max-w-md mb-4">
                      This website blocks iframe embedding for security. Try sites like Wikipedia, MDN Web Docs, or Example.com instead.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigateToUrl("https://www.wikipedia.org")}
                        className="px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                      >
                        Try Wikipedia
                      </button>
                      <button
                        onClick={() => window.open(currentUrl, '_blank')}
                        className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                      >
                        Open Externally
                      </button>
                    </div>
                  </div>
                ) : (
                  <iframe
                    ref={iframeRef}
                    src={currentUrl}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    onLoad={handleIframeLoad}
                  />
                )
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Globe className="w-16 h-16 mb-4 opacity-50" />
                  <h2 className="text-lg font-medium mb-2">Welcome to Claude Browser</h2>
                  <p className="text-sm text-center max-w-md mb-4">
                    Start browsing by entering a URL or search term in the address bar above. Great for sites like Wikipedia, MDN Web Docs, and Example.com!
                  </p>
                  <button
                    onClick={() => navigateToUrl("https://www.wikipedia.org")}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    Try Wikipedia
                  </button>
                </div>
              )}

              {/* Loading Overlay */}
              <AnimatePresence>
                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center"
                  >
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
                      <span className="text-sm font-medium text-gray-700">Loading...</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
