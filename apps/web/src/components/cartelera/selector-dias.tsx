import Link from 'next/link';
import { diasEntre, formatoDiaCorto } from '@/lib/cartelera/formato';

/** Navegación entre los días de la edición; conserva los filtros en el cliente vía ListaDia. */
export function SelectorDias({ desde, hasta, actual }: { desde: string; hasta: string; actual: string }) {
  return (
    <nav aria-label="Días del festival" className="selector-dias">
      <ul>
        {diasEntre(desde, hasta).map((d) => (
          <li key={d}>
            <Link href={`/cartelera/${d}`} aria-current={d === actual ? 'date' : undefined}>
              {formatoDiaCorto(d)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
