'use client';

import Link from 'next/link';
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
 * Elige un rol de demostración (puente de desarrollo). Solo funciona contra una API en
 * development/test; con la sesión real de Identidad (T091) la API usa la cookie y lo ignora.
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
        <label htmlFor="rol-demo">Sesión de demostración (solo desarrollo y pruebas)</label>
        <select id="rol-demo" value={sesion?.rol ?? ''} onChange={(e) => elegir(e.target.value as RolOperacion | '')}>
          <option value="">Sin sesión</option>
          {ROLES.map((r) => (
            <option key={r.rol} value={r.rol}>
              {r.nombre}
            </option>
          ))}
        </select>
      </div>
      <p className={estilos.ayuda}>
        Con tu cuenta del personal: <Link href="/cuenta/ingresar?volver=/programacion">Ingresar</Link> (la sesión real tiene prioridad).
      </p>
    </aside>
  );
}
