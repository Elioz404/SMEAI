import { NextResponse } from "next/server";
import { census } from "@/lib/census";

export const runtime = "nodejs";

/**
 * Censo publico. Se sirve tal cual lo escribio el script, con su metodo y sus
 * tamanos de muestra incluidos: quien lo consuma debe poder ver las mismas
 * limitaciones que nosotros, no solo las cifras.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=600, s-maxage=21600, stale-while-revalidate=86400",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function GET() {
  return NextResponse.json(census, { headers: CORS });
}
