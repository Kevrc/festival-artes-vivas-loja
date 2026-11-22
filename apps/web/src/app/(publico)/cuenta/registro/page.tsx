'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { ErrorApiIdentidad, type Politica, apiIdentidad } from '@/lib/identidad/api';
import { requisitosContrasena } from '@/lib/identidad/requisitos';

type Campo = 'nombre' | 'correo' | 'contrasena' | 'politica';

/** A qué campo corresponde cada `codigo` del servidor, para asociar el error (aria-describedby). */
const CAMPO_DE: Record<string, Campo> = {
  contrasena_corta: 'contrasena',
  contrasena_larga: 'contrasena',
  contrasena_filtrada: 'contrasena',
  politica_no_aceptada: 'politica',
};

/**
 * `/cuenta/registro` (US7): nombre, correo y contraseña con requisitos visibles, y aceptación
 * explícita de la política de privacidad (enlazada). Los errores se resumen arriba con foco y se
 * asocian a su campo (contracts/rutas-web.md).
 */
export default function RegistroPage() {
  const id = useId();
  const resumen = useRef<HTMLDivElement>(null);
  const [politica, setPolitica] = useState<Politica | null>(null);
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [aceptaPolitica, setAceptaPolitica] = useState(false);
  const [aceptaNovedades, setAceptaNovedades] = useState(false);
  const [errores, setErrores] = useState<Partial<Record<Campo | 'general', string>>>({});
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    apiIdentidad
      .politica()
      .then(setPolitica)
      .catch(() => setErrores({ general: 'No se pudo cargar la política de privacidad. Intenta de nuevo más tarde.' }));
  }, []);

  useEffect(() => {
    if (Object.keys(errores).length > 0) resumen.current?.focus();
  }, [errores]);

  const requisitos = requisitosContrasena(contrasena, correo);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const locales: typeof errores = {};
    if (nombre.trim().length < 2) locales.nombre = 'Escribe tu nombre (al menos 2 letras).';
    if (!/^\S+@\S+\.\S+$/.test(correo.trim())) locales.correo = 'Escribe un correo válido, por ejemplo ana@correo.com.';
    if ([...contrasena].length < 10) locales.contrasena = 'La contraseña debe tener al menos 10 caracteres.';
    if (!aceptaPolitica) locales.politica = 'Debes aceptar la política de privacidad para crear la cuenta.';
    if (Object.keys(locales).length > 0 || !politica) {
      setErrores(locales);
      return;
    }
    setEnviando(true);
    try {
      await apiIdentidad.registrar({ nombre, correo, contrasena, aceptaPolitica, versionPolitica: politica.version, aceptaNovedades });
      setEnviado(true);
    } catch (err) {
      if (err instanceof ErrorApiIdentidad) {
        const campo = err.codigo ? CAMPO_DE[err.codigo] : undefined;
        setErrores(campo ? { [campo]: err.message } : { general: err.message });
      } else setErrores({ general: 'No se pudo conectar con el servidor. Intenta de nuevo.' });
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <>
        <h1>Revisa tu correo</h1>
        <div role="status" className={estilos.exito}>
          <p>
            Si el correo <strong>{correo.trim()}</strong> es válido, te llegará un enlace para verificarlo. El enlace vale durante 24 horas.
          </p>
        </div>
        <p>¿No llegó? Revisa la carpeta de correo no deseado o pide otro enlace desde la página del enlace.</p>
      </>
    );
  }

  const lista = Object.entries(errores) as [Campo | 'general', string][];
  const descr = (campo: Campo, ...otros: string[]) => [errores[campo] ? `${id}-${campo}-error` : '', ...otros].filter(Boolean).join(' ') || undefined;

  return (
    <>
      <h1>Crear una cuenta</h1>
      <p>Con tu cuenta puedes comprar entradas, reservar funciones gratuitas y postular a las convocatorias.</p>

      {lista.length > 0 && (
        <div ref={resumen} tabIndex={-1} role="alert" className={estilos.resumen} aria-labelledby={`${id}-resumen`}>
          <h2 id={`${id}-resumen`} style={{ fontSize: '1.05rem', margin: 0 }}>
            Revisa {lista.length === 1 ? 'este dato' : 'estos datos'}:
          </h2>
          <ul>
            {lista.map(([campo, texto]) => (
              <li key={campo}>{campo === 'general' ? texto : <a href={`#${id}-${campo}`}>{texto}</a>}</li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={enviar} noValidate className={estilos.formulario} aria-label="Crear una cuenta" style={{ gridTemplateColumns: '1fr', maxWidth: 520 }}>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-nombre`}>Nombre</label>
          <input id={`${id}-nombre`} autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} required aria-invalid={!!errores.nombre} aria-describedby={descr('nombre')} />
          {errores.nombre && <span id={`${id}-nombre-error`} className={estilos.errorCampo}>{errores.nombre}</span>}
        </div>

        <div className={estilos.campo}>
          <label htmlFor={`${id}-correo`}>Correo electrónico</label>
          <input id={`${id}-correo`} type="email" autoComplete="email" inputMode="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required aria-invalid={!!errores.correo} aria-describedby={descr('correo')} />
          {errores.correo && <span id={`${id}-correo-error`} className={estilos.errorCampo}>{errores.correo}</span>}
        </div>

        <div className={estilos.campo}>
          <label htmlFor={`${id}-contrasena`}>Contraseña</label>
          <input
            id={`${id}-contrasena`}
            type={mostrar ? 'text' : 'password'}
            autoComplete="new-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            required
            aria-invalid={!!errores.contrasena}
            aria-describedby={descr('contrasena', `${id}-requisitos`)}
          />
          <label style={{ fontWeight: 400 }}>
            <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} /> Mostrar la contraseña
          </label>
          <ul id={`${id}-requisitos`} className={estilos.ayuda} style={{ margin: 0, paddingLeft: 20 }}>
            {requisitos.map((r) => (
              <li key={r.texto}>
                {r.cumple ? '✓ Cumple: ' : '○ Falta: '}
                {r.texto}
              </li>
            ))}
            <li>No puede ser una contraseña conocida por filtraciones.</li>
          </ul>
          {errores.contrasena && <span id={`${id}-contrasena-error`} className={estilos.errorCampo}>{errores.contrasena}</span>}
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }} aria-describedby={descr('politica')}>
          <legend className="solo-lectores">Consentimientos</legend>
          <label style={{ display: 'block', padding: '4px 0' }}>
            <input type="checkbox" checked={aceptaPolitica} onChange={(e) => setAceptaPolitica(e.target.checked)} id={`${id}-politica`} aria-invalid={!!errores.politica} />{' '}
            Acepto la{' '}
            <Link href={politica?.url ?? '/privacidad'} target="_blank" rel="noopener">
              política de privacidad{politica ? ` (versión ${politica.version})` : ''} (se abre en otra pestaña)
            </Link>
          </label>
          {errores.politica && <span id={`${id}-politica-error`} className={estilos.errorCampo}>{errores.politica}</span>}
          <label style={{ display: 'block', padding: '4px 0' }}>
            <input type="checkbox" checked={aceptaNovedades} onChange={(e) => setAceptaNovedades(e.target.checked)} /> Quiero recibir novedades del festival (opcional)
          </label>
        </fieldset>

        <div className={estilos.acciones}>
          <button type="submit" disabled={enviando || !politica}>
            {enviando ? 'Creando la cuenta…' : 'Crear la cuenta'}
          </button>
        </div>
      </form>
    </>
  );
}
