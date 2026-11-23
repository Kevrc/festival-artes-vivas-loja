import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ListaDia } from '@/components/cartelera/lista-dia';
import { SelectorDias } from '@/components/cartelera/selector-dias';
import { Mosaico } from '@/components/sitio/mosaico';
import { obtener } from '@/lib/cartelera/api';
import { formatoDia } from '@/lib/cartelera/formato';
import type { DiaCartelera, EdicionConFacetas } from '@/lib/cartelera/tipos';

/** Página del día con ISR (research R1): todas las funciones; los filtros se aplican en el navegador. */
export const revalidate = 60;

// Lista vacía + dynamicParams: cada página se genera en la primera visita y queda en caché ISR (research R1)
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ fecha: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { fecha } = await params;
  return { title: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `Cartelera del ${formatoDia(fecha)}` : 'Cartelera' };
}

export default async function PaginaDia({ params }: Props) {
  const { fecha } = await params;
  const [dia, edicion] = await Promise.all([
    obtener<DiaCartelera>(`/dias/${fecha}`, [`dia:${fecha}`]),
    obtener<EdicionConFacetas>('/ediciones/actual', ['edicion']),
  ]);
  if (!dia || !edicion) notFound();
  return (
    <section aria-labelledby="titulo-dia">
      <header className="portada-dia">
        <div>
          <p className="sobretitulo">
            {dia.edicion.numero} edición · {dia.edicion.anio}
            {dia.edicion.paisInvitado ? ` · País invitado: ${dia.edicion.paisInvitado}` : ''}
          </p>
          <h1 id="titulo-dia">
            Cartelera del <em>{formatoDia(fecha)}</em>
          </h1>
        </div>
        <Mosaico />
      </header>
      <SelectorDias desde={dia.edicion.fechaInicio} hasta={dia.edicion.fechaFin} actual={fecha} />
      <ListaDia fecha={fecha} funciones={dia.funciones} facetas={edicion.facetas} version={dia.version} />
    </section>
  );
}
