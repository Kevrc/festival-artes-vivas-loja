import Link from 'next/link';

/** Panel de coordinación de convocatorias (sesión de desarrollo hasta que exista Identidad). */
export default function LayoutCoordinacion({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="saltar" href="#contenido">Saltar al contenido</a>
      <header className="cabecera no-imprimir">
        <Link href="/cartelera" className="marca">FIAVL <span>Panel de operación · Convocatorias</span></Link>
        <nav aria-label="Coordinación de convocatorias">
          <ul>
            <li><Link href="/admisibilidad">Admisibilidad</Link></li>
            <li><Link href="/convocatorias">Convocatorias públicas</Link></li>
          </ul>
        </nav>
      </header>
      <main id="contenido" tabIndex={-1}>{children}</main>
      <footer className="pie no-imprimir"><p>Revisión de admisibilidad · FIAVL Loja</p></footer>
    </>
  );
}
