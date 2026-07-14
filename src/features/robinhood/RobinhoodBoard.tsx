import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  enrichPoolsWithWindows,
  fetchChainSnapshot,
  HOUR_SAMPLE_MIN_TVL,
  mergePoolStats,
} from './api/uniswap'
import type { ChainSnapshot, PoolRow, Protocol, TokenRow, WinKey } from './types'
import { WIN_KEYS } from './types'
import { feeLabel, pct, price, timeAgo, usd } from './utils/format'
import './RobinhoodBoard.css'

type Tab = 'pools' | 'tokens'
type PoolSort = 'tvl' | 'feeTier' | 'txCount' | 'tvlChange24h' | WinKey | `fees_${WinKey}` | `apr_${WinKey}`
type TokenSort = 'volume1h' | 'volume1d' | 'tvl' | 'priceChange24h' | 'price' | 'symbol'
type Dir = 'desc' | 'asc'

/** base list (TVL/pairs) + window vol — 10 min is enough for LP screening */
const BASE_REFRESH_MS = 10 * 60_000
const WIN_REFRESH_MS = 10 * 60_000
const DEFAULT_MIN_TVL = 20_000
const MAX_VISIBLE_ROWS = 80

function riskFlag(p: PoolRow, win: WinKey): 'high' | 'med' | null {
  const apr = p.stats?.[win]?.apr ?? 0
  if (p.tvl < 50_000 && apr > 200) return 'high'
  if (p.tvl < 100_000 && apr > 100) return 'med'
  const vol = p.stats?.[win]?.vol ?? 0
  if (p.tvl > 0 && vol / p.tvl > 20 && p.tvl < 200_000) return 'med'
  return null
}

function poolSortValue(p: PoolRow, key: PoolSort): number {
  if (key === 'tvl' || key === 'feeTier' || key === 'txCount') return p[key]
  if (key === 'tvlChange24h') return p.tvlChange24h ?? -Infinity
  if (key.startsWith('fees_')) {
    const w = key.slice(5) as WinKey
    return p.stats?.[w]?.fees ?? -1
  }
  if (key.startsWith('apr_')) {
    const w = key.slice(4) as WinKey
    return p.stats?.[w]?.apr ?? -1
  }
  const v = p.stats?.[key as WinKey]?.vol
  return v == null ? -1 : v
}

function fmtWin(vol: number | null | undefined, loading: boolean): string {
  // null/undefined = no data; 0 = real zero volume
  if (vol == null) return loading ? '…' : '—'
  return usd(vol)
}

