"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, RefreshCw, DollarSign } from "lucide-react";
import { api } from "@/utils/api";

interface CryptoPrice {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  marketCap: number;
  lastUpdated: Date;
}

export function CryptoTracker() {
  const [prices, setPrices] = useState<CryptoPrice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const { data, isLoading: queryLoading, error: queryError, refetch } = api.crypto.getPrices.useQuery(
    { symbols: ["BTC", "ETH"] },
    {
      refetchInterval: autoRefresh ? 30000 : false, // refresh every 30 seconds if auto-refresh is on
      refetchIntervalInBackground: true,
    }
  );

  useEffect(() => {
    if (data) {
      setPrices(data.prices);
      setLastRefresh(new Date());
      setError(null);
    }
  }, [data]);

  useEffect(() => {
    if (queryError) {
      setError(queryError.message);
    }
  }, [queryError]);

  const handleRefresh = async () => {
    setIsLoading(true);
    await refetch();
    setIsLoading(false);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: price < 1 ? 6 : 2
    }).format(price);
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1e9) return `$${(volume / 1e9).toFixed(2)}B`;
    if (volume >= 1e6) return `$${(volume / 1e6).toFixed(2)}M`;
    return formatPrice(volume);
  };

  const formatPercentage = (percent: number) => {
    const formatted = percent.toFixed(2);
    return percent >= 0 ? `+${formatted}%` : `${formatted}%`;
  };

  const getCryptoIcon = (symbol: string) => {
    const icons: Record<string, string> = {
      BTC: "₿",
      ETH: "Ξ"
    };
    return icons[symbol] || symbol;
  };

  const getCryptoColor = (symbol: string) => {
    const colors: Record<string, string> = {
      BTC: "from-orange-400 to-orange-600",
      ETH: "from-blue-400 to-indigo-600"
    };
    return colors[symbol] || "from-gray-400 to-gray-600";
  };

  if (queryLoading && prices.length === 0) {
    return (
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
        <div className="flex items-center justify-center py-8">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="h-8 w-8 border-3 border-purple-500 border-t-transparent rounded-full"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
      {/* header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            crypto prices
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            live cryptocurrency market data
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            auto-refresh
          </label>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </motion.button>
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
        >
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </motion.div>
      )}

      {/* price cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence mode="popLayout">
          {prices.map((crypto) => (
            <motion.div
              key={crypto.symbol}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              className="relative overflow-hidden"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${getCryptoColor(crypto.symbol)} opacity-5 rounded-2xl`} />
              
              <div className="relative bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
                {/* header with symbol and name */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 bg-gradient-to-br ${getCryptoColor(crypto.symbol)} rounded-xl flex items-center justify-center text-white font-bold text-xl`}>
                      {getCryptoIcon(crypto.symbol)}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {crypto.symbol}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {crypto.name}
                      </p>
                    </div>
                  </div>
                  
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${
                    crypto.changePercent24h >= 0 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' 
                      : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  }`}>
                    {crypto.changePercent24h >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    <span className="text-sm font-medium">
                      {formatPercentage(crypto.changePercent24h)}
                    </span>
                  </div>
                </div>

                {/* current price */}
                <div className="mb-4">
                  <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                    {formatPrice(crypto.price)}
                  </div>
                  <div className={`text-sm mt-1 ${
                    crypto.change24h >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {crypto.change24h >= 0 ? '+' : ''}{formatPrice(Math.abs(crypto.change24h))} (24h)
                  </div>
                </div>

                {/* stats grid */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">24h high</p>
                    <p className="text-gray-900 dark:text-gray-100 font-medium">
                      {formatPrice(crypto.high24h)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">24h low</p>
                    <p className="text-gray-900 dark:text-gray-100 font-medium">
                      {formatPrice(crypto.low24h)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">24h volume</p>
                    <p className="text-gray-900 dark:text-gray-100 font-medium">
                      {formatVolume(crypto.volume24h)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">market cap</p>
                    <p className="text-gray-900 dark:text-gray-100 font-medium">
                      {formatVolume(crypto.marketCap)}
                    </p>
                  </div>
                </div>

                {/* price range bar */}
                <div className="mt-4">
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ 
                        width: `${((crypto.price - crypto.low24h) / (crypto.high24h - crypto.low24h)) * 100}%` 
                      }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className={`h-full bg-gradient-to-r ${getCryptoColor(crypto.symbol)}`}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>24h low</span>
                    <span>24h high</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* footer */}
      <div className="mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <DollarSign className="h-3 w-3" />
          <span>prices in USD</span>
        </div>
        <div>
          last updated: {lastRefresh.toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}