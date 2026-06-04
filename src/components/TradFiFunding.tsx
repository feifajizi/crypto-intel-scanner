import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, ExternalLink, RefreshCw, Search, SlidersHorizontal, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface FundingRow {
  exchange: 'Gate' | 'Bybit' | 'Binance' | 'OKX' | 'Bitget' | 'Hyperliquid' | 'AsterDEX' | 'Lighter' | 'Variational' | 'GRVT' | string;
  symbol: string;
  base: string;
  fundingRate: number | null;
  fundingRatePct: number | null;
  intervalHours: number | null;
  annualizedPct: number | null;
  absAnnualizedPct: number | null;
  earnSide: string;
  nextFundingTime: string | null;
  markPrice: number | null;
  indexPrice: number | null;
  lastPrice: number | null;
  turnover24h: number | null;
  volume24h: number | null;
  openInterest: number | null;
  maxLeverage: string | null;
  url: string;
}

interface ApiResp {
  updatedAt: string;
  count: number;
  errors?: { exchange: string; error: string }[];
  data: FundingRow[];
}

type SortKey = 'absAnnualizedPct' | 'annualizedPct' | 'fundingRatePct' | 'base' | 'exchange';

const EXCHANGES = ['Gate', 'Bybit', 'Binance', 'OKX', 'Bitget', 'Hyperliquid', 'AsterDEX', 'Lighter', 'Variational', 'GRVT'];

