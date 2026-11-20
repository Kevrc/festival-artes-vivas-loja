import type { EventoPublicadoBoleteria } from '@fiavl/contracts';
import type { ParLlavesQr } from '../domain/firma-qr';
import type {
  CanalPedido,
  EstadoCaja,
  EstadoEdicion,
  EstadoEntrada,
  EstadoFuncion,
  EstadoPedido,
  MedioPagoTaquilla,
  PublicoObjetivo,
  ResolucionCancelacion,
  RolBoleteria,
  TipoAcceso,
  TipoMovimientoCaja,
  TipoPedido,
} from '../domain/tipos';

export const REPOSITORIO_BOLETERIA = Symbol('REPOSITORIO_BOLETERIA');
export const PROVEEDOR_PAGOS = Symbol('PROVEEDOR_PAGOS');
export const PUBLICADOR_BOLETERIA = Symbol('PUBLICADOR_BOLETERIA');
export const AUTORIZACION_BOLETERIA = Symbol('AUTORIZACION_BOLETERIA');
export const RELOJ_BOLETERIA = Symbol('RELOJ_BOLETERIA');
export const LLAVES_QR = Symbol('LLAVES_QR');

export type RelojBoleteria = () => Date;

export interface ContextoUsuario {
  cuentaId: string;
  correo?: string;
  correoVerificado: boolean;
  estudianteAcreditado: boolean;
  roles: { rol: RolBoleteria; sedeId?: string }[];
}

export interface AutorizacionBoleteriaPort {
  resolverDesdePeticion(req: {
    headers: Record<string, string | string[] | undefined>;
  }): Promise<ContextoUsuario | null>;
}

export interface FuncionConEdicion {
  funcionId: string;
  edicionId: string;
  obraId: string;
  obraTitulo: string;
  sedeId: string;
  sedeNombre: string;
  inicio: Date;
  fin: Date;
  tipoAcceso: TipoAcceso;
  publico: PublicoObjetivo;
  estadoFuncion: EstadoFuncion;
  estadoEdicion: EstadoEdicion;
  precioCentavos: number;
  maxPorPedido: number;
  maxPorPersona: number;
  aforoHabilitado: number;
  retenidos: number;
  emitidos: number;
  usados: number;
  reservasLiberadas: boolean;
  versionOrigen: number;
}

export interface EntradaRegistro {
  id: string;
  pedidoId: string;
  funcionId: string;
  tokenQr: string;
  codigoCorto: string;
  estado: EstadoEntrada;
  emitidaEn: Date;
}

export interface PedidoRegistro {
  id: string;
  funcionId: string;
  obraId: string;
  obraTitulo: string;
  sedeId: string;
  sedeNombre: string;
  inicio: Date;
  cuentaId: string | null;
  correoComprador: string | null;
  canal: CanalPedido;
  tipo: TipoPedido;
  cantidad: number;
  precioUnitarioCentavos: number;
  importeCentavos: number;
  estado: EstadoPedido;
  claveIdempotencia: string;
  venceEn: Date | null;
  cajaId: string | null;
  resolucionCancelacion: ResolucionCancelacion | null;
  plazoEleccionHasta: Date | null;
  pedidoOrigenId: string | null;
  creadoEn: Date;
  entradas: EntradaRegistro[];
}

export interface CajaRegistro {
  id: string;
  vendedorId: string;
  sedeId: string;
  estado: EstadoCaja;
  fondoInicialCentavos: number;
  efectivoEsperadoCentavos: number | null;
  efectivoDeclaradoCentavos: number | null;
  diferenciaCentavos: number | null;
  abiertaEn: Date;
  cerradaEn: Date | null;
  movimientos: {
    id: string;
    pedidoId: string;
    tipo: TipoMovimientoCaja;
    medioPago: MedioPagoTaquilla;
    importeCentavos: number;
    registradoEn: Date;
  }[];
}

