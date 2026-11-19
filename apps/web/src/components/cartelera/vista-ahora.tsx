'use client';
import { useEffect, useMemo, useState } from 'react';
import { obtenerCliente } from '@/lib/cartelera/api';
import { REFERENCIAS, minutosAPie, ordenarPorCercania, type Punto } from '@/lib/cartelera/distancia';
import type { FuncionResumen } from '@/lib/cartelera/tipos';
import { TarjetaFuncion } from './tarjeta-funcion';

/** US4: la ubicación se usa solo en el dispositivo y nunca se envía (FR-014). */
export function VistaAhora() {
  const [items, setItems] = useState<FuncionResumen[] | null>(null);
  const [error, setError] = useState(false);
  const [origen, setOrigen] = useState<{ punto: Punto; nombre: string } | null>(null);
  const [estadoUbicacion, setEstadoUbicacion] = useState<'inicial' | 'pidiendo' | 'denegada'>('inicial');

  useEffect(() => {
    obtenerCliente<{ items: FuncionResumen[] }>('/ahora')
      .then((r) => setItems(r.items))
      .catch(() => setError(true));
  }, []);

  const usarUbicacion = () => {
    if (!('geolocation' in navigator)) return setEstadoUbicacion('denegada');
    setEstadoUbicacion('pidiendo');
    navigator.geolocation.getCurrentPosition(
      (p) => setOrigen({ punto: { lat: p.coords.latitude, lng: p.coords.longitude }, nombre: 'tu ubicación' }),
      () => setEstadoUbicacion('denegada'),
      { maximumAge: 60_000, timeout: 10_000 },
    );
  };

  const lista = useMemo(() => (items && origen ? ordenarPorCercania(items, origen.punto) : (items ?? [])), [items, origen]);

  if (error) return <p className="aviso">No pudimos cargar lo que pasa ahora. Revisa la cartelera del día.</p>;
  if (!items) return <p>Cargando…</p>;

  return (
    <>
      <div className="no-imprimir" role="group" aria-label="Ordenar por cercanía">
        <button type="button" onClick={usarUbicacion} disabled={estadoUbicacion === 'pidiendo'}>
          Ordenar por cercanía a mi ubicación
        </button>{' '}
        <label htmlFor="referencia">o desde </label>
        <select
          id="referencia"
          value={origen && origen.nombre !== 'tu ubicación' ? origen.nombre : ''}
          onChange={(e) => {
            const r = REFERENCIAS.find((x) => x.nombre === e.currentTarget.value);
            setOrigen(r ? { punto: r.punto, nombre: r.nombre } : null);
          }}
        >
          <option value="">(por hora)</option>
          {REFERENCIAS.map((r) => (
            <option key={r.nombre}>{r.nombre}</option>
          ))}
        </select>
        {estadoUbicacion === 'denegada' && <p role="status">Sin permiso de ubicación: elige un punto de referencia.</p>}
      </div>
      <p aria-live="polite" className="conteo">
        {lista.length} funciones{origen ? `, ordenadas por cercanía a ${origen.nombre}` : ', ordenadas por hora'}
      </p>
      {lista.length === 0 ? (
        <p className="vacio">No hay funciones en la próxima hora.</p>
      ) : (
        <ol className="lista-funciones">
          {lista.map((f) => (
            <li key={f.id}>
              <TarjetaFuncion
                funcion={f}
                accion={origen && <span className="etiqueta">≈ {minutosAPie(origen.punto, f.sede.coordenadas)} min a pie</span>}
              />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
