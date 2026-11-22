'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { apiIdentidad } from '@/lib/identidad/api';

/** `/cuenta/recuperar` (US8-AS3): pide el enlace de 1 hora. La respuesta no revela si la cuenta existe. */
export default function RecuperarPage() {
  const id = useId();
  const [correo, setCorreo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await apiIdentidad.pedirRecuperacion(correo);
      setMensaje(`${r.mensaje} El enlace vale durante 1 hora.`);
    } catch {
      setMensaje('No se pudo pedir el enlace. Revisa el correo e intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <h1>Recuperar la contraseña</h1>
      <p>Te enviaremos un enlace para elegir una contraseña nueva.</p>
      <form onSubmit={enviar} className={estilos.formulario} aria-label="Recuperar la contraseña" style={{ gridTemplateColumns: '1fr', maxWidth: 420 }}>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-correo`}>Correo electrónico</label>
          <input id={`${id}-correo`} type="email" autoComplete="email" inputMode="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
        </div>
        <div className={estilos.acciones}>
          <button type="submit" disabled={enviando}>
            Enviar el enlace
          </button>
        </div>
      </form>
      <div role="status" aria-live="polite" className={mensaje ? estilos.exito : undefined}>
        {mensaje}
      </div>
      <p>
        <Link href="/cuenta/ingresar">Volver a ingresar</Link>
      </p>
    </>
  );
}
