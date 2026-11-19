import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TarjetaFuncion } from '@/components/cartelera/tarjeta-funcion';
import { obtener } from '@/lib/cartelera/api';
import type { FichaSede } from '@/lib/cartelera/tipos';

export const revalidate = 60;

// Lista vacía + dynamicParams: cada página se genera en la primera visita y queda en caché ISR (research R1)
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}
type Props = { params: Promise<{ id: string }> };

const cargar = async (id: string) => obtener<FichaSede>(`/sedes/${id}`, [`sede:${id}`]);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await cargar((await params).id))?.nombre ?? 'Sede' };
}

const RASGOS: Record<string, string> = { sillaRuedas: 'Espacio para silla de ruedas', banoAccesible: 'Baño accesible', rampa: 'Rampa de acceso' };

/** US3: ficha de sede con accesibilidad explícita o "sin información" (US3-AS2). */
export default async function FichaSedePagina({ params }: Props) {
  const s = await cargar((await params).id);
  if (!s) notFound();
  const rasgos = Object.entries(s.accesibilidad ?? {}).filter(([, v]) => v);
  const comoLlegar = `https://www.openstreetmap.org/directions?to=${s.coordenadas.lat}%2C${s.coordenadas.lng}`;
  return (
    <article className="ficha" aria-labelledby="titulo-sede">
      <h1 id="titulo-sede">{s.nombre}</h1>
      <dl>
        <dt>Dirección</dt>
        <dd>{s.direccion}</dd>
        {s.aforo && (
          <>
            <dt>Aforo</dt>
            <dd>{s.aforo} personas</dd>
          </>
        )}
        <dt>Accesibilidad</dt>
        <dd>
          {rasgos.length ? (
            <ul>
              {rasgos.map(([k]) => (
                <li key={k}>{RASGOS[k] ?? k}</li>
              ))}
            </ul>
          ) : (
            'Sin información de accesibilidad'
          )}
        </dd>
      </dl>
      <p>
        <a className="boton" href={comoLlegar} target="_blank" rel="noopener noreferrer">
          Cómo llegar <span className="solo-lectores">(abre OpenStreetMap en otra pestaña)</span>
        </a>
      </p>
      <h2>Funciones en esta sede</h2>
      <ol className="lista-funciones">
        {s.funciones.map((f) => (
          <li key={f.id}>
            <TarjetaFuncion funcion={f} mostrarDia />
          </li>
        ))}
      </ol>
    </article>
  );
}
