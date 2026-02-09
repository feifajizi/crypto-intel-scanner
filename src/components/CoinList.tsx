import { useMemo, useState } from 'react';
import type { Coin } from '@/types';
import { useCoins, useCoinSearch } from '@/hooks/useCoins';
import { dataService } from '@/services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Search, Twitter, Globe, RefreshCw } from 'lucide-react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

function CoinCard({ coin, index }: { coin: Coin; index: number }) {
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const isPositive = (coin.price_change_percentage_24h || 0) >= 0;
  
  // 构建Twitter链接
  const twitterUrl = coin.twitter_screen_name 
    ? `https://twitter.com/${coin.twitter_screen_name}`
    : null;
  
  // 官网链接
  const homepageUrl = coin.homepage || null;

  const doScan = async () => {
    if (!homepageUrl || scanLoading) return;

    try {
      setScanLoading(true);
      setScanError(null);
      setScanResult(null);

      // 轻缓存：同一个 homepage 一天内不重复扫
      const cacheKey = `stake-scan:${homepageUrl}`;
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        const ts = Date.parse(cached?.scanned_at || '');
        if (Number.isFinite(ts) && Date.now() - ts < 24 * 3600 * 1000) {
          setScanResult(cached);
          return;
        }
      }

      const r = await dataService.scanStake(homepageUrl, 8);
      setScanResult(r);
      localStorage.setItem(cacheKey, JSON.stringify(r));
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'scan failed');
    } finally {
      setScanLoading(false);
    }
  };
  
  return (
    <div className="group relative bg-gradient-to-br from-slate-900/50 to-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10 hover:-translate-y-1">
      <div className="flex items-center gap-4">
        {/* 排名 */}
        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-slate-800 rounded-lg text-slate-400 text-sm font-medium">
          {index + 1}
        </div>
        
        {/* 图标 */}
        <div className="relative">
          <img 
            src={coin.image || `https://via.placeholder.com/40?text=${coin.symbol}`} 
            alt={coin.symbol}
            className="w-10 h-10 rounded-full bg-slate-800 p-1"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://via.placeholder.com/40?text=${coin.symbol}`;
            }}
          />
        </div>
        
        {/* 信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-white">{coin.symbol}</h3>
            <span className="text-slate-500 text-sm truncate">{coin.name}</span>
          </div>

          {coin.token_network && coin.token_address && (
            <div
              className="mt-0.5 text-xs text-slate-600 truncate font-mono"
              title={`${coin.token_network}:${coin.token_address}`}
            >
              {coin.token_network}:{coin.token_address}
            </div>
          )}

          <div className="flex items-center gap-4 mt-1 text-sm">
            <span className="text-slate-400">
              ${coin.current_price?.toLocaleString()}
            </span>
            <span className={`flex items-center gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(coin.price_change_percentage_24h || 0).toFixed(2)}%
            </span>
          </div>
        </div>
        
        {/* 市值 & 交易量 */}
        <div className="hidden sm:flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-slate-500">市值</p>
            <p className="text-sm font-medium text-white">
              ${(coin.market_cap / 1e9).toFixed(2)}B
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">24h 交易量</p>
            <p className="text-sm font-medium text-white">
              ${(coin.total_volume / 1e6).toFixed(2)}M
            </p>
          </div>
        </div>
        
        {/* 链接按钮 + 扫描 */}
        <div className="flex items-center gap-2">
          {twitterUrl && (
            <a
              href={twitterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-blue-500/20 hover:text-blue-400 transition-all"
              title={`Twitter/X: @${coin.twitter_screen_name}`}
            >
              <Twitter className="w-4 h-4" />
            </a>
          )}
          {homepageUrl && (
            <a
              href={homepageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-green-500/20 hover:text-green-400 transition-all"
              title="官网"
            >
              <Globe className="w-4 h-4" />
            </a>
          )}

          {homepageUrl && (
            <Button
              onClick={doScan}
              variant="outline"
              size="icon"
              className="border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
              disabled={scanLoading}
              title="扫描官网是否有 staking/earn"
            >
              <ExternalLink className={`w-4 h-4 ${scanLoading ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </div>

      {(scanResult || scanError) && (
        <div className="mt-2 text-xs text-slate-400">
          {scanError && <span className="text-red-400">Scan failed: {scanError}</span>}
          {scanResult && (
            <span>
              Stake-scan: {scanResult.found ? 'FOUND' : 'not found'}
              {scanResult.evidence?.url ? (
                <a
                  className="ml-2 text-cyan-400 hover:underline"
                  href={scanResult.evidence.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  evidence
                </a>
              ) : null}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function CoinSkeleton() {
  return (
    <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
      <div className="flex items-center gap-4">
        <Skeleton className="w-8 h-8 rounded-lg" />
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-8 w-24 hidden sm:block" />
        <Skeleton className="h-8 w-24 hidden sm:block" />
        <div className="flex gap-2">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-8 h-8 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function CoinList() {
  const [searchQuery, setSearchQuery] = useState('');
  const [excludeMeme, setExcludeMeme] = useState(true);
  const [excludeRwaStock, setExcludeRwaStock] = useState(true);

  const { coins, loading, error, refresh } = useCoins(100);
  const { results: searchResults, loading: searchLoading } = useCoinSearch(searchQuery);

  const displayCoins = useMemo(() => {
    const list = searchQuery ? searchResults : coins;

    const MEME_TAGS = new Set([
      'memes',
      'meme',
      'doggone-doggerel',
    ]);

    const RWA_STOCK_TAGS = new Set([
      'rwa',
      'real-world-assets',
      'tokenized-stock',
      'tokenized-stocks',
      'tokenized-assets',
      'tokenized-gold',
    ]);

    const shouldDrop = (coin: Coin) => {
      const tags = (coin.tags || []).map(t => String(t).toLowerCase());
      if (excludeMeme && tags.some(t => MEME_TAGS.has(t) || t.includes('meme'))) return true;
      if (excludeRwaStock && tags.some(t => RWA_STOCK_TAGS.has(t) || t.includes('rwa') || t.includes('tokenized'))) return true;

      // 兜底：tags 没给/不准时，用 name/symbol 做弱规则
      const name = `${coin.name} ${coin.symbol}`.toLowerCase();
      if (excludeMeme && /(inu|doge|pepe|shib|wif|bonk|meme)/i.test(name)) return true;
      if (excludeRwaStock && /(rwa|stock|share|equity|gold|silver|treasury|bond)/i.test(name)) return true;

      return false;
    };

    return list.filter(c => !shouldDrop(c));
  }, [coins, searchQuery, searchResults, excludeMeme, excludeRwaStock]);

  if (error) {
    return (
      <Card className="bg-slate-900/50 border-slate-700">
        <CardContent className="p-8 text-center">
          <p className="text-red-400 mb-4">加载失败: {error}</p>
          <Button onClick={refresh} variant="outline" className="border-slate-700 text-white hover:bg-slate-800">
            <RefreshCw className="w-4 h-4 mr-2" />
            重试
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题和搜索 */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              最新上架币种
            </span>
            <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/50">
              100
            </Badge>
          </h2>
          <p className="text-slate-400 mt-1">按 Gate 上架时间倒序（官网 / Twitter 链接保守补全：不确定就留空）</p>

          {/* 过滤开关 */}
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={excludeMeme} onCheckedChange={setExcludeMeme} />
              <Label className="text-slate-300">去掉 Meme</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={excludeRwaStock} onCheckedChange={setExcludeRwaStock} />
              <Label className="text-slate-300">去掉 RWA/股票相关</Label>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              placeholder="搜索币种..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full sm:w-64 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>
          <Button 
            onClick={refresh} 
            variant="outline" 
            size="icon"
            className="border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* 统计信息 */}
      {!loading && !searchQuery && coins.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
            <p className="text-slate-400 text-sm">总币种数</p>
            <p className="text-2xl font-bold text-white">{coins.length}</p>
          </div>
          <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
            <p className="text-slate-400 text-sm">上涨</p>
            <p className="text-2xl font-bold text-green-400">
              {coins.filter(c => (c.price_change_percentage_24h || 0) > 0).length}
            </p>
          </div>
          <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
            <p className="text-slate-400 text-sm">下跌</p>
            <p className="text-2xl font-bold text-red-400">
              {coins.filter(c => (c.price_change_percentage_24h || 0) < 0).length}
            </p>
          </div>
          <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
            <p className="text-slate-400 text-sm">总交易量</p>
            <p className="text-2xl font-bold text-cyan-400">
              ${(coins.reduce((acc, c) => acc + (c.total_volume || 0), 0) / 1e9).toFixed(1)}B
            </p>
          </div>
        </div>
      )}

      {/* 币种列表 */}
      <div className="space-y-3">
        {loading || searchLoading ? (
          // 加载骨架
          Array.from({ length: 8 }).map((_, i) => (
            <CoinSkeleton key={i} />
          ))
        ) : displayCoins.length > 0 ? (
          // 币种卡片
          displayCoins.map((coin, index) => (
            <CoinCard key={coin.id} coin={coin} index={index} />
          ))
        ) : (
          // 空状态
          <div className="text-center py-12">
            <p className="text-slate-400">未找到匹配的币种</p>
          </div>
        )}
      </div>
    </div>
  );
}
