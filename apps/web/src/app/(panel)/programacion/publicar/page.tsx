'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SesionDevOperacion as SelectorSesion } from '@/components/operacion/sesion-dev-operacion';
import estilos from '@/components/operacion/operacion.module.css';
import {
  type Edicion,
  ErrorApiOperacion,
  type SesionDevOperacion,
  type ValidacionPublicacion,
  apiOperacion,
} from '@/lib/operacion/api';

type ErrorValidacion = ValidacionPublicacion['errores'][number];

/** Enlace a donde se corrige cada error: la función en la grilla o la obra en el buscador. */
function enlaceDe(e: ErrorValidacion): string | null {
  if (e.funcionId) return `/programacion?funcion=${e.funcionId}`;
  if (e.obraId) return '/programacion/obras';
  return null;
}

const nuevaClave = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/**
 * `/programacion/publicar` (US2): lista todos los errores que bloquean la publicación, enlazados a
 * donde se corrigen, y el botón "Publicar" queda bloqueado mientras haya alguno (FR-005).
 */
export default function PublicarPage() {
  const [sesion, setSesion] = useState<SesionDevOperacion | null>(null);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [validacion, setValidacion] = useState<ValidacionPublicacion | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const resumenRef = useRef<HTMLDivElement>(null);
  const clave = useRef(nuevaClave());
  const alCambiarSesion = useCallback((s: SesionDevOperacion | null) => setSesion(s), []);

  const validar = useCallback(async (e: Edicion) => {
    try {
      setValidacion(await apiOperacion.validarPublicacion(e.id));
      setError('');
    } catch (err) {
      setError(err instanceof ErrorApiOperacion && err.status === 403 ? 'Solo el rol de programación puede publicar.' : String(err));
    }
  }, []);

  useEffect(() => {
    if (!sesion) return;
    apiOperacion
      .ediciones()
      .then((l) => {
        const actual = l.find((x) => x.estado !== 'cerrada') ?? null;
        setEdicion(actual);
        if (actual) void validar(actual);
      })
      .catch((err) => setError(String(err)));
  }, [sesion, validar]);

  useEffect(() => {
    if (validacion && !validacion.valida) resumenRef.current?.focus();
  }, [validacion]);

  const publicar = async () => {
    if (!edicion) return;
    setEnviando(true);
    setMensaje('');
    try {
      const r = await apiOperacion.publicarEdicion(edicion.id, clave.current);
      clave.current = nuevaClave();
      setMensaje(
        r.funcionesPublicadas > 0
          ? `Se publicaron ${r.funcionesPublicadas} funciones. La cartelera y la boletería las reciben en menos de un minuto.`
          : 'No había borradores nuevos: la programación ya estaba publicada.',
      );
      const actualizada = (await apiOperacion.ediciones()).find((x) => x.id === edicion.id) ?? edicion;
      setEdicion(actualizada);
      await validar(actualizada);
    } catch (err) {
      if (err instanceof ErrorApiOperacion && err.errores.length > 0) setValidacion({ valida: false, errores: err.errores });
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  const errores = validacion?.errores ?? [];

  return (
    <>
      <h1>Publicar la programación</h1>
      <SelectorSesion onCambio={alCambiarSesion} />
      {error && (
        <p role="alert" className={estilos.resumen}>
          {error}
        </p>
      )}

      {edicion && (
        <p>
          Edición {edicion.numero} ({edicion.anio}) · estado: <strong>{edicion.estado === 'publicada' ? 'publicada' : 'en planificación'}</strong>
        </p>
      )}

      <div role="status" aria-live="polite" className={mensaje ? estilos.exito : undefined}>
        {mensaje}
      </div>

      {validacion && errores.length > 0 && (
        <div ref={resumenRef} tabIndex={-1} className={estilos.resumen} aria-labelledby="titulo-errores">
          <h2 id="titulo-errores">
            {errores.length === 1 ? 'Hay 1 error que impide publicar' : `Hay ${errores.length} errores que impiden publicar`}
          </h2>
          <ul>
            {errores.map((e, i) => {
              const href = enlaceDe(e);
              return (
                <li key={`${e.codigo}-${e.funcionId ?? e.obraId ?? i}`}>
                  {href ? <Link href={href}>{e.mensaje}</Link> : e.mensaje}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {validacion?.valida && (
        <p className={estilos.exito}>
          {edicion?.estado === 'publicada' ? 'No hay errores en los borradores pendientes.' : 'La programación no tiene errores: se puede publicar.'}
        </p>
      )}

      {edicion && (
        <div className={estilos.acciones}>
          <button type="button" onClick={publicar} disabled={!validacion?.valida || enviando} aria-describedby="ayuda-publicar">
            Publicar
          </button>
          <button type="button" className={estilos.secundario} onClick={() => edicion && validar(edicion)} disabled={enviando}>
            Volver a validar
          </button>
        </div>
      )}
      <p id="ayuda-publicar" className={estilos.ayuda}>
        Publicar pasa todos los borradores a &quot;programada&quot;. Una vez publicada la edición, cada función nueva se puede publicar sola desde la grilla.
      </p>
    </>
  );
}
