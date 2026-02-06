import { useState, useEffect, useCallback } from 'react';
import type { MerklReward } from '@/types';
import { merklService } from '@/services/api';

export function useMerklRewards() {
  const [rewards, setRewards] = useState<MerklReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRewards = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 使用Merkl API获取真实数据
      const data = await merklService.getOpportunities();
      
      setRewards(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch rewards';
      setError(errorMessage);
      console.error('Error fetching Merkl rewards:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRewards();
  }, [fetchRewards]);

  // 刷新函数
  const refresh = useCallback(() => {
    fetchRewards();
  }, [fetchRewards]);

  return { rewards, loading, error, refresh };
}

export function useActiveRewards() {
  const [rewards, setRewards] = useState<MerklReward[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActive = async () => {
      try {
        setLoading(true);
        const data = await merklService.getActiveRewards();
        setRewards(data);
      } catch (err) {
        console.error('Error fetching active rewards:', err);
        setRewards([]);
      } finally {
        setLoading(false);
      }
    };

    fetchActive();
  }, []);

  return { rewards, loading };
}

export function useLatestRewards(limit: number = 10) {
  const [rewards, setRewards] = useState<MerklReward[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLatest = async () => {
      try {
        setLoading(true);
        const data = await merklService.getLatestRewards(limit);
        setRewards(data);
      } catch (err) {
        console.error('Error fetching latest rewards:', err);
        setRewards([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLatest();
  }, [limit]);

  return { rewards, loading };
}

export function useRewardsByChain(chainId: number) {
  const [rewards, setRewards] = useState<MerklReward[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchByChain = async () => {
      if (!chainId) return;
      
      try {
        setLoading(true);
        const data = await merklService.getRewardsByChain(chainId);
        setRewards(data);
      } catch (err) {
        console.error('Error fetching rewards by chain:', err);
        setRewards([]);
      } finally {
        setLoading(false);
      }
    };

    fetchByChain();
  }, [chainId]);

  return { rewards, loading };
}
