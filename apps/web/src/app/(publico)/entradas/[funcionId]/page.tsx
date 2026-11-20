'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatoCodigoCorto, nuevaClaveIdempotencia } from '@/components/boleteria/formato-boleteria';
import { PanelSesionDev } from '@/components/boleteria/panel-sesion-dev';
import {
  type DisponibilidadFuncion,
  ErrorApiBoleteria,
  apiBoleteria,
  formatoDolares,
} from '@/lib/boleteria/api-boleteria';
import { diaDeInstante, formatoDia, formatoHora } from '@/lib/cartelera/formato';

export default function EntradasFuncionPage() {
  const params = useParams<{ funcionId: string }>();
  const router = useRouter();
  const funcionId = params.funcionId;

  const [info, setInfo] = useState<DisponibilidadFuncion | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claveIdempotencia, setClaveIdempotencia] = useState(() => nuevaClaveIdempotencia());

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      setError(null);
      const data = await apiBoleteria.disponibilidadFuncion(funcionId);
      setInfo(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la función.');
    } finally {
      setCargando(false);
    }
  }, [funcionId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function manejarEnvio(ev: React.FormEvent) {
    ev.preventDefault();
    if (!info) return;
    setEnviando(true);
    setError(null);
    try {
      if (info.tipoAcceso === 'pagada') {
        const res = await apiBoleteria.crearPedidoPagado(funcionId, cantidad, claveIdempotencia);
        setClaveIdempotencia(nuevaClaveIdempotencia());
        const destino = res.urlPago.startsWith('http')
          ? new URL(res.urlPago).pathname + new URL(res.urlPago).search
          : res.urlPago;
        router.push(destino);
      } else {
        const ped = await apiBoleteria.crearReservaGratuita(funcionId, cantidad, claveIdempotencia);
        setClaveIdempotencia(nuevaClaveIdempotencia());
        router.push(`/mis-entradas?nuevo=${ped.id}`);
      }
    } catch (e) {
      if (e instanceof ErrorApiBoleteria) {
        setError(e.message);
        if (e.status === 409) void cargar();
      } else {
        setError('Error inesperado al procesar tu solicitud.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section aria-labelledby="titulo-entradas">
      <p className="sobretitulo">
        <Link href="/cartelera">← Volver a la cartelera</Link>
      </p>
      <h1 id="titulo-entradas">Obtener entradas</h1>

      <PanelSesionDev rolSugerido="asistente" />

      {cargando && <p>Cargando disponibilidad…</p>}
      {error && (
        <p className="aviso" role="alert">
          {error}
        </p>
      )}

      {info && (
        <article className="tarjeta">
          <div className="tarjeta-hora">
            <time dateTime={info.inicio}>{formatoHora(info.inicio)}</time>
          </div>
          <div className="tarjeta-cuerpo">
            <h2>{info.obraTitulo}</h2>
            <p className="detalle">
              {formatoDia(diaDeInstante(info.inicio))} · {info.sedeNombre}
            </p>
            <p className="etiquetas">
              <span className="etiqueta">
                {info.tipoAcceso === 'pagada'
                  ? formatoDolares(info.precioCentavos)
                  : info.tipoAcceso === 'gratuita_libre'
                    ? 'Entrada libre'
                    : 'Gratuita con reserva'}
              </span>
              {info.tipoAcceso !== 'gratuita_libre' && (
                <span className="etiqueta">
                  {info.lugaresDisponibles === 0
                    ? 'Agotado'
                    : `${info.lugaresDisponibles} lugares disponibles`}
                </span>
              )}
              {info.tipoAcceso === 'restringida' && (
                <span className="etiqueta">Solo estudiantes acreditados</span>
              )}
            </p>

            {info.estadoFuncion === 'cancelada' ? (
              <p className="aviso">Esta función fue cancelada y no admite nuevas compras ni reservas.</p>
            ) : info.tipoAcceso === 'gratuita_libre' ? (
              <div className="vacio">
                <p>
                  <strong>Entrada libre:</strong> el acceso es gratuito hasta completar la capacidad del
                  espacio público, sin necesidad de reserva ni boleto previo.
                </p>
              </div>
            ) : !info.ventaEnLineaAbierta ? (
              <p className="aviso">La venta y reserva en línea para esta función está cerrada.</p>
            ) : info.lugaresDisponibles === 0 ? (
              <p className="aviso">Agotado: no quedan lugares disponibles en este momento.</p>
            ) : (
              <form onSubmit={manejarEnvio} className="form-boleteria">
                <label htmlFor="cantidad-entradas">
                  Cantidad de {info.tipoAcceso === 'pagada' ? 'entradas' : 'lugares'} (máximo{' '}
                  {info.maxPorPedido} por pedido):
                </label>
                <div className="tarjeta-acciones">
                  <select
                    id="cantidad-entradas"
                    value={cantidad}
                    onChange={(e) => setCantidad(Number(e.target.value))}
                  >
                    {Array.from({ length: info.maxPorPedido }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? 'lugar' : 'lugares'}
                      </option>
                    ))}
                  </select>
                  <button type="submit" disabled={enviando}>
                    {enviando
                      ? 'Procesando…'
                      : info.tipoAcceso === 'pagada'
                        ? `Retener y pagar (${formatoDolares(cantidad * info.precioCentavos)})`
                        : 'Confirmar reserva gratuita'}
                  </button>
                </div>
                {info.tipoAcceso === 'pagada' && (
                  <p className="detalle">
                    Los lugares quedan retenidos durante 10 minutos mientras completas el pago. Ref clave:{' '}
                    <code>{formatoCodigoCorto(claveIdempotencia.slice(0, 8))}</code>
                  </p>
                )}
              </form>
            )}
          </div>
        </article>
      )}
    </section>
  );
}
