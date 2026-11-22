'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  type SesionDevBoleteria,
  guardarSesionDev,
  leerSesionDev,
} from '@/lib/boleteria/api-boleteria';
import { type Yo, apiIdentidad } from '@/lib/identidad/api';

/**
 * El puente de desarrollo se ofrece salvo que el despliegue lo apague con
 * NEXT_PUBLIC_SESION_DEV=false (en producción la API lo rechaza de todos modos).
 */
const PUENTE_DEV = process.env.NEXT_PUBLIC_SESION_DEV !== 'false';

/**
 * Sesión de las pantallas de Boletería. T091 (spec 004): con sesión real de Identidad (cookie
 * `fiavl_sesion`) la muestra y permite cerrarla; sin ella ofrece ingresar con la cuenta y, en
 * desarrollo y pruebas, el puente de demostración `sesion_dev` de la spec 002.
 */
export function PanelSesionDev({
  rolSugerido = 'asistente',
  sedeSugerida,
  onCambio,
}: {
  rolSugerido?: SesionDevBoleteria['rol'];
  sedeSugerida?: string;
  onCambio?: (s: SesionDevBoleteria | null) => void;
}) {
  const [sesion, setSesion] = useState<SesionDevBoleteria | null>(null);
  const [real, setReal] = useState<Yo | null>(null);
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setSesion(leerSesionDev());
    setMontado(true);
    apiIdentidad
      .yo()
      .then((yo) => setReal(yo.segundoFactorOk ? yo : null))
      .catch(() => setReal(null));
  }, []);

  if (!montado) return null;

  if (real) {
    return (
      <aside className="aviso no-imprimir" aria-label="Tu sesión">
        <p>
          Sesión: <strong>{real.nombre}</strong> ({real.correo}) ·{' '}
          <button
            type="button"
            className="boton-favorito"
            onClick={async () => {
              await apiIdentidad.salir().catch(() => undefined);
              setReal(null);
              onCambio?.(null);
            }}
          >
            Cerrar sesión
          </button>
        </p>
      </aside>
    );
  }

  const volver = typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}`;
  const ingresar = <Link href={`/cuenta/ingresar?volver=${encodeURIComponent(volver)}`}>Ingresar con tu cuenta</Link>;

  const activar = (p: Partial<SesionDevBoleteria>) => {
    const nueva: SesionDevBoleteria = {
      cuentaId: p.cuentaId ?? '11111111-1111-4111-8111-111111111111',
      rol: p.rol ?? rolSugerido,
      sedeId: p.sedeId ?? sedeSugerida,
      estudiante: p.estudiante ?? false,
      correo: p.correo ?? 'asistente.demo@fiavl.ec',
    };
    guardarSesionDev(nueva);
    setSesion(nueva);
    onCambio?.(nueva);
  };

  const cerrar = () => {
    guardarSesionDev(null);
    setSesion(null);
    onCambio?.(null);
  };

  if (!PUENTE_DEV) {
    return (
      <aside className="aviso no-imprimir" aria-label="Tu sesión">
        <p>Para operar esta pantalla necesitas ingresar. {ingresar}</p>
      </aside>
    );
  }

  return (
    <aside className="aviso no-imprimir" aria-label="Sesión de demostración">
      {sesion ? (
        <p>
          Sesión activa: <strong>{sesion.rol}</strong> ({sesion.correo ?? sesion.cuentaId.slice(0, 8)}
          {sesion.estudiante ? ' · estudiante acreditado' : ''}) ·{' '}
          <button type="button" className="boton-favorito" onClick={cerrar}>
            Cerrar sesión
          </button>
        </p>
      ) : (
        <div>
          <p>Para operar esta pantalla necesitas una sesión. {ingresar}, o usa una sesión de demostración (solo desarrollo y pruebas):</p>
          <div className="tarjeta-acciones">
            <button
              type="button"
              onClick={() => activar({ rol: rolSugerido, sedeId: sedeSugerida })}
            >
              Entrar como {rolSugerido}
            </button>
            {rolSugerido === 'asistente' && (
              <button
                type="button"
                className="boton-favorito"
                onClick={() => activar({ rol: 'asistente', estudiante: true, correo: 'estudiante@utpl.edu.ec' })}
              >
                Entrar como estudiante acreditado
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
