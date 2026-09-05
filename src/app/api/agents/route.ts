import { NextResponse } from "next/server";
import { CATEGORY_ORDER, bestProbe, type CategoryKey } from "@/lib/taxonomy";
import { mainnetRegistry, snapshot } from "@/lib/snapshot";

export const runtime = "nodejs";

/**
 * API publica del catalogo verificado.
 *
 * Existe porque el valor de este proyecto no es la web: es el hecho de que
 * alguien haya llamado a los endpoints y anotado que contesto. Ese dato solo
 * sirve si otros pueden construir encima sin depender de nuestra interfaz.
 *
 * Lee del mismo snapshot que la web, asi que responde exactamente lo que se ve
 * en pantalla. Sin claves y con CORS abierto: es informacion publica sobre un
 * registro publico.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  // El cron pide cada 30 min pero GitHub lo estrangula en repos publicos: en
  // la practica el snapshot se rehace unas 7 veces al dia. Media hora de cache
  // es holgada, no ajustada, y por eso no arriesga servir datos futuros.
  "Cache-Control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const MAX_LIMIT = 500;

function record(a: (typeof snapshot.agents)[number]) {
  const p = bestProbe(a);
  return {
    id: a.agent_id,
    chain_id: a.chain_id,
    token_id: a.token_id,
    name: a.name,
    description: a.description,
    testnet: a.is_testnet,
    owner: a.owner_address,
    wallet: a.agent_wallet,
    categories: a.categories,
    trust_score: a.trust_score,
    verification: {
      /** Sirve una agent-card valida. */
      serves_card: a.live,
      /** Card valida Y servicio A2A que responde: esto es lo contratable. */
      hireable: a.hireable,
      requires_auth: a.service?.requires_auth ?? false,
      latency_ms: p?.ok ? p.latency_ms : null,
      checked_at: p?.checked_at ?? null,
      endpoint: p?.url ?? null,
    },
    /** Precio que el propio agente cotizo por ERC-8183, si expone negociacion. */
    quote: a.service?.quote?.price
      ? {
          price_raw: a.service.quote.price,
          currency: a.service.quote.currency ?? null,
          eta_seconds: a.service.quote.eta_seconds ?? null,
          negotiation_hash: a.service.quote.negotiation_hash ?? null,
        }
      : null,
    /** Identidades que comparten dueno y backend con esta. */
    cluster_size: a.cluster?.size ?? 1,
    url: `/agent/${a.chain_id}/${a.token_id}`,
  };
}

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;

  const category = q.get("category");
  if (category && !CATEGORY_ORDER.includes(category as CategoryKey)) {
    return NextResponse.json(
      { error: `unknown category; expected one of ${CATEGORY_ORDER.join(", ")}` },
      { status: 400, headers: CORS },
    );
  }

  const chainParam = q.get("chain");
  if (chainParam && !/^(56|97)$/.test(chainParam)) {
    return NextResponse.json(
      { error: "chain must be 56 (BSC mainnet) or 97 (BSC testnet)" },
      { status: 400, headers: CORS },
    );
  }

  let list = snapshot.agents;
  if (category) list = list.filter((a) => a.categories.includes(category as CategoryKey));
  if (chainParam) list = list.filter((a) => a.chain_id === Number(chainParam));
  if (q.get("hireable") === "true") list = list.filter((a) => a.hireable);
  if (q.get("quoted") === "true") list = list.filter((a) => !!a.service?.quote?.price);

  const total = list.length;
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(q.get("limit")) || 100),
  );
  const offset = Math.max(0, Number(q.get("offset")) || 0);
  const page = list
    .slice()
    .sort((a, b) => b.trust_score - a.trust_score)
    .slice(offset, offset + limit);

  const reg = mainnetRegistry();
  return NextResponse.json(
    {
      measured_at: snapshot.finished_at,
      registry: {
        chain_id: reg.chain_id,
        registered: reg.registered,
        endpoint_verified: reg.endpoint_verified,
      },
      totals: snapshot.totals,
      query: { category, chain: chainParam, limit, offset, total },
      agents: page.map(record),
    },
    { headers: CORS },
  );
}
