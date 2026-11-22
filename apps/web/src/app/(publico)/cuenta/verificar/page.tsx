'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { ErrorApiIdentidad, apiIdentidad } from '@/lib/identidad/api';

type Estado = 'verificando' | 'verificada' | 'vencido' | 'usado' | 'sin_token' | 'error';

/**
 * `/cuenta/verificar?token=…` (US7-AS2): consume el enlace al abrir la página. Si venció, ofrece
 * pedir otro (máximo 3 por hora). El token se quita de la barra de direcciones tras usarlo.
 */
export default function VerificarPage() {
  const id = useId();
  const titulo = useRef<HTMLHeadingElement>(null);
  const [estado, setEstado] = useState<Estado>('verificando');
  const [correo, setCorreo] = useState('');
  const [aviso, setAviso] = useState('');
  const usado = useRef(false);

  useEffect(() => {
    if (usado.current) return; // StrictMode monta dos veces: el enlace es de un solo uso
    usado.current = true;
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setEstado('sin_token');
      return;
    }
    window.history.replaceState(null, '', '/cuenta/verificar');
    apiIdentidad
      .verificar(token)
      .then(() => setEstado('verificada'))
      .catch((e) => setEstado(e instanceof ErrorApiIdentidad && e.codigo === 'enlace_usado' ? 'usado' : e instanceof ErrorApiIdentidad && e.status === 410 ? 'vencido' : 'error'));
  }, []);

  useEffect(() => {
    if (estado !== 'verificando') titulo.current?.focus();
  }, [estado]);

  const reenviar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await apiIdentidad.reenviar(correo);
      setAviso(r.mensaje);
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'No se pudo pedir el enlace.');
    }
  };

  const textos: Record<Estado, { titulo: string; cuerpo: string }> = {
    verificando: { titulo: 'Verificando tu correo…', cuerpo: '' },
    verificada: { titulo: 'Tu correo está verificado', cuerpo: 'Ya puedes ingresar para comprar entradas, reservar funciones y postular.' },
    usado: { titulo: 'Este enlace ya se usó', cuerpo: 'Si ya verificaste tu correo, puedes ingresar.' },
    vencido: { titulo: 'El enlace venció', cuerpo: 'Los enlaces valen 24 horas. Pide uno nuevo con tu correo.' },
    sin_token: { titulo: 'Falta el enlace', cuerpo: 'Abre esta página desde el enlace que te enviamos por correo, o pide uno nuevo.' },
    error: { titulo: 'No pudimos verificar tu correo', cuerpo: 'Intenta de nuevo en unos minutos o pide un enlace nuevo.' },
  };
  const t = textos[estado];

  return (
    <>
      <h1 ref={titulo} tabIndex={-1}>
        {t.titulo}
      </h1>
      <div role="status" aria-live="polite" className={estado === 'verificada' ? estilos.exito : undefined}>
        {t.cuerpo && <p>{t.cuerpo}</p>}
      </div>
      {(estado === 'verificada' || estado === 'usado') && (
        <p>
          <Link href="/cuenta/ingresar">Ingresar</Link>
        </p>
      )}
      {(estado === 'vencido' || estado === 'sin_token' || estado === 'error') && (
        <form onSubmit={reenviar} className={estilos.barra} aria-label="Pedir un enlace nuevo">
          <div className={estilos.campo}>
            <label htmlFor={`${id}-correo`}>Tu correo</label>
            <input id={`${id}-correo`} type="email" autoComplete="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
          </div>
          <button type="submit">Enviar un enlace nuevo</button>
          <p role="status" aria-live="polite" className={estilos.ayuda}>
            {aviso}
          </p>
        </form>
      )}
    </>
  );
}
