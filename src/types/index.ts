// 币种数据类型
export interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_24h: number;
  sparkline_in_7d?: {
    price: number[];
  };
  listed_at?: string;
  // 额外字段
  homepage?: string;
  twitter_screen_name?: string;
}

// Merkl奖励数据类型
export interface MerklReward {
  id: string;
  opportunityId: string;
  opportunityName: string;
  protocol: string;
  chainId: number;
  chainName: string;
  tokenSymbol: string;
  tokenAddress: string;
  dailyRewards: number;
  tvl: number;
  apr: number;
  startTimestamp: number;
  endTimestamp: number;
  status: 'active' | 'ended' | 'upcoming';
  merklUrl?: string; // 正确的Merkl链接
}

// 扫描结果类型
export interface ScanResult {
  token: string;
  source: 'twitter' | 'website';
  matchedKeywords: string[];
  context: string;
  link: string;
  timestamp: string;
}

// API响应类型
export interface ApiResponse<T> {
  data: T;
  loading: boolean;
  error: string | null;
}
