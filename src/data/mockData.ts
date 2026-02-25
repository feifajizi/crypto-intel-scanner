import type { Coin } from '@/types';

// 模拟最近上架的100个币种
export const mockCoins: Coin[] = [
  {
    id: 'bitcoin',
    symbol: 'btc',
    name: 'Bitcoin',
    image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
    current_price: 67432.15,
    market_cap: 1328456789123,
    total_volume: 34567890123,
    price_change_percentage_24h: 2.34,
    listed_at: '2024-01-15'
  },
  {
    id: 'ethereum',
    symbol: 'eth',
    name: 'Ethereum',
    image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
    current_price: 3521.87,
    market_cap: 423456789012,
    total_volume: 15678901234,
    price_change_percentage_24h: 1.56,
    listed_at: '2024-01-14'
  },
  {
    id: 'solana',
    symbol: 'sol',
    name: 'Solana',
    image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    current_price: 142.35,
    market_cap: 67890123456,
    total_volume: 3456789012,
    price_change_percentage_24h: 5.67,
    listed_at: '2024-01-13'
  },
  {
    id: 'uniswap',
    symbol: 'uni',
    name: 'Uniswap',
    image: 'https://assets.coingecko.com/coins/images/12504/large/uniswap.png',
    current_price: 12.45,
    market_cap: 7456123456,
    total_volume: 456789012,
    price_change_percentage_24h: -1.23,
    listed_at: '2024-01-12'
  },
  {
    id: 'aave',
    symbol: 'aave',
    name: 'Aave',
    image: 'https://assets.coingecko.com/coins/images/12645/large/aave.png',
    current_price: 145.67,
    market_cap: 2145678901,
    total_volume: 123456789,
    price_change_percentage_24h: 3.45,
    listed_at: '2024-01-11'
  },
  {
    id: 'curve-dao-token',
    symbol: 'crv',
    name: 'Curve DAO Token',
    image: 'https://assets.coingecko.com/coins/images/12124/large/curve.png',
    current_price: 0.89,
    market_cap: 456789012,
    total_volume: 23456789,
    price_change_percentage_24h: -2.34,
    listed_at: '2024-01-10'
  },
  {
    id: 'compound-governance-token',
    symbol: 'comp',
    name: 'Compound',
    image: 'https://assets.coingecko.com/coins/images/10775/large/compound.png',
    current_price: 67.89,
    market_cap: 567890123,
    total_volume: 34567890,
    price_change_percentage_24h: 4.56,
    listed_at: '2024-01-09'
  },
  {
    id: 'sushi',
    symbol: 'sushi',
    name: 'SushiSwap',
    image: 'https://assets.coingecko.com/coins/images/12271/large/sushi.png',
    current_price: 1.23,
    market_cap: 234567890,
    total_volume: 12345678,
    price_change_percentage_24h: -0.45,
    listed_at: '2024-01-08'
  },
  {
    id: 'lido-dao',
    symbol: 'ldo',
    name: 'Lido DAO',
    image: 'https://assets.coingecko.com/coins/images/13573/large/lido.png',
    current_price: 2.34,
    market_cap: 2089012345,
    total_volume: 98765432,
    price_change_percentage_24h: 6.78,
    listed_at: '2024-01-07'
  },
  {
    id: 'maker',
    symbol: 'mkr',
    name: 'Maker',
    image: 'https://assets.coingecko.com/coins/images/1364/large/mkr.png',
    current_price: 1789.45,
    market_cap: 1654321098,
    total_volume: 87654321,
    price_change_percentage_24h: 1.23,
    listed_at: '2024-01-06'
  },
  {
    id: 'pendle',
    symbol: 'pendle',
    name: 'Pendle',
    image: 'https://assets.coingecko.com/coins/images/25385/large/pendle.png',
    current_price: 5.67,
    market_cap: 890123456,
    total_volume: 45678901,
    price_change_percentage_24h: 8.90,
    listed_at: '2024-01-05'
  },
  {
    id: 'ether-fi',
    symbol: 'ethfi',
    name: 'Ether.fi',
    image: 'https://assets.coingecko.com/coins/images/35958/large/etherfi.png',
    current_price: 3.45,
    market_cap: 412345678,
    total_volume: 34567890,
    price_change_percentage_24h: -3.21,
    listed_at: '2024-01-04'
  }
];
