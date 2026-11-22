'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { ErrorApiIdentidad, apiIdentidad } from '@/lib/identidad/api';
import { requisitosContrasena } from '@/lib/identidad/requisitos';

/**
 * `/cuenta/recuperar/nueva?token=…` (US8-AS3): elegir una contraseña nueva con el enlace de un solo
 * uso. Al guardarla se cierran todas las sesiones abiertas.
 */
export default function NuevaContrasenaPage() {
  const id = useId();
  const alerta = useRef<HTMLParagraphElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token'));
    window.history.replaceState(null, '', '/cuenta/recuperar/nueva');
  }, []);

  useEffect(() => {
    if (error) alerta.current?.focus();
  }, [error]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    setEnviando(true);
    try {
      await apiIdentidad.confirmarRecuperacion(token, contrasena);
      setListo(true);
    } catch (err) {
      setError(err instanceof ErrorApiIdentidad ? err.message : 'No se pudo guardar la contraseña. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  if (listo) {
    return (
      <>
        <h1>Contraseña cambiada</h1>
        <p role="status" className={estilos.exito}>
          Ya puedes ingresar con tu contraseña nueva. Cerramos tus sesiones abiertas en otros dispositivos.
        </p>
        <p>
          <Link href="/cuenta/ingresar">Ingresar</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Elige una contraseña nueva</h1>
      {token === null || token === '' ? (
        <p>
          Falta el enlace. <Link href="/cuenta/recuperar">Pide uno nuevo</Link>.
        </p>
      ) : (
        <>
          {error && (
            <p ref={alerta} tabIndex={-1} role="alert" className={estilos.resumen}>
              {error} {/vencido|venció|usó/.test(error) && <Link href="/cuenta/recuperar">Pedir otro enlace</Link>}
            </p>
          )}
          <form onSubmit={enviar} className={estilos.formulario} aria-label="Elige una contraseña nueva" style={{ gridTemplateColumns: '1fr', maxWidth: 420 }}>
            <div className={estilos.campo}>
              <label htmlFor={`${id}-contrasena`}>Contraseña nueva</label>
              <input
                id={`${id}-contrasena`}
                type="password"
                autoComplete="new-password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                required
                minLength={10}
                aria-describedby={`${id}-requisitos`}
              />
              <ul id={`${id}-requisitos`} className={estilos.ayuda} style={{ margin: 0, paddingLeft: 20 }}>
                {requisitosContrasena(contrasena, '').slice(0, 2).map((r) => (
                  <li key={r.texto}>
                    {r.cumple ? '✓ Cumple: ' : '○ Falta: '}
                    {r.texto}
                  </li>
                ))}
                <li>No puede ser una contraseña conocida por filtraciones.</li>
              </ul>
            </div>
            <div className={estilos.acciones}>
              <button type="submit" disabled={enviando}>
                Guardar la contraseña
              </button>
            </div>
          </form>
        </>
      )}
    </>
  );
}
