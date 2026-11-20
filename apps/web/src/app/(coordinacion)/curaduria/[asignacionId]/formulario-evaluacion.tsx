'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import styles from '../../../(publico)/convocatorias/convocatorias.module.css';
import { documentosVigentes, encabezadosCurador, ETIQUETA_ESTADO, puntajeEc, respuestaApi } from '@/lib/convocatorias/api';

interface Detalle {
  asignacionId: string; estado: string; bloqueada: boolean; motivoBloqueo: string | null;
  postulacion: {
    id: string; numero: string; tituloObra: string; disciplina: string; estado: string; sinopsis: string; duracionMin: number; publico: string;
    videoUrl: string | null; elenco: { nombre: string; trayectoria: string };
    documentos: Array<{ id: string; tipo: string; nombreOriginal: string; bytes: number }>;
  };
  criterios: Array<{ id: string; nombre: string; descripcion: string; peso: number }>;
  evaluacion: { id: string; estado: string; puntaje: string | null; observaciones: string | null; calificaciones: Array<{ criterioId: string; puntaje: number }> } | null;
  otrasEvaluaciones: Array<{ puntaje: string }> | null;
}
interface Envio { evaluacion: { puntaje: string }; postulacion: { estado: string; puntajeFinal: string | null } }

export function FormularioEvaluacion() {
  const { asignacionId } = useParams<{ asignacionId: string }>();
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [observaciones, setObservaciones] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<Envio | null>(null);
  const resumenRef = useRef<HTMLDivElement>(null);
  const confirmarRef = useRef<HTMLButtonElement>(null);

  const cargar = useCallback(async () => {
    try {
      const datos = await respuestaApi<Detalle>(`/curaduria/asignaciones/${asignacionId}/evaluacion`, { headers: encabezadosCurador() });
      setDetalle(datos);
      setNotas(Object.fromEntries((datos.evaluacion?.calificaciones ?? []).map((c) => [c.criterioId, String(c.puntaje)])));
      setObservaciones(datos.evaluacion?.observaciones ?? '');
    } catch (e) { setError((e as Error).message); }
  }, [asignacionId]);
  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => { if (confirmando) confirmarRef.current?.focus(); }, [confirmando]);
  useEffect(() => { if (errores.length) resumenRef.current?.focus(); }, [errores]);

  async function descargar(id: string) {
    try {
      const { url } = await respuestaApi<{ url: string }>(`/documentos/${id}/descarga`, { headers: encabezadosCurador() });
      window.location.assign(url);
    } catch (e) { setError((e as Error).message); }
  }

  /** Valida en cliente (la API vuelve a validar): enteros de 0 a 100 en todos los criterios. */
  function problemas(completo: boolean): string[] {
    const lista: string[] = [];
    for (const criterio of detalle!.criterios) {
      const valor = notas[criterio.id]?.trim() ?? '';
      if (valor === '') { if (completo) lista.push(`${criterio.nombre}: ingresa una calificación`); continue; }
      const n = Number(valor);
      if (!Number.isInteger(n) || n < 0 || n > 100) lista.push(`${criterio.nombre}: la calificación debe ser un entero entre 0 y 100`);
    }
    return lista;
  }
  const cuerpo = () => ({
    calificaciones: detalle!.criterios.filter((c) => (notas[c.id] ?? '').trim() !== '').map((c) => ({ criterioId: c.id, puntaje: Number(notas[c.id]) })),
    observaciones,
  });

  async function guardar() {
    setError(''); setAviso(''); setConfirmando(false);
    const lista = problemas(false); setErrores(lista);
    if (lista.length) return;
    setOcupado(true);
    try {
      await respuestaApi(`/curaduria/asignaciones/${asignacionId}/evaluacion`, { method: 'PUT', body: JSON.stringify(cuerpo()), headers: encabezadosCurador() });
      setAviso('Borrador guardado.');
      await cargar();
    } catch (e) { setError((e as Error).message); } finally { setOcupado(false); }
  }
  function pedirConfirmacion() {
    setError(''); setAviso('');
    const lista = problemas(true); setErrores(lista);
    setConfirmando(lista.length === 0);
  }
  async function enviar() {
    setOcupado(true); setError(''); setConfirmando(false);
    try {
      await respuestaApi(`/curaduria/asignaciones/${asignacionId}/evaluacion`, { method: 'PUT', body: JSON.stringify(cuerpo()), headers: encabezadosCurador() });
      setResultado(await respuestaApi<Envio>(`/curaduria/asignaciones/${asignacionId}/enviar`, { method: 'POST', headers: encabezadosCurador() }));
      setAviso('Evaluación enviada. Quedó cerrada; solo coordinación puede reabrirla.');
      await cargar();
    } catch (e) { setError((e as Error).message); } finally { setOcupado(false); }
  }

  if (!detalle) return error ? <div role="alert" className={styles.errores}>{error}</div> : <p role="status">Cargando evaluación…</p>;
  const p = detalle.postulacion;
  if (detalle.bloqueada) {
    return <article className={styles.tarjeta}>
      <h1>{p.numero} · {p.tituloObra}</h1>
      <p role="note" className={styles.aviso}>Asignación bloqueada: {detalle.motivoBloqueo}. No puedes ver ni evaluar esta postulación.</p>
      <Link href="/curaduria">Volver a mis asignaciones</Link>
    </article>;
  }
  const enviada = detalle.evaluacion?.estado === 'enviada';
  const editable = !enviada && ['asignada', 'en_evaluacion'].includes(detalle.estado) && ['admitida', 'en_evaluacion'].includes(p.estado);
  const estadoFinal = resultado?.postulacion.estado ?? p.estado;
  return <>
    <p className="sobretitulo">Curaduría</p>
    <h1>{p.numero} · {p.tituloObra}</h1>
    <p><span className={styles.estado}>Postulación: {ETIQUETA_ESTADO[estadoFinal] ?? estadoFinal}</span>{' '}
      <span className={styles.estado}>Mi evaluación: {detalle.evaluacion ? ETIQUETA_ESTADO[detalle.evaluacion.estado] : 'sin iniciar'}</span></p>
    {error ? <div role="alert" className={styles.errores}><strong>No se pudo completar la acción</strong><p>{error}</p></div> : null}
    <p role="status">{aviso}</p>
    {detalle.evaluacion?.estado === 'reabierta' ? <p role="note" className={styles.aviso}>Coordinación reabrió tu evaluación: corrige y vuelve a enviarla.</p> : null}

    <section className={styles.tarjeta} aria-labelledby="material-titulo">
      <h2 id="material-titulo">Material de la obra</h2>
      <p>{p.sinopsis}</p>
      <p>Disciplina: {p.disciplina} · Duración: {p.duracionMin} min · Público: {p.publico}</p>
      <p>Elenco: {p.elenco.nombre}. {p.elenco.trayectoria}</p>
      {p.videoUrl ? <p>Video: <a href={p.videoUrl} target="_blank" rel="noreferrer noopener">{p.videoUrl}</a></p> : null}
      {p.documentos.length ? <ul>{documentosVigentes(p.documentos).map((d) => <li key={d.id}>
        <button type="button" className="boton-favorito" onClick={() => void descargar(d.id)}>Descargar {d.nombreOriginal}</button> ({d.bytes} bytes)
      </li>)}</ul> : <p>Sin documentos.</p>}
    </section>

    <form className={styles.formulario} onSubmit={(e) => { e.preventDefault(); void guardar(); }} aria-label="Evaluación por criterios" noValidate>
      {errores.length ? <div ref={resumenRef} tabIndex={-1} role="alert" className={styles.errores}>
        <h2>Revisa la evaluación</h2><ul>{errores.map((m) => <li key={m}>{m}</li>)}</ul>
      </div> : null}
      <fieldset disabled={!editable || ocupado}>
        <legend>Calificaciones (0 a 100)</legend>
        {detalle.criterios.map((c) => <label key={c.id} className={styles.campo} htmlFor={`criterio-${c.id}`}>
          {c.nombre} ({c.peso} %)
          <input id={`criterio-${c.id}`} type="number" min={0} max={100} step={1} inputMode="numeric" value={notas[c.id] ?? ''}
            aria-describedby={`desc-${c.id}`} aria-invalid={errores.some((m) => m.startsWith(`${c.nombre}:`)) || undefined}
            onChange={(e) => setNotas((anterior) => ({ ...anterior, [c.id]: e.target.value }))} />
          <small id={`desc-${c.id}`}>{c.descripcion}</small>
        </label>)}
        <label className={styles.campo} htmlFor="observaciones">Observaciones
          <textarea id="observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        </label>
      </fieldset>
      {enviada ? <section aria-labelledby="resultado-titulo" className={styles.aviso}>
        <h2 id="resultado-titulo">Evaluación enviada</h2>
        <p>Mi puntaje: <strong>{puntajeEc(resultado?.evaluacion.puntaje ?? detalle.evaluacion?.puntaje)}</strong></p>
        {detalle.otrasEvaluaciones?.length ? <p>Otras evaluaciones enviadas: {detalle.otrasEvaluaciones.map((o) => puntajeEc(o.puntaje)).join(', ')}</p>
          : <p>Aún no hay otras evaluaciones enviadas.</p>}
        {resultado?.postulacion.puntajeFinal ? <p>Puntaje final de la postulación: <strong>{puntajeEc(resultado.postulacion.puntajeFinal)}</strong></p> : null}
        {estadoFinal === 'requiere_deliberacion' ? <p>Las evaluaciones difieren en más de 25 puntos: el comité deliberará.</p> : null}
      </section> : null}
      {editable ? <div className={styles.acciones}>
        <button type="submit" disabled={ocupado}>Guardar borrador</button>
        <button type="button" disabled={ocupado} onClick={pedirConfirmacion}>Enviar evaluación</button>
      </div> : null}
      {confirmando ? <section role="alertdialog" aria-labelledby="confirmar-titulo" aria-describedby="confirmar-texto" className={styles.aviso}>
        <h2 id="confirmar-titulo">¿Enviar la evaluación?</h2>
        <p id="confirmar-texto">Al enviarla quedará cerrada; solo coordinación podrá reabrirla con un motivo.</p>
        <div className={styles.acciones}>
          <button ref={confirmarRef} type="button" disabled={ocupado} onClick={() => void enviar()}>Confirmar envío</button>
          <button type="button" className="boton-favorito" onClick={() => setConfirmando(false)}>Cancelar</button>
        </div>
      </section> : null}
    </form>
    <p><Link href="/curaduria">Volver a mis asignaciones</Link></p>
  </>;
}
