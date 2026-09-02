"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type NavItem = {
  key: string;
  label: string;
  short: string;
  accent: string;
  total: number;
  live: number;
  hireable: number;
};

const STORAGE_KEY = "smeai:sidebar-collapsed";

/**
 * Chrome persistente de la aplicacion.
 *
 * Recibe los conteos ya calculados desde el layout de servidor. Es importante
 * que no importe `snapshot`: es un componente cliente, y hacerlo mandaria los
 * 232 KB del snapshot al navegador.
 */
export function Shell({
  nav,
  children,
}: {
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ready, setReady] = useState(false);

  // La preferencia se lee despues del montaje para no romper la hidratacion.
  // `ready` evita que la barra "salte" de ancho en el primer pintado.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // navegador sin acceso a storage: nos quedamos con el valor por defecto
    }
    setReady(true);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // sin persistencia, pero la sesion actual funciona igual
      }
      return next;
    });
  }

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const width = collapsed ? "var(--sidebar-w-collapsed)" : "var(--sidebar-w)";

  return (
    <div className="flex min-h-screen">
      {/* Velo para móvil */}
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      <aside
        style={{ width, transition: ready ? "width 160ms ease" : undefined }}
        className={`fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col border-r border-line bg-sunken lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } transition-transform lg:transition-none`}
      >
        <div
          className={`flex h-14 items-center border-b border-line ${
            collapsed ? "justify-center px-0" : "justify-between px-4"
          }`}
        >
          {!collapsed && (
            <Link
              href="/"
              className="t-mono text-[15px] font-semibold tracking-[0.14em] text-t1"
            >
              SMEAI
            </Link>
          )}
          <button
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden size-7 items-center justify-center rounded text-t3 transition-colors hover:bg-overlay hover:text-t1 lg:flex"
          >
            <ChevronIcon direction={collapsed ? "right" : "left"} />
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="flex size-7 items-center justify-center rounded text-t3 hover:text-t1 lg:hidden"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {!collapsed && <p className="t-label px-4 pb-2">Categories</p>}

          <ul className="flex flex-col gap-0.5 px-2">
            {nav.map((item) => {
              const href = `/category/${item.key}`;
              const active = pathname === href;
              return (
                <li key={item.key}>
                  <Link
                    href={href}
                    title={collapsed ? `${item.label} — ${item.hireable} hireable of ${item.total}` : undefined}
                    className={`group flex items-center rounded transition-colors ${
                      collapsed ? "justify-center px-0 py-2" : "gap-2.5 px-2 py-1.5"
                    } ${active ? "bg-overlay" : "hover:bg-overlay/60"}`}
                  >
                    <span
                      aria-hidden
                      className="t-mono flex size-6 shrink-0 items-center justify-center rounded text-[9px] font-semibold"
                      style={{
                        color: active ? "#0a0c10" : item.accent,
                        background: active ? item.accent : "transparent",
                        boxShadow: active ? "none" : `inset 0 0 0 1px ${item.accent}40`,
                      }}
                    >
                      {item.short}
                    </span>

                    {!collapsed && (
                      <>
                        <span
                          className={`min-w-0 flex-1 truncate text-[12.5px] ${
                            active ? "text-t1" : "text-t2 group-hover:text-t1"
                          }`}
                        >
                          {item.label}
                        </span>
                        <span className="t-data shrink-0 text-t3">
                          <span style={{ color: "var(--live)" }}>{item.hireable}</span>
                          <span className="text-t3">/{item.total}</span>
                        </span>
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          {!collapsed && (
            <>
              <p className="t-label px-4 pb-2 pt-6">Reference</p>
              <ul className="flex flex-col gap-0.5 px-2">
                <SideLink href="/method" active={pathname === "/method"}>
                  How verification works
                </SideLink>
                <SideLink href="/report" active={pathname === "/report"}>
                  Agent Advantage Report
                </SideLink>
              </ul>
            </>
          )}
        </nav>

        {!collapsed && (
          <div className="border-t border-line px-4 py-3">
            <p className="t-data leading-relaxed text-t3">
              Built for BNB Chain
              <br />
              Build the Era
            </p>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior solo para móvil: en escritorio la marca vive en la
            barra lateral y repetirla aquí sería ruido. */}
        <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="flex size-8 items-center justify-center rounded text-t2 hover:bg-overlay hover:text-t1"
          >
            <MenuIcon />
          </button>
          <Link
            href="/"
            className="t-mono text-sm font-semibold tracking-[0.14em] text-t1"
          >
            SMEAI
          </Link>
        </div>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function SideLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className={`block rounded px-2 py-1.5 text-[12.5px] transition-colors ${
          active ? "bg-overlay text-t1" : "text-t2 hover:bg-overlay/60 hover:text-t1"
        }`}
      >
        {children}
      </Link>
    </li>
  );
}

/* Iconos como SVG en línea, no emojis: heredan currentColor, escalan sin
   pixelarse y se pintan igual en todos los sistemas. */

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d={direction === "left" ? "M8.5 3.5 5 7l3.5 3.5" : "M5.5 3.5 9 7l-3.5 3.5"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 4h12M2 8h12M2 12h12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3.5 3.5l7 7m0-7l-7 7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
