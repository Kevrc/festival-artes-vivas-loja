import Link from 'next/link';
import { Buscador } from '@/components/cartelera/buscador';

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
        <nav aria-label="Principal">
          <ul>
            <li><Link href="/cartelera">Cartelera</Link></li>
            <li><Link href="/ahora">Ahora</Link></li>
            <li><Link href="/mapa">Mapa</Link></li>
            <li><Link href="/mi-agenda">Mi agenda</Link></li>
            <li><Link href="/mis-entradas">Mis entradas</Link></li>
          </ul>
        </nav>
        <Buscador />
      </header>
      <main id="contenido" tabIndex={-1}>
        {children}
      </main>
      <footer className="pie">
        <p>Horas en hora de Ecuador continental. Programación sujeta a cambios.</p>
      </footer>
    </>
  );
}
