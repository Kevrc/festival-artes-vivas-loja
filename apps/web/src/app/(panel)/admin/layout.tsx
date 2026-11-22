import Link from 'next/link';

/** Navegación de Administración (spec 004, US9). No cambia el layout del panel de Boletería. */
export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav aria-label="Administración" className="no-imprimir">
        <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
          <li>
            <Link href="/admin/personal">Personal</Link>
          </li>
          <li>
            <Link href="/admin/ediciones">Ediciones</Link>
          </li>
          <li>
            <Link href="/admin/sedes">Sedes</Link>
          </li>
          <li>
            <Link href="/admin/estudiantes">Dominios de estudiantes</Link>
          </li>
          <li>
            <Link href="/admin/notificaciones">Avisos fallidos</Link>
          </li>
          <li>
            <Link href="/programacion">Programación</Link>
          </li>
          <li>
            <Link href="/mi-cuenta">Mi cuenta</Link>
          </li>
        </ul>
      </nav>
      {children}
    </>
  );
}
