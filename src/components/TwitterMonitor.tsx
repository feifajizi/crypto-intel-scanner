import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
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

  const truncateText = (text: string, maxLength: number = 200) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
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
              className="bg-slate-900/50 border-slate-800/50 hover:border-purple-500/30 transition-all"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">
                      <span className="text-lg">🐦</span>
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold text-white">
                        {tweet.name}
                        {tweet.is_rt && tweet.rt_source && (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            转推自 @{tweet.rt_source}
                          </span>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <span>@{tweet.screen_name}</span>
                        <span>•</span>
                        <span>{formatTime(tweet.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <a
                    href={tweet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 whitespace-pre-wrap mb-3">
                  {truncateText(tweet.text)}
                </p>
                
                {/* Media */}
                {tweet.media_urls && tweet.media_urls.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {tweet.media_urls.slice(0, 4).map((url, idx) => (
                      <img
                        key={idx}
                        src={url}
                        alt=""
                        className="rounded-lg w-full h-32 object-cover border border-slate-700"
                      />
                    ))}
                  </div>
                )}
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
    </div>
  );
}
