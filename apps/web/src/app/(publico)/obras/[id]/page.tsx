import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TarjetaFuncion } from '@/components/cartelera/tarjeta-funcion';
import { API_PUBLICA, obtener } from '@/lib/cartelera/api';
import { ETIQUETA_COMPONENTE, ETIQUETA_DISCIPLINA, ICONO_DISCIPLINA } from '@/lib/cartelera/formato';
import type { FichaObra } from '@/lib/cartelera/tipos';

export const revalidate = 60;

// Lista vacía + dynamicParams: cada página se genera en la primera visita y queda en caché ISR (research R1)
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}
type Props = { params: Promise<{ id: string }> };

const cargar = async (id: string) => obtener<FichaObra>(`/obras/${id}`, [`obra:${id}`]);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const o = await cargar((await params).id);
  return { title: o?.titulo ?? 'Obra' };
}

/** US3: ficha de obra con todas sus funciones. */
export default async function FichaObraPagina({ params }: Props) {
  const o = await cargar((await params).id);
  if (!o) notFound();
  const edad = o.edadMinima ?? 0;
  return (
    <article className="ficha" aria-labelledby="titulo-obra">
      <p className="sobretitulo">
        <span aria-hidden="true">{ICONO_DISCIPLINA[o.disciplina]} </span>
        {ETIQUETA_DISCIPLINA[o.disciplina]} · {ETIQUETA_COMPONENTE[o.componente]}
      </p>
      <h1 id="titulo-obra">{o.titulo}</h1>
      {o.imagenes?.[0] && (
        <img className="ficha-imagen" src={o.imagenes[0]} alt="" width={960} height={600} />
      )}
      {edad >= 16 && <p className="destacado">No apta para menores de {edad} años</p>}
      {o.sinopsis && <p>{o.sinopsis}</p>}
      <dl>
        <dt>Elenco</dt>
        <dd>
          <Link href={`/elencos/${o.elenco.id}`}>{o.elenco.nombre}</Link> ({o.elenco.pais})
        </dd>
        <dt>Duración</dt>
        <dd>{o.duracionMin} minutos</dd>
        <dt>Edad mínima recomendada</dt>
        <dd>{edad > 0 ? `${edad} años` : 'Todo público'}</dd>
        {o.idioma && (
          <>
            <dt>Idioma</dt>
            <dd>{o.idioma}</dd>
          </>
        )}
        {o.fichaArtistica?.map((p) => (
          <div key={`${p.rol}-${p.nombre}`} style={{ display: 'contents' }}>
            <dt>{p.rol}</dt>
            <dd>{p.nombre}</dd>
          </div>
        ))}
      </dl>
      <h2>Funciones</h2>
      <ol className="lista-funciones">
        {o.funciones.map((f) => (
          <li key={f.id}>
            <TarjetaFuncion
              funcion={f}
              mostrarDia
              accion={
                f.estado !== 'cancelada' && (
                  <a className="boton boton-favorito" href={`${API_PUBLICA}/api/cartelera/funciones/${f.id}/calendario.ics`}>
                    Añadir a mi calendario
                  </a>
                )
              }
            />
          </li>
        ))}
      </ol>
    </article>
  );
}