export default function App() {
  const [data, setData] = useState<ChainSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [hourLoading, setHourLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('pools')

  const [q, setQ] = useState('')
  const [protocol, setProtocol] = useState<'ALL' | Protocol>('ALL')
  const [minTvl, setMinTvl] = useState(DEFAULT_MIN_TVL)
  const [feeWin, setFeeWin] = useState<WinKey>('1h')
  const [minVol, setMinVol] = useState(0)
  const [feeFilter, setFeeFilter] = useState<string>('ALL')
  const [hideEmptyVol, setHideEmptyVol] = useState(false)
  const [onlyNew, setOnlyNew] = useState(false)

  const [poolSort, setPoolSort] = useState<PoolSort>('1h')
  const [poolDir, setPoolDir] = useState<Dir>('desc')
  const [tokenSort, setTokenSort] = useState<TokenSort>('volume1h')
  const [tokenDir, setTokenDir] = useState<Dir>('desc')

  const dataRef = useRef<ChainSnapshot | null>(null)
  /** bumps to invalidate in-flight window jobs (hard refresh only) */
  const winGen = useRef(0)
  const winBusyRef = useRef(false)

  useEffect(() => {
    dataRef.current = data
  }, [data])

  const loadBase = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const snap = await fetchChainSnapshot()
      const prev = dataRef.current
      const pools = mergePoolStats(snap.pools, prev?.pools)
      const hourReady = pools.filter((p) => p.stats != null && p.tvl >= HOUR_SAMPLE_MIN_TVL).length
      const next: ChainSnapshot = {
        ...snap,
        pools,
        hourReady,
        hourTotal: pools.filter((p) => p.tvl >= HOUR_SAMPLE_MIN_TVL).length,
      }
      setData(next)
      setError(null)
      return next
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const loadWindows = useCallback(async (pools: PoolRow[]) => {
    if (winBusyRef.current) return
    const gen = ++winGen.current
    winBusyRef.current = true
    setHourLoading(true)
    try {
      // Prefer re-sampling pools still missing stats first, then refresh all
      const ordered = [...pools].sort((a, b) => {
        const am = a.stats == null ? 0 : 1
        const bm = b.stats == null ? 0 : 1
        if (am !== bm) return am - bm
        return b.tvl - a.tvl
      })
      await enrichPoolsWithWindows(ordered, {
        isCancelled: () => winGen.current !== gen,
        onPools: (pools, ready, total) => {
          if (winGen.current !== gen) return
          setData((prev) => {
            if (!prev) return prev
            // merge by id so base list order/tvl stay from prev
            const byId = new Map(pools.map((p) => [p.id, p]))
            return {
              ...prev,
              hourReady: ready,
              hourTotal: total,
              pools: prev.pools.map((p) => {
                const u = byId.get(p.id)
                return u ? { ...p, stats: u.stats, volumeSource: u.volumeSource } : p
              }),
              fetchedAt: Date.now(),
            }
          })
        },
      })
    } catch (e) {
      console.error(e)
    } finally {
      if (winGen.current === gen) {
        winBusyRef.current = false
        setHourLoading(false)
      }
    }
  }, [])

  const hardRefresh = useCallback(async () => {
    winGen.current += 1
    winBusyRef.current = false
    const snap = await loadBase(true)
    if (snap) {
      const cleared = {
        ...snap,
        pools: snap.pools.map((p) => ({ ...p, stats: null })),
        hourReady: 0,
      }
      setData(cleared)
      void loadWindows(cleared.pools)
    }
  }, [loadBase, loadWindows])

  useEffect(() => {
    // Do not cancel sampling on unmount (avoids half-filled tables)
    void (async () => {
      const snap = await loadBase(false)
      if (snap) void loadWindows(snap.pools)
    })()
    const baseId = setInterval(() => {
      if (!document.hidden) void loadBase(true)
    }, BASE_REFRESH_MS)
    const winId = setInterval(() => {
      const cur = dataRef.current
      if (cur && !winBusyRef.current && !document.hidden) void loadWindows(cur.pools)
    }, WIN_REFRESH_MS)
    const onVisible = () => {
      if (!document.hidden) void loadBase(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(baseId)
      clearInterval(winId)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, [])

  const summary = useMemo(() => {
    if (!data) return null
    const listed = data.pools.filter((p) => p.tvl >= minTvl)
    const tvl = listed.reduce((s, p) => s + p.tvl, 0)
    const volByWin = Object.fromEntries(
      WIN_KEYS.map((w) => [w, listed.reduce((s, p) => s + (p.stats?.[w]?.vol ?? 0), 0)]),
    ) as Record<WinKey, number>
    const feesByWin = Object.fromEntries(
      WIN_KEYS.map((w) => [w, listed.reduce((s, p) => s + (p.stats?.[w]?.fees ?? 0), 0)]),
    ) as Record<WinKey, number>
    const v2 = listed.filter((p) => p.protocol === 'V2').length
    const v3 = listed.filter((p) => p.protocol === 'V3').length
    const v4 = listed.filter((p) => p.protocol === 'V4').length
    return {
      tvl,
      volByWin,
      feesByWin,
      v2,
      v3,
      v4,
      poolCount: listed.length,
      rawPoolCount: data.pools.length,
      tokenVol1h: data.tokens.reduce((s, t) => s + t.volume1h, 0),
      tokenVol1d: data.tokens.reduce((s, t) => s + t.volume1d, 0),
      tokenCount: data.tokens.length,
      newCount: data.pools.filter((p) => p.isNew && p.tvl >= minTvl).length,
    }
  }, [data, minTvl])

  const feeOptions = useMemo(() => {
    if (!data) return []
    return [...new Set(data.pools.map((p) => p.feeTier))].sort((a, b) => a - b)
  }, [data])

  const pools = useMemo(() => {
    if (!data) return []
    const qq = q.trim().toLowerCase()
    let list = data.pools.filter((p) => {
      if (protocol !== 'ALL' && p.protocol !== protocol) return false
      if (p.tvl < minTvl) return false
      if (minVol > 0 && (p.stats?.[feeWin]?.vol ?? 0) < minVol) return false
      if (feeFilter !== 'ALL' && p.feeTier !== Number(feeFilter)) return false
      if (hideEmptyVol && (p.stats?.[feeWin]?.vol ?? 0) <= 0 && p.stats != null) return false
      if (onlyNew && !p.isNew) return false
      if (qq) {
        const hay = `${p.pair} ${p.token0.symbol} ${p.token1.symbol} ${p.token0.name} ${p.token1.name} ${p.address}`.toLowerCase()
        if (!hay.includes(qq)) return false
      }
      return true
    })
    list = [...list].sort((a, b) => {
      const an = poolSortValue(a, poolSort)
      const bn = poolSortValue(b, poolSort)
      return poolDir === 'desc' ? bn - an : an - bn
    })
    return list
  }, [data, q, protocol, minTvl, minVol, feeWin, feeFilter, hideEmptyVol, onlyNew, poolSort, poolDir])

  const tokens = useMemo(() => {
    if (!data) return []
    const qq = q.trim().toLowerCase()
    let list = data.tokens.filter((t) => {
      if (t.tvl < minTvl) return false
      if (minVol > 0 && t.volume1h < minVol && t.volume1d < minVol) return false
      if (qq) {
        const hay = `${t.symbol} ${t.name} ${t.address}`.toLowerCase()
        if (!hay.includes(qq)) return false
      }
      return true
    })
    list = [...list].sort((a, b) => {
      const av = a[tokenSort]
      const bv = b[tokenSort]
      if (typeof av === 'string' && typeof bv === 'string') {
        return tokenDir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv)
      }
      const an = typeof av === 'number' ? av : 0
      const bn = typeof bv === 'number' ? bv : 0
      return tokenDir === 'desc' ? bn - an : an - bn
    })
    return list
  }, [data, q, minTvl, minVol, tokenSort, tokenDir])

  function togglePoolSort(key: PoolSort) {
    if (poolSort === key) setPoolDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else {
      setPoolSort(key)
      setPoolDir('desc')
    }
  }

  function toggleTokenSort(key: TokenSort) {
    if (tokenSort === key) setTokenDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else {
      setTokenSort(key)
      setTokenDir('desc')
    }
  }

  function sortMark(active: boolean, dir: Dir) {
    if (!active) return ''
    return dir === 'desc' ? ' ↓' : ' ↑'
  }

  return (
    <div className="rh-board">
      <header className="rh-header">
        <div>
          <h1>Robinhood Uniswap LP</h1>
          <p className="sub">
            真成交量：5m / 15m / 30m / 1h / 6h / 24h · TVL ≥ $20k · 后台暂停刷新
          </p>
        </div>
        <div className="header-actions">
          <span className="live">
            {refreshing ? 'refreshing…' : data ? timeAgo(data.fetchedAt) : '—'}
            {hourLoading
              ? ` · windows ${data?.hourReady ?? 0}/${data?.hourTotal ?? '?'}`
              : data
                ? ` · win ${data.hourReady}/${data.hourTotal}`
                : ''}
          </span>
          <button className="btn" onClick={() => void hardRefresh()} disabled={loading || refreshing}>
            刷新
          </button>
        </div>
      </header>

      {data?.v3Stale && (
        <div className="banner warn">
          Uniswap V3 子图在 Robinhood 上游标记为延迟，基础数据可能慢一点。
        </div>
      )}
      {error && <div className="banner err">Error: {error}</div>}

      {summary && (
        <section className="cards">
          <Card
            label="筛选后 TVL"
            value={usd(summary.tvl, 0)}
            hint={`${summary.poolCount} shown / ${summary.rawPoolCount} ranked · V2 ${summary.v2} / V3 ${summary.v3} / V4 ${summary.v4}`}
          />
          <Card
            label={`池子成交 ${feeWin}`}
            value={
              hourLoading && summary.volByWin[feeWin] === 0 && (data?.hourReady ?? 0) === 0
                ? '…'
                : usd(summary.volByWin[feeWin], 0)
            }
            hint={`Fees ${feeWin} ≈ ${usd(summary.feesByWin[feeWin], 0)} · NEW 24h: ${summary.newCount}`}
          />
          <Card
            label="池子成交 24h"
            value={
              hourLoading && summary.volByWin['24h'] === 0 && (data?.hourReady ?? 0) === 0
                ? '…'
                : usd(summary.volByWin['24h'], 0)
            }
            hint={`Fees 24h ≈ ${usd(summary.feesByWin['24h'], 0)} · GeckoTerminal real`}
          />
          <Card
            label="代币成交 1h / 24h"
            value={usd(summary.tokenVol1h, 0)}
            hint={`24h ${usd(summary.tokenVol1d, 0)} · Uniswap API · ${summary.tokenCount} ranked`}
          />
        </section>
      )}

      <section className="toolbar">
        <div className="tabs">
          <button className={tab === 'pools' ? 'tab on' : 'tab'} onClick={() => setTab('pools')}>
            池子 ({pools.length})
          </button>
          <button className={tab === 'tokens' ? 'tab on' : 'tab'} onClick={() => setTab('tokens')}>
            代币 ({tokens.length})
          </button>
        </div>

        <div className="filters">
          <input
            className="input"
            placeholder="搜索交易对 / 代币 / 地址..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {tab === 'pools' && (
            <>
              <select
                className="select"
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as 'ALL' | Protocol)}
              >
                <option value="ALL">全部版本</option>
                <option value="V2">只看 V2</option>
                <option value="V3">只看 V3</option>
                <option value="V4">只看 V4</option>
              </select>
              <select className="select" value={feeFilter} onChange={(e) => setFeeFilter(e.target.value)}>
                <option value="ALL">全部费率</option>
                {feeOptions.map((f) => (
                  <option key={f} value={f}>
                    {feeLabel(f)}
                  </option>
                ))}
              </select>
              <select
                className="select"
                value={feeWin}
                onChange={(e) => {
                  const w = e.target.value as WinKey
                  setFeeWin(w)
                  setPoolSort(w)
                }}
                title="Fees/APR column + min-vol filter window"
              >
                {WIN_KEYS.map((w) => (
                  <option key={w} value={w}>
                    Focus: {w}
                  </option>
                ))}
              </select>
            </>
          )}
          <select className="select" value={minTvl} onChange={(e) => setMinTvl(Number(e.target.value))}>
            <option value={0}>TVL: 不限</option>
            <option value={10_000}>≥ $10K</option>
            <option value={20_000}>≥ $20K (default)</option>
            <option value={50_000}>≥ $50K</option>
            <option value={100_000}>≥ $100K</option>
            <option value={500_000}>≥ $500K</option>
            <option value={1_000_000}>≥ $1M</option>
          </select>
          <select className="select" value={minVol} onChange={(e) => setMinVol(Number(e.target.value))}>
            <option value={0}>成交 ({feeWin}): 不限</option>
            <option value={1_000}>≥ $1K</option>
            <option value={10_000}>≥ $10K</option>
            <option value={50_000}>≥ $50K</option>
            <option value={100_000}>≥ $100K</option>
            <option value={500_000}>≥ $500K</option>
          </select>
          {tab === 'pools' && (
            <>
              <label className="check">
                <input type="checkbox" checked={hideEmptyVol} onChange={(e) => setHideEmptyVol(e.target.checked)} />
                隐藏 0 成交
              </label>
              <label className="check">
                <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
                只看 24h 新池
              </label>
            </>
          )}
        </div>
      </section>

      <p className="disclaimer">
        <strong>用法</strong>：热度 <code>5m·15m·30m·1h</code>；半天 <code>6h</code>；全天 <code>24h</code>。
        成交量：Gecko 榜单 + 按地址 multi 补全短窗口。仅 24h 有数=Gecko 未收录、用了 Uni V2 日量。
        <code>—</code>=无数据；<code>$0</code>=真实零成交。Fees/APR=<code>vol×fee</code> 粗算。
        页面最多渲染前 {MAX_VISIBLE_ROWS} 行，减少浏览器扩展扫描压力。
      </p>

      {loading && !data ? (
        <div className="empty">Loading Robinhood Uniswap data…</div>
      ) : tab === 'pools' ? (
        <PoolsTable
          rows={pools.slice(0, MAX_VISIBLE_ROWS)}
          sort={poolSort}
          dir={poolDir}
          onSort={togglePoolSort}
          sortMark={sortMark}
          hourLoading={hourLoading}
          feeWin={feeWin}
        />
      ) : (
        <TokensTable
          rows={tokens.slice(0, MAX_VISIBLE_ROWS)}
          sort={tokenSort}
          dir={tokenDir}
          onSort={toggleTokenSort}
          sortMark={sortMark}
        />
      )}
    </div>
  )
}

