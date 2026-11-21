'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from '../../(publico)/convocatorias/convocatorias.module.css';
import { encabezadosCoordinacion, ETIQUETA_ESTADO, puntajeEc, respuestaApi } from '@/lib/convocatorias/api';

interface Resumen {
  postulacionId: string; numero: string; tituloObra: string; estado: string; puntajeFinal: string | null; deliberacion: boolean; pendientes: number;
  evaluaciones: Array<{ evaluacionId: string | null; asignacionId: string; estado: string; puntaje: string | null }>;
}

/** Coordinación: avance de la curaduría, puntaje final y reapertura de evaluaciones con motivo (US3-AS6). */
export function PanelEvaluaciones() {
  const [items, setItems] = useState<Resumen[] | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    try {
      setError('');
      setItems(await respuestaApi<Resumen[]>('/panel/evaluaciones', { headers: encabezadosCoordinacion() }));
    } catch (e) { setError((e as Error).message); setItems([]); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function reabrir(numero: string, evaluacionId: string, motivo: string) {
    setError(''); setAviso('');
    try {
      await respuestaApi(`/panel/evaluaciones/${evaluacionId}/reabrir`, { method: 'POST', body: JSON.stringify({ motivo }), headers: encabezadosCoordinacion() });
      setAviso(`Evaluación de ${numero} reabierta. La postulación vuelve a estar en evaluación.`);
      await cargar();
    } catch (e) { setError((e as Error).message); }
  }

  return <>
    <p className="sobretitulo">Coordinación de convocatorias</p>
    <h1>Evaluaciones de postulaciones</h1>
    <p>Consulta el avance de cada curaduría. Una evaluación enviada solo puede reabrirse con un motivo, que queda registrado.</p>
    {error ? <div role="alert" className={styles.errores}><strong>No se pudo completar la acción</strong><p>{error}</p></div> : null}
    <p role="status">{aviso}</p>
    {items === null ? <p role="status">Cargando evaluaciones…</p> : items.length === 0 ? <p>No hay postulaciones en evaluación.</p> :
      <ul className={styles.lista} aria-label="Postulaciones en evaluación">{items.map((p) => <li key={p.postulacionId}><Tarjeta p={p} onReabrir={reabrir} /></li>)}</ul>}
  </>;
}

function Tarjeta({ p, onReabrir }: { p: Resumen; onReabrir: (numero: string, evaluacionId: string, motivo: string) => Promise<void> }) {
  const [motivo, setMotivo] = useState('');
  const [local, setLocal] = useState('');
  const idMotivo = `motivo-${p.postulacionId}`;
  const reabribles = p.evaluaciones.filter((e) => e.estado === 'enviada' && e.evaluacionId);

  async function reabrir(evaluacionId: string) {
    if (!motivo.trim()) { setLocal('El motivo es obligatorio para reabrir una evaluación.'); return; }
    setLocal('');
    await onReabrir(p.numero, evaluacionId, motivo.trim());
    setMotivo('');
  }

  return <article className={styles.tarjeta} aria-labelledby={`e-${p.postulacionId}`}>
    <h2 id={`e-${p.postulacionId}`}>{p.numero} · {p.tituloObra}</h2>
    <p><span className={styles.estado}>Estado: {ETIQUETA_ESTADO[p.estado] ?? p.estado}</span></p>
    <p>Puntaje final: <strong>{puntajeEc(p.puntajeFinal)}</strong> · Evaluaciones pendientes: {p.pendientes}</p>
    {p.deliberacion ? <p role="note" className={styles.aviso}>Requiere deliberación: las evaluaciones difieren en más de 25 puntos.</p> : null}
    <ul>{p.evaluaciones.map((e, i) => <li key={e.asignacionId}>
      Evaluación {i + 1}: {ETIQUETA_ESTADO[e.estado] ?? e.estado} · puntaje {puntajeEc(e.puntaje)}
    </li>)}</ul>
    {reabribles.length ? <div>
      <label className={styles.campo} htmlFor={idMotivo}>Motivo de reapertura
        <textarea id={idMotivo} value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-describedby={local ? `${idMotivo}-error` : undefined} />
      </label>
      {local ? <p id={`${idMotivo}-error`} role="alert" className={styles.errores}>{local}</p> : null}
      <div className={styles.acciones}>{p.evaluaciones.map((e, i) => e.estado === 'enviada' && e.evaluacionId
        ? <button key={e.asignacionId} type="button" className="boton-favorito" aria-label={`Reabrir evaluación ${i + 1} de ${p.numero}`} onClick={() => void reabrir(e.evaluacionId!)}>Reabrir evaluación {i + 1}</button>
        : null)}</div>
    </div> : null}
  </article>;
}
