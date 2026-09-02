import type { NextConfig } from "next";

// La app renderiza texto, URLs y cuerpos de respuesta escritos por terceros
// desconocidos (cualquiera puede registrar un agente ERC-8004). React ya escapa
// el contenido, pero estas cabeceras cubren lo que React no: sniffing de MIME,
// enmarcado en otra pagina, y fuga de la URL al navegar fuera.
// React usa eval() en modo desarrollo para reconstruir stacks entre entornos.
// Con el CSP estricto puesto, el overlay de errores deja de funcionar. Se relaja
// SOLO en dev: en produccion script-src queda cerrado, que es donde importa.
const isDev = process.env.NODE_ENV === "development";
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

// El hot-reload de Next abre un WebSocket contra ws://localhost, que
// `connect-src 'self'` bloquea. Solo se permite en desarrollo.
const connectSrc = isDev
  ? "connect-src 'self' ws: wss:"
  : "connect-src 'self'";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    // Sin `unsafe-eval`. `unsafe-inline` en style-src es necesario para los
    // estilos inline que usamos en los indicadores de estado; el riesgo real
    // esta en script-src, que si queda cerrado.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      connectSrc,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
