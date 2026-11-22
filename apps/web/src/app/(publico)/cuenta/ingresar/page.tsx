'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { ErrorApiIdentidad, apiIdentidad } from '@/lib/identidad/api';
import { destinoSeguro } from '@/lib/identidad/requisitos';
import { fusionarConCuenta } from '@/lib/cartelera/favoritos';

/**
 * `/cuenta/ingresar` (US8-AS1): correo y contraseña. El mensaje ante un fallo es neutro (FR-016):
 * no dice si el correo existe ni si la cuenta está bloqueada. Al entrar vuelve a `?volver=`.
 */
export default function IngresarPage() {
  const id = useId();
  const alerta = useRef<HTMLParagraphElement>(null);
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (error) alerta.current?.focus();
  }, [error]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!correo.trim() || !contrasena) {
      setError('Escribe tu correo y tu contraseña.');
      return;
    }
    setEnviando(true);
    try {
      const yo = await apiIdentidad.ingresar(correo, contrasena);
      const volver = destinoSeguro(new URLSearchParams(window.location.search).get('volver'));
      // Mi agenda (spec 001, US5): los favoritos del dispositivo se suman a los de la cuenta.
      if (yo.segundoFactorOk) await fusionarConCuenta().catch(() => undefined);
      // Personal sin segundo factor: primero debe configurarlo (US9-AS3).
      const siguiente = !yo.segundoFactorOk ? '/cuenta/segundo-factor' : yo.politicaPendiente ? '/cuenta/politica' : null;
      window.location.assign(siguiente ? `${siguiente}?volver=${encodeURIComponent(volver)}` : volver);
    } catch (err) {
      setError(err instanceof ErrorApiIdentidad && err.status === 401 ? err.message : 'No se pudo conectar con el servidor. Intenta de nuevo.');
      setEnviando(false);
    }
  };

  return (
    <>
      <h1>Ingresar</h1>
      {error && (
        <p ref={alerta} tabIndex={-1} role="alert" className={estilos.resumen}>
          {error}
        </p>
      )}
      <form onSubmit={enviar} noValidate className={estilos.formulario} aria-label="Ingresar" style={{ gridTemplateColumns: '1fr', maxWidth: 420 }}>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-correo`}>Correo electrónico</label>
          <input id={`${id}-correo`} type="email" autoComplete="username" inputMode="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
        </div>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-contrasena`}>Contraseña</label>
          <input id={`${id}-contrasena`} type="password" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required />
        </div>
        <div className={estilos.acciones}>
          <button type="submit" disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </div>
      </form>
      <p>
        <Link href="/cuenta/recuperar">¿Olvidaste tu contraseña?</Link> · <Link href="/cuenta/registro">Crear una cuenta</Link>
      </p>
    </>
  );
}
