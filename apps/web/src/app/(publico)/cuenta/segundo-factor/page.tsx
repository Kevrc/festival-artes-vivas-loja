'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { type AltaTotp, ErrorApiIdentidad, type Yo, apiIdentidad } from '@/lib/identidad/api';
import { destinoSeguro } from '@/lib/identidad/requisitos';

/**
 * `/cuenta/segundo-factor` (US9-AS3, FR-018): el personal configura su aplicación de códigos con el
 * QR o con la clave en texto (para lectores de pantalla o escribirla a mano) y confirma con un código
 * de 6 dígitos. Si ya lo tiene configurado, solo pide el código.
 */
export default function SegundoFactorPage() {
  const id = useId();
  const alerta = useRef<HTMLParagraphElement>(null);
  const [yo, setYo] = useState<Yo | null>(null);
  const [sinSesion, setSinSesion] = useState(false);
  const [alta, setAlta] = useState<AltaTotp | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [volver, setVolver] = useState('/mi-cuenta');

  useEffect(() => {
    setVolver(destinoSeguro(new URLSearchParams(window.location.search).get('volver')));
    (async () => {
      try {
        const y = await apiIdentidad.yo();
        setYo(y);
        if (y.esPersonal && !y.segundoFactorOk && !y.segundoFactorActivo) setAlta(await apiIdentidad.altaTotp());
      } catch (e) {
        if (e instanceof ErrorApiIdentidad && e.status === 401) setSinSesion(true);
        else setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (error) alerta.current?.focus();
  }, [error]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(codigo.trim())) {
      setError('Escribe los 6 dígitos que muestra tu aplicación de códigos.');
      return;
    }
    setEnviando(true);
    try {
      const yo = await apiIdentidad.verificarTotp(codigo.trim());
      // US11-AS4: una cuenta que aún no aceptó la política vigente la acepta antes de continuar.
      window.location.assign(yo.politicaPendiente ? `/cuenta/politica?volver=${encodeURIComponent(volver)}` : volver);
    } catch (err) {
      setCodigo('');
      if (err instanceof ErrorApiIdentidad && err.status === 401 && err.codigo !== 'codigo_invalido') setSinSesion(true);
      else setError(err instanceof ErrorApiIdentidad ? err.message : 'No se pudo conectar con el servidor. Intenta de nuevo.');
      setEnviando(false);
    }
  };

  if (sinSesion) {
    return (
      <>
        <h1>Segundo factor</h1>
        <p>
          Tu sesión terminó. <Link href="/cuenta/ingresar">Vuelve a ingresar</Link>.
        </p>
      </>
    );
  }
  if (!yo) return <h1>Segundo factor</h1>;
  if (yo.segundoFactorOk) {
    return (
      <>
        <h1>Segundo factor</h1>
        <p role="status" className={estilos.exito}>
          {yo.esPersonal ? 'Tu sesión ya está verificada con el segundo factor.' : 'Tu cuenta no necesita segundo factor.'}
        </p>
        <p>
          <Link href={volver}>Continuar</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>{alta ? 'Configura tu segundo factor' : 'Verifica tu segundo factor'}</h1>
      {error && (
        <p ref={alerta} tabIndex={-1} role="alert" className={estilos.resumen}>
          {error}
        </p>
      )}
      {alta ? (
        <section aria-labelledby={`${id}-pasos`}>
          <h2 id={`${id}-pasos`}>Antes de continuar</h2>
          <ol>
            <li>Instala en tu teléfono una aplicación de códigos (por ejemplo, Google Authenticator, Microsoft Authenticator o FreeOTP).</li>
            <li>En la aplicación, elige añadir una cuenta y escanea este código QR.</li>
            <li>Escribe abajo el código de 6 dígitos que aparece en la aplicación.</li>
          </ol>
          {/* El SVG lo genera la API con la librería qrcode a partir del URI otpauth (no es contenido de terceros). */}
          <div
            role="img"
            aria-label="Código QR para configurar la aplicación de códigos. Si no puedes escanearlo, usa la clave en texto."
            style={{ width: 200, height: 200, background: '#fff', padding: 8 }}
            dangerouslySetInnerHTML={{ __html: alta.qrSvg }}
          />
          <p>
            ¿No puedes escanearlo? En la aplicación elige «ingresar una clave» y escribe esta clave (basada en tiempo):
          </p>
          <p>
            <code id={`${id}-clave`} style={{ fontSize: '1.15rem', letterSpacing: '0.08em', wordBreak: 'break-all' }}>
              {alta.clave}
            </code>
          </p>
        </section>
      ) : (
        <p>Abre tu aplicación de códigos y escribe el código de 6 dígitos de tu cuenta del festival.</p>
      )}
      <form onSubmit={enviar} noValidate className={estilos.formulario} aria-label="Código del segundo factor" style={{ gridTemplateColumns: '1fr', maxWidth: 420 }}>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-codigo`}>Código de 6 dígitos</label>
          <input
            id={`${id}-codigo`}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
            required
          />
        </div>
        <div className={estilos.acciones}>
          <button type="submit" disabled={enviando}>
            {enviando ? 'Verificando…' : 'Verificar el código'}
          </button>
        </div>
      </form>
      <p className={estilos.ayuda}>¿Perdiste el teléfono? Pide al equipo de administración que restablezca tu segundo factor.</p>
    </>
  );
}
