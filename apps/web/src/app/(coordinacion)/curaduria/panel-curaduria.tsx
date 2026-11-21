'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import styles from '../../(publico)/convocatorias/convocatorias.module.css';
import { cuentaCurador, encabezadosCurador, ETIQUETA_ESTADO, fijarCuentaCurador, puntajeEc, respuestaApi } from '@/lib/convocatorias/api';

interface Asignacion {
  asignacionId: string; estado: string; bloqueada: boolean; motivoBloqueo: string | null;
  postulacion: { id: string; numero: string; tituloObra: string; disciplina: string; estado: string };
  evaluacion: { estado: string; puntaje: string | null } | null;
}

export function PanelCuraduria() {
  const [cuenta, setCuenta] = useState('');
  const [borrador, setBorrador] = useState('');
  const [items, setItems] = useState<Asignacion[] | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      setError('');
      setItems(await respuestaApi<Asignacion[]>('/curaduria/asignaciones', { headers: encabezadosCurador() }));
    } catch (e) { setError((e as Error).message); setItems([]); }
  }, []);

  useEffect(() => {
    const actual = cuentaCurador();
    setCuenta(actual); setBorrador(actual);
    if (actual) void cargar(); else setItems([]);
  }, [cargar]);

  function usarCuenta(event: React.FormEvent) {
    event.preventDefault();
    fijarCuentaCurador(borrador);
    setCuenta(borrador.trim());
    void cargar();
  }

  return <>
    <p className="sobretitulo">Curaduría</p>
    <h1>Mis asignaciones</h1>
    <p>Revisa el material de cada postulación asignada, califica los criterios y envía tu evaluación.</p>
    <form className={styles.formulario} onSubmit={usarCuenta} aria-label="Sesión de desarrollo">
      <label className={styles.campo} htmlFor="cuenta-curador">Cuenta de curador (sesión de desarrollo)
        <input id="cuenta-curador" value={borrador} onChange={(e) => setBorrador(e.target.value)} placeholder="UUID de la cuenta de curador" />
      </label>
      <div className={styles.acciones}><button type="submit">Usar esta cuenta</button></div>
    </form>
    {error ? <div role="alert" className={styles.errores}><strong>No se pudo completar la acción</strong><p>{error}</p></div> : null}
    {items === null ? <p role="status">Cargando asignaciones…</p>
      : !cuenta ? <p>Indica una cuenta de curador para ver tus asignaciones.</p>
      : items.length === 0 ? <p>No tienes asignaciones.</p>
      : <ul className={styles.lista} aria-label="Asignaciones">{items.map((a) => <li key={a.asignacionId}>
        <article className={styles.tarjeta} aria-labelledby={`a-${a.asignacionId}`}>
          <h2 id={`a-${a.asignacionId}`}>{a.postulacion.numero} · {a.postulacion.tituloObra}</h2>
          <p>Disciplina: {a.postulacion.disciplina}</p>
          <p><span className={styles.estado}>Postulación: {ETIQUETA_ESTADO[a.postulacion.estado] ?? a.postulacion.estado}</span>{' '}
            <span className={styles.estado}>Mi evaluación: {a.evaluacion ? ETIQUETA_ESTADO[a.evaluacion.estado] : 'sin iniciar'}</span></p>
          {a.evaluacion?.puntaje ? <p>Mi puntaje: <strong>{puntajeEc(a.evaluacion.puntaje)}</strong></p> : null}
          {a.bloqueada
            ? <p role="note" className={styles.aviso}>Asignación bloqueada: {a.motivoBloqueo}. No puedes ver ni evaluar esta postulación.</p>
            : <div className={styles.acciones}><Link className="boton" href={`/curaduria/${a.asignacionId}`} aria-label={`Evaluar ${a.postulacion.numero}`}>{a.evaluacion?.estado === 'enviada' ? 'Ver evaluación' : 'Evaluar'}</Link></div>}
        </article>
      </li>)}</ul>}
  </>;
}
