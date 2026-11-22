'use client';

import { useCallback, useEffect, useState } from 'react';
import { SesionDevOperacion as SelectorSesion } from '@/components/operacion/sesion-dev-operacion';
import estilos from '@/components/operacion/operacion.module.css';
import { type Edicion, ErrorApiOperacion, type Obra, type SesionDevOperacion, apiOperacion } from '@/lib/operacion/api';

const COMPONENTES: Record<Obra['componente'], string> = {
  internacional: 'Internacional',
  nacional: 'Nacional',
  camino_a_loja: 'Camino a Loja',
  escuela: 'Escuela del festival',
  salud_arte: 'Salud y arte',
};

/** Ficha técnica en texto legible: requerimientos y tiempos informados por el elenco. */
function FichaTecnica({ ficha }: { ficha: Record<string, unknown> }) {
  const requerimientos = Array.isArray(ficha.requerimientos) ? (ficha.requerimientos as string[]) : [];
  const montaje = typeof ficha.montajeMin === 'number' ? `${ficha.montajeMin} min de montaje` : null;
  const desmontaje = typeof ficha.desmontajeMin === 'number' ? `${ficha.desmontajeMin} min de desmontaje` : null;
  const tiempos = [montaje, desmontaje].filter(Boolean).join(', ');
  if (!tiempos && requerimientos.length === 0) return <dd>Sin ficha técnica</dd>;
  return (
    <dd>
      {tiempos && <span>{tiempos}. </span>}
      {requerimientos.length > 0 && <span>Requiere: {requerimientos.join(', ')}.</span>}
    </dd>
  );
}

/** `/programacion/obras`: buscar obras programables, incluidas las de convocatoria (US1-AS5, FR-007). */
export default function ObrasPage() {
  const [sesion, setSesion] = useState<SesionDevOperacion | null>(null);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [q, setQ] = useState('');
  const [origen, setOrigen] = useState<'' | 'invitado' | 'convocatoria'>('');
  const [obras, setObras] = useState<Obra[] | null>(null);
  const [error, setError] = useState('');
  const alCambiarSesion = useCallback((s: SesionDevOperacion | null) => setSesion(s), []);

  useEffect(() => {
    if (!sesion) return;
    apiOperacion
      .ediciones()
      .then((l) => setEdicion(l.find((e) => e.estado !== 'cerrada') ?? l[0] ?? null))
      .catch((e) => setError(e instanceof ErrorApiOperacion && e.status === 403 ? 'Tu rol no puede ver las obras.' : String(e)));
  }, [sesion]);

  const buscar = useCallback(async () => {
    if (!edicion) return;
    try {
      setObras(await apiOperacion.obras(edicion.id, { q: q || undefined, origen: origen || undefined }));
      setError('');
    } catch (e) {
      setError(e instanceof ErrorApiOperacion && e.status === 403 ? 'Tu rol no puede ver las obras.' : String(e));
    }
  }, [edicion, q, origen]);

  useEffect(() => {
    void buscar();
    // Solo al cambiar de edición u origen; el texto se busca al enviar el formulario.
  }, [edicion, origen]);

  return (
    <>
      <h1>Obras</h1>
      <SelectorSesion onCambio={alCambiarSesion} />
      {error && (
        <p role="alert" className={estilos.resumen}>
          {error}
        </p>
      )}
      <form
        role="search"
        className={estilos.barra}
        onSubmit={(e) => {
          e.preventDefault();
          void buscar();
        }}
      >
        <div className={estilos.campo}>
          <label htmlFor="q">Buscar por título o elenco</label>
          <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className={estilos.campo}>
          <label htmlFor="origen">Origen</label>
          <select id="origen" value={origen} onChange={(e) => setOrigen(e.target.value as typeof origen)}>
            <option value="">Todas</option>
            <option value="invitado">Invitadas</option>
            <option value="convocatoria">De convocatoria</option>
          </select>
        </div>
        <button type="submit">Buscar</button>
      </form>

      <p aria-live="polite" className={estilos.ayuda}>
        {obras ? `${obras.length} obras encontradas` : ''}
      </p>
      {obras && (
        <ul className={estilos.obras}>
          {obras.map((o) => (
            <li key={o.id} className={estilos.obra}>
              <h2>{o.titulo}</h2>
              <p>
                {o.elenco.nombre} ({o.elenco.pais}) · {COMPONENTES[o.componente]} · {o.origen === 'convocatoria' ? 'Seleccionada en convocatoria' : 'Invitada'}
              </p>
              <dl>
                <dt>Duración</dt>
                <dd>{o.duracionMin} min</dd>
                <dt>Edad mínima</dt>
                <dd>{o.edadMinima > 0 ? `${o.edadMinima} años` : 'Todo público'}</dd>
                <dt>Ficha técnica</dt>
                <FichaTecnica ficha={(o.fichaTecnica ?? {}) as Record<string, unknown>} />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
