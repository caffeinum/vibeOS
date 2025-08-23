"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Globe
} from "lucide-react";

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

export function Browser({ isOpen: externalIsOpen, onClose }: BrowserProps = {}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const [currentUrl, setCurrentUrl] = useState("https://www.dedaluslabs.ai/");
  const [isLoading, setIsLoading] = useState(false);

  // Kernel-specific state
  const [kernelApiKey, setKernelApiKey] = useState<string>("");
  const [isKernelReady, setIsKernelReady] = useState(false);
  const [kernelBrowser, setKernelBrowser] = useState<KernelBrowser | null>(null);
  const [kernelError, setKernelError] = useState<KernelError | null>(null);

  // Kernel API functions
  const createKernelBrowser = useCallback(async (): Promise<KernelBrowser | undefined> => {
    if (!kernelApiKey) {
      console.warn("Kernel API key not set");
      return undefined;
    }

    try {
      const response = await fetch('/api/kernel/browsers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${kernelApiKey}`
        },
        body: JSON.stringify({
          // Browser configuration options can be added here
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to create browser: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        id: data.id,
        cdp_ws_url: data.cdp_ws_url,
        browser_live_view_url: data.browser_live_view_url,
        status: 'running'
      };
    } catch (error) {
      console.error("Error creating Kernel browser:", error);
      return undefined;
    }
  }, [kernelApiKey]);

  const closeKernelBrowser = useCallback(async (browserId: string): Promise<boolean> => {
    if (!kernelApiKey || !browserId) return false;

    try {
      const response = await fetch(`/api/kernel/browsers?browserId=${encodeURIComponent(browserId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${kernelApiKey}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Error closing Kernel browser:", errorData.error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error closing Kernel browser:", error);
      return false;
    }
  }, [kernelApiKey]);

  const initializeKernelBrowser = useCallback(async (): Promise<KernelBrowser | undefined> => {
    const browser = await createKernelBrowser();
    if (browser) {
      setKernelBrowser(browser);
      setKernelError(null);
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

  // Initialize Kernel API key from environment or localStorage
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_KERNEL_API_KEY || localStorage.getItem('kernelApiKey') || '';
    setKernelApiKey(apiKey);
    setIsKernelReady(!!apiKey);
  }, []);

  // Initialize browser when component mounts
  useEffect(() => {
    if (isKernelReady && !kernelBrowser) {
      initializeKernelBrowser();
    }
  }, [isKernelReady, kernelBrowser, initializeKernelBrowser]);

  // Cleanup Kernel browser on unmount
  useEffect(() => {
    return () => {
      if (kernelBrowser) {
        closeKernelBrowser(kernelBrowser.id);
      }
    };
  }, [kernelBrowser, closeKernelBrowser]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50"
          style={{ width: '956px', height: '706px' }}
        >
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
                        marginTop: '-53px' 
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
                    Start browsing by entering a URL or search term in the address bar above. Powered by Kernel's isolated browser infrastructure!
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
