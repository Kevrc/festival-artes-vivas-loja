'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import styles from '../../convocatorias/convocatorias.module.css';
import { API_CONVOCATORIAS, documentosVigentes, encabezadosDemo, fechaEcuador, respuestaApi, tiempoRestante } from '@/lib/convocatorias/api';

interface Postulacion {
  id: string; convocatoriaId: string; numero: string; estado: string; tituloObra: string; disciplina: string;
  subsanarHasta: string | null; ahoraServidor: string; detalleSubsanacion: { motivo: string | null } | null;
  documentos: Array<{ id: string; tipo: string; nombreOriginal: string; bytes: number }>;
}

const TIPOS = [
  { tipo: 'dossier', etiqueta: 'Reemplazar dossier' },
  { tipo: 'ficha_tecnica', etiqueta: 'Reemplazar ficha técnica' },
];

export function DetallePostulacion() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [postulacion, setPostulacion] = useState<Postulacion | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  /** Diferencia entre el reloj del servidor y el del navegador, para mostrar un tiempo restante fiable. */
  const [desfase, setDesfase] = useState(0);
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    try {
      const datos = await respuestaApi<Postulacion>(`/postulaciones/${params.id}`);
      setDesfase(new Date(datos.ahoraServidor).getTime() - Date.now());
      setPostulacion(datos);
    } catch (e) { setError((e as Error).message); }
  }, [params.id]);
  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(intervalo);
  }, []);

  async function descargarDocumento(id: string) {
    const url = await respuestaApi<{ url: string }>(`/documentos/${id}/descarga`);
    window.location.assign(url.url);
  }
  async function descargarCopia() {
    const copia = await respuestaApi(`/postulaciones/${params.id}/descarga`);
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([JSON.stringify(copia, null, 2)], { type: 'application/json' }));
    enlace.download = `postulacion-${postulacion?.numero || params.id}.json`;
    enlace.click(); URL.revokeObjectURL(enlace.href);
  }
  async function retirar() {
    await respuestaApi(`/postulaciones/${params.id}/retirar`, { method: 'POST' });
    router.push(`/convocatorias/${postulacion?.convocatoriaId}/postular?postulacionId=${params.id}`);
  }
  async function reemplazar(tipo: string, archivo: File | null) {
    if (!archivo) return;
    setError(''); setAviso(''); setOcupado(true);
    try {
      const data = new FormData(); data.set('tipo', tipo); data.set('archivo', archivo);
      const response = await fetch(`${API_CONVOCATORIAS}/postulaciones/${params.id}/documentos`, { method: 'POST', headers: encabezadosDemo(), body: data });
      const cuerpo = await response.json().catch(() => ({})) as { detail?: string };
      if (!response.ok) throw new Error(cuerpo.detail ?? `No se pudo cargar ${archivo.name}`);
      setAviso(`Documento reemplazado: ${archivo.name}`);
      await cargar();
    } catch (e) { setError((e as Error).message); } finally { setOcupado(false); }
  }
  async function reenviar() {
    setError(''); setAviso(''); setOcupado(true);
    try {
      await respuestaApi(`/postulaciones/${params.id}/subsanar`, { method: 'POST' });
      setAviso('Corrección reenviada. Coordinación volverá a revisar tu postulación.');
      await cargar();
    } catch (e) { setError((e as Error).message); await cargar(); } finally { setOcupado(false); }
  }

  if (!postulacion) return error ? <div role="alert" className={styles.errores}>{error}</div> : <p role="status">Cargando postulación…</p>;
  const enSubsanacion = postulacion.estado === 'requiere_subsanacion' && postulacion.subsanarHasta !== null;
  const restante = enSubsanacion ? new Date(postulacion.subsanarHasta!).getTime() - (ahora + desfase) : 0;
  const vencido = enSubsanacion && restante <= 0;
  return <article className={styles.tarjeta}>
    <p className="sobretitulo">Comprobante de postulación</p>
    <h1>{postulacion.numero.startsWith('BORRADOR-') ? 'Borrador guardado' : `Postulación ${postulacion.numero}`}</h1>
    <p><span className={styles.estado}>Estado: {postulacion.estado.replace('_', ' ')}</span></p>
    {error ? <div role="alert" className={styles.errores}><strong>No se pudo completar la acción</strong><p>{error}</p></div> : null}
    <p role="status">{aviso}</p>
    <h2>{postulacion.tituloObra}</h2><p>Disciplina: {postulacion.disciplina}</p>
    {enSubsanacion ? <section className={styles.aviso} aria-labelledby="subsanacion-titulo">
      <h2 id="subsanacion-titulo">Corrección solicitada</h2>
      <p>{postulacion.detalleSubsanacion?.motivo ?? 'Coordinación pidió una corrección.'}</p>
      <p>Fecha límite: <time dateTime={postulacion.subsanarHasta!}>{fechaEcuador(postulacion.subsanarHasta!)}</time> (hora de Ecuador)</p>
      <p>Tiempo restante: <strong>{tiempoRestante(restante)}</strong></p>
      {vencido ? <p>El plazo terminó: ya no puedes reemplazar documentos ni reenviar.</p> : <>
        {TIPOS.map(({ tipo, etiqueta }) => <label key={tipo} className={styles.campo} htmlFor={`reemplazo-${tipo}`}>{etiqueta} (PDF, JPEG o PNG)
          <input id={`reemplazo-${tipo}`} type="file" disabled={ocupado} accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={(e) => { void reemplazar(tipo, e.target.files?.[0] ?? null); e.target.value = ''; }} />
        </label>)}
        <div className={styles.acciones}>
          <button type="button" disabled={ocupado} onClick={() => void reenviar()}>Reenviar corrección</button>
        </div>
      </>}
    </section> : null}
    {postulacion.estado === 'no_admitida' ? <section className={styles.aviso} aria-labelledby="no-admitida-titulo">
      <h2 id="no-admitida-titulo">Postulación no admitida</h2>
      <p>{postulacion.detalleSubsanacion?.motivo ?? 'La postulación no fue admitida.'}</p>
    </section> : null}
    {postulacion.estado === 'admitida' ? <p>Tu postulación fue admitida y pasará a evaluación.</p> : null}
    <h2>Documentos adjuntos</h2>
    {postulacion.documentos.length ? <ul>{documentosVigentes(postulacion.documentos).map((doc) => <li key={doc.id}>
      <button type="button" className="boton-favorito" onClick={() => void descargarDocumento(doc.id)}>Descargar {doc.nombreOriginal}</button> ({doc.bytes} bytes)
    </li>)}</ul> : <p>No hay documentos adjuntos.</p>}
    <div className={styles.acciones}>
      <button type="button" onClick={() => void descargarCopia()}>Descargar copia de mi postulación</button>
      {postulacion.estado === 'enviada' ? <button type="button" className="boton-favorito" onClick={() => void retirar()}>Retirar para editar</button> : null}
      {postulacion.estado === 'borrador' ? <Link className="boton" href={`/convocatorias/${postulacion.convocatoriaId}/postular?postulacionId=${postulacion.id}`}>Continuar borrador</Link> : null}
      <Link href="/convocatorias">Volver a convocatorias</Link>
    </div>
  </article>;
}
