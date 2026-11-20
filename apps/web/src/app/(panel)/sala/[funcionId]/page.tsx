'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PanelSesionDev } from '@/components/boleteria/panel-sesion-dev';
import { type OcupacionFuncion, apiBoleteria } from '@/lib/boleteria/api-boleteria';

/** Vista en vivo de ocupación por función para jefe de sala (T060: US6-AS1, FR-015). */
export default function SalaOcupacionPage() {
  const params = useParams<{ funcionId: string }>();
  const funcionId = params.funcionId;

  const [datos, setDatos] = useState<OcupacionFuncion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<string>('');

  const cargar = useCallback(async () => {
    try {
      setError(null);
      const res = await apiBoleteria.ocupacionEnVivo(funcionId);
      setDatos(res);
      setActualizado(new Date().toLocaleTimeString('es-EC', { hour12: false }));
    } catch (e) {
      setDatos(null);
      setError(e instanceof Error ? e.message : 'No se pudo consultar la ocupación de sala.');
    }
  }, [funcionId]);

  useEffect(() => {
    void cargar();
    const id = setInterval(() => void cargar(), 5000);
    return () => clearInterval(id);
  }, [cargar]);

  return (
    <section aria-labelledby="titulo-ocupacion">
      <p className="sobretitulo">
        <Link href="/taquilla">← Taquilla</Link> · <Link href={`/validador/${funcionId}`}>Ir a puerta</Link>
      </p>
      <h1 id="titulo-ocupacion">Ocupación en vivo de sala</h1>
      <PanelSesionDev rolSugerido="jefe_sala" onCambio={() => void cargar()} />

      <div className="tarjeta-acciones">
        <button type="button" onClick={() => void cargar()}>
          Actualizar ocupación ahora
        </button>
        {actualizado && (
          <span className="detalle" aria-live="polite">
            Última lectura: {actualizado}
          </span>
        )}
      </div>

      {error && (
        <p className="aviso" role="alert">
          {error}
        </p>
      )}

      {datos && (
        <dl className="metricas-grid" aria-label="Contadores de aforo e ingresos">
          <div className="metrica-caja">
            <dt>Aforo habilitado</dt>
            <dd data-testid="oc-aforo">{datos.aforoHabilitado}</dd>
          </div>
          <div className="metrica-caja">
            <dt>Entradas emitidas</dt>
            <dd data-testid="oc-emitidas">{datos.emitidas}</dd>
          </div>
          <div className="metrica-caja">
            <dt>Ingresos validados</dt>
            <dd data-testid="oc-ingresos">{datos.ingresos}</dd>
          </div>
          <div className="metrica-caja">
            <dt>Pendientes por ingresar</dt>
            <dd data-testid="oc-pendientes">{datos.pendientes}</dd>
          </div>
          <div className="metrica-caja">
            <dt>Lugares libres</dt>
            <dd data-testid="oc-libres">{datos.libres}</dd>
          </div>
          <div className="metrica-caja">
            <dt>Retenidos en pago</dt>
            <dd data-testid="oc-retenidos">{datos.retenidos}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
