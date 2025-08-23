import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

// mock crypto data - in production you'd fetch from a real API
const mockCryptoData = {
  BTC: {
    symbol: 'BTC',
    name: 'Bitcoin',
    price: 65234.56,
    change24h: 1245.23,
    changePercent24h: 1.95,
    high24h: 66000.00,
    low24h: 63500.00,
    volume24h: 28500000000,
    marketCap: 1275000000000,
  },
  ETH: {
    symbol: 'ETH',
    name: 'Ethereum',
    price: 3456.78,
    change24h: -45.67,
    changePercent24h: -1.30,
    high24h: 3525.00,
    low24h: 3400.00,
    volume24h: 12300000000,
    marketCap: 415000000000,
  },
};

export const cryptoRouter = router({
  getPrices: publicProcedure
    .input(
      z.object({
        symbols: z.array(z.string()),
      })
    )
    .query(async ({ input }) => {
      // simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const prices = input.symbols
        .map(symbol => mockCryptoData[symbol as keyof typeof mockCryptoData])
        .filter(Boolean)
        .map(data => ({
          ...data,
          lastUpdated: new Date(),
        }));

      return {
        prices,
        timestamp: new Date(),
      };
    }),
});