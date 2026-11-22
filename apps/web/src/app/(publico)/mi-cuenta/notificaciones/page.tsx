'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { ErrorApiIdentidad, type Notificacion, apiIdentidad } from '@/lib/identidad/api';
import { ESTADO_AVISO, fechaAviso } from '@/lib/identidad/notificaciones';

/** `/mi-cuenta/notificaciones` (US10-AS5): historial de avisos recibidos, del más reciente al más antiguo. */
export default function MisNotificacionesPage() {
  const [items, setItems] = useState<Notificacion[] | null>(null);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [sinSesion, setSinSesion] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async (cursor?: string) => {
    try {
      const r = await apiIdentidad.misNotificaciones(cursor);
      setItems((prev) => (cursor && prev ? [...prev, ...r.items] : r.items));
      setSiguiente(r.siguiente);
    } catch (e) {
      if (e instanceof ErrorApiIdentidad && e.status === 401) setSinSesion(true);
      else setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (sinSesion) {
    return (
      <>
        <h1>Mis notificaciones</h1>
        <p>
          Necesitas ingresar. <Link href="/cuenta/ingresar?volver=/mi-cuenta/notificaciones">Ingresar</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Mis notificaciones</h1>
      <p>Los avisos que el festival te envió por correo: entradas, cambios de funciones y postulaciones.</p>
      {error && (
        <p role="alert" className={estilos.resumen}>
          {error}
        </p>
      )}
      {items && items.length === 0 && <p>Aún no tienes avisos.</p>}
      {items && items.length > 0 && (
        <ul className={estilos.obras}>
          {items.map((n) => (
            <li key={n.id} className={estilos.obra}>
              <h2>{n.asunto.replace(/ · FIAVL$/, '')}</h2>
              <p className={estilos.ayuda}>
                {fechaAviso(n.creadaEn)} · {ESTADO_AVISO[n.estado]}
                {n.enviadaEn ? ` el ${fechaAviso(n.enviadaEn)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
      {siguiente && (
        <p>
          <button type="button" className={estilos.secundario} onClick={() => void cargar(siguiente)}>
            Ver avisos anteriores
          </button>
        </p>
      )}
      <p>
        <Link href="/mi-cuenta">Volver a mi cuenta</Link>
      </p>
    </>
  );
}
