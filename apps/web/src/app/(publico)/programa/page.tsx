import type { Metadata } from 'next';
import { TarjetaFuncion } from '@/components/cartelera/tarjeta-funcion';
import { obtener } from '@/lib/cartelera/api';
import { aplicarFiltros, hayFiltros, leerFiltros } from '@/lib/cartelera/filtros';
import { diasEntre, formatoDia, ZONA } from '@/lib/cartelera/formato';
import type { DiaCartelera, EdicionConFacetas } from '@/lib/cartelera/tipos';
import { BotonImprimir } from '@/components/cartelera/boton-imprimir';

export const metadata: Metadata = { title: 'Programa de mano' };

type Busqueda = Record<string, string | string[] | undefined>;

/** US6-AS1: programa imprimible, completo o filtrado (research R9). */
export default async function Programa({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams;
  const params = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])));
  const filtros = leerFiltros(params);
  const edicion = await obtener<EdicionConFacetas>('/ediciones/actual', ['edicion']);
  if (!edicion) return <p>No hay una edición publicada.</p>;
  const fecha = params.get('fecha');
  const dias = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? [fecha] : diasEntre(edicion.fechaInicio, edicion.fechaFin);
  const cargados = (await Promise.all(dias.map((d) => obtener<DiaCartelera>(`/dias/${d}`, [`dia:${d}`])))).filter(Boolean) as DiaCartelera[];
  const generado = new Intl.DateTimeFormat('es-EC', { timeZone: ZONA, dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  return (
    <section aria-labelledby="titulo-programa">
      <h1 id="titulo-programa">
        Programa de mano · {edicion.numero} FIAVL {edicion.anio}
      </h1>
      <p className="sobretitulo">
        Generado el {generado}
        {hayFiltros(filtros) ? ' · con filtros' : ''}. La programación puede cambiar: consulta la cartelera en línea.
      </p>
      <p className="no-imprimir">
        <BotonImprimir />
      </p>
      {cargados.map((d) => {
        const lista = aplicarFiltros(d.funciones, filtros);
        return lista.length ? (
          <section key={d.fecha} aria-labelledby={`p-${d.fecha}`}>
            <h2 id={`p-${d.fecha}`}>{formatoDia(d.fecha)}</h2>
            <ol className="lista-funciones">
              {lista.map((f) => (
                <li key={f.id}>
                  <TarjetaFuncion funcion={f} />
                </li>
              ))}
            </ol>
          </section>
        ) : null;
      })}
    </section>
  );
}
