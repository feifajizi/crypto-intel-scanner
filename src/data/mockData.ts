import type { Coin, MerklReward } from '@/types';

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
  },
  {
    id: 'eigenlayer',
    symbol: 'eigen',
    name: 'EigenLayer',
    image: 'https://assets.coingecko.com/coins/images/36958/large/eigen.png',
    current_price: 4.56,
    market_cap: 678901234,
    total_volume: 56789012,
    price_change_percentage_24h: 12.34,
    listed_at: '2024-01-03'
  },
  {
    id: 'celestia',
    symbol: 'tia',
    name: 'Celestia',
    image: 'https://assets.coingecko.com/coins/images/31967/large/tia.png',
    current_price: 8.90,
    market_cap: 1234567890,
    total_volume: 98765432,
    price_change_percentage_24h: 7.89,
    listed_at: '2024-01-02'
  },
  {
    id: 'dymension',
    symbol: 'dym',
    name: 'Dymension',
    image: 'https://assets.coingecko.com/coins/images/36970/large/dym.png',
    current_price: 6.78,
    market_cap: 890123456,
    total_volume: 67890123,
    price_change_percentage_24h: -5.67,
    listed_at: '2024-01-01'
  }
];

// 生成更多模拟币种数据
for (let i = 0; i < 85; i++) {
  const symbols = ['PEPE', 'SHIB', 'DOGE', 'LINK', 'ARB', 'OP', 'MATIC', 'AVAX', 'NEAR', 'APT', 
                   'SUI', 'SEI', 'STRK', 'ZRO', 'WLD', 'TIA', 'DYM', 'SAGA', 'OMNI', 'ZKSYNC',
                   'POL', 'IMX', 'GRT', 'RNDR', 'FET', 'AGIX', 'WLD', 'ARKM', 'TAO', 'TRX',
                   'DOT', 'ADA', 'XRP', 'LTC', 'BCH', 'ETC', 'XLM', 'VET', 'FIL', 'EOS',
                   'XTZ', 'ALGO', 'ATOM', 'ICP', 'NEO', 'XMR', 'DASH', 'ZEC', 'BSV', 'IOTA'];
  const names = ['Pepe', 'Shiba Inu', 'Dogecoin', 'Chainlink', 'Arbitrum', 'Optimism', 'Polygon', 'Avalanche', 'Near', 'Aptos',
                 'Sui', 'Sei', 'Starknet', 'LayerZero', 'Worldcoin', 'Celestia', 'Dymension', 'Saga', 'Omni', 'zkSync',
                 'Pol', 'Immutable X', 'The Graph', 'Render', 'Fetch.ai', 'SingularityNET', 'Worldcoin', 'Arkham', 'Bittensor', 'Tron',
                 'Polkadot', 'Cardano', 'Ripple', 'Litecoin', 'Bitcoin Cash', 'Ethereum Classic', 'Stellar', 'VeChain', 'Filecoin', 'EOS',
                 'Tezos', 'Algorand', 'Cosmos', 'Internet Computer', 'Neo', 'Monero', 'Dash', 'Zcash', 'Bitcoin SV', 'IOTA'];
  
  const idx = i % symbols.length;
  const price = Math.random() * 100 + 0.01;
  const marketCap = Math.random() * 1000000000 + 10000000;
  
  mockCoins.push({
    id: names[idx].toLowerCase().replace(/\s+/g, '-'),
    symbol: symbols[idx].toLowerCase(),
    name: names[idx],
    image: `https://assets.coingecko.com/coins/images/${1000 + i}/large/${names[idx].toLowerCase().replace(/\s+/g, '')}.png`,
    current_price: price,
    market_cap: marketCap,
    total_volume: marketCap * 0.1,
    price_change_percentage_24h: (Math.random() - 0.5) * 20,
    listed_at: new Date(Date.now() - i * 86400000).toISOString().split('T')[0]
  });
}