function Card({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className="card-value">{value}</div>
      <div className="card-hint">{hint}</div>
    </div>
  )
}

function PoolsTable({
  rows,
  sort,
  dir,
  onSort,
  sortMark,
  hourLoading,
  feeWin,
}: {
  rows: PoolRow[]
  sort: PoolSort
  dir: Dir
  onSort: (k: PoolSort) => void
  sortMark: (active: boolean, dir: Dir) => string
  hourLoading: boolean
  feeWin: WinKey
}) {
  if (!rows.length) return <div className="empty">No pools match filters.</div>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Pair</th>
            <th>Proto</th>
            <th className="num sortable" onClick={() => onSort('feeTier')}>
              Fee{sortMark(sort === 'feeTier', dir)}
            </th>
            <th className="num sortable" onClick={() => onSort('tvl')}>
              TVL{sortMark(sort === 'tvl', dir)}
            </th>
            {WIN_KEYS.map((w) => (
              <th key={w} className="num sortable" onClick={() => onSort(w)}>
                Vol {w}
                {sortMark(sort === w, dir)}
              </th>
            ))}
            <th className="num sortable" onClick={() => onSort(`fees_${feeWin}`)}>
              Fees {feeWin}≈{sortMark(sort === `fees_${feeWin}`, dir)}
            </th>
            <th className="num sortable" onClick={() => onSort(`apr_${feeWin}`)}>
              APR {feeWin}≈{sortMark(sort === `apr_${feeWin}`, dir)}
            </th>
            <th>Risk</th>
            <th>Pool</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const risk = riskFlag(p, feeWin)
            const st = p.stats?.[feeWin]
            return (
              <tr key={p.id} className={risk === 'high' ? 'row-high' : risk === 'med' ? 'row-med' : ''}>
                <td className="pair">
                  <strong>{p.pair}</strong>
                  {p.isNew && <span className="badge-new">NEW</span>}
                </td>
                <td>
                  <span className={`tag ${p.protocol.toLowerCase()}`}>{p.protocol}</span>
                </td>
                <td className="num">{feeLabel(p.feeTier)}</td>
                <td className="num mono">{usd(p.tvl)}</td>
                {WIN_KEYS.map((w) => {
                  const s = p.stats?.[w]
                  return (
                    <td key={w} className="num mono">
                      {fmtWin(s?.vol, hourLoading && p.stats == null)}
                    </td>
                  )
                })}
                <td className="num mono">
                  {st?.fees == null
                    ? hourLoading && p.stats == null
                      ? '…'
                      : '—'
                    : usd(st.fees)}
                </td>
                <td className="num mono">
                  {st?.apr == null
                    ? hourLoading && p.stats == null
                      ? '…'
                      : '—'
                    : pct(st.apr, 0)}
                </td>
                <td>
                  {risk === 'high' && <span className="risk high">high</span>}
                  {risk === 'med' && <span className="risk med">watch</span>}
                  {!risk && <span className="risk ok">—</span>}
                </td>
                <td>
                  <button className="link-btn" type="button" onClick={() => window.open(p.uniswapUrl, '_blank', 'noopener,noreferrer')}>
                    打开
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TokensTable({
  rows,
  sort,
  dir,
  onSort,
  sortMark,
}: {
  rows: TokenRow[]
  sort: TokenSort
  dir: Dir
  onSort: (k: TokenSort) => void
  sortMark: (active: boolean, dir: Dir) => string
}) {
  if (!rows.length) return <div className="empty">No tokens match filters.</div>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="sortable" onClick={() => onSort('symbol')}>
              Token{sortMark(sort === 'symbol', dir)}
            </th>
            <th className="num sortable" onClick={() => onSort('price')}>
              Price{sortMark(sort === 'price', dir)}
            </th>
            <th className="num sortable" onClick={() => onSort('priceChange24h')}>
              24h%{sortMark(sort === 'priceChange24h', dir)}
            </th>
            <th className="num sortable" onClick={() => onSort('volume1h')}>
              Vol 1h{sortMark(sort === 'volume1h', dir)}
            </th>
            <th className="num sortable" onClick={() => onSort('volume1d')}>
              Vol 1d{sortMark(sort === 'volume1d', dir)}
            </th>
            <th className="num sortable" onClick={() => onSort('tvl')}>
              TVL{sortMark(sort === 'tvl', dir)}
            </th>
            <th>Address</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.address}>
              <td className="pair">
                <strong>{t.symbol}</strong>
                <span className="muted"> {t.name}</span>
              </td>
              <td className="num mono">{price(t.price)}</td>
              <td className={`num mono ${chgClass(t.priceChange24h)}`}>{pct(t.priceChange24h)}</td>
              <td className="num mono">{usd(t.volume1h)}</td>
              <td className="num mono">{usd(t.volume1d)}</td>
              <td className="num mono">{usd(t.tvl)}</td>
              <td>
                <button className="link-btn" type="button" onClick={() => window.open(t.uniswapUrl, '_blank', 'noopener,noreferrer')}>
                  打开
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function chgClass(n: number | null | undefined): string {
  if (n == null || n === 0) return ''
  return n > 0 ? 'up' : 'down'
}
