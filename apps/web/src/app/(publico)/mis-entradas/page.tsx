'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BoletoQr } from '@/components/boleteria/boleto-qr';
import { PanelSesionDev } from '@/components/boleteria/panel-sesion-dev';
import { type PedidoDetalle, apiBoleteria, formatoDolares } from '@/lib/boleteria/api-boleteria';
import { diaDeInstante, formatoDia, formatoHora } from '@/lib/cartelera/formato';

export default function MisEntradasPage() {
  const [pedidos, setPedidos] = useState<PedidoDetalle[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cambioDestino, setCambioDestino] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      setError(null);
      const lista = await apiBoleteria.misEntradas();
      setPedidos(lista);
    } catch (e) {
      setPedidos([]);
      setError(e instanceof Error ? e.message : 'Inicia sesión para consultar tus entradas.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function reenviar(pedidoId: string) {
    setMensaje(null);
    setError(null);
    try {
      await apiBoleteria.reenviarCorreo(pedidoId);
      setMensaje('Reenvío de entradas por correo encolado.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reenviar.');
    }
  }

  async function cancelarRes(pedidoId: string) {
    setMensaje(null);
    setError(null);
    try {
      await apiBoleteria.cancelarReserva(pedidoId);
      setMensaje('Reserva cancelada; los lugares volvieron al inventario.');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cancelar la reserva.');
    }
  }

  async function solicitarDevolucion(pedidoId: string) {
    setMensaje(null);
    setError(null);
    try {
      await apiBoleteria.elegirCancelacion(pedidoId, 'devolucion');
      setMensaje('Devolución registrada.');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar la devolución.');
    }
  }

  async function solicitarCambio(pedidoId: string) {
    const nuevaFuncionId = cambioDestino[pedidoId]?.trim();
    if (!nuevaFuncionId) {
      setError('Indica el identificador UUID de la función destino para el cambio.');
      return;
    }
    setMensaje(null);
    setError(null);
    try {
      await apiBoleteria.elegirCancelacion(pedidoId, 'cambio', nuevaFuncionId);
      setMensaje('Cambio de función aplicado sin nuevo cobro.');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo realizar el cambio.');
    }
  }

  return (
    <section aria-labelledby="titulo-mis-entradas">
      <h1 id="titulo-mis-entradas">Mis entradas</h1>
      <PanelSesionDev rolSugerido="asistente" onCambio={() => void cargar()} />

      {mensaje && (
        <p className="aviso" role="status" aria-live="polite">
          {mensaje}
        </p>
      )}
      {error && (
        <p className="aviso" role="alert">
          {error}
        </p>
      )}
      {cargando && <p>Cargando tus entradas…</p>}

      {!cargando && pedidos.length === 0 && !error && (
        <div className="vacio">
          <p>Todavía no tienes entradas ni reservas registradas.</p>
          <Link className="boton" href="/cartelera">
            Explorar cartelera
          </Link>
        </div>
      )}

      <ul className="lista-funciones">
        {pedidos.map((p) => (
          <li key={p.id}>
            <article className="tarjeta">
              <div className="tarjeta-hora">
                <time dateTime={p.inicio}>{formatoHora(p.inicio)}</time>
              </div>
              <div className="tarjeta-cuerpo">
                <h2>{p.obraTitulo}</h2>
                <p className="detalle">
                  {formatoDia(diaDeInstante(p.inicio))} · {p.sedeNombre}
                </p>
                <p className="etiquetas">
                  <span className="etiqueta">Estado: {p.estado}</span>
                  <span className="etiqueta">{p.tipo === 'reserva' ? 'Reserva gratuita' : formatoDolares(p.importeCentavos)}</span>
                  <span className="etiqueta">{p.cantidad} {p.cantidad === 1 ? 'entrada' : 'entradas'}</span>
                </p>

                {p.entradas.length > 0 && (
                  <div className="lista-funciones">
                    {p.entradas.map((e) => (
                      <BoletoQr key={e.id} tokenQr={e.tokenQr} codigoCorto={e.codigoCorto} estado={e.estado} />
                    ))}
                  </div>
                )}

                <div className="tarjeta-acciones">
                  {(p.estado === 'pagado' || p.estado === 'confirmado') && (
                    <button type="button" className="boton-favorito" onClick={() => void reenviar(p.id)}>
                      Reenviar por correo
                    </button>
                  )}
                  {p.tipo === 'reserva' && p.estado === 'confirmado' && (
                    <button type="button" className="boton-favorito" onClick={() => void cancelarRes(p.id)}>
                      Cancelar reserva
                    </button>
                  )}
                  {p.estado === 'pagado' && p.resolucionCancelacion === 'pendiente_eleccion' && (
                    <div>
                      <p className="nota">
                        Esta función fue cancelada. Elige devolución o cambio sin costo antes de 7 días:
                      </p>
                      <div className="tarjeta-acciones">
                        <button type="button" onClick={() => void solicitarDevolucion(p.id)}>
                          Solicitar devolución
                        </button>
                        <label htmlFor={`cambio-${p.id}`} className="solo-lectores">
                          UUID de nueva función
                        </label>
                        <input
                          id={`cambio-${p.id}`}
                          type="text"
                          placeholder="UUID de función alternativa"
                          value={cambioDestino[p.id] ?? ''}
                          onChange={(ev) => setCambioDestino((prev) => ({ ...prev, [p.id]: ev.target.value }))}
                        />
                        <button type="button" className="boton-favorito" onClick={() => void solicitarCambio(p.id)}>
                          Cambiar de función
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
