import Link from 'next/link';

/** Navegación de Programación (spec 004). No cambia el layout del panel de Boletería. */
export default function LayoutProgramacion({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav aria-label="Programación" className="no-imprimir">
        <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
          <li>
            <Link href="/programacion">Grilla</Link>
          </li>
          <li>
            <Link href="/programacion/obras">Obras</Link>
          </li>
          <li>
            <Link href="/programacion/publicar">Publicar</Link>
          </li>
        </ul>
      </nav>
      {children}
    </>
  );
}