export interface EntradaPaqueteItem {
  id: string;
  codigoCorto: string;
  estado: EstadoEntrada;
  usadaEn: Date | null;
  puerta: string | null;
  dispositivoId: string | null;
}

export interface EntradaParaValidacion {
  id: string;
  pedidoId: string;
  funcionId: string;
  tokenQr: string;
  codigoCorto: string;
  estado: EstadoEntrada;
  obraTitulo: string;
  sedeId: string;
  sedeNombre: string;
  inicio: Date;
  fin: Date;
  ultimoIngreso: {
    escaneadoEn: Date;
    puerta: string;
    dispositivoId: string;
  } | null;
}

export interface EntradaDevolucionTaquilla {
  entradaId: string;
  entradaEstado: EstadoEntrada;
  pedidoId: string;
  funcionId: string;
  sedeId: string;
  estadoFuncion: EstadoFuncion;
  pedidoEstado: EstadoPedido;
  canal: CanalPedido;
  importeCentavos: number;
  cantidadPedido: number;
  resolucionCancelacion: ResolucionCancelacion | null;
  entradasPedido: { id: string; estado: EstadoEntrada }[];
  tuvoEfectivo: boolean;
}

export interface IniciarCobroInput {
  pedidoId: string;
  importeCentavos: number;
  descripcion: string;
  correo?: string;
}

export interface IniciarCobroResultado {
  urlPago: string;
  referenciaIntencion: string;
}

export interface ConsultarPagoResultado {
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  referenciaProveedor?: string;
  importeCentavos?: number;
}

export interface DevolverPagoResultado {
  referenciaDevolucion: string;
  aprobada: boolean;
}

export interface ProveedorPagos {
  readonly nombre: 'simulador' | 'payphone';
  iniciarCobro(input: IniciarCobroInput): Promise<IniciarCobroResultado>;
  consultarPago(pedidoId: string, referenciaIntencion?: string): Promise<ConsultarPagoResultado>;
  devolverPago(p: {
    pedidoId: string;
    referenciaCobro: string;
    importeCentavos: number;
  }): Promise<DevolverPagoResultado>;
  verificarWebhook(p: { firma: string; cuerpoCrudo: string; payload: unknown }): boolean;
}

export interface PublicadorEventosBoleteria {
  publicar(
    evento: EventoPublicadoBoleteria,
    opciones?: { singletonKey?: string; singletonSeconds?: number },
  ): Promise<void>;
}

export interface CrearEntradasParams {
  llaves: ParLlavesQr;
  ahora: Date;
}

export interface AuditoriaInput {
  accion: string;
  actorId?: string | null;
  rol?: string | null;
  entidad: string;
  entidadId: string;
  motivo?: string | null;
  datos?: Record<string, unknown>;
  correlacionId: string;
}

export interface RepositorioBoleteria {
  obtenerFuncionConEdicion(funcionId: string): Promise<FuncionConEdicion | null>;
  obtenerPedidoPorId(pedidoId: string): Promise<PedidoRegistro | null>;
  obtenerPedidoPorClave(claveIdempotencia: string): Promise<PedidoRegistro | null>;
  listarPedidosPorCuenta(cuentaId: string): Promise<PedidoRegistro[]>;

  retenerParaPedidoPagado(p: {
    funcionId: string;
    cuentaId: string;
    correoComprador?: string;
    cantidad: number;
    claveIdempotencia: string;
    ahora: Date;
    venceEn: Date;
    estudianteAcreditado: boolean;
    correlacionId: string;
  }): Promise<
    | { ok: true; pedido: PedidoRegistro; inventarioActualizado: FuncionConEdicion; idempotente: boolean }
    | { ok: false; motivo: 'no_encontrada' | 'venta_cerrada' | 'restringida' | 'limite' | 'cupo' | 'conflicto_idempotencia'; detalle: string; disponibles?: number }
  >;

  registrarIntencionPago(p: {
    pedidoId: string;
    proveedor: string;
    referenciaIntencion: string;
    importeCentavos: number;
  }): Promise<void>;

