export function usd(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  if (Math.abs(n) < 0.01 && n !== 0) return `$${n.toExponential(1)}`
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: digits })}`
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(digits)}%`
}

export function feeLabel(feeTier: number): string {
  // 500 = 0.05%
  const p = feeTier / 10_000
  if (p >= 1) return `${p.toFixed(2)}%`
  if (p >= 0.1) return `${p.toFixed(2)}%`
  return `${p.toFixed(2)}%`
}

export function price(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—'
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  if (n >= 1) return `$${n.toFixed(4)}`
  if (n >= 0.01) return `$${n.toFixed(5)}`
  return `$${n.toPrecision(3)}`
}

export function shortAddr(a: string): string {
  if (!a || a.length < 12) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ${s % 60}s ago`
}
