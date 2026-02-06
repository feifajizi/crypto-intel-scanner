import { useState } from 'react';
import type { MerklReward } from '@/types';
import { useMerklRewards } from '@/hooks/useMerklRewards';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, 
  DollarSign, 
  Layers, 
  ExternalLink,
  Filter,
  RefreshCw,
  Zap
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function RewardCard({ reward }: { reward: MerklReward }) {
  const formatCurrency = (value: number) => {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'ended': return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
      case 'upcoming': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return '进行中';
      case 'ended': return '已结束';
      case 'upcoming': return '即将开始';
      default: return status;
    }
  };

  // 使用正确的Merkl链接
  const merklLink = reward.merklUrl || `https://app.merkl.xyz/opportunities/${reward.protocol.toLowerCase()}/CLAMM/${reward.opportunityId}`;

  return (
    <div className="group bg-gradient-to-br from-slate-900/50 to-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10 overflow-hidden">
      {/* 主内容 */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          {/* 左侧: 协议信息 */}
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-lg font-bold text-white group-hover:text-purple-400 transition-colors">
                {reward.opportunityName}
              </h3>
              <Badge className={`${getStatusColor(reward.status)} border`}>
                {getStatusText(reward.status)}
              </Badge>
              <Badge variant="outline" className="text-slate-400 border-slate-600">
                {reward.chainName}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-slate-400">协议:</span>
              <span className="text-sm font-medium text-cyan-400">{reward.protocol}</span>
              <span className="text-slate-600">|</span>
              <span className="text-sm text-slate-400">奖励代币:</span>
              <span className="text-sm font-medium text-purple-400">{reward.tokenSymbol}</span>
            </div>
          </div>
          
          {/* 右侧: APR */}
          <div className="text-right hidden sm:block">
            <p className="text-xs text-slate-500 mb-1">APR</p>
            <p className="text-2xl font-bold text-green-400">{reward.apr.toFixed(2)}%</p>
          </div>
        </div>
        
        {/* 指标卡片 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
              <Layers className="w-3 h-3" />
              TVL
            </div>
            <p className="text-lg font-semibold text-white">{formatCurrency(reward.tvl)}</p>
          </div>
          
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
              <DollarSign className="w-3 h-3" />
              每日奖励
            </div>
            <p className="text-lg font-semibold text-cyan-400">
              {reward.dailyRewards.toLocaleString()} {reward.tokenSymbol}
            </p>
          </div>
          
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
              <TrendingUp className="w-3 h-3" />
              APR
            </div>
            <p className="text-lg font-semibold text-green-400">{reward.apr.toFixed(2)}%</p>
          </div>
        </div>
        
        {/* 操作按钮 */}
        <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center justify-between">
          <div className="text-xs text-slate-500 font-mono truncate max-w-[300px]">
            {merklLink}
          </div>
          <a
            href={merklLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            在 Merkl 上查看
          </a>
        </div>
      </div>
    </div>
  );
}

function RewardSkeleton() {
  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-12 w-24" />
      </div>
      <div className="grid grid-cols-3 gap-4 mt-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  );
}

export function MerklRewards() {
  const { rewards, loading, error, refresh } = useMerklRewards();
  const [filter, setFilter] = useState<'all' | 'active' | 'ended' | 'upcoming'>('all');

  const filteredRewards = rewards.filter(reward => {
    if (filter === 'all') return true;
    return reward.status === filter;
  });

  // 计算统计数据
  const stats = {
    totalRewards: rewards.reduce((acc, r) => acc + r.dailyRewards, 0),
    totalTvl: rewards.reduce((acc, r) => acc + r.tvl, 0),
    avgApr: rewards.length > 0 ? rewards.reduce((acc, r) => acc + r.apr, 0) / rewards.length : 0,
    activeCount: rewards.filter(r => r.status === 'active').length
  };

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
      {/* 标题和筛选 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
              Merkl 最新激励
            </span>
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/50">
              Live
            </Badge>
          </h2>
          <p className="text-slate-400 mt-1">实时追踪 DeFi 流动性挖矿最新奖励</p>
        </div>
        
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-slate-700 text-white hover:bg-slate-800">
                <Filter className="w-4 h-4 mr-2" />
                {filter === 'all' ? '全部' : 
                 filter === 'active' ? '进行中' : 
                 filter === 'ended' ? '已结束' : '即将开始'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-slate-800 border-slate-700">
              <DropdownMenuItem onClick={() => setFilter('all')} className="text-white hover:bg-slate-700">
                全部
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilter('active')} className="text-white hover:bg-slate-700">
                进行中
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilter('upcoming')} className="text-white hover:bg-slate-700">
                即将开始
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilter('ended')} className="text-white hover:bg-slate-700">
                已结束
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
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

      {/* 统计卡片 */}
      {!loading && rewards.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-purple-900/30 to-slate-900/50 border-purple-500/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-purple-400 mb-2">
                <Zap className="w-4 h-4" />
                <span className="text-sm">活跃激励</span>
              </div>
              <p className="text-2xl font-bold text-white">{stats.activeCount}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-cyan-900/30 to-slate-900/50 border-cyan-500/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-cyan-400 mb-2">
                <DollarSign className="w-4 h-4" />
                <span className="text-sm">每日总奖励</span>
              </div>
              <p className="text-2xl font-bold text-white">{stats.totalRewards.toLocaleString()}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-900/30 to-slate-900/50 border-green-500/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-green-400 mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm">平均 APR</span>
              </div>
              <p className="text-2xl font-bold text-white">{stats.avgApr.toFixed(2)}%</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-pink-900/30 to-slate-900/50 border-pink-500/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-pink-400 mb-2">
                <Layers className="w-4 h-4" />
                <span className="text-sm">总 TVL</span>
              </div>
              <p className="text-2xl font-bold text-white">
                ${(stats.totalTvl / 1e6).toFixed(2)}M
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 奖励列表 */}
      <div className="space-y-4">
        {loading ? (
          // 加载骨架
          Array.from({ length: 4 }).map((_, i) => (
            <RewardSkeleton key={i} />
          ))
        ) : filteredRewards.length > 0 ? (
          // 奖励卡片
          filteredRewards.map((reward) => (
            <RewardCard key={reward.id} reward={reward} />
          ))
        ) : (
          // 空状态
          <div className="text-center py-12 bg-slate-900/30 rounded-xl border border-slate-700/50">
            <p className="text-slate-400">暂无奖励数据</p>
          </div>
        )}
      </div>
    </div>
  );
}
