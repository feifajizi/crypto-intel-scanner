import type { Coin, MerklReward } from '@/types';

// ============================================
// Merkl API 服务
// ============================================
export const merklService = {
  // 获取所有奖励机会
  async getOpportunities(): Promise<MerklReward[]> {
    try {
      const url = 'https://api.merkl.xyz/v4/opportunities';
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Merkl API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!Array.isArray(data)) {
        throw new Error('Invalid response format from Merkl API');
      }

      // 转换为MerklReward类型
      return data.map((opp: any) => {
        // 获取token信息
        const tokens = opp.tokens || [];
        const mainToken = tokens[0] || {};
        
        // 获取协议信息（从protocols数组）
        const protocols = opp.protocols || [];
        const protocol = protocols[0] || 'Unknown';
        
        // 获取链信息
        const chain = opp.chain || {};
        const chainName = chain.name || 'Unknown';
        
        // 使用 API 返回的 depositUrl（如果有的话）
        const identifier = opp.identifier || opp.id;
        const merklUrl = opp.depositUrl || `https://app.merkl.xyz/opportunities`;
        
        return {
          id: opp.id?.toString() || '',
          opportunityId: identifier,
          opportunityName: opp.name || 'Unknown',
          protocol: protocol, // 显示用的协议名
          chainId: opp.chainId || 0,
          chainName: chainName,
          tokenSymbol: mainToken.symbol || 'Unknown',
          tokenAddress: mainToken.address || '',
          dailyRewards: parseFloat(opp.dailyRewards) || 0,
          tvl: parseFloat(opp.tvl) || 0,
          apr: parseFloat(opp.apr) || 0,
          startTimestamp: 0,
          endTimestamp: 0,
          status: opp.status === 'LIVE' ? 'active' : 
                  opp.status === 'PENDING' ? 'upcoming' : 'ended',
          merklUrl: merklUrl, // 正确的Merkl链接
        };
      });
    } catch (error) {
      console.error('Error fetching Merkl opportunities:', error);
      throw error;
    }
  },

  // 获取活跃奖励
  async getActiveRewards(): Promise<MerklReward[]> {
    const rewards = await this.getOpportunities();
    return rewards.filter(r => r.status === 'active');
  },

  // 按链筛选
  async getRewardsByChain(chainId: number): Promise<MerklReward[]> {
    const rewards = await this.getOpportunities();
    return rewards.filter(r => r.chainId === chainId);
  },

  // 按协议筛选
  async getRewardsByProtocol(protocol: string): Promise<MerklReward[]> {
    const rewards = await this.getOpportunities();
    return rewards.filter(r => 
      r.protocol.toLowerCase() === protocol.toLowerCase()
    );
  },

  // 获取最新奖励（按TVL排序）
  async getLatestRewards(limit: number = 10): Promise<MerklReward[]> {
    const rewards = await this.getOpportunities();
    return rewards
      .filter(r => r.status === 'active')
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, limit);
  }
};

