import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obtener } from '@/lib/cartelera/api';
import { ETIQUETA_COMPONENTE, ETIQUETA_DISCIPLINA } from '@/lib/cartelera/formato';
import type { FichaElenco } from '@/lib/cartelera/tipos';

export const revalidate = 60;

// Lista vacía + dynamicParams: cada página se genera en la primera visita y queda en caché ISR (research R1)
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}
type Props = { params: Promise<{ id: string }> };

const cargar = async (id: string) => obtener<FichaElenco>(`/elencos/${id}`, [`elenco:${id}`]);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await cargar((await params).id))?.nombre ?? 'Elenco' };
}

/** US3: ficha de elenco con sus obras en la edición. */
export default async function FichaElencoPagina({ params }: Props) {
  const e = await cargar((await params).id);
  if (!e) notFound();
  return (
    <article className="ficha" aria-labelledby="titulo-elenco">
      <p className="sobretitulo">{ETIQUETA_COMPONENTE[e.componente]}</p>
      <h1 id="titulo-elenco">{e.nombre}</h1>
      <p>
        {e.ciudad ? `${e.ciudad}, ` : ''}
        {e.pais}
      </p>
      <h2>Obras en el festival</h2>
      <ul>
        {e.obras.map((o) => (
          <li key={o.id}>
            <Link href={`/obras/${o.id}`}>{o.titulo}</Link> · {ETIQUETA_DISCIPLINA[o.disciplina]}
          </li>
        ))}
      </ul>
    </article>
  );
}