  liberarPorFallaInicioPago(p: { pedidoId: string; proveedor: string; detalle: string }): Promise<FuncionConEdicion | null>;

  procesarResultadoPago(p: {
    pedidoId: string;
    proveedor: string;
    referenciaProveedor: string;
    resultado: 'aprobado' | 'rechazado';
    importeCentavos: number;
    ahora: Date;
    llaves: ParLlavesQr;
    correlacionId: string;
  }): Promise<{
    accion: 'ya_procesado' | 'pagado' | 'rechazado' | 'tardio_pagado' | 'tardio_requiere_reembolso' | 'no_encontrado';
    pedido: PedidoRegistro | null;
    inventario?: FuncionConEdicion | null;
  }>;

  registrarReembolsoConfirmado(p: {
    pedidoId: string;
    proveedor: string;
    referenciaDevolucion: string;
    importeCentavos: number;
    motivo: 'funcion_cancelada' | 'funcion_reprogramada' | 'pago_tardio_sin_cupo' | 'plazo_7_dias_vencido';
    correlacionId: string;
    actorId?: string | null;
    rol?: string | null;
    marcarResolucionDevolucion?: boolean;
  }): Promise<{ pedido: PedidoRegistro | null; inventario?: FuncionConEdicion | null; yaRegistrado: boolean }>;

  expirarRetencionesVencidas(ahora: Date, limite?: number): Promise<{ pedidoId: string; funcion: FuncionConEdicion }[]>;
  listarPedidosPendientesAntiguos(antesDe: Date): Promise<{ id: string; referenciaIntencion: string | null }[]>;
  obtenerReferenciaCobroAprobado(pedidoId: string): Promise<{ proveedor: string; referenciaProveedor: string; importeCentavos: number } | null>;

  crearReservaGratuita(p: {
    funcionId: string;
    cuentaId: string;
    correoComprador?: string;
    cantidad: number;
    claveIdempotencia: string;
    ahora: Date;
    estudianteAcreditado: boolean;
    llaves: ParLlavesQr;
    correlacionId: string;
  }): Promise<
    | { ok: true; pedido: PedidoRegistro; inventarioActualizado: FuncionConEdicion; idempotente: boolean }
    | { ok: false; motivo: 'no_encontrada' | 'entrada_libre' | 'venta_cerrada' | 'restringida' | 'limite' | 'cupo' | 'conflicto_idempotencia'; detalle: string; disponibles?: number }
  >;

  cancelarReserva(p: {
    pedidoId: string;
    cuentaId: string;
    ahora: Date;
    correlacionId: string;
  }): Promise<
    | { ok: true; pedido: PedidoRegistro; inventario: FuncionConEdicion }
    | { ok: false; motivo: 'no_encontrado' | 'no_autorizado' | 'no_permitido'; detalle: string }
  >;

  liberarReservasNoValidadas(ahora: Date): Promise<{ funcion: FuncionConEdicion; entradasLiberadas: number }[]>;

  abrirCaja(p: { vendedorId: string; sedeId: string; fondoInicialCentavos: number; ahora: Date; correlacionId: string }): Promise<
    | { ok: true; caja: CajaRegistro }
    | { ok: false; motivo: 'ya_abierta'; detalle: string }
  >;
  obtenerCajaAbierta(vendedorId: string): Promise<CajaRegistro | null>;
  obtenerCajaPorId(cajaId: string): Promise<CajaRegistro | null>;
  cerrarCaja(p: {
    cajaId: string;
    vendedorId: string;
    efectivoDeclaradoCentavos: number;
    ahora: Date;
    correlacionId: string;
  }): Promise<{ ok: true; caja: CajaRegistro } | { ok: false; motivo: 'no_encontrada' | 'no_autorizada' | 'ya_cerrada'; detalle: string }>;

