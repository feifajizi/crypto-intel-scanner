import type {
  ChainSnapshot,
  PoolRow,
  TokenRow,
  TokenRef,
  Protocol,
  WinKey,
} from '../types'
import { V2_FEE_TIER } from '../types'
import {
  applyGeckoVolumes,
  fetchGeckoByAddresses,
  fetchGeckoVolumeMap,
  statsFromVolumes,
} from './geckoterminal'

const GQL = import.meta.env.VITE_GQL_URL ?? '/api/rh-graphql'
const CHAIN = 'ROBINHOOD'
const CHAIN_PATH = 'robinhood'

export const HOUR_SAMPLE_MIN_TVL = 20_000
const NEW_POOL_SEC = 24 * 3600

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function gql<T>(query: string): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(GQL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`GraphQL HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ''}`)
      }
      const json = await res.json()
      if (json.data == null) {
        const msg = json.errors?.[0]?.message ?? 'empty GraphQL data'
        throw new Error(msg)
      }
      return json.data as T
    } catch (e) {
      lastErr = e
      if (attempt < 1) await sleep(200)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

function num(v: { value?: number | null } | null | undefined): number {
  return v?.value ?? 0
}

function optNum(v: { value?: number | null } | null | undefined): number | null {
  if (v?.value == null) return null
  return v.value
}

function mapToken(t: { address: string; symbol: string; name: string }): TokenRef {
  return { address: t.address, symbol: t.symbol, name: t.name }
}

function buildPool(input: {
  protocol: Protocol
  id: string
  address: string
  feeTier: number
  txCount: number
  tvl: number
  tvlChange24h: number | null
  createdAtTimestamp: number | null
  vol1dOfficial: number | null
  token0: TokenRef
  token1: TokenRef
  nowSec: number
}): PoolRow {
  const pair = `${input.token0.symbol}/${input.token1.symbol}`
  const uniswapUrl = `https://app.uniswap.org/explore/pools/${CHAIN_PATH}/${input.address}`
  const isNew =
    input.createdAtTimestamp != null &&
    input.nowSec - input.createdAtTimestamp < NEW_POOL_SEC

  return {
    id: input.id,
    protocol: input.protocol,
    address: input.address,
    feeTier: input.feeTier,
    txCount: input.txCount,
    tvl: input.tvl,
    tvlChange24h: input.tvlChange24h,
    createdAtTimestamp: input.createdAtTimestamp,
    stats: null,
    vol1dOfficial: input.vol1dOfficial,
    token0: input.token0,
    token1: input.token1,
    pair,
    uniswapUrl,
    isNew,
    volumeSource: null,
  }
}

interface V2Raw {
  address: string
  txCount: number
  createdAtTimestamp: number | null
  totalLiquidity: { value: number } | null
  totalLiquidityPercentChange24h: { value: number } | null
  volDay: { value: number } | null
  token0: { address: string; symbol: string; name: string }
  token1: { address: string; symbol: string; name: string }
}

interface V3Raw {
  address: string
  feeTier: number
  txCount: number
  createdAtTimestamp: number | null
  totalLiquidity: { value: number } | null
  totalLiquidityPercentChange24h: { value: number } | null
  token0: { address: string; symbol: string; name: string }
  token1: { address: string; symbol: string; name: string }
}

interface V4Raw {
  poolId: string
  feeTier: number
  txCount: number
  createdAtTimestamp: number | null
  totalLiquidity: { value: number } | null
  totalLiquidityPercentChange24h: { value: number } | null
  token0: { address: string; symbol: string; name: string }
  token1: { address: string; symbol: string; name: string }
}

interface TokenRaw {
  address: string
  symbol: string
  name: string
  decimals: number
  market: {
    price: { value: number } | null
    volume1h: { value: number } | null
    volume1d: { value: number } | null
    totalValueLocked: { value: number } | null
    pricePercentChange: { value: number } | null
  } | null
}

export async function fetchChainSnapshot(): Promise<ChainSnapshot> {
  const nowSec = Math.floor(Date.now() / 1000)
  const [v2r, v3r, v4r, tokensR, staleR] = await Promise.allSettled([
    // V2: real DAY volume from Uniswap (works on RH)
    gql<{ topV2Pairs: V2Raw[] }>(`{
      topV2Pairs(chain: ${CHAIN}, first: 100) {
        address txCount createdAtTimestamp
        totalLiquidity { value }
        totalLiquidityPercentChange24h { value }
        volDay: cumulativeVolume(duration: DAY) { value }
        token0 { address symbol name }
        token1 { address symbol name }
      }
    }`),
    gql<{ topV3Pools: V3Raw[] }>(`{
      topV3Pools(chain: ${CHAIN}, first: 100) {
        address feeTier txCount createdAtTimestamp
        totalLiquidity { value }
        totalLiquidityPercentChange24h { value }
        token0 { address symbol name }
        token1 { address symbol name }
      }
    }`),
    gql<{ topV4Pools: V4Raw[] }>(`{
      topV4Pools(chain: ${CHAIN}, first: 100) {
        poolId feeTier txCount createdAtTimestamp
        totalLiquidity { value }
        totalLiquidityPercentChange24h { value }
        token0 { address symbol name }
        token1 { address symbol name }
      }
    }`),
    gql<{ topTokens: TokenRaw[] }>(`{
      topTokens(chain: ${CHAIN}, page: 0, pageSize: 50, orderBy: VOLUME) {
        address symbol name decimals
        market {
          price { value }
          volume1h: volume(duration: HOUR) { value }
          volume1d: volume(duration: DAY) { value }
          totalValueLocked { value }
          pricePercentChange(duration: DAY) { value }
        }
      }
    }`),
    gql<{ isV3SubgraphStale: boolean }>(`{
      isV3SubgraphStale(chain: ${CHAIN})
    }`),
  ])

  const v2 = v2r.status === 'fulfilled' ? v2r.value : { topV2Pairs: [] as V2Raw[] }
  const v3 = v3r.status === 'fulfilled' ? v3r.value : { topV3Pools: [] as V3Raw[] }
  const v4 = v4r.status === 'fulfilled' ? v4r.value : { topV4Pools: [] as V4Raw[] }
  const tokens = tokensR.status === 'fulfilled' ? tokensR.value : { topTokens: [] as TokenRaw[] }
  const stale =
    staleR.status === 'fulfilled' ? staleR.value : { isV3SubgraphStale: false }

  if (
    v2r.status === 'rejected' &&
    v3r.status === 'rejected' &&
    v4r.status === 'rejected'
  ) {
    throw new Error(
      v3r.reason instanceof Error ? v3r.reason.message : 'failed to load pools',
    )
  }

  const pools: PoolRow[] = [
    ...(v2.topV2Pairs ?? []).map((p) =>
      buildPool({
        protocol: 'V2',
        id: `v2-${p.address}`,
        address: p.address,
        feeTier: V2_FEE_TIER,
        txCount: p.txCount ?? 0,
        tvl: num(p.totalLiquidity),
        tvlChange24h: optNum(p.totalLiquidityPercentChange24h),
        createdAtTimestamp: p.createdAtTimestamp ?? null,
        vol1dOfficial: optNum(p.volDay),
        token0: mapToken(p.token0),
        token1: mapToken(p.token1),
        nowSec,
      }),
    ),
    ...(v3.topV3Pools ?? []).map((p) =>
      buildPool({
        protocol: 'V3',
        id: `v3-${p.address}`,
        address: p.address,
        feeTier: p.feeTier,
        txCount: p.txCount ?? 0,
        tvl: num(p.totalLiquidity),
        tvlChange24h: optNum(p.totalLiquidityPercentChange24h),
        createdAtTimestamp: p.createdAtTimestamp ?? null,
        vol1dOfficial: null, // V3 DAY broken on RH GraphQL
        token0: mapToken(p.token0),
        token1: mapToken(p.token1),
        nowSec,
      }),
    ),
    ...(v4.topV4Pools ?? []).map((p) =>
      buildPool({
        protocol: 'V4',
        id: `v4-${p.poolId}`,
        address: p.poolId,
        feeTier: p.feeTier,
        txCount: p.txCount ?? 0,
        tvl: num(p.totalLiquidity),
        tvlChange24h: optNum(p.totalLiquidityPercentChange24h),
        createdAtTimestamp: p.createdAtTimestamp ?? null,
        vol1dOfficial: null,
        token0: mapToken(p.token0),
        token1: mapToken(p.token1),
        nowSec,
      }),
    ),
  ]

  const tokenRows: TokenRow[] = (tokens.topTokens ?? []).map((t) => {
    const m = t.market
    return {
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
      price: num(m?.price),
      volume1h: num(m?.volume1h),
      volume1d: num(m?.volume1d),
      tvl: num(m?.totalValueLocked),
      priceChange24h: num(m?.pricePercentChange),
      uniswapUrl: `https://app.uniswap.org/explore/tokens/${CHAIN_PATH}/${t.address}`,
    }
  })

  return {
    pools,
    tokens: tokenRows,
    fetchedAt: Date.now(),
    v3Stale: Boolean(stale.isV3SubgraphStale),
    hourReady: 0,
    hourTotal: pools.filter((p) => p.tvl >= HOUR_SAMPLE_MIN_TVL).length,
  }
}

export type EnrichOpts = {
  /** Called with full pool list after each partial apply — UI should replace pools */
  onPools?: (pools: PoolRow[], ready: number, total: number) => void
  isCancelled?: () => boolean
}

function applyV2DayFallback(pools: PoolRow[]): PoolRow[] {
  return pools.map((p) => {
    // only if still no gecko stats at all
    if (p.stats != null && p.volumeSource === 'geckoterminal') return p
    if (p.stats != null && p.volumeSource === 'uniswap-day') return p
    if (p.stats != null) return p
    if (p.vol1dOfficial == null || p.vol1dOfficial <= 0) return p
    return {
      ...p,
      stats: statsFromVolumes({ '24h': p.vol1dOfficial }, p.feeTier, p.tvl),
      volumeSource: 'uniswap-day' as const,
    }
  })
}

/** Needs multi-fetch: no gecko short windows yet (null / uniswap-day-only) */
function needsGeckoShortWindows(p: PoolRow): boolean {
  if (p.tvl < HOUR_SAMPLE_MIN_TVL) return false
  if (p.volumeSource === 'geckoterminal' && p.stats?.['1h']?.vol != null) return false
  return true
}

function countReady(pools: PoolRow[]): number {
  // count pools that have real short-window data (1h), not just 24h fallback
  return pools.filter(
    (p) => p.tvl >= HOUR_SAMPLE_MIN_TVL && p.stats?.['1h']?.vol != null,
  ).length
}

/**
 * REAL volumes via GeckoTerminal.
 * Rank pages → multi ALL incomplete V2/V3/V4 → only then V2 day fallback for 24h only.
 * BUGFIX: do NOT apply V2 day before multi (that blocked multi with stats!=null).
 */
export async function enrichPoolsWithWindows(
  pools: PoolRow[],
  opts?: EnrichOpts,
): Promise<{ pools: PoolRow[]; hourReady: number }> {
  const total = pools.filter((p) => p.tvl >= HOUR_SAMPLE_MIN_TVL).length
  let next = pools
  const volMap: Map<string, Partial<Record<WinKey, number>>> = new Map()

  const publishGeckoOnly = () => {
    const applied = applyGeckoVolumes(next, volMap)
    next = applied.pools
    const ready = countReady(next)
    opts?.onPools?.(next, ready, total)
    return ready
  }

  if (opts?.isCancelled?.()) {
    return { pools: next, hourReady: countReady(next) }
  }

  // 1) rank pages
  const ranked = await fetchGeckoVolumeMap((m) => {
    for (const [a, v] of m) volMap.set(a, v)
    if (!opts?.isCancelled?.()) publishGeckoOnly()
  })
  for (const [a, v] of ranked) volMap.set(a, v)
  publishGeckoOnly()

  if (opts?.isCancelled?.()) {
    return { pools: next, hourReady: countReady(next) }
  }

  // 2) multi-fetch EVERY pool still missing short windows (includes V2 that only have Uni day later)
  const missing = next.filter(needsGeckoShortWindows).map((p) => p.address)
  console.info(`gecko multi needed: ${missing.length}/${total}`)

  if (missing.length) {
    const extra = await fetchGeckoByAddresses(missing, (m) => {
      for (const [addr, vols] of m) volMap.set(addr, vols)
      if (!opts?.isCancelled?.()) publishGeckoOnly()
    })
    for (const [addr, vols] of extra) volMap.set(addr, vols)
    publishGeckoOnly()
  }

  // 3) ONLY now: V2 Uni DAY → 24h column for leftovers without gecko
  next = applyV2DayFallback(next)
  const hourReady = countReady(next)
  // also count day-only as partially filled for UI progress bar
  const anyReady = next.filter((p) => p.stats != null && p.tvl >= HOUR_SAMPLE_MIN_TVL).length
  opts?.onPools?.(next, hourReady, total)

  console.info(
    `volume gecko-1h ready ${hourReady}/${total}, any-stats ${anyReady}/${total}, multi asked ${missing.length}`,
  )
  return { pools: next, hourReady }
}

export function mergePoolStats(fresh: PoolRow[], prev: PoolRow[] | undefined): PoolRow[] {
  if (!prev?.length) return fresh
  const map = new Map(prev.map((p) => [p.id, p]))
  return fresh.map((p) => {
    const old = map.get(p.id)
    if (!old?.stats) return p
    return {
      ...p,
      stats: old.stats,
      volumeSource: old.volumeSource,
      vol1dOfficial: p.vol1dOfficial ?? old.vol1dOfficial,
    }
  })
}
