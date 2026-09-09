// El ciclo ERC-8183 completo, leido del registro que dejo el script.
//
// SOLO SERVIDOR, como el resto de lectores de datos.
//
// QUE ES ESTO Y QUE NO ES
//
// Es la respuesta a una pregunta que el catalogo no puede contestar mirandose a
// si mismo: de los diez trabajos que financiamos a vendedores ajenos, ninguno
// recibio entrega — ¿falla el riel, o fallan los vendedores? Separarlo exige un
// vendedor que SI aparezca, y por eso lo pusimos nosotros.
//
// NO es oferta del mercado. El vendedor de este trabajo no esta registrado en
// ERC-8004, asi que no puede salir en el catalogo por construccion y no por
// filtrado: `ingest.mjs` lee el registro, y lo que no esta en el registro no
// existe para el. Tampoco se puede contratar desde la web: lo escribe
// `scripts/lifecycle-demo.mjs`, a mano y con --confirm.
//
// La divulgacion de que ambos lados son nuestros viaja DENTRO del manifiesto
// que se hasheo en cadena, no solo en esta pagina. Cualquiera que descargue el
// deliverable y lo rehashee lee esa frase junto al resultado; no es una nota al
// pie que podamos quitar despues.

import "server-only";
import raw from "../../data/lifecycle-demo.json";

export type LifecycleDemo = {
  generated_at: string;
  chain_id: number;
  explorer: string;
  buyer: string;
  seller: string;
  commerce: string;
  job_id: string;
  price_raw: string;
  task: string;
  subject_wallet: string;
  deliverable: string;
  deliverable_url: string;
  dispute_window_seconds: number;
  expired_at: number;
  hire: { tx: string };
  submit: { tx: string; at: string };
  settle: { tx: string; status: string; paid_raw: string } | null;
  updated_at: string;
};

export const lifecycle = raw as LifecycleDemo;

/** true solo cuando la cadena dijo COMPLETED. No se anuncia un ciclo a medias. */
export const lifecycleCompleted = lifecycle.settle?.status === "COMPLETED";

/**
 * Los cuatro pasos, en el orden en que ocurrieron, con el hash de cada uno.
 *
 * Se construye desde el registro y no a mano: si algun dia un paso falta, la
 * tabla se queda corta en vez de mostrar una fila sin transaccion detras.
 */
export function lifecycleSteps(): { label: string; tx: string }[] {
  const steps = [
    { label: "Job funded in escrow by the buyer", tx: lifecycle.hire.tx },
    { label: "Deliverable submitted by the seller", tx: lifecycle.submit.tx },
  ];
  if (lifecycle.settle) {
    steps.push({
      label: "Escrow released — the seller was paid",
      tx: lifecycle.settle.tx,
    });
  }
  return steps;
}

/** Lo cobrado por el vendedor, en $U legibles. */
export function lifecyclePaidU(): string {
  try {
    return String(Number(BigInt(lifecycle.settle?.paid_raw ?? "0")) / 1e18);
  } catch {
    return "0";
  }
}
