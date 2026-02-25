import type { Coin } from '@/types';

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
// Gate 新上币种（现货+合约）服务
// ============================================
export const gateLatestService = {
  // 获取 Gate 新上币种（通过 Vercel Serverless Function）
  // 保守策略：链接补全只有在 CoinGecko “symbol+name 唯一精确匹配”时才会返回，否则留空。
  async getCoinsMarkets(limit: number = 100, enrichLinks: boolean = true): Promise<Coin[]> {
    try {
      const url = `/api/gate-latest?limit=${limit}&enrich=${enrichLinks ? 1 : 0}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Gate latest API error: ${response.status}`);
      }

      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('Error fetching latest tokens from Gate:', error);
      throw error;
    }
  },

  // 搜索币种：在最新列表里本地搜
  async searchCoins(query: string): Promise<Coin[]> {
    try {
      const allCoins = await this.getCoinsMarkets(250, false);
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
  // 获取币种完整信息（包括官网 / Twitter / tags）
  async getCoinsWithDetails(limit: number = 100): Promise<Coin[]> {
    try {
      return await gateLatestService.getCoinsMarkets(limit, true);
    } catch (error) {
      console.error('Error fetching coins with details:', error);
      throw error;
    }
  },

  // 扫描官网是否存在 staking/earn 等信号（保守，best-effort）
  async scanStake(homepage: string, maxPages: number = 8): Promise<any> {
    const url = `/api/stake-scan?homepage=${encodeURIComponent(homepage)}&maxPages=${maxPages}`;
    const resp = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error(`stake-scan error: ${resp.status}`);
    return await resp.json();
  }
};
