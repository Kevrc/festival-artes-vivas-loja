import type { Metadata } from 'next';
import { TarjetaFuncion } from '@/components/cartelera/tarjeta-funcion';
import { obtener } from '@/lib/cartelera/api';
import type { FuncionResumen, ObraResumen } from '@/lib/cartelera/tipos';

export const metadata: Metadata = { title: 'Buscar' };

type Resultado = ObraResumen & { funciones: FuncionResumen[] };

/** US2: búsqueda por obra o elenco, sin distinguir tildes (FR-004). */
export default async function Buscar({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').trim();
  const valida = q.length >= 2 && q.length <= 80;
  const resultados = valida ? ((await obtener<Resultado[]>(`/buscar?q=${encodeURIComponent(q)}`, ['busqueda'])) ?? []) : [];
  return (
    <section aria-labelledby="titulo-buscar">
      <h1 id="titulo-buscar">Buscar</h1>
      <form action="/buscar" role="search" className="buscador">
        <label htmlFor="q-pagina" className="solo-lectores">Obra o elenco</label>
        <input id="q-pagina" name="q" type="search" defaultValue={q} minLength={2} maxLength={80} required />
        <button type="submit">Buscar</button>
      </form>
      {valida && (
        <p aria-live="polite" className="conteo">
          {resultados.length === 0 ? `Sin resultados para “${q}”.` : `${resultados.length} obra(s) para “${q}”.`}
        </p>
      )}
      {resultados.map((o) => (
        <section key={o.id} aria-labelledby={`r-${o.id}`}>
          <h2 id={`r-${o.id}`}>{o.titulo}</h2>
          <ol className="lista-funciones">
            {o.funciones.map((f) => (
              <li key={f.id}>
                <TarjetaFuncion funcion={f} mostrarDia />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </section>
  );
}
