"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Globe,
  Send,
  Loader2
} from "lucide-react";
import { api } from "@/utils/api";

// Kernel browser types
interface KernelBrowser {
  id: string;
  cdp_ws_url: string;
  browser_live_view_url: string;
  status: 'creating' | 'running' | 'stopped';
}

interface KernelError {
  message: string;
  code?: string;
}

interface BrowserProps {
  isOpen?: boolean;
  onClose?: () => void;
  initialized?: boolean;
}

// Utility function to get page title from URL
// const getPageTitle = (url: string): string => {
//   try {
//     if (url === "about:blank" || !url) {
//       return "New Tab";
//     }

//     const urlObj = new URL(url);
//     const domain = urlObj.hostname.toLowerCase();

//     // Common website titles
//     const titleMap: Record<string, string> = {
//       'google.com': 'Google',
//       'www.google.com': 'Google',
//       'wikipedia.org': 'Wikipedia',
//       'www.wikipedia.org': 'Wikipedia',
//       'github.com': 'GitHub',
//       'www.github.com': 'GitHub',
//       'youtube.com': 'YouTube',
//       'www.youtube.com': 'YouTube',
//       'facebook.com': 'Facebook',
//       'www.facebook.com': 'Facebook',
//       'twitter.com': 'Twitter',
//       'www.twitter.com': 'Twitter',
//       'reddit.com': 'Reddit',
//       'www.reddit.com': 'Reddit',
//       'stackoverflow.com': 'Stack Overflow',
//       'developer.mozilla.org': 'MDN Web Docs',
//       'example.com': 'Example Domain',
//       'httpbin.org': 'HTTPBin',
//       'jsonplaceholder.typicode.com': 'JSONPlaceholder',
//       'dedaluslabs.ai': 'Dedalus Labs',
//       'www.dedaluslabs.ai': 'Dedalus Labs'
//     };

//     // Return mapped title if available
//     if (titleMap[domain]) {
//       return titleMap[domain];
//     }

//     // For other domains, create a readable title from the domain
//     const cleanDomain = domain.replace(/^www\./, '');
//     const parts = cleanDomain.split('.');
//     const mainPart = parts.length > 1 ? parts[parts.length - 2] : parts[0];

//     // Capitalize first letter
//     return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);

//   } catch {
//     return "New Tab";
//   }
// };

