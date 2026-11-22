import Link from 'next/link';

/** Navegación de Estadísticas (spec 004, US5). No cambia el layout del panel de Boletería. */
export default function LayoutEstadisticas({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav aria-label="Estadísticas" className="no-imprimir">
        <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
          <li>
            <Link href="/estadisticas">Indicadores</Link>
          </li>
          <li>
            <Link href="/estadisticas/informe">Informe de cierre</Link>
          </li>
          <li>
            <Link href="/programacion">Programación</Link>
          </li>
        </ul>
      </nav>
      {children}
    </>
  );
}