// ============================================
// Gate.io API 服务
// ============================================
export const gateService = {
  // 获取现货交易对（公开API）
  async getSpotPairs(): Promise<string[]> {
    try {
      const url = 'https://api.gateio.ws/api/v4/spot/currency_pairs';
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Gate API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!Array.isArray(data)) {
        throw new Error('Invalid response format from Gate API');
      }

      // 提取交易对ID
      return data.map((pair: any) => pair.id);
    } catch (error) {
      console.error('Error fetching Gate spot pairs:', error);
      throw error;
    }
  },

  // 获取合约交易对（公开API）
  async getContractPairs(): Promise<string[]> {
    try {
      const url = 'https://api.gateio.ws/api/v4/futures/usdt/contracts';
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Gate API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!Array.isArray(data)) {
        throw new Error('Invalid response format from Gate API');
      }

      // 提取合约名称
      return data.map((contract: any) => contract.name);
    } catch (error) {
      console.error('Error fetching Gate contract pairs:', error);
      throw error;
    }
  },

  // 获取所有币种（去重）
  async getAllCoins(): Promise<string[]> {
    try {
      const [spotPairs, contractPairs] = await Promise.all([
        this.getSpotPairs(),
        this.getContractPairs()
      ]);

      // 提取基础币种并去重
      const allCoins = new Set<string>();
      
      // 处理现货交易对 (格式: BTC_USDT)
      spotPairs.forEach((pair: string) => {
        const base = pair.split('_')[0];
        if (base) allCoins.add(base);
      });
      
      // 处理合约交易对 (格式: BTC_USDT)
      contractPairs.forEach((pair: string) => {
        const base = pair.split('_')[0];
        if (base) allCoins.add(base);
      });

      return Array.from(allCoins).sort();
    } catch (error) {
      console.error('Error fetching Gate coins:', error);
      throw error;
    }
  },

  // 获取币种详情（公开API）
  async getCurrencyInfo(currency: string): Promise<any> {
    try {
      const url = `https://api.gateio.ws/api/v4/spot/currencies/${currency}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error(`Error fetching currency info for ${currency}:`, error);
      return null;
    }
  }
};

// ============================================
// CoinMarketCap API 服务
// ============================================
export const coinGeckoService = {
  // 获取最新上架的币种（通过 Vercel Serverless Function 调用 CoinMarketCap API）
  async getCoinsMarkets(limit: number = 100): Promise<Coin[]> {
    try {
      const url = `/api/cmc-latest?limit=${limit}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`CoinMarketCap API error: ${response.status}`);
      }

      const result = await response.json();
      const data = result.data || [];
      
      return data.map((coin: any) => ({
        id: coin.slug || coin.symbol.toLowerCase(),
        symbol: coin.symbol,
        name: coin.name,
        image: `https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`,
        current_price: coin.quote?.USD?.price || 0,
        market_cap: coin.quote?.USD?.market_cap || 0,
        total_volume: coin.quote?.USD?.volume_24h || 0,
        price_change_percentage_24h: coin.quote?.USD?.percent_change_24h || 0,
        listed_at: coin.date_added ? coin.date_added.split('T')[0] : undefined,
      }));
    } catch (error) {
      console.error('Error fetching latest tokens from CoinMarketCap:', error);
      throw error;
    }
  },

  // 获取币种详细信息（包括links）
  async getCoinDetails(coinId: string): Promise<{
    symbol: string;
    name: string;
    homepage: string;
    twitter_screen_name: string;
  } | null> {
    try {
      const url = `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const links = data.links || {};
      
      return {
        symbol: data.symbol?.toUpperCase() || '',
        name: data.name || '',
        homepage: links.homepage?.[0] || '',
        twitter_screen_name: links.twitter_screen_name || '',
      };
    } catch (error) {
      console.error(`Error fetching coin details for ${coinId}:`, error);
      return null;
    }
  },

  // 搜索币种
  async searchCoins(query: string): Promise<Coin[]> {
    try {
      const allCoins = await this.getCoinsMarkets(250);
      const lowerQuery = query.toLowerCase();
      
      return allCoins.filter(coin => 
        coin.symbol.toLowerCase().includes(lowerQuery) ||
        coin.name.toLowerCase().includes(lowerQuery)
      ).slice(0, 20);
    } catch (error) {
      console.error('Error searching coins:', error);
      return [];
    }
  }
};

// ============================================
// 综合数据服务
// ============================================
export const dataService = {
  // 获取币种完整信息（包括links）
  async getCoinsWithDetails(limit: number = 100): Promise<Coin[]> {
    try {
      // 获取市场数据
      const markets = await coinGeckoService.getCoinsMarkets(limit);
      
      // 获取每个币种的详细信息（包括links）
      const coinsWithDetails = await Promise.all(
        markets.map(async (coin) => {
          try {
            const details = await coinGeckoService.getCoinDetails(coin.id);
            
            if (details) {
              return {
                ...coin,
                homepage: details.homepage,
                twitter_screen_name: details.twitter_screen_name,
              };
            }
          } catch (err) {
            console.warn(`Failed to get details for ${coin.id}:`, err);
          }
          
          return coin;
        })
      );
      
      return coinsWithDetails;
    } catch (error) {
      console.error('Error fetching coins with details:', error);
      throw error;
    }
  }
};
