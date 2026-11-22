'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { ErrorApiIdentidad, type Politica, type Yo, apiIdentidad } from '@/lib/identidad/api';
import { destinoSeguro } from '@/lib/identidad/requisitos';

/**
 * `/cuenta/politica` (US11-AS4): aceptar la versión vigente de la política de privacidad. Queda
 * registrado qué versión se aceptó y cuándo; hasta entonces la sesión está restringida.
 */
export default function AceptarPoliticaPage() {
  const alerta = useRef<HTMLParagraphElement>(null);
  const [yo, setYo] = useState<Yo | null>(null);
  const [politica, setPolitica] = useState<Politica | null>(null);
  const [sinSesion, setSinSesion] = useState(false);
  const [acepto, setAcepto] = useState(false);
  const [error, setError] = useState('');
  const [volver, setVolver] = useState('/mi-cuenta');

  useEffect(() => {
    setVolver(destinoSeguro(new URLSearchParams(window.location.search).get('volver')));
    Promise.all([apiIdentidad.yo(), apiIdentidad.politica()])
      .then(([y, p]) => {
        setYo(y);
        setPolitica(p);
      })
      .catch((e) => (e instanceof ErrorApiIdentidad && e.status === 401 ? setSinSesion(true) : setError(String(e))));
  }, []);

  useEffect(() => {
    if (error) alerta.current?.focus();
  }, [error]);

  if (sinSesion) {
    return (
      <>
        <h1>Política de privacidad</h1>
        <p>
          Necesitas ingresar. <Link href="/cuenta/ingresar">Ingresar</Link>
        </p>
      </>
    );
  }
  if (!yo || !politica) return <h1>Política de privacidad</h1>;
  if (!yo.politicaPendiente) {
    return (
      <>
        <h1>Política de privacidad</h1>
        <p role="status" className={estilos.exito}>
          Ya aceptaste la versión vigente ({politica.version}).
        </p>
        <p>
          <Link href={volver}>Continuar</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Actualizamos la política de privacidad</h1>
      <p>
        Para seguir usando tu cuenta, revisa la versión {politica.version}, vigente desde el{' '}
        {new Date(politica.vigenteDesde).toLocaleDateString('es-EC', { dateStyle: 'long', timeZone: 'America/Guayaquil' })}.
      </p>
      <p>
        <a href={politica.url} target="_blank" rel="noreferrer">
          Leer la política de privacidad (se abre en otra pestaña)
        </a>
      </p>
      {error && (
        <p ref={alerta} tabIndex={-1} role="alert" className={estilos.resumen}>
          {error}
        </p>
      )}
      <form
        className={estilos.formulario}
        aria-label="Aceptar la política de privacidad"
        style={{ gridTemplateColumns: '1fr', maxWidth: 520 }}
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await apiIdentidad.aceptarPolitica(String(politica.version));
            window.location.assign(volver);
          } catch (err) {
            setError(err instanceof ErrorApiIdentidad ? err.message : String(err));
          }
        }}
      >
        <label>
          <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} required /> Leí y acepto la política de privacidad (versión {politica.version})
        </label>
        <div className={estilos.acciones}>
          <button type="submit" disabled={!acepto}>
            Aceptar y continuar
          </button>
        </div>
      </form>
      <p className={estilos.ayuda}>
        Si no la aceptas, puedes <Link href="/mi-cuenta">descargar tus datos o eliminar tu cuenta</Link>.
      </p>
    </>
  );
}
