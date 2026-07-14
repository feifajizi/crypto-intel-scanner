import type { PoolRow, WinKey, WindowStats } from '../types'
import { WIN_GECKO, WIN_KEYS, WIN_SEC } from '../types'

const GT = import.meta.env.VITE_GECKO_URL ?? '/api/rh-gecko'
const NETWORK = 'robinhood'
/** 3 pages = 60 pools — covers almost all liquid RH pools; rest via multi */
const PAGES = 3
const MULTI_CHUNK = 30

export type GeckoVolMap = Map<string, Partial<Record<WinKey, number>>>

function feeRate(feeTier: number): number {
  return feeTier / 1_000_000
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function geckoUrl(path: string): string {
  return `${GT}?path=${encodeURIComponent(path)}`
}

function num(v: unknown): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function emptyStats(): Record<WinKey, WindowStats> {
  return Object.fromEntries(
    WIN_KEYS.map((k) => [k, { vol: null, fees: null, apr: null, partial: false }]),
  ) as Record<WinKey, WindowStats>
}

/** Build stats; missing keys → null (display —), present 0 → real $0 */
export function statsFromVolumes(
  vols: Partial<Record<WinKey, number | null>>,
  feeTier: number,
  tvl: number,
): Record<WinKey, WindowStats> {
  const rate = feeRate(feeTier)
  const out = emptyStats()
  for (const k of WIN_KEYS) {
    if (!(k in vols) || vols[k] == null) {
      out[k] = { vol: null, fees: null, apr: null, partial: false }
      continue
    }
    const vol = num(vols[k])
    const fees = vol * rate
    const periods = (365 * 24 * 3600) / WIN_SEC[k]
    const apr = tvl > 0 ? (fees * periods) / tvl * 100 : 0
    out[k] = { vol, fees, apr, partial: false }
  }
  return out
}

interface GeckoPoolAttrs {
  address?: string
  name?: string
  reserve_in_usd?: string
  volume_usd?: Partial<Record<string, string | number>>
}

interface GeckoPoolItem {
  attributes?: GeckoPoolAttrs
}

function parsePoolItem(item: GeckoPoolItem): { addr: string; vols: Partial<Record<WinKey, number>> } | null {
  const a = item.attributes || {}
  const addr = (a.address || '').toLowerCase()
  if (!addr) return null
  const vu = a.volume_usd || {}
  const vols: Partial<Record<WinKey, number>> = {}
  for (const k of WIN_KEYS) {
    if (vu[WIN_GECKO[k]] != null && vu[WIN_GECKO[k]] !== '') {
      vols[k] = num(vu[WIN_GECKO[k]])
    }
  }
  return { addr, vols }
}

async function fetchJson(url: string): Promise<{ ok: boolean; status: number; json: unknown }> {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    if (!res.ok) {
      return { ok: false, status: res.status, json: null }
    }
    return { ok: true, status: res.status, json: await res.json() }
  } catch {
    return { ok: false, status: 0, json: null }
  }
}

function mergeItems(map: GeckoVolMap, items: GeckoPoolItem[]) {
  for (const item of items) {
    const parsed = parsePoolItem(item)
    if (!parsed) continue
    map.set(parsed.addr, parsed.vols)
  }
}

/**
 * Fast path: fetch rank pages in parallel (server caches 90s).
 * Then multi-get only still-missing addresses among targets.
 */
export async function fetchGeckoVolumeMap(
  onUpdate?: (map: GeckoVolMap) => void,
): Promise<GeckoVolMap> {
  const map: GeckoVolMap = new Map()

  // Parallel page fetch — proxy serializes + caches upstream
  const pageResults = await Promise.all(
    Array.from({ length: PAGES }, (_, i) => {
      const page = i + 1
      const url = geckoUrl(`/networks/${NETWORK}/pools?page=${page}&sort=h24_volume_usd_desc`)
      return fetchJson(url)
    }),
  )

  for (const { ok, json } of pageResults) {
    if (!ok) continue
    const items = ((json as { data?: GeckoPoolItem[] }).data || []) as GeckoPoolItem[]
    mergeItems(map, items)
  }
  onUpdate?.(map)
  return map
}

export async function fetchGeckoByAddresses(
  addresses: string[],
  onUpdate?: (map: GeckoVolMap) => void,
): Promise<GeckoVolMap> {
  const map: GeckoVolMap = new Map()
  const uniq = [...new Set(addresses.map((a) => a.toLowerCase()).filter(Boolean))]
  if (!uniq.length) return map

  for (let i = 0; i < uniq.length; i += MULTI_CHUNK) {
    const chunk = uniq.slice(i, i + MULTI_CHUNK)
    const path = geckoUrl(`/networks/${NETWORK}/pools/multi/${chunk.join(',')}`)
    let { ok, json, status } = await fetchJson(path)
    // one retry on 429/empty
    if (!ok || status === 429) {
      await sleep(600)
      ;({ ok, json, status } = await fetchJson(path))
    }
    if (ok) {
      const raw = (json as { data?: GeckoPoolItem[] | GeckoPoolItem }).data
      const items = Array.isArray(raw) ? raw : raw ? [raw] : []
      mergeItems(map, items)
      onUpdate?.(new Map(map))
    } else {
      console.warn('gecko multi fail', status, 'chunk', chunk.length)
    }
    if (i + MULTI_CHUNK < uniq.length) await sleep(200)
  }

  return map
}

export function applyGeckoVolumes(pools: PoolRow[], volMap: GeckoVolMap): {
  pools: PoolRow[]
  matched: number
} {
  let matched = 0
  const next = pools.map((p) => {
    const vols = volMap.get(p.address.toLowerCase())
    if (!vols) return p
    matched++
    return {
      ...p,
      stats: statsFromVolumes(vols, p.feeTier, p.tvl),
      volumeSource: 'geckoterminal' as const,
    }
  })
  return { pools: next, matched }
}

export { emptyStats }
