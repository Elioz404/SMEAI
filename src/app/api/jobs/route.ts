import { NextResponse } from "next/server";
import { formatU, jobs, jobsWithAgents } from "@/lib/jobs";

export const runtime = "nodejs";

/**
 * API publica de los trabajos ERC-8183 que hemos financiado.
 *
 * Es la mitad que ningun directorio publica: no que agentes existen, sino que
 * paso cuando se les pago. Cada entrada es comprobable en el explorador con el
 * jobId y la direccion del kernel que van en la respuesta.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function GET() {
  const list = jobsWithAgents();
  return NextResponse.json(
    {
      measured_at: jobs.generated_at,
      chain_id: jobs.chain_id,
      commerce: jobs.commerce,
      payment_token: jobs.payment_token,
      buyer: jobs.treasury,
      explorer: jobs.explorer,
      totals: {
        ...jobs.totals,
        escrowed_u: formatU(jobs.totals.escrowed_raw),
        paid_u: formatU(jobs.totals.paid_raw),
      },
      jobs: list.map((j) => ({
        id: j.id,
        status: j.status,
        provider: j.provider,
        agent: j.agent,
        budget_raw: j.budget,
        budget_u: formatU(j.budget),
        description: j.description,
        expired_at: j.expired_at,
        submitted_at: j.submitted_at,
        delivered: j.delivered,
        reclaimable: j.reclaimable,
      })),
    },
    { headers: CORS },
  );
}
