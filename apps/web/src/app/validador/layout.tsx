'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/** Maqueta PWA del validador de entradas en puerta (T036, T037). */
export default function LayoutValidador({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/validador/sw.js', { scope: '/validador' }).catch(() => {
        // El registro puede omitirse en entornos sin soporte SW
      });
    }
  }, []);

  return (
    <>
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <header className="cabecera">
        <Link href="/validador" className="marca">
          FIAVL <span>Validador en puerta</span>
        </Link>
        <nav aria-label="Navegación del validador">
          <ul>
            <li><Link href="/validador">Funciones y paquetes</Link></li>
            <li><Link href="/taquilla">Taquilla</Link></li>
            <li><Link href="/cartelera">Cartelera</Link></li>
          </ul>
        </nav>
      </header>
      <main id="contenido" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
