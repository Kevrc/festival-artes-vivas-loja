import Link from 'next/link';
import { Buscador } from '@/components/cartelera/buscador';
import { NavPrincipal } from '@/components/sitio/nav-principal';

/** Maqueta pública accesible (FR-013): regiones, idioma es, navegación por teclado. */
export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <header className="cabecera">
        <Link href="/cartelera" className="marca">
          FIAVL <span>Festival Internacional de Artes Vivas · Loja</span>
        </Link>
        <NavPrincipal />
        <Buscador />
      </header>
      <main id="contenido" tabIndex={-1}>
        {children}
      </main>
      <footer className="pie">
        <p>Festival Internacional de Artes Vivas · Loja, Ecuador · 12–22 de noviembre de 2026</p>
        <p>Horas en hora de Ecuador continental. Programación sujeta a cambios.</p>
      </footer>
    </>
  );
}
