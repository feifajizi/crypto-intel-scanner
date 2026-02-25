import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Tweet {
  id: string;
  screen_name: string;
  name: string;
  text: string;
  created_at: string;
  url: string;
  media_urls: string[];
  is_rt: boolean;
  rt_source: string;
}

interface TwitterData {
  last_update: string;
  count: number;
  tweets: Tweet[];
}

export function TwitterMonitor() {
  const [data, setData] = useState<TwitterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const fetchTweets = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/twitter_tweets.json');
      
      if (!response.ok) {
        throw new Error('Failed to fetch tweets');
      }
      
      const jsonData = await response.json();
      setData(jsonData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching tweets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTweets();
  }, []);

  const formatTime = (dateStr: string) => {
    try {
      // Twitter API 返回格式: "Wed Feb 25 13:20:15 +0000 2026"
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return '刚刚';
      if (diffMins < 60) return `${diffMins}分钟前`;
      if (diffHours < 24) return `${diffHours}小时前`;
      if (diffDays < 7) return `${diffDays}天前`;
      
      return date.toLocaleDateString('zh-CN');
    } catch {
      return dateStr;
    }
  };

  const truncateText = (text: string, maxLength: number = 280) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const renderMediaGrid = (mediaUrls: string[], tweetId: string) => {
    if (!mediaUrls || mediaUrls.length === 0) return null;

    const count = Math.min(mediaUrls.length, 4);
    
    // Grid layout based on image count
    const gridClass = count === 1 
      ? 'grid-cols-1' 
      : count === 2 
      ? 'grid-cols-2' 
      : count === 3 
      ? 'grid-cols-3' 
      : 'grid-cols-2';

    return (
      <div className={`grid ${gridClass} gap-2 mt-4`}>
        {mediaUrls.slice(0, 4).map((url, idx) => (
          <div
            key={`${tweetId}-${idx}`}
            className="relative overflow-hidden rounded-lg border border-slate-700/50 hover:border-purple-500/50 transition-all cursor-pointer group"
            onClick={() => setLightboxImage(url)}
          >
            <img
              src={url}
              alt={`Media ${idx + 1}`}
              className={`w-full object-cover transition-transform group-hover:scale-105 ${
                count === 1 ? 'h-64' : count === 3 && idx === 0 ? 'h-48' : 'h-32'
              }`}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="bg-slate-900/50 border-slate-800/50">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-slate-900/50 border-slate-800/50">
        <CardContent className="py-12">
          <div className="text-center">
            <p className="text-red-400 mb-4">加载失败: {error}</p>
            <Button
              onClick={fetchTweets}
              variant="outline"
              className="border-slate-700 hover:border-purple-500"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              重试
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">
            🐦 推特监控
          </h2>
          <p className="text-slate-400">
            实时追踪 DeFi 领域关键动态
          </p>
        </div>
        <Button
          onClick={fetchTweets}
          variant="outline"
          size="sm"
          className="border-slate-700 hover:border-purple-500"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      </div>

      {/* Last Update */}
      {data?.last_update && (
        <div className="text-sm text-slate-500">
          最后更新: {new Date(data.last_update).toLocaleString('zh-CN')}
        </div>
      )}

      {/* Tweets Grid */}
      <div className="grid gap-4">
        {data?.tweets && data.tweets.length > 0 ? (
          data.tweets.map((tweet) => (
            <Card
              key={tweet.id}
              className={`
                border transition-all
                ${tweet.is_rt 
                  ? 'bg-purple-900/30 border-purple-800/30 hover:border-purple-500/50' 
                  : 'bg-slate-900 border-slate-800/50 hover:border-blue-500/30'
                }
              `}
            >
              {/* Retweet Header */}
              {tweet.is_rt && tweet.rt_source && (
                <div className="px-6 pt-4 pb-2 border-b border-purple-800/20">
                  <div className="flex items-center gap-2 text-sm text-purple-300">
                    <span className="text-base">🔁</span>
                    <span>转发自</span>
                    <a
                      href={`https://twitter.com/${tweet.rt_source.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold hover:text-purple-200 transition-colors"
                    >
                      {tweet.rt_source}
                    </a>
                  </div>
                </div>
              )}

              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Avatar */}
                    <div className={`
                      w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0
                      ${tweet.is_rt ? 'bg-purple-500/20' : 'bg-blue-500/20'}
                    `}>
                      <span className="text-xl">🐦</span>
                    </div>
                    
                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base font-semibold text-white truncate">
                        {tweet.name}
                      </CardTitle>
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <span className="truncate">@{tweet.screen_name}</span>
                        <span>•</span>
                        <span className="whitespace-nowrap">{formatTime(tweet.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* External Link */}
                  <a
                    href={tweet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`
                      flex-shrink-0 transition-colors
                      ${tweet.is_rt ? 'text-purple-400 hover:text-purple-300' : 'text-blue-400 hover:text-blue-300'}
                    `}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                {/* Tweet Text */}
                <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {truncateText(tweet.text)}
                </p>
                
                {/* Media Grid */}
                {renderMediaGrid(tweet.media_urls, tweet.id)}
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="bg-slate-900/50 border-slate-800/50">
            <CardContent className="py-12 text-center text-slate-400">
              暂无推文
            </CardContent>
          </Card>
        )}
      </div>

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setLightboxImage(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 transition-colors"
            onClick={() => setLightboxImage(null)}
          >
            <X className="h-6 w-6 text-white" />
          </button>
          <img
            src={lightboxImage}
            alt="Full size"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