  venderEnTaquilla(p: {
    cajaId: string;
    vendedorId: string;
    sedesPermitidas?: string[];
    funcionId: string;
    cantidad: number;
    medioPago: MedioPagoTaquilla;
    correoComprador?: string;
    claveIdempotencia: string;
    ahora: Date;
    llaves: ParLlavesQr;
    correlacionId: string;
  }): Promise<
    | { ok: true; pedido: PedidoRegistro; inventario: FuncionConEdicion; idempotente: boolean }
    | { ok: false; motivo: 'caja_no_encontrada' | 'caja_cerrada' | 'no_autorizado' | 'no_encontrada' | 'entrada_libre' | 'venta_cerrada' | 'cupo' | 'conflicto_idempotencia'; detalle: string; disponibles?: number }
  >;

  buscarEntradaPorCodigoOToken(codigoEntrada: string): Promise<EntradaDevolucionTaquilla | null>;
  ejecutarDevolucionTaquillaEfectivo(p: {
    cajaId: string;
    vendedorId: string;
    pedidoId: string;
    ahora: Date;
    correlacionId: string;
  }): Promise<{ ok: true; pedido: PedidoRegistro } | { ok: false; motivo: 'caja_cerrada' | 'no_autorizado' | 'no_permitido'; detalle: string }>;

  listarEntradasParaPaquete(funcionId: string): Promise<EntradaPaqueteItem[]>;
  buscarEntradaParaValidar(p: { entradaId?: string; codigoCorto?: string }): Promise<EntradaParaValidacion | null>;
  registrarIngresoEnLinea(p: {
    entradaId: string;
    funcionId: string;
    validadorId: string;
    dispositivoId: string;
    puerta: string;
    escaneadoEn: Date;
  }): Promise<{ ingresoId: string; duplicado: boolean }>;

  sincronizarIngresosLote(p: {
    validadorId: string;
    ingresos: {
      entradaId: string;
      funcionId: string;
      dispositivoId: string;
      puerta: string;
      escaneadoEn: Date;
    }[];
    ahora: Date;
  }): Promise<{
    aplicados: number;
    duplicados: number;
    nuevosIngresos: { ingresoId: string; entradaId: string; funcionId: string; sedeId: string; edicionId: string; validadorId: string; escaneadoEn: Date }[];
    conflictos: {
      entradaId: string;
      funcionId: string;
      sedeId: string;
      edicionId: string;
      primerIngresoEn: Date;
      puertaGanadora: string;
      primerDispositivoId: string;
      segundoDispositivoId: string;
      mensaje: string;
    }[];
  }>;

  cambiarFuncionPorCancelacion(p: {
    pedidoId: string;
    cuentaId: string;
    nuevaFuncionId: string;
    ahora: Date;
    llaves: ParLlavesQr;
    correlacionId: string;
  }): Promise<
    | { ok: true; nuevoPedido: PedidoRegistro; nuevaFuncion: FuncionConEdicion }
    | { ok: false; motivo: 'no_encontrado' | 'no_autorizado' | 'no_permitido' | 'cupo'; detalle: string; disponibles?: number }
  >;

  listarPedidosVencidosSinEleccion(ahora: Date): Promise<PedidoRegistro[]>;

  aplicarEventoOperacion(p: {
    eventoId: string;
    tipo: string;
    edicionId: string;
    datos: unknown;
    ahora: Date;
    correlacionId: string;
  }): Promise<{
    aplicado: boolean;
    funcionAfectada?: FuncionConEdicion | null;
    excesoAforo?: { funcionId: string; sedeId: string; edicionId: string; aforoHabilitado: number; entradasActivas: number; exceso: number } | null;
  }>;

  registrarAuditoria(input: AuditoriaInput): Promise<void>;
}

export const UNIDAD_TRABAJO = Symbol('UnidadDeTrabajo');

/** Ejecuta un cambio y la publicación de sus eventos en una misma transacción (ADR-0003). */
export interface UnidadDeTrabajo {
  ejecutar<T>(fn: () => Promise<T>): Promise<T>;
}
