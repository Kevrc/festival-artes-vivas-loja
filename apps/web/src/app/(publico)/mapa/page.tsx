import type { Metadata } from 'next';
import { obtener } from '@/lib/cartelera/api';
import type { DiaCartelera, EdicionConFacetas } from '@/lib/cartelera/tipos';
import { formatoDia } from '@/lib/cartelera/formato';
import { MapaCargable } from '@/components/cartelera/mapa-cargable';

export const metadata: Metadata = { title: 'Mapa' };

/** FR-008: sedes y funciones del día en un mapa (Leaflet bajo demanda, research R7). */
export default async function Mapa({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const edicion = await obtener<EdicionConFacetas>('/ediciones/actual', ['edicion']);
  const pedida = (await searchParams).fecha;
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : edicion?.diaSugerido;
  const dia = fecha ? await obtener<DiaCartelera>(`/dias/${fecha}`, [`dia:${fecha}`]) : null;
  return (
    <section aria-labelledby="titulo-mapa">
      <h1 id="titulo-mapa">Mapa{fecha ? ` del ${formatoDia(fecha)}` : ''}</h1>
      {dia ? <MapaCargable funciones={dia.funciones} /> : <p>No hay programación para mostrar.</p>}
    </section>
  );
}