// 模拟Merkl奖励数据
export const mockMerklRewards: MerklReward[] = [
  {
    id: '1',
    opportunityId: '0x1234567890abcdef',
    opportunityName: 'Uniswap V3 ETH/USDC',
    protocol: 'Uniswap',
    chainId: 1,
    chainName: 'Ethereum',
    tokenSymbol: 'UNI',
    tokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    dailyRewards: 1250.5,
    tvl: 45678901.23,
    apr: 15.67,
    startTimestamp: 1704067200,
    endTimestamp: 1735689600,
    status: 'active'
  },
  {
    id: '2',
    opportunityId: '0xabcdef1234567890',
    opportunityName: 'Aave V3 USDC',
    protocol: 'Aave',
    chainId: 1,
    chainName: 'Ethereum',
    tokenSymbol: 'AAVE',
    tokenAddress: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
    dailyRewards: 890.25,
    tvl: 67890123.45,
    apr: 8.92,
    startTimestamp: 1704153600,
    endTimestamp: 1735776000,
    status: 'active'
  },
  {
    id: '3',
    opportunityId: '0x9876543210fedcba',
    opportunityName: 'Curve 3pool',
    protocol: 'Curve',
    chainId: 1,
    chainName: 'Ethereum',
    tokenSymbol: 'CRV',
    tokenAddress: '0xD533a949740bb3306d119CC777fa900bA034cd52',
    dailyRewards: 2340.75,
    tvl: 34567890.12,
    apr: 22.45,
    startTimestamp: 1704240000,
    endTimestamp: 1735862400,
    status: 'active'
  },
  {
    id: '4',
    opportunityId: '0xfedcba0987654321',
    opportunityName: 'Compound USDC',
    protocol: 'Compound',
    chainId: 1,
    chainName: 'Ethereum',
    tokenSymbol: 'COMP',
    tokenAddress: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
    dailyRewards: 567.80,
    tvl: 23456789.67,
    apr: 11.23,
    startTimestamp: 1704326400,
    endTimestamp: 1735948800,
    status: 'active'
  },
  {
    id: '5',
    opportunityId: '0x1122334455667788',
    opportunityName: 'SushiSwap ETH/USDT',
    protocol: 'SushiSwap',
    chainId: 1,
    chainName: 'Ethereum',
    tokenSymbol: 'SUSHI',
    tokenAddress: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
    dailyRewards: 445.90,
    tvl: 12345678.90,
    apr: 18.76,
    startTimestamp: 1704412800,
    endTimestamp: 1736035200,
    status: 'active'
  },
  {
    id: '6',
    opportunityId: '0x8877665544332211',
    opportunityName: 'Lido stETH',
    protocol: 'Lido',
    chainId: 1,
    chainName: 'Ethereum',
    tokenSymbol: 'LDO',
    tokenAddress: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
    dailyRewards: 1567.35,
    tvl: 89012345.67,
    apr: 4.56,
    startTimestamp: 1704499200,
    endTimestamp: 1736121600,
    status: 'active'
  },
  {
    id: '7',
    opportunityId: '0xaabbccdd11223344',
    opportunityName: 'Pendle YT-USDC',
    protocol: 'Pendle',
    chainId: 42161,
    chainName: 'Arbitrum',
    tokenSymbol: 'PENDLE',
    tokenAddress: '0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8',
    dailyRewards: 789.45,
    tvl: 15678901.23,
    apr: 28.90,
    startTimestamp: 1704585600,
    endTimestamp: 1736208000,
    status: 'active'
  },
  {
    id: '8',
    opportunityId: '0x44332211ddccbbaa',
    opportunityName: 'Ether.fi eETH',
    protocol: 'Ether.fi',
    chainId: 1,
    chainName: 'Ethereum',
    tokenSymbol: 'ETHFI',
    tokenAddress: '0xFe0c0E5E55b50e6b5F5fC7A1A2E9e8D3C4b5A607',
    dailyRewards: 1234.56,
    tvl: 23456789.01,
    apr: 12.34,
    startTimestamp: 1704672000,
    endTimestamp: 1736294400,
    status: 'active'
  },
  {
    id: '9',
    opportunityId: '0x55667788aabbccdd',
    opportunityName: 'EigenLayer restaking',
    protocol: 'EigenLayer',
    chainId: 1,
    chainName: 'Ethereum',
    tokenSymbol: 'EIGEN',
    tokenAddress: '0x8E0cF5C3B5F6A1D2E3C4b5A6078901a2B3c4D5E6F',
    dailyRewards: 2345.67,
    tvl: 45678901.23,
    apr: 16.78,
    startTimestamp: 1704758400,
    endTimestamp: 1736380800,
    status: 'active'
  },
  {
    id: '10',
    opportunityId: '0xddccbbaa88776655',
    opportunityName: 'Celestia TIA staking',
    protocol: 'Celestia',
    chainId: 1,
    chainName: 'Ethereum',
    tokenSymbol: 'TIA',
    tokenAddress: '0xA1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0',
    dailyRewards: 890.12,
    tvl: 12345678.90,
    apr: 9.01,
    startTimestamp: 1704844800,
    endTimestamp: 1736467200,
    status: 'active'
  }
];
