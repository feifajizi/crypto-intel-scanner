import { useState, useEffect, useCallback } from 'react';
import type { Coin } from '@/types';
import { dataService, coinGeckoService } from '@/services/api';

export function useCoins(limit: number = 100) {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCoins = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 使用dataService获取币种数据（包含links）
      const data = await dataService.getCoinsWithDetails(limit);
      
      setCoins(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch coins';
      setError(errorMessage);
      console.error('Error fetching coins:', err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchCoins();
  }, [fetchCoins]);

  // 刷新函数
  const refresh = useCallback(() => {
    fetchCoins();
  }, [fetchCoins]);

  return { coins, loading, error, refresh };
}

export function useCoinSearch(query: string) {
  const [results, setResults] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const search = async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }

      try {
        setLoading(true);
        const data = await coinGeckoService.searchCoins(query);
        setResults(data);
      } catch (err) {
        console.error('Search error:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(search, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  return { results, loading };
}
