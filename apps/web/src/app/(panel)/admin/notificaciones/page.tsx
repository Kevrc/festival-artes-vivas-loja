'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { ErrorApiIdentidad, type Notificacion, apiIdentidad } from '@/lib/identidad/api';
import { fechaAviso } from '@/lib/identidad/notificaciones';

/** `/admin/notificaciones` (US10-AS2): avisos que no se pudieron enviar en 24 h, para revisión. */
export default function NotificacionesFallidasPage() {
  const [items, setItems] = useState<Notificacion[] | null>(null);
  const [acceso, setAcceso] = useState<'ok' | 'sin_sesion' | 'prohibido'>('ok');
  const [error, setError] = useState('');

  useEffect(() => {
    apiIdentidad
      .notificacionesFallidas()
      .then(setItems)
      .catch((e) => {
        if (e instanceof ErrorApiIdentidad && e.status === 401) setAcceso('sin_sesion');
        else if (e instanceof ErrorApiIdentidad && e.status === 403) setAcceso('prohibido');
        else setError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  return (
    <>
      <h1>Avisos fallidos</h1>
      {acceso === 'sin_sesion' && (
        <p>
          Necesitas ingresar con una cuenta de administración. <Link href="/cuenta/ingresar?volver=/admin/notificaciones">Ingresar</Link>
        </p>
      )}
      {acceso === 'prohibido' && <p>Tu cuenta no tiene el rol de administración, o falta verificar tu segundo factor.</p>}
      {error && (
        <p role="alert" className={estilos.resumen}>
          {error}
        </p>
      )}
      {items && items.length === 0 && <p>No hay avisos fallidos.</p>}
      {items && items.length > 0 && (
        <div className={estilos.desplazable} tabIndex={0} role="region" aria-label="Tabla de avisos fallidos (se desplaza)">
          <table className={estilos.tabla}>
            <caption>Avisos sin enviar tras 24 horas de reintentos</caption>
            <thead>
              <tr>
                <th scope="col">Aviso</th>
                <th scope="col">Creado</th>
                <th scope="col">Intentos</th>
                <th scope="col">Último error</th>
              </tr>
            </thead>
            <tbody>
              {items.map((n) => (
                <tr key={n.id}>
                  <th scope="row">{n.asunto.replace(/ · FIAVL$/, '')}</th>
                  <td>{fechaAviso(n.creadaEn)}</td>
                  <td>{n.intentos}</td>
                  <td>{n.ultimoError ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
