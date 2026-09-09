// ¿Acierta el agente? Leido del registro que deja `scripts/outcome-check.mjs`.
//
// SOLO SERVIDOR, como el resto de lectores de datos.
//
// Durante casi todo el proyecto esta pregunta no se podia responder, y la
// pagina de metodo lo decia: calificar la correccion exige tener la respuesta,
// y ningun vendedor de A2A entrego una. Lo que la desbloqueo no fue un cambio
// en el ecosistema sino aprender a hablar MCP, donde el agente contesta en el
// acto y gratis. La pregunta sigue sin poder responderse para la mayoria del
// catalogo, y esa parte tambien se dice.

import "server-only";
import raw from "../../data/outcomes.json";

/**
 * - `match`     coincidio con la cadena en todas las observaciones.
 * - `stale`     coincidio al menos una vez, asi que la aritmetica es correcta;
 *               el resto de veces sirvio cache. No es lo mismo que equivocarse.
 * - `divergent` nunca se acerco a la cadena.
 * - `unreadable` contesto algo que no se pudo comparar.
 */
export type OutcomeVerdict = "match" | "stale" | "divergent" | "unreadable";

export type OutcomeResult = {
  id: string;
  agent: { chain_id: number; token_id: string; name: string };
  endpoint: string;
  tool: string;
  question: string;
  kind: "numeric" | "set";
  truth_source: string;
  last_run: { answer: number | null; truth: number | null; latency_ms: number | null }[];
  observations: { at: string; delta: number; latency_ms: number | null }[];
  verdict: OutcomeVerdict;
  detail: string;
  error: string | null;
};

export type OutcomeFile = {
  generated_at: string;
  chain_id: number;
  tolerance: number;
  samples: number;
  sample_gap_ms: number;
  results: OutcomeResult[];
};

export const outcomes = raw as OutcomeFile;

export const outcomeCount = (v: OutcomeVerdict) =>
  outcomes.results.filter((r) => r.verdict === v).length;

/** Cuantos agentes distintos se han podido calificar. */
export const gradedAgents = new Set(outcomes.results.map((r) => r.agent.token_id)).size;

/** La calificacion de un agente concreto, si la tiene. */
export function outcomeFor(chainId: number, tokenId: string): OutcomeResult | undefined {
  return outcomes.results.find(
    (r) => r.agent.chain_id === chainId && r.agent.token_id === String(tokenId),
  );
}

export const VERDICT_LABEL: Record<OutcomeVerdict, string> = {
  match: "Agreed with the chain",
  stale: "Right, but serving cache",
  divergent: "Did not match the chain",
  unreadable: "Answer could not be compared",
};