function fmtPct(v: number | null | undefined, digits = 3) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}%`;
}

function fmtNum(v: number | null | undefined, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(v);
}

function fmtTime(v: string | null | undefined) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function exchangeColor(exchange: string) {
  if (exchange === 'Gate') return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
  if (exchange === 'Bybit') return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
  if (exchange === 'Binance') return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30';
  if (exchange === 'OKX') return 'bg-white/10 text-slate-100 border-white/20';
  if (exchange === 'Bitget') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (exchange === 'Hyperliquid') return 'bg-teal-500/15 text-teal-300 border-teal-500/30';
  if (exchange === 'AsterDEX') return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
  if (exchange === 'Lighter') return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
  if (exchange === 'Variational') return 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30';
  if (exchange === 'GRVT') return 'bg-lime-500/15 text-lime-300 border-lime-500/30';
  return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
}

export function TradFiFunding() {
  const [rows, setRows] = useState<FundingRow[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<ApiResp['errors']>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedExchanges, setSelectedExchanges] = useState<string[]>(EXCHANGES);
  const [minAbsAnnualized, setMinAbsAnnualized] = useState('0');
  const [direction, setDirection] = useState<'all' | 'long' | 'short'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('absAnnualizedPct');

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const exchanges = selectedExchanges.map((x) => x.toLowerCase()).join(',');
      const resp = await fetch(`/api/tradfi-funding?exchanges=${encodeURIComponent(exchanges)}&t=${Date.now()}`, {
        headers: { Accept: 'application/json' },
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || `HTTP ${resp.status}`);
      setRows(Array.isArray(json.data) ? json.data : []);
      setUpdatedAt(json.updatedAt || new Date().toISOString());
      setErrors(Array.isArray(json.errors) ? json.errors : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const max = rows[0];
    const positive = rows.filter((r) => (r.annualizedPct || 0) > 0).length;
    const negative = rows.filter((r) => (r.annualizedPct || 0) < 0).length;
    return { max, positive, negative };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    const min = Number(minAbsAnnualized || 0);
    return rows
      .filter((r) => selectedExchanges.includes(r.exchange))
      .filter((r) => !q || r.symbol.toUpperCase().includes(q) || r.base.toUpperCase().includes(q))
      .filter((r) => (r.absAnnualizedPct || 0) >= (Number.isFinite(min) ? min : 0))
      .filter((r) => {
        if (direction === 'long') return (r.annualizedPct || 0) < 0;
        if (direction === 'short') return (r.annualizedPct || 0) > 0;
        return true;
      })
      .sort((a, b) => {
        if (sortKey === 'base' || sortKey === 'exchange') return String(a[sortKey]).localeCompare(String(b[sortKey]));
        return ((b[sortKey] as number | null) || 0) - ((a[sortKey] as number | null) || 0);
      });
  }, [rows, query, selectedExchanges, minAbsAnnualized, direction, sortKey]);

  const toggleExchange = (exchange: string) => {
    setSelectedExchanges((prev) => {
      if (prev.includes(exchange)) return prev.filter((x) => x !== exchange);
      return [...prev, exchange];
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <Badge className="bg-cyan-500/15 text-cyan-300 border-cyan-500/30">股票合约</Badge>
            <Badge className="bg-slate-800 text-slate-300 border-slate-700">手动刷新</Badge>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            股票合约 <span className="text-cyan-400">资金费率</span>
          </h2>
          <p className="text-slate-400 mt-3 max-w-2xl">
            只筛股票/ETF 类 TradFi 永续，覆盖 Gate、Bybit、Binance、OKX、Bitget、Hyperliquid、AsterDEX、Lighter、Variational、GRVT；正费率做空收，负费率做多收。
          </p>
        </div>
        <Button onClick={load} disabled={loading || selectedExchanges.length === 0} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          刷新实时费率
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
          <div className="text-slate-400 text-sm">当前合约</div>
          <div className="text-2xl font-bold text-white mt-1">{rows.length}</div>
        </div>
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
          <div className="text-slate-400 text-sm">最高绝对年化</div>
          <div className="text-2xl font-bold text-cyan-300 mt-1">{fmtPct(stats.max?.absAnnualizedPct, 1)}</div>
        </div>
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
          <div className="text-slate-400 text-sm">做空收 / 做多收</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.positive} / {stats.negative}</div>
        </div>
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
          <div className="text-slate-400 text-sm">更新时间</div>
          <div className="text-lg font-semibold text-white mt-1">{fmtTime(updatedAt)}</div>
        </div>
      </div>

      <div className="bg-slate-900/70 backdrop-blur-sm rounded-2xl border border-slate-800 p-4 md:p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="relative md:col-span-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜 AAPL / NVDA / TSLA" className="pl-9 bg-slate-950/80 border-slate-700 text-white" />
          </div>
          <div className="md:col-span-3">
            <Input value={minAbsAnnualized} onChange={(e) => setMinAbsAnnualized(e.target.value)} placeholder="最低绝对年化 %" className="bg-slate-950/80 border-slate-700 text-white" />
          </div>
          <select value={direction} onChange={(e) => setDirection(e.target.value as any)} className="md:col-span-2 bg-slate-950/80 border border-slate-700 rounded-md px-3 text-sm text-white">
            <option value="all">全部方向</option>
            <option value="short">做空收</option>
            <option value="long">做多收</option>
          </select>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="md:col-span-3 bg-slate-950/80 border border-slate-700 rounded-md px-3 text-sm text-white">
            <option value="absAnnualizedPct">按绝对年化</option>
            <option value="annualizedPct">按年化方向</option>
            <option value="fundingRatePct">按单期费率</option>
            <option value="base">按股票代码</option>
            <option value="exchange">按交易所</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-slate-500" />
          {EXCHANGES.map((exchange) => (
            <button
              key={exchange}
              onClick={() => toggleExchange(exchange)}
              className={`px-3 py-1.5 rounded-full border text-sm transition-all ${selectedExchanges.includes(exchange) ? exchangeColor(exchange) : 'bg-slate-950 text-slate-500 border-slate-800'}`}
            >
              {exchange}
            </button>
          ))}
          <span className="text-slate-500 text-sm ml-auto">筛选后 {filtered.length} 条</span>
        </div>

        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300 text-sm">{error}</div>}
        {errors && errors.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200 text-sm">
            部分交易所拉取失败：{errors.map((e) => `${e.exchange}: ${e.error}`).join('；')}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-950/90 text-slate-400">
              <tr>
                <th className="text-left p-3 font-medium">交易所</th>
                <th className="text-left p-3 font-medium">品种</th>
                <th className="text-right p-3 font-medium">费率/周期</th>
                <th className="text-right p-3 font-medium">年化</th>
                <th className="text-left p-3 font-medium">收益方向</th>
                <th className="text-right p-3 font-medium">标记价</th>
                <th className="text-right p-3 font-medium">OI</th>
                <th className="text-left p-3 font-medium">下次结算</th>
                <th className="text-right p-3 font-medium">链接</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/30">
              {loading && rows.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-slate-400">正在拉取实时费率...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-slate-400">当前筛选下暂无数据</td></tr>
              ) : filtered.map((r) => {
                const positive = (r.annualizedPct || 0) > 0;
                const negative = (r.annualizedPct || 0) < 0;
                return (
                  <tr key={`${r.exchange}:${r.symbol}`} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3"><Badge className={exchangeColor(r.exchange)}>{r.exchange}</Badge></td>
                    <td className="p-3">
                      <div className="font-semibold text-white">{r.base}</div>
                      <div className="text-xs text-slate-500">{r.symbol}</div>
                    </td>
                    <td className="p-3 text-right text-slate-200">
                      <div>{fmtPct(r.fundingRatePct, 4)}</div>
                      <div className="text-xs text-slate-500">/{r.intervalHours || '-'}h</div>
                    </td>
                    <td className={`p-3 text-right font-bold ${positive ? 'text-emerald-300' : negative ? 'text-red-300' : 'text-slate-300'}`}>
                      {fmtPct(r.annualizedPct, 1)}
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 ${positive ? 'text-emerald-300' : negative ? 'text-red-300' : 'text-slate-300'}`}>
                        {positive ? <TrendingUp className="w-4 h-4" /> : negative ? <TrendingDown className="w-4 h-4" /> : <ArrowDownUp className="w-4 h-4" />}
                        {r.earnSide}
                      </span>
                    </td>
                    <td className="p-3 text-right text-slate-200">${fmtNum(r.markPrice || r.lastPrice, 4)}</td>
                    <td className="p-3 text-right text-slate-300">{fmtNum(r.openInterest, 0)}</td>
                    <td className="p-3 text-slate-300 whitespace-nowrap">{fmtTime(r.nextFundingTime)}</td>
                    <td className="p-3 text-right">
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-end text-cyan-300 hover:text-cyan-200">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
