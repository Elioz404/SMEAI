// Taxonomía de las 4 categorías obligatorias del hackathon.
// `queries` alimenta la búsqueda semántica de 8004scan (recall).
// `must` / `veto` son el filtro determinista que aplicamos después (precision).
// La búsqueda semántica sola devuelve basura: para "health factor" 8004scan
// devuelve un agente llamado "water" que "te ayuda a encontrar la paz interior".
export const CATEGORIES = {
  rebalancing: {
    label: 'Rebalancing',
    blurb: 'Manages LP ranges, resets positions automatically',
    queries: [
      'concentrated liquidity range rebalancer PancakeSwap V3',
      'automatically rebalance LP position when price leaves range',
      'portfolio rebalancing to target allocation on BNB Chain',
    ],
    must: /\b(rebalanc\w*|re-balanc\w*|range\s+(manage|reset|width)|reposition\w*|lp\s+range)\b/i,
    veto: /\b(fitness|sport|geopolitic|inner peace|companion|dating)\b/i,
  },
  grid: {
    label: 'Grid Trading',
    blurb: 'Places and manages automated grid orders',
    queries: [
      'grid trading bot places buy and sell orders in a bounded range',
      'automated grid strategy PancakeSwap pair levels',
      'DCA ladder order execution agent BSC',
    ],
    must: /\b(grid\b|ladder\b|bounded\s+range|order\s+levels?|dca\b)\b/i,
    veto: /\b(fitness|sport|geopolitic|inner peace|companion|power\s?grid|electric)\b/i,
  },
  yield: {
    label: 'Yield Optimisation',
    blurb: 'Routes liquidity to the highest available APR',
    queries: [
      'yield optimiser routes capital to highest APR pool',
      'auto compound harvest restake Venus PancakeSwap Beefy',
      'stablecoin yield routing agent BNB Chain',
    ],
    must: /\b(yield|apr\b|apy\b|harvest\w*|auto-?compound\w*|restak\w*|farm\w*|optimis\w*\s+(return|yield)|route\w*\s+(liquidity|capital))\b/i,
    veto: /\b(fitness|sport|geopolitic|inner peace|companion)\b/i,
  },
  health: {
    label: 'Health Factor Monitoring',
    blurb: 'Protects lending positions from liquidation',
    queries: [
      'health factor monitor lending position liquidation protection Venus',
      'loan risk monitoring auto top up collateral Aave V3 BNB',
      'liquidation risk alert borrower position',
    ],
    must: /\b(health\s*factor|liquidat\w*|collateral\w*|borrow\w*|loan\s+(health|risk|position)|ltv\b|lending\s+(risk|position|health))\b/i,
    veto: /\b(fitness|sport|geopolitic|inner peace|companion|mental\s+health)\b/i,
  },
};

// Ruido conocido del registro. Medido: 297.281 agentes en chain 56, de los
// cuales solo 5 tienen endpoint verificado por 8004scan.
export const SPAM = [
  /^Agent\s*#\d+$/i,                 // registros sin metadata
  /^An EvoEvo AI Agent/i,            // granja EvoEvo
  /\.agent on Termix Platform$/i,    // registros masivos de TermiX
  /^(studio-agent|new\.agent|test|tradingbot)$/i,
];
