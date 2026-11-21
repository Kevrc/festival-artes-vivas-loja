import Link from 'next/link';
import { notFound } from 'next/navigation';
import { API_CONVOCATORIAS, type ConvocatoriaPublica } from '@/lib/convocatorias/api';
import styles from '../convocatorias.module.css';

export const dynamic = 'force-dynamic';

export default async function ConvocatoriaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await fetch(`${API_CONVOCATORIAS}/${id}`, { cache: 'no-store' });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('No se pudo consultar las bases de la convocatoria');
  const convocatoria = await response.json() as ConvocatoriaPublica;
  return (
    <article className={styles.tarjeta}>
      <p className="sobretitulo">Convocatoria abierta</p>
      <h1>{convocatoria.codigo}</h1>
      <p>Componente: {convocatoria.componente}{convocatoria.provincia ? ` · ${convocatoria.provincia}` : ''}</p>
      <p>Desde {new Intl.DateTimeFormat('es-EC', { dateStyle: 'long', timeZone: 'America/Guayaquil' }).format(new Date(convocatoria.abreEn))}
        {' '}hasta {new Intl.DateTimeFormat('es-EC', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Guayaquil' }).format(new Date(convocatoria.cierraEn))}.</p>
      <p>Máximo {convocatoria.maxObrasPorElenco} obras distintas por elenco.</p>
      <h2>Documentos obligatorios</h2>
      <ul>{convocatoria.requisitos.map((requisito) => <li key={requisito}>{requisito === 'ficha_tecnica' ? 'Ficha técnica' : 'Dossier'}</li>)}</ul>
      <p>PDF, JPEG o PNG de hasta 10 MB (10 000 000 bytes). Los videos se comparten mediante enlace.</p>
      <div className={styles.acciones}><Link className="boton" href={`/convocatorias/${id}/postular`}>Iniciar postulación</Link><Link href="/convocatorias">Volver a convocatorias</Link></div>
    </article>
  );
}