export function Browser({ isOpen: externalIsOpen, onClose, initialized }: BrowserProps = {}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const [currentUrl, setCurrentUrl] = useState("https://www.dedaluslabs.ai/");
  const [isLoading, setIsLoading] = useState(false);

  // Browser-use state
  const [taskInput, setTaskInput] = useState("");
  const [isRunningAgent, setIsRunningAgent] = useState(false);

  // Kernel-specific state
  const [kernelApiKey, setKernelApiKey] = useState<string>("");
  const [isKernelReady, setIsKernelReady] = useState(false);
  const [kernelBrowser, setKernelBrowser] = useState<KernelBrowser | null>(null);
  const [kernelError, setKernelError] = useState<KernelError | null>(null);

  // tRPC mutations
  const createBrowserMutation = api.kernel.createBrowser.useMutation({
    onSuccess: (data) => {
      console.log('[Browser] Created successfully:', data.id);
      setKernelBrowser({
        id: data.id,
        cdp_ws_url: data.cdp_ws_url,
        browser_live_view_url: data.browser_live_view_url,
        status: data.status
      });
      setKernelError(null);
    },
    onError: (error) => {
      console.error('[Browser] Creation error:', error);
      const kernelErr: KernelError = {
        message: error.message || "Failed to create Kernel browser. Please check your API key.",
        code: "BROWSER_CREATION_FAILED"
      };
      setKernelError(kernelErr);
    }
  });

  const closeBrowserMutation = api.kernel.closeBrowser.useMutation({
    onSuccess: () => {
      console.log('[Browser] Closed successfully');
      setKernelBrowser(null);
    },
    onError: (error) => {
      console.error('[Browser] Close error:', error);
    }
  });

  // Browser-use mutations
  const runAgentMutation = api.browserUse.runAgent.useMutation({
    onSuccess: (data) => {
      console.log('[Browser] Agent completed:', data);
      setIsRunningAgent(false);
    },
    onError: (error) => {
      console.error('[Browser] Agent error:', error);
      setIsRunningAgent(false);
    }
  });

  // Kernel API functions
  const createKernelBrowser = useCallback(async (): Promise<KernelBrowser | undefined> => {
    if (!kernelApiKey) {
      console.warn("Kernel API key not set");
      return undefined;
    }

    // Don't create if already creating or exists
    if (createBrowserMutation.isPending || kernelBrowser) {
      console.log('[Browser] Skipping creation - already pending or exists');
      return kernelBrowser || undefined;
    }

    try {
      const data = await createBrowserMutation.mutateAsync({
        apiKey: kernelApiKey
      });

      const browser = {
        id: data.id,
        cdp_ws_url: data.cdp_ws_url,
        browser_live_view_url: data.browser_live_view_url,
        status: data.status as 'creating' | 'running' | 'stopped'
      };
      
      return browser;
    } catch (error) {
      console.error("Error creating Kernel browser:", error);
      return undefined;
    }
  }, [kernelApiKey, createBrowserMutation, kernelBrowser]);

  const closeKernelBrowser = useCallback(async (browserId: string): Promise<boolean> => {
    if (!kernelApiKey || !browserId) return false;

    // Don't close if already closing
    if (closeBrowserMutation.isPending) {
      console.log('[Browser] Skipping close - already pending');
      return false;
    }

    try {
      await closeBrowserMutation.mutateAsync({
        apiKey: kernelApiKey,
        browserId
      });
      return true;
    } catch (error) {
      console.error("Error closing Kernel browser:", error);
      return false;
    }
  }, [kernelApiKey, closeBrowserMutation]);

  const initializeKernelBrowser = useCallback(async (): Promise<KernelBrowser | undefined> => {
    const browser = await createKernelBrowser();
    if (browser) {
      return browser;
    } else {
      const error: KernelError = {
        message: "Failed to create Kernel browser. Please check your API key.",
        code: "BROWSER_CREATION_FAILED"
      };
      setKernelError(error);
      return undefined;
    }
  }, [createKernelBrowser]);

  // Browser-use functions
  const runBrowserAgent = useCallback(async (task: string) => {
    if (!kernelBrowser?.cdp_ws_url || !task.trim()) {
      console.warn("No CDP URL or task provided");
      return;
    }

    setIsRunningAgent(true);

    try {
      await runAgentMutation.mutateAsync({
        task: task.trim(),
        cdpUrl: kernelBrowser.cdp_ws_url,
        apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || localStorage.getItem('openaiApiKey') || ''
      });
    } catch (error) {
      console.error("Error running browser agent:", error);
      setIsRunningAgent(false);
    }
  }, [kernelBrowser?.cdp_ws_url, runAgentMutation]);

  // Initialize Kernel API key from environment or localStorage
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_KERNEL_API_KEY || localStorage.getItem('kernelApiKey') || '';
    setKernelApiKey(apiKey);
    setIsKernelReady(!!apiKey);
  }, []);

  // Initialize browser when component mounts (regardless of isOpen state)
  // Use a ref to track initialization state to prevent multiple calls
  const initializingRef = useRef(false);
  const initializedRef = useRef(false);
  
  useEffect(() => {
    if (isKernelReady && !kernelBrowser && initialized && !initializingRef.current && !initializedRef.current) {
      initializingRef.current = true;
      initializeKernelBrowser().then(() => {
        initializedRef.current = true;
        initializingRef.current = false;
      });
    }
  }, [isKernelReady, kernelBrowser, initialized, initializeKernelBrowser]);

  // Cleanup Kernel browser on unmount
  useEffect(() => {
    return () => {
      if (kernelBrowser) {
        closeKernelBrowser(kernelBrowser.id);
      }
    };
  }, [kernelBrowser, closeKernelBrowser]);

  // Render the browser content always, but hide it when not open
  const browserContent = (
    <div className="bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl overflow-hidden w-full h-full flex flex-col border border-white/20">
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
          
          {/* Task Input */}
          <div className="flex-1 flex items-center gap-2 ml-4">
                         <input
               type="text"
               placeholder="Enter a task for the browser agent (e.g., 'Search for Python tutorials')"
               value={taskInput}
               onChange={(e) => setTaskInput(e.target.value)}
               onKeyPress={(e) => {
                 if (e.key === 'Enter' && taskInput.trim() && !isRunningAgent) {
                   runBrowserAgent(taskInput);
                 }
               }}
                               className="flex-1 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                style={{ 
                  caretColor: 'black',
                  color: 'black'
                }}
               disabled={isRunningAgent || !kernelBrowser}
             />
            <button
              onClick={() => taskInput.trim() && runBrowserAgent(taskInput)}
              disabled={isRunningAgent || !kernelBrowser || !taskInput.trim()}
              className="px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm flex items-center gap-1"
            >
              {isRunningAgent ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Send className="w-3 h-3" />
                  Run
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Browser Content */}
      <div className="flex-1 relative bg-white overflow-hidden">
        {!isKernelReady ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Shield className="w-16 h-16 mb-4 opacity-50" />
            <h2 className="text-lg font-medium mb-2">Kernel API Required</h2>
            <p className="text-sm text-center max-w-md mb-4">
              To use this browser, you need a Kernel API key. Set NEXT_PUBLIC_KERNEL_API_KEY environment variable or add your API key to localStorage.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Enter Kernel API Key"
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    const input = e.target as HTMLInputElement;
                    const apiKey = input.value.trim();
                    if (apiKey) {
                      localStorage.setItem('kernelApiKey', apiKey);
                      setKernelApiKey(apiKey);
                      setIsKernelReady(true);
                    }
                  }
                }}
              />
              <button
                onClick={() => window.open('https://docs.onkernel.com', '_blank')}
                className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
              >
                Get API Key
              </button>
            </div>
          </div>
        ) : currentUrl && currentUrl !== "about:blank" ? (
          kernelError || !kernelBrowser ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Shield className="w-16 h-16 mb-4 opacity-50" />
              <h2 className="text-lg font-medium mb-2">Browser Error</h2>
              <p className="text-sm text-center max-w-md mb-4">
                {kernelError?.message || "Failed to create Kernel browser session. Please check your connection and API key."}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => initializeKernelBrowser()}
                  className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                >
                  Retry
                </button>
                <button
                  onClick={() => window.open('https://docs.onkernel.com', '_blank')}
                  className="px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                >
                  Documentation
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full h-full overflow-hidden">
              <iframe
                src={kernelBrowser?.browser_live_view_url}
                className="w-full border-0"
                style={{ 
                  height: 'calc(100% + 66px)', 
                  marginTop: '-43px' 
                }}
                scrolling="no"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
                allow="camera; microphone; geolocation"
              />
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Globe className="w-16 h-16 mb-4 opacity-50" />
            <h2 className="text-lg font-medium mb-2">Welcome to Kernel Browser</h2>
            <p className="text-sm text-center max-w-md mb-4">
              Start browsing by entering a URL or search term in the address bar above. Powered by Kernel&apos;s isolated browser infrastructure!
            </p>
            <button
              onClick={() => window.open("https://www.wikipedia.org", '_blank')}
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
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium text-gray-700">Loading...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  return (
    <div 
      className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 transition-all duration-300 ${
        isOpen 
          ? 'opacity-100 scale-100 pointer-events-auto' 
          : 'opacity-0 scale-95 pointer-events-none'
      }`}
      style={{ width: '956px', height: '706px' }}
    >
      {browserContent}
    </div>
  );
}
