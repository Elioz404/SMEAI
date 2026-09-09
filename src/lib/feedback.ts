// Lo que hemos escrito de vuelta en el registro ERC-8004.
//
// SOLO SERVIDOR, como el resto de lectores de datos.
//
// Lo escribe `scripts/publish-feedback.mjs`, a mano y en dos fases. La web
// MUESTRA estos registros; no puede crearlos. Es la misma separacion que con la
// demostracion de mainnet, y por el mismo motivo: escribir en el registro
// publico de un tercero no puede depender de que alguien pulse un boton.
//
// Se publica solo senal positiva y un registro por backend. El porque esta en
// la cabecera del script, que es donde vive la decision.

import "server-only";
import raw from "../../data/feedback.json";

export type FeedbackRecord = {
  agent_id: string;
  name: string;
  endpoint: string;
  category: string;
  identities: number;
  observed: number;
  uptime_ratio: number;
  value: number;
  value_decimals: number;
  uri: string;
  hash: string;
  bytes: number;
  /** null mientras no se haya escrito en cadena. */
  tx: string | null;
  block?: number;
  gas_used?: number;
};

export type FeedbackFile = {
  generated_at: string;
  chain_id: number;
  registry: string;
  issuer: string;
  explorer: string;
  min_checks: number;
  records: FeedbackRecord[];
  updated_at?: string;
};

export const feedback = raw as FeedbackFile;

/**
 * Solo los que estan de verdad en cadena.
 *
 * La pagina se dibuja a partir de esto y no de `records`: un registro
 * preparado pero no enviado no es una contribucion al registro, y anunciarlo
 * como si lo fuera seria la clase de afirmacion sin respaldo que este sitio
 * mide en los demas.
 */
export const publishedFeedback = feedback.records.filter((r) => r.tx);

/** Identidades que quedan cubiertas, contando las que comparten backend. */
export function identitiesCovered(): number {
  return publishedFeedback.reduce((n, r) => n + r.identities, 0);
}

/** El registro publicado para un agente, si lo hay. */
export function feedbackFor(chainId: number, tokenId: string): FeedbackRecord | undefined {
  if (chainId !== feedback.chain_id) return undefined;
  return publishedFeedback.find((r) => r.agent_id === String(tokenId));
}
