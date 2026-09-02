// Lectura del historial de disponibilidad.
//
// SOLO SERVIDOR, como snapshot.ts: importa un JSON que no debe viajar al
// navegador entero. Los componentes reciben ya la serie de un solo agente.

import raw from "../../data/history.json";
import { MARK_META, type Mark } from "./taxonomy";

export { MARK_META, type Mark };

export type History = {
  /** Instante de cada comprobación, en orden. */
  checks: string[];
  /** Una cadena por agente; el carácter N corresponde a la comprobación N. */
  agents: Record<string, string>;
};

export const history = raw as History;

export type Uptime = {
  /** Marcas en orden cronológico, ya recortadas. */
  marks: Mark[];
  /** Instante de cada marca, alineado con `marks`. */
  at: string[];
  /** Comprobaciones en las que el agente existía en el catálogo. */
  observed: number;
  /** De esas, en cuántas era contratable. */
  hireable: number;
  /** Porcentaje sobre las observadas, o null si no hay ninguna. */
  pct: number | null;
  /** Instante de la última caída, si la hubo. */
  lastDrop: string | null;
};

/**
 * Serie de un agente, lista para pintar.
 *
 * `observed` excluye las comprobaciones en que el agente no estaba en el
 * catálogo. Contarlas como caídas castigaría a un agente registrado ayer por no
 * haber existido antes, que es exactamente el tipo de dato inflado que este
 * producto denuncia.
 */
export function uptimeOf(agentId: string, limit = 60): Uptime {
  const s = history.agents[agentId] ?? "";
  const marks = s.split("") as Mark[];
  const at = history.checks;

  const from = Math.max(0, marks.length - limit);
  const slice = marks.slice(from);
  const atSlice = at.slice(from);

  const observed = slice.filter((m) => m !== "-").length;
  const hireable = slice.filter((m) => m === "h").length;

  let lastDrop: string | null = null;
  for (let i = slice.length - 1; i >= 0; i--) {
    if (slice[i] === "d" || slice[i] === "c") {
      lastDrop = atSlice[i] ?? null;
      break;
    }
  }

  return {
    marks: slice,
    at: atSlice,
    observed,
    hireable,
    pct: observed ? Math.round((hireable / observed) * 100) : null,
    lastDrop,
  };
}

/** Ultimas `n` marcas de un agente, para las listas. */
export function recentMarks(agentId: string, n = 24): string {
  return (history.agents[agentId] ?? "").slice(-n);
}
