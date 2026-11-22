'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { ErrorApiIdentidad, type SesionAbierta, apiIdentidad } from '@/lib/identidad/api';

const fecha = (iso: string) => new Date(iso).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guayaquil' });

/** `/mi-cuenta/sesiones` (US8-AS4): dispositivos con sesión abierta y botón para cerrar cada uno. */
export default function SesionesPage() {
  const [sesiones, setSesiones] = useState<SesionAbierta[] | null>(null);
  const [sinSesion, setSinSesion] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const cargar = useCallback(async () => {
    try {
      setSesiones(await apiIdentidad.sesiones());
    } catch (e) {
      if (e instanceof ErrorApiIdentidad && e.status === 401) setSinSesion(true);
      else setMensaje(String(e));
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (sinSesion) {
    return (
      <>
        <h1>Mis sesiones</h1>
        <p>
          Necesitas ingresar. <Link href="/cuenta/ingresar?volver=/mi-cuenta/sesiones">Ingresar</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Mis sesiones</h1>
      <p>Si no reconoces un dispositivo, cierra su sesión y cambia tu contraseña.</p>
      <div role="status" aria-live="polite" className={mensaje ? estilos.exito : undefined}>
        {mensaje}
      </div>
      {sesiones && (
        <ul className={estilos.obras}>
          {sesiones.map((s) => (
            <li key={s.id} className={estilos.obra}>
              <h2>
                {s.dispositivo}
                {s.actual ? ' (este dispositivo)' : ''}
              </h2>
              <p className={estilos.ayuda}>
                Inició: {fecha(s.creadaEn)} · Última actividad: {fecha(s.ultimaActividadEn)}
              </p>
              {!s.actual && (
                <button
                  type="button"
                  className={estilos.secundario}
                  onClick={async () => {
                    await apiIdentidad.cerrarSesion(s.id);
                    setMensaje(`Sesión de ${s.dispositivo} cerrada: ese dispositivo ya no tiene acceso.`);
                    await cargar();
                  }}
                >
                  Cerrar esta sesión
                  <span className="solo-lectores">
                    {' '}
                    ({s.dispositivo}, iniciada el {fecha(s.creadaEn)})
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link href="/mi-cuenta">Volver a mi cuenta</Link>
      </p>
    </>
  );
}
