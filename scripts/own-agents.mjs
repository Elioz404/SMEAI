// Los agentes de referencia que publicamos NOSOTROS, en un solo sitio.
//
// POR QUE EXISTE ESTE FICHERO
//
// Dos scripts necesitan saber cuales son: `register-agent.mjs` para acuñarlos y
// `ingest.mjs` para listarlos. Tenerlo duplicado significaba que un dia el
// catalogo y el registro dirian cosas distintas sobre el mismo agente.
//
// Aqui solo vive lo que NO se puede leer de la cadena:
//
//   - `path` y los textos, porque hacen falta ANTES de que exista el token;
//   - `category`, porque el clasificador de `ingest.mjs` mide a terceros por lo
//     que escriben, y forzarlo a reconocerse a si mismo cambiaria las cifras
//     que publicamos sobre los demas. Nuestra categoria la declaramos, no la
//     inferimos, y por eso va acompañada de `is_ours`;
//   - `tokenId`, que lo asigna el mint y se anota aqui despues de registrar.
//
// Todo lo demas — nombre, descripcion y endpoint vigentes, y el dueño — se lee
// del registro ERC-8004 en el momento de la ingesta. La cadena es la fuente de
// verdad; esto es solo el indice.
//
// Regla que no cambia: se ven, se etiquetan y NO suman. `ingest.mjs` los marca
// `is_ours` y los excluye de todos los totales, categorias y embudo.

export const OWN_AGENTS = {
  health: {
    // Registrado en mainnet (56) porque lee posiciones de Venus en mainnet.
    chainId: 56,
    tokenId: 331625n,
    category: 'health',
    path: '/api/a2a',
    name: 'SMEAI Reference Health Factor Monitor',
    description:
      "Reads a wallet's Venus position on BSC mainnet and returns its real health factor — weighted collateral over debt, priced by the Venus oracle. Published by SMEAI as a free reference implementation so the health-factor category always has something that answers. Excluded from every statistic SMEAI publishes.",
  },
  lp: {
    chainId: 56,
    tokenId: 331698n,
    // Vigilar el rango de una posicion V3 es el trabajo previo a reposicionarla.
    category: 'rebalancing',
    path: '/api/a2a/lp',
    name: 'SMEAI Reference PancakeSwap LP Monitor',
    description:
      'Reads a PancakeSwap V3 liquidity position on BSC mainnet and reports whether it is still in range, how far the price can move before it stops earning fees, and what fees sit uncollected. Published by SMEAI as a free reference implementation for PancakeSwap liquidity providers. Excluded from every statistic SMEAI publishes.',
  },
  grid: {
    chainId: 56,
    tokenId: 331794n,
    category: 'grid',
    path: '/api/a2a/grid',
    name: 'SMEAI Reference Grid Viability Checker',
    description:
      'Reads a PancakeSwap V3 pool on BSC mainnet and works out whether a proposed grid step covers its own costs — a full cycle pays the pool fee twice, so any step below that loses money every time it completes. Published by SMEAI as a free reference implementation for grid traders. It does not predict prices. Excluded from every statistic SMEAI publishes.',
  },
};
