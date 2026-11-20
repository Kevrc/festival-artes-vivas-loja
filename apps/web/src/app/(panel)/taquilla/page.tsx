'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BoletoQr } from '@/components/boleteria/boleto-qr';
import { nuevaClaveIdempotencia } from '@/components/boleteria/formato-boleteria';
import { PanelSesionDev } from '@/components/boleteria/panel-sesion-dev';
import {
  type CajaDetalle,
  ErrorApiBoleteria,
  type MedioPagoTaquilla,
  type PedidoDetalle,
  apiBoleteria,
  formatoDolares,
} from '@/lib/boleteria/api-boleteria';
import { cargarCatalogoOperacion } from '@/lib/boleteria/cartelera-operacion';
import { formatoDia, formatoHora, diaDeInstante } from '@/lib/cartelera/formato';
import type { FuncionResumen, SedeResumen } from '@/lib/cartelera/tipos';

function dolaresACentavos(texto: string): number {
  const num = Number(texto.replace(',', '.'));
  if (!Number.isFinite(num) || num < 0) return -1;
  return Math.round(num * 100);
}

/** Pantalla de taquilla presencial: apertura, venta, devolución y arqueo (T049, T056). */
export default function TaquillaPage() {
  const [sedes, setSedes] = useState<SedeResumen[]>([]);
  const [funciones, setFunciones] = useState<FuncionResumen[]>([]);
  const [caja, setCaja] = useState<CajaDetalle | null>(null);
  const [sedeId, setSedeId] = useState('');
  const [fondoInicial, setFondoInicial] = useState('20.00');

  const [funcionId, setFuncionId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [medioPago, setMedioPago] = useState<MedioPagoTaquilla>('efectivo');
  const [correoComprador, setCorreoComprador] = useState('');
  const [claveIdempotencia, setClaveIdempotencia] = useState(() => nuevaClaveIdempotencia());

  const [codigoDevolucion, setCodigoDevolucion] = useState('');
  const [efectivoDeclarado, setEfectivoDeclarado] = useState('20.00');

  const [ultimoPedido, setUltimoPedido] = useState<PedidoDetalle | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargarCaja = useCallback(async () => {
    try {
      setError(null);
      const actual = await apiBoleteria.obtenerCajaActual();
      setCaja(actual);
      setEfectivoDeclarado(((actual.efectivoEsperadoCentavos ?? 0) / 100).toFixed(2));
    } catch (e) {
      if (e instanceof ErrorApiBoleteria && e.status === 404) {
        setCaja(null);
        return;
      }
      if (e instanceof ErrorApiBoleteria && (e.status === 401 || e.status === 403)) {
        setCaja(null);
        return;
      }
      setError(e instanceof Error ? e.message : 'No se pudo consultar la caja actual.');
    }
  }, []);

  useEffect(() => {
    void cargarCatalogoOperacion().then((cat) => {
      setSedes(cat.sedes);
      setFunciones(cat.funciones);
      if (cat.sedes[0]) setSedeId((prev) => prev || cat.sedes[0]!.id);
      const conCupo = cat.funciones.find((f) => f.tipoAcceso === 'pagada' || f.tipoAcceso === 'gratuita_reserva');
      if (conCupo) setFuncionId((prev) => prev || conCupo.id);
    });
    void cargarCaja();
  }, [cargarCaja]);

  async function manejarApertura(ev: React.FormEvent) {
    ev.preventDefault();
    const centavos = dolaresACentavos(fondoInicial);
    if (!sedeId.trim() || centavos < 0) {
      setError('Indica una sede válida y un fondo inicial no negativo.');
      return;
    }
    setError(null);
    setMensaje(null);
    try {
      const abierta = await apiBoleteria.abrirCaja(sedeId.trim(), centavos);
      setCaja(abierta);
      setEfectivoDeclarado(((abierta.efectivoEsperadoCentavos ?? 0) / 100).toFixed(2));
      setMensaje('Caja diaria abierta correctamente.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la caja.');
    }
  }

  async function manejarVenta(ev: React.FormEvent) {
    ev.preventDefault();
    if (!caja || !funcionId.trim()) return;
    setError(null);
    setMensaje(null);
    try {
      const ped = await apiBoleteria.venderTaquilla(
        {
          cajaId: caja.id,
          funcionId: funcionId.trim(),
          cantidad,
          medioPago,
          ...(correoComprador.trim() ? { correoComprador: correoComprador.trim() } : {}),
        },
        claveIdempotencia,
      );
      setClaveIdempotencia(nuevaClaveIdempotencia());
      setUltimoPedido(ped);
      setCorreoComprador('');
      setMensaje(`Venta registrada: ${ped.entradas.length} entrada(s) emitida(s).`);
      await cargarCaja();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la venta.');
    }
  }

  async function manejarDevolucion(ev: React.FormEvent) {
    ev.preventDefault();
    if (!caja || !codigoDevolucion.trim()) return;
    setError(null);
    setMensaje(null);
    try {
      const ped = await apiBoleteria.devolverTaquilla(caja.id, codigoDevolucion.trim());
      setCodigoDevolucion('');
      setMensaje(`Devolución en efectivo registrada para el pedido ${ped.id.slice(0, 8)} (${formatoDolares(ped.importeCentavos)}).`);
      await cargarCaja();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la devolución.');
    }
  }

  async function manejarCierre(ev: React.FormEvent) {
    ev.preventDefault();
    if (!caja) return;
    const centavos = dolaresACentavos(efectivoDeclarado);
    if (centavos < 0) {
      setError('Indica un efectivo contado válido.');
      return;
    }
    setError(null);
    setMensaje(null);
    try {
      const cerrada = await apiBoleteria.cerrarCaja(caja.id, centavos);
      setCaja(cerrada);
      setMensaje(`Caja cerrada. Diferencia de arqueo: ${formatoDolares(cerrada.diferenciaCentavos ?? 0)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cerrar la caja.');
    }
  }

  const funcionesDeSede = caja
    ? funciones.filter((f) => f.sede.id === caja.sedeId)
    : funciones;

  return (
    <section aria-labelledby="titulo-taquilla">
      <h1 id="titulo-taquilla">Taquilla presencial y arqueo de caja</h1>
      <PanelSesionDev rolSugerido="taquilla" onCambio={() => void cargarCaja()} />

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

      {(!caja || caja.estado === 'cerrada') && (
        <form className="form-boleteria no-imprimir" onSubmit={manejarApertura}>
          <h2>Abrir caja del día</h2>
          {sedes.length > 0 && (
            <div className="campo-boleteria">
              <label htmlFor="sede-select">Sede de taquilla</label>
              <select
                id="sede-select"
                value={sedeId}
                onChange={(e) => setSedeId(e.target.value)}
              >
                {sedes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="campo-boleteria">
            <label htmlFor="sede-uuid">Identificador de sede (UUID)</label>
            <input
              id="sede-uuid"
              type="text"
              required
              value={sedeId}
              onChange={(e) => setSedeId(e.target.value)}
            />
          </div>
          <div className="campo-boleteria">
            <label htmlFor="fondo-inicial">Fondo inicial en efectivo (USD)</label>
            <input
              id="fondo-inicial"
              type="text"
              inputMode="decimal"
              required
              value={fondoInicial}
              onChange={(e) => setFondoInicial(e.target.value)}
            />
          </div>
          <button type="submit">Abrir caja</button>
        </form>
      )}

      {caja && (
        <section className="ficha no-imprimir" aria-labelledby="titulo-resumen-caja">
          <h2 id="titulo-resumen-caja">Estado de caja ({caja.estado})</h2>
          <dl>
            <dt>Fondo inicial</dt>
            <dd>{formatoDolares(caja.fondoInicialCentavos)}</dd>
            <dt>Ventas en efectivo</dt>
            <dd>{formatoDolares(caja.totalEfectivoVentasCentavos ?? 0)}</dd>
            <dt>Ventas con tarjeta</dt>
            <dd>{formatoDolares(caja.totalTarjetaVentasCentavos ?? 0)}</dd>
            <dt>Devoluciones efectivo</dt>
            <dd>{formatoDolares(caja.totalDevolucionesEfectivoCentavos ?? 0)}</dd>
            <dt>Efectivo esperado</dt>
            <dd data-testid="efectivo-esperado">{formatoDolares(caja.efectivoEsperadoCentavos ?? 0)}</dd>
            {caja.estado === 'cerrada' && (
              <>
                <dt>Efectivo declarado</dt>
                <dd>{formatoDolares(caja.efectivoDeclaradoCentavos ?? 0)}</dd>
                <dt>Diferencia de arqueo</dt>
                <dd data-testid="diferencia-arqueo">{formatoDolares(caja.diferenciaCentavos ?? 0)}</dd>
              </>
            )}
          </dl>
        </section>
      )}

      {caja?.estado === 'abierta' && (
        <>
          <form className="form-boleteria no-imprimir" onSubmit={manejarVenta}>
            <h2>Venta rápida presencial</h2>
            {funcionesDeSede.length > 0 && (
              <div className="campo-boleteria">
                <label htmlFor="funcion-taquilla-select">Función de la sede</label>
                <select
                  id="funcion-taquilla-select"
                  value={funcionId}
                  onChange={(e) => setFuncionId(e.target.value)}
                >
                  {funcionesDeSede.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.obra.titulo} · {formatoDia(diaDeInstante(f.inicio))} {formatoHora(f.inicio)} ({f.sede.nombre})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="campo-boleteria">
              <label htmlFor="funcion-taquilla-id">ID de función (UUID)</label>
              <input
                id="funcion-taquilla-id"
                type="text"
                required
                value={funcionId}
                onChange={(e) => setFuncionId(e.target.value)}
              />
            </div>
            <div className="campo-boleteria">
              <label htmlFor="taquilla-cantidad">Cantidad</label>
              <input
                id="taquilla-cantidad"
                type="number"
                min={1}
                max={6}
                required
                value={cantidad}
                onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))}
              />
            </div>
            <div className="campo-boleteria">
              <label htmlFor="taquilla-medio">Medio de pago</label>
              <select
                id="taquilla-medio"
                value={medioPago}
                onChange={(e) => setMedioPago(e.target.value as MedioPagoTaquilla)}
              >
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta_datafono">Tarjeta (datáfono)</option>
              </select>
            </div>
            <div className="campo-boleteria">
              <label htmlFor="taquilla-correo">Correo opcional del asistente</label>
              <input
                id="taquilla-correo"
                type="email"
                placeholder="opcional@ejemplo.ec"
                value={correoComprador}
                onChange={(e) => setCorreoComprador(e.target.value)}
              />
            </div>
            <div className="tarjeta-acciones">
              <button type="submit">Emitir entradas en taquilla</button>
              {funcionId && (
                <Link className="boton boton-favorito" href={`/sala/${funcionId}`}>
                  Ver ocupación de sala
                </Link>
              )}
            </div>
          </form>

          {ultimoPedido && (
            <section className="ficha" aria-labelledby="titulo-boleto-imprimible">
              <h2 id="titulo-boleto-imprimible">Boleto emitido · {ultimoPedido.obraTitulo}</h2>
              <p className="detalle">
                {ultimoPedido.sedeNombre} · {ultimoPedido.cantidad} entradas · {formatoDolares(ultimoPedido.importeCentavos)}
              </p>
              <div className="lista-funciones">
                {ultimoPedido.entradas.map((ent) => (
                  <BoletoQr
                    key={ent.id}
                    tokenQr={ent.tokenQr}
                    codigoCorto={ent.codigoCorto}
                    estado={ent.estado}
                  />
                ))}
              </div>
              <p className="no-imprimir">
                <button type="button" onClick={() => window.print()}>
                  Imprimir boleto
                </button>
              </p>
            </section>
          )}

          <form className="form-boleteria no-imprimir" onSubmit={manejarDevolucion}>
            <h2>Devolución en efectivo (función cancelada)</h2>
            <div className="campo-boleteria">
              <label htmlFor="codigo-devolucion">Código corto de entrada</label>
              <input
                id="codigo-devolucion"
                type="text"
                required
                placeholder="Ej. AB34-CD56"
                value={codigoDevolucion}
                onChange={(e) => setCodigoDevolucion(e.target.value)}
              />
            </div>
            <button type="submit" className="boton-favorito">
              Registrar devolución en efectivo
            </button>
          </form>

          <form className="form-boleteria no-imprimir" onSubmit={manejarCierre}>
            <h2>Cerrar caja y registrar arqueo</h2>
            <div className="campo-boleteria">
              <label htmlFor="efectivo-declarado">Efectivo contado en caja (USD)</label>
              <input
                id="efectivo-declarado"
                type="text"
                inputMode="decimal"
                required
                value={efectivoDeclarado}
                onChange={(e) => setEfectivoDeclarado(e.target.value)}
              />
            </div>
            <button type="submit">Cerrar caja con arqueo</button>
          </form>
        </>
      )}
    </section>
  );
}
