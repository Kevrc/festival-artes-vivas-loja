'use client';

import { useEffect, useState } from 'react';
import {
  type SesionDevBoleteria,
  guardarSesionDev,
  leerSesionDev,
} from '@/lib/boleteria/api-boleteria';

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
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setSesion(leerSesionDev());
    setMontado(true);
  }, []);

  if (!montado) return null;

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
          <p>Para operar esta pantalla necesitas una sesión activa (puente dev hasta Identidad 004):</p>
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
