import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { CoinList } from '@/components/CoinList';
import { MerklRewards } from '@/components/MerklRewards';
import { Footer } from '@/components/Footer';
import { Toaster } from '@/components/ui/sonner';

function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header />
      
      <main>
        {/* Hero Section */}
        <Hero />
        
        {/* Coins Section */}
        <section id="coins" className="py-20 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900/50 to-slate-950" />
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <CoinList />
          </div>
        </section>
        
        {/* Merkl Rewards Section */}
        <section id="merkl" className="py-20 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-purple-900/10 to-slate-950" />
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <MerklRewards />
          </div>
        </section>
        
        {/* About Section */}
        <section id="about" className="py-20 relative">
          <div className="absolute inset-0 bg-slate-950" />
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-white mb-4">
                关于 <span className="text-cyan-400">CryptoIntel</span>
              </h2>
              <p className="text-slate-400 max-w-2xl mx-auto">
                CryptoIntel 是一个开源的加密货币情报平台，致力于帮助投资者发现最新的投资机会。
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl p-6 border border-slate-800/50 hover:border-cyan-500/30 transition-all">
                <div className="w-12 h-12 bg-cyan-500/20 rounded-lg flex items-center justify-center mb-4">
                  <span className="text-2xl">📊</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">实时数据</h3>
                <p className="text-slate-400 text-sm">
                  通过 CoinGecko API 获取最新的加密货币数据，包括价格、市值、交易量等关键指标。
                </p>
              </div>
              
              <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl p-6 border border-slate-800/50 hover:border-purple-500/30 transition-all">
                <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
                  <span className="text-2xl">🎯</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Merkl 集成</h3>
                <p className="text-slate-400 text-sm">
                  实时监测 Merkl 平台的 DeFi 奖励机会，包括每日奖励、TVL、APR 等关键信息。
                </p>
              </div>
              
              <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl p-6 border border-slate-800/50 hover:border-green-500/30 transition-all">
                <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center mb-4">
                  <span className="text-2xl">🔒</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">开源透明</h3>
                <p className="text-slate-400 text-sm">
                  项目完全开源，使用公开 API，代码透明可查，确保数据的安全性和可靠性。
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
      <Toaster />
    </div>
  );
}

export default App;
