'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { BoletoQr } from '@/components/boleteria/boleto-qr';
import { PanelSesionDev } from '@/components/boleteria/panel-sesion-dev';
import { type PedidoDetalle, apiBoleteria, formatoDolares } from '@/lib/boleteria/api-boleteria';

function RetornoPagoContenido() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const pedidoId = params.id;
  const esSimulador = searchParams.get('sim') === '1';
  const ref = searchParams.get('ref') ?? `sim-${pedidoId.slice(0, 8)}`;

  const [pedido, setPedido] = useState<PedidoDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setError(null);
      const data = await apiBoleteria.obtenerPedido(pedidoId);
      setPedido(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el estado del pedido.');
    }
  }, [pedidoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function simularResultado(resultado: 'aprobado' | 'rechazado') {
    if (!pedido) return;
    setProcesando(true);
    setError(null);
    try {
      await apiBoleteria.confirmarPagoSimulado({
        pedidoId: pedido.id,
        resultado,
        importeCentavos: pedido.importeCentavos,
        referenciaProveedor: `${ref}-${resultado}`,
      });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo confirmar el pago simulado.');
    } finally {
      setProcesando(false);
    }
  }

  return (
    <section aria-labelledby="titulo-retorno">
      <h1 id="titulo-retorno">Estado del pago</h1>
      <PanelSesionDev rolSugerido="asistente" onCambio={() => void cargar()} />

      {error && (
        <p className="aviso" role="alert">
          {error}
        </p>
      )}

      {pedido && (
        <div className="ficha">
          <h2>{pedido.obraTitulo}</h2>
          <p className="detalle">
            {pedido.sedeNombre} · {pedido.cantidad} entradas · {formatoDolares(pedido.importeCentavos)}
          </p>
          <p>
            Estado actual: <strong data-testid="estado-pedido">{pedido.estado}</strong>
          </p>

          {pedido.estado === 'pendiente' && esSimulador && (
            <div className="vacio">
              <p>Pasarela simulada en modo de prueba (ADR-0007). Elige el resultado del cobro:</p>
              <div className="tarjeta-acciones">
                <button type="button" disabled={procesando} onClick={() => void simularResultado('aprobado')}>
                  Aprobar pago simulado
                </button>
                <button
                  type="button"
                  className="boton-favorito"
                  disabled={procesando}
                  onClick={() => void simularResultado('rechazado')}
                >
                  Rechazar pago simulado
                </button>
              </div>
            </div>
          )}

          {pedido.estado === 'pagado' && (
            <div>
              <p className="aviso">Pago confirmado. Tus entradas digitales ya están disponibles.</p>
              <div className="lista-funciones">
                {pedido.entradas.map((e) => (
                  <BoletoQr key={e.id} tokenQr={e.tokenQr} codigoCorto={e.codigoCorto} estado={e.estado} />
                ))}
              </div>
              <p>
                <Link className="boton" href="/mis-entradas">
                  Ir a Mis entradas
                </Link>
              </p>
            </div>
          )}

          {(pedido.estado === 'fallido' || pedido.estado === 'expirado') && (
            <div className="aviso">
              <p>El pago no se completó y los lugares fueron liberados.</p>
              <Link className="boton" href={`/entradas/${pedido.funcionId}`}>
                Intentar nuevamente
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function RetornoPagoPage() {
  return (
    <Suspense fallback={<p>Cargando estado del pago…</p>}>
      <RetornoPagoContenido />
    </Suspense>
  );
}
