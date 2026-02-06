import { useEffect, useState } from 'react';
import { ArrowDown, Sparkles, Zap, TrendingUp, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Hero() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const stats = [
    { icon: Zap, label: '实时数据', value: '100+ 币种' },
    { icon: TrendingUp, label: 'DeFi 奖励', value: 'Merkl 集成' },
    { icon: Shield, label: '安全可靠', value: '公开 API' },
  ];

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-slate-950">
        {/* Gradient Orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
        
        {/* Grid Pattern */}
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `
              linear-gradient(rgba(6, 182, 212, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(6, 182, 212, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px'
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          {/* Badge */}
          <div 
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/30 mb-8 transition-all duration-1000 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-cyan-400 text-sm font-medium">智能加密货币情报平台</span>
          </div>

          {/* Title */}
          <h1 
            className={`text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 transition-all duration-1000 delay-100 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            发现下一个
            <span className="block mt-2 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
              加密货币机会
            </span>
          </h1>

          {/* Description */}
          <p 
            className={`text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-10 transition-all duration-1000 delay-200 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            实时追踪最新上架的100个热门币种，监测 Merkl DeFi 奖励，
            <span className="text-slate-300">助您把握投资先机</span>
          </p>

          {/* CTA Buttons */}
          <div 
            className={`flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 transition-all duration-1000 delay-300 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <a href="#coins">
              <Button 
                size="lg"
                className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white px-8 py-6 text-lg rounded-xl shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-all"
              >
                <TrendingUp className="w-5 h-5 mr-2" />
                浏览币种
              </Button>
            </a>
            <a href="#merkl">
              <Button 
                size="lg"
                variant="outline"
                className="border-slate-700 text-white hover:bg-slate-800 px-8 py-6 text-lg rounded-xl"
              >
                <Zap className="w-5 h-5 mr-2" />
                查看奖励
              </Button>
            </a>
          </div>

          {/* Stats */}
          <div 
            className={`grid grid-cols-3 gap-4 sm:gap-8 max-w-2xl mx-auto transition-all duration-1000 delay-400 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            {stats.map((stat) => (
              <div 
                key={stat.label}
                className="bg-slate-900/50 backdrop-blur-sm rounded-xl p-4 border border-slate-800/50 hover:border-cyan-500/30 transition-all"
              >
                <stat.icon className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                <p className="text-white font-semibold text-sm sm:text-base">{stat.value}</p>
                <p className="text-slate-500 text-xs sm:text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll Indicator */}
        <div 
          className={`absolute bottom-8 left-1/2 -translate-x-1/2 transition-all duration-1000 delay-500 ${
            isVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <a 
            href="#coins"
            className="flex flex-col items-center text-slate-500 hover:text-cyan-400 transition-colors"
          >
            <span className="text-xs mb-2">向下滚动</span>
            <ArrowDown className="w-5 h-5 animate-bounce" />
          </a>
        </div>
      </div>
    </section>
  );
}
