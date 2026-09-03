// Censo de la poblacion que declara protocolo en BSC.
//
// SOLO SERVIDOR, como snapshot.ts y jobs.ts. Lo produce `scripts/census.mjs`.
//
// El catalogo y el censo responden preguntas distintas y no deben mezclarse: el
// catalogo verifica en profundidad los agentes de las cuatro categorias, y el
// censo describe la poblacion entera por encima. Uno es exhaustivo en su
// recorte; el otro es una muestra declarada de un universo mucho mayor.

import "server-only";
import raw from "../../data/census.json";

export type CensusHost = { host: string; count: number };

export type CensusChain = {
  chain_id: number;
  chain_name: string;
  /** Cifras exactas del indice, no muestreadas. */
  population: {
    registered: number | null;
    declares_a2a: number | null;
    declares_mcp: number | null;
  };
  sample: {
    size: number;
    strata: number[];
    strata_planned: number;
    strata_failed: number[];
    deepest_offset: number | null;
    /** Fraccion de la poblacion que la muestra llega a cubrir. */
    covers_fraction: number | null;
    with_endpoint: number;
    /** Registros cuya URL trae un marcador `{...}` sin sustituir. */
    broken_template: number;
    /** De esos, cuantos responden al sustituir el marcador por el token. */
    template_resolves: number;
    distinct_hosts: number;
    hosts: CensusHost[];
    platform_status: { status: string; count: number }[];
  };
  examples: {
    token_id: string;
    registered_url: string;
    registered_status: string | number;
    corrected_status: string | number;
  }[];
};

export type Census = {
  generated_at: string;
  method: string;
  chains: CensusChain[];
};

export const census = raw as Census;

/** Atajo: la cadena que abre la pagina. */
export function censusFor(chainId: number): CensusChain | undefined {
  return census.chains.find((c) => c.chain_id === chainId);
}

/** Porcentaje entero de una fraccion, o null si no hay dato. */
export function pct(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}
