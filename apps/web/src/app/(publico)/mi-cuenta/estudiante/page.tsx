'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { ErrorApiIdentidad, type Yo, apiIdentidad } from '@/lib/identidad/api';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-EC', { dateStyle: 'long', timeZone: 'America/Guayaquil' });

/**
 * `/mi-cuenta/estudiante` (US12, FR-025): el asistente confirma un correo de su institución
 * educativa y queda acreditado hasta el fin de la edición (RN-012) para las funciones «solo
 * estudiantes». El enlace del correo vuelve aquí con `?token=` y se confirma con la sesión iniciada.
 */
export default function EstudiantePage() {
  const id = useId();
  const alerta = useRef<HTMLParagraphElement>(null);
  const [yo, setYo] = useState<Yo | null>(null);
  const [sinSesion, setSinSesion] = useState(false);
  const [correo, setCorreo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    (async () => {
      try {
        if (token) {
          // El token sale de la barra de direcciones (no queda en el historial).
          window.history.replaceState(null, '', '/mi-cuenta/estudiante');
          try {
            const r = await apiIdentidad.confirmarAcreditacion(token);
            setMensaje(`Listo: quedaste acreditado como estudiante de ${r.institucion} hasta el ${fecha(r.vigenteHasta)}.`);
          } catch (e) {
            if (e instanceof ErrorApiIdentidad && e.status === 401) {
              window.location.assign(`/cuenta/ingresar?volver=${encodeURIComponent(`/mi-cuenta/estudiante?token=${token}`)}`);
              return;
            }
            setError(e instanceof Error ? e.message : String(e));
          }
        }
        setYo(await apiIdentidad.yo());
      } catch (e) {
        if (e instanceof ErrorApiIdentidad && e.status === 401) setSinSesion(true);
        else setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (error) alerta.current?.focus();
  }, [error]);

  if (sinSesion) {
    return (
      <>
        <h1>Condición de estudiante</h1>
        <p>
          Necesitas ingresar. <Link href="/cuenta/ingresar?volver=/mi-cuenta/estudiante">Ingresar</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Condición de estudiante</h1>
      <div role="status" aria-live="polite" className={mensaje ? estilos.exito : undefined}>
        {mensaje}
      </div>
      {error && (
        <p ref={alerta} tabIndex={-1} role="alert" className={estilos.resumen}>
          {error}
        </p>
      )}
      {yo?.estudianteAcreditado ? (
        <p>Tu cuenta está acreditada como estudiante: puedes reservar las funciones «solo estudiantes» hasta el fin de esta edición.</p>
      ) : (
        <>
          <p>
            Algunas funciones son solo para estudiantes. Para reservarlas, confirma un correo de tu institución educativa: te enviaremos un
            enlace y la acreditación durará hasta el último día de esta edición del festival.
          </p>
          <form
            className={estilos.formulario}
            aria-label="Acreditarme como estudiante"
            style={{ gridTemplateColumns: '1fr', maxWidth: 520 }}
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              setMensaje('');
              setEnviando(true);
              try {
                setMensaje((await apiIdentidad.pedirAcreditacion(correo)).mensaje);
              } catch (err) {
                setError(err instanceof ErrorApiIdentidad ? err.message : String(err));
              } finally {
                setEnviando(false);
              }
            }}
          >
            <div className={estilos.campo}>
              <label htmlFor={`${id}-correo`}>Tu correo institucional</label>
              <input id={`${id}-correo`} type="email" inputMode="email" autoComplete="off" value={correo} onChange={(e) => setCorreo(e.target.value)} required aria-describedby={`${id}-ayuda`} />
              <span id={`${id}-ayuda`} className={estilos.ayuda}>
                Por ejemplo, nombre@utpl.edu.ec. Solo guardamos el dominio de tu institución, no este correo.
              </span>
            </div>
            <div className={estilos.acciones}>
              <button type="submit" disabled={enviando}>
                Enviar el enlace
              </button>
            </div>
          </form>
        </>
      )}
      <p>
        <Link href="/mi-cuenta">Volver a mi cuenta</Link>
      </p>
    </>
  );
}
