'use client';

import { useEffect, useState } from 'react';
import { type RolOperacion, type SesionDevOperacion, guardarSesionDev, leerSesionDev } from '@/lib/operacion/api';
import estilos from './operacion.module.css';

const CUENTA_DEMO = '00000000-0000-4000-8000-0000000000a4';
const ROLES: { rol: RolOperacion; nombre: string }[] = [
  { rol: 'programador', nombre: 'Programador' },
  { rol: 'direccion', nombre: 'Dirección (solo lectura)' },
  { rol: 'jefe_sala', nombre: 'Jefe de sala (solo lectura)' },
];

/**
 * shortcut: elige un rol de demostración mientras no exista el inicio de sesión de Identidad
 * (US8, T077). Solo funciona contra una API en development/test.
 */
export function SesionDevOperacion({ onCambio }: { onCambio: (s: SesionDevOperacion | null) => void }) {
  const [sesion, setSesion] = useState<SesionDevOperacion | null>(null);
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    const s = leerSesionDev();
    setSesion(s);
    setMontado(true);
    onCambio(s);
  }, [onCambio]);

  if (!montado) return null;

  const elegir = (rol: RolOperacion | '') => {
    const nueva = rol ? { cuentaId: CUENTA_DEMO, rol } : null;
    guardarSesionDev(nueva);
    setSesion(nueva);
    onCambio(nueva);
  };

  return (
    <aside className="aviso no-imprimir" aria-label="Sesión de demostración">
      <div className={estilos.campo}>
        <label htmlFor="rol-demo">Sesión de demostración (hasta el inicio de sesión real)</label>
        <select id="rol-demo" value={sesion?.rol ?? ''} onChange={(e) => elegir(e.target.value as RolOperacion | '')}>
          <option value="">Sin sesión</option>
          {ROLES.map((r) => (
            <option key={r.rol} value={r.rol}>
              {r.nombre}
            </option>
          ))}
        </select>
      </div>
    </aside>
  );
}
