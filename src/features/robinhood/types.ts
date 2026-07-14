export type Protocol = 'V2' | 'V3' | 'V4'

/** Uniswap V2 fixed swap fee = 0.30% → 3000 hundredths of a bip */
export const V2_FEE_TIER = 3000

/**
 * Real windows from GeckoTerminal (no extrapolation).
 * Keys match API: m5 / m15 / m30 / h1 / h6 / h24
 */
export type WinKey = '5m' | '15m' | '30m' | '1h' | '6h' | '24h'

export const WIN_KEYS: WinKey[] = ['5m', '15m', '30m', '1h', '6h', '24h']

/** GeckoTerminal volume_usd field names */
export const WIN_GECKO: Record<WinKey, string> = {
  '5m': 'm5',
  '15m': 'm15',
  '30m': 'm30',
  '1h': 'h1',
  '6h': 'h6',
  '24h': 'h24',
}

/** seconds in window — for APR annualization from fees */
export const WIN_SEC: Record<WinKey, number> = {
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '6h': 21600,
  '24h': 86400,
}

export interface TokenRef {
  address: string
  symbol: string
  name: string
}

export interface WindowStats {
  /** null = this window has no data (not the same as $0) */
  vol: number | null
  fees: number | null
  apr: number | null
  partial: boolean
}

export interface PoolRow {
  id: string
  protocol: Protocol
  address: string
  feeTier: number
  txCount: number
  tvl: number
  tvlChange24h: number | null
  createdAtTimestamp: number | null
  /** null = not loaded / not found on any volume source */
  stats: Record<WinKey, WindowStats> | null
  /** Uniswap GraphQL real 1d volume when available (V2) */
  vol1dOfficial: number | null
  token0: TokenRef
  token1: TokenRef
  pair: string
  uniswapUrl: string
  isNew: boolean
  volumeSource: 'geckoterminal' | 'uniswap-day' | null
}

export interface TokenRow {
  address: string
  symbol: string
  name: string
  decimals: number
  price: number
  volume1h: number
  volume1d: number
  tvl: number
  priceChange24h: number
  uniswapUrl: string
}

export interface ChainSnapshot {
  pools: PoolRow[]
  tokens: TokenRow[]
  fetchedAt: number
  v3Stale: boolean
  hourReady: number
  hourTotal: number
}
