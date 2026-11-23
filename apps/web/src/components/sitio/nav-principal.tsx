'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ENLACES = [
  ['/cartelera', 'Cartelera'],
  ['/ahora', 'Ahora'],
  ['/mapa', 'Mapa'],
  ['/mi-agenda', 'Mi agenda'],
  ['/mis-entradas', 'Mis entradas'],
  ['/convocatorias', 'Convocatorias'],
  ['/mi-cuenta', 'Mi cuenta'],
] as const;

/** Navegación pública con la sección actual marcada (aria-current). */
export function NavPrincipal() {
  const ruta = usePathname();
  return (
    <nav aria-label="Principal">
      <ul>
        {ENLACES.map(([href, texto]) => (
          <li key={href}>
            <Link href={href} aria-current={ruta === href || ruta.startsWith(`${href}/`) ? 'page' : undefined}>
              {texto}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
