import Link from 'next/link';

/** Maqueta accesible del panel operativo de taquilla, sala y validación. */
export default function LayoutPanel({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <header className="cabecera no-imprimir">
        <Link href="/cartelera" className="marca">
          FIAVL <span>Panel de operación · Boletería</span>
        </Link>
        <nav aria-label="Operación de boletería">
          <ul>
            <li><Link href="/taquilla">Taquilla</Link></li>
            <li><Link href="/validador">Validador</Link></li>
            <li><Link href="/cartelera">Cartelera pública</Link></li>
          </ul>
        </nav>
      </header>
      <main id="contenido" tabIndex={-1}>
        {children}
      </main>
      <footer className="pie no-imprimir">
        <p>Operación de boletería y control de accesos · FIAVL Loja</p>
      </footer>
    </>
  );
}
