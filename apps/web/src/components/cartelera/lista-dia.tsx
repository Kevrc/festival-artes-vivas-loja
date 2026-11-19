'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { aplicarFiltros, escribirFiltros, hayFiltros, leerFiltros, quitarUltimo, type Filtros } from '@/lib/cartelera/filtros';
import type { Facetas, FuncionResumen } from '@/lib/cartelera/tipos';
import { BotonFavorito } from './boton-favorito';
import { FiltrosPanel } from './filtros-panel';
import { TarjetaFuncion } from './tarjeta-funcion';
import { useDisponibilidad } from './use-disponibilidad';

/** Funciones del día con filtros en la URL (research R1, FR-005) y disponibilidad aparte (R4). */
export function ListaDia({
  fecha,
  funciones,
  facetas,
  version,
}: {
  fecha: string;
  funciones: FuncionResumen[];
  facetas: Facetas;
  version: string;
}) {
  const router = useRouter();
  const ruta = usePathname();
  // La lista completa se renderiza en el servidor (HTML útil sin JS y en 4G); los filtros de la URL se
  // aplican al montar. Estado local: dos clics seguidos no se pisan y la URL se actualiza al instante (FR-005).
  const [filtros, setFiltros] = useState<Filtros>({});
  useEffect(() => {
    const leer = () => setFiltros(leerFiltros(new URLSearchParams(window.location.search)));
    leer();
    window.addEventListener('popstate', leer);
    return () => window.removeEventListener('popstate', leer);
  }, []);
  const visibles = useMemo(() => aplicarFiltros(funciones, filtros), [funciones, filtros]);
  const { nivelDe, desactualizada } = useDisponibilidad(fecha, version);

  const cambiar = (f: Filtros) => {
    setFiltros(f);
    const q = escribirFiltros(f);
    window.history.replaceState(null, '', q ? `${ruta}?${q}` : ruta);
  };

  return (
    <>
      {desactualizada && (
        <p className="aviso" role="status">
          La programación se actualizó. <button onClick={() => router.refresh()}>Ver cambios</button>
        </p>
      )}
      <FiltrosPanel facetas={facetas} filtros={filtros} alCambiar={cambiar} />
      <p className="no-imprimir">
        <a href={`/programa?fecha=${fecha}${hayFiltros(filtros) ? `&${escribirFiltros(filtros)}` : ''}`}>Programa imprimible de este día</a>
      </p>
      <p aria-live="polite" className="conteo">
        {visibles.length === 1 ? '1 función' : `${visibles.length} funciones`}
        {hayFiltros(filtros) ? ' con los filtros elegidos' : ''}
      </p>
      {visibles.length === 0 ? (
        <div className="vacio">
          <p>No hay funciones que cumplan todos los filtros.</p>
          {hayFiltros(filtros) && (
            <p>
              <button onClick={() => cambiar(quitarUltimo(filtros))}>Quitar el último filtro</button>{' '}
              <button onClick={() => cambiar({})}>Limpiar filtros</button>
            </p>
          )}
        </div>
      ) : (
        <ol className="lista-funciones">
          {visibles.map((f) => (
            <li key={f.id}>
              <TarjetaFuncion funcion={f} nivel={nivelDe(f.id)} accion={<BotonFavorito funcionId={f.id} titulo={f.obra.titulo} />} />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
