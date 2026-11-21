import Link from 'next/link';
import { API_CONVOCATORIAS, type ConvocatoriaPublica } from '@/lib/convocatorias/api';
import styles from './convocatorias.module.css';

export const dynamic = 'force-dynamic';

export default async function ConvocatoriasPage() {
  let convocatorias: ConvocatoriaPublica[] = [];
  let error = false;
  try {
    const response = await fetch(API_CONVOCATORIAS, { cache: 'no-store' });
    if (!response.ok) throw new Error('API no disponible');
    convocatorias = await response.json() as ConvocatoriaPublica[];
  } catch { error = true; }

  return (
    <section>
      <p className="sobretitulo">Festival Internacional de Artes Vivas · Loja</p>
      <h1>Convocatorias abiertas</h1>
      {error ? <p role="status">No se pudo consultar las convocatorias. Intenta de nuevo en unos minutos.</p> : null}
      {!error && convocatorias.length === 0 ? <p>No hay convocatorias abiertas en este momento.</p> : null}
      <ul className={styles.lista}>
        {convocatorias.map((convocatoria) => (
          <li className={styles.tarjeta} key={convocatoria.id}>
            <h2>{convocatoria.codigo}</h2>
            <p>Componente: {convocatoria.componente}{convocatoria.provincia ? ` · ${convocatoria.provincia}` : ''}</p>
            <p>Recepción hasta: {new Intl.DateTimeFormat('es-EC', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Guayaquil' }).format(new Date(convocatoria.cierraEn))}</p>
            <Link className="boton" href={`/convocatorias/${convocatoria.id}`}>Ver bases y postular</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
