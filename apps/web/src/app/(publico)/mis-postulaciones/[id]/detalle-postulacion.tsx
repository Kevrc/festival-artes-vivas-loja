'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import styles from '../../convocatorias/convocatorias.module.css';
import { respuestaApi } from '@/lib/convocatorias/api';

interface Postulacion {
  id: string; convocatoriaId: string; numero: string; estado: string; tituloObra: string; disciplina: string;
  documentos: Array<{ id: string; tipo: string; nombreOriginal: string; bytes: number }>;
}

export function DetallePostulacion() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [postulacion, setPostulacion] = useState<Postulacion | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { respuestaApi<Postulacion>(`/postulaciones/${params.id}`).then(setPostulacion).catch((e: Error) => setError(e.message)); }, [params.id]);

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

  if (error) return <div role="alert" className={styles.errores}>{error}</div>;
  if (!postulacion) return <p role="status">Cargando postulación…</p>;
  return <article className={styles.tarjeta}>
    <p className="sobretitulo">Comprobante de postulación</p>
    <h1>{postulacion.numero.startsWith('BORRADOR-') ? 'Borrador guardado' : `Postulación ${postulacion.numero}`}</h1>
    <p><span className={styles.estado}>Estado: {postulacion.estado}</span></p>
    <h2>{postulacion.tituloObra}</h2><p>Disciplina: {postulacion.disciplina}</p>
    <h2>Documentos adjuntos</h2>
    {postulacion.documentos.length ? <ul>{postulacion.documentos.map((doc) => <li key={doc.id}>
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
