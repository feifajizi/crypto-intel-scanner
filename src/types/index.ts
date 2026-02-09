// 币种数据类型
export interface Coin {
  // 通用 id（当前实现为 symbol.toLowerCase()）
  id: string;

  symbol: string;
  name: string;
  image?: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_24h: number;

  // tags（用于过滤 meme / rwa / tokenized-stock 等；当前 Gate 来源默认空数组）
  tags?: string[];

  sparkline_in_7d?: {
    price: number[];
  };
  listed_at?: string;

  // 额外字段
  homepage?: string;
  twitter_screen_name?: string;

  // 合约信息（用于人工 override / 校验）
  token_network?: string;
  token_address?: string;
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
