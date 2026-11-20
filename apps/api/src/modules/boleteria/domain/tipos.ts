export type TipoAcceso = 'pagada' | 'gratuita_reserva' | 'gratuita_libre' | 'restringida';
export type PublicoObjetivo = 'familiar' | 'adultos' | 'estudiantes';
export type EstadoEdicion = 'borrador' | 'publicada' | 'cerrada';
export type EstadoFuncion = 'borrador' | 'programada' | 'reprogramada' | 'cancelada' | 'finalizada';

export type CanalPedido = 'web' | 'taquilla' | 'cambio';
export type TipoPedido = 'compra' | 'reserva';
export type EstadoPedido = 'pendiente' | 'pagado' | 'fallido' | 'expirado' | 'reembolsado' | 'confirmado' | 'cancelado';
export type ResolucionCancelacion = 'devolucion' | 'cambiado' | 'pendiente_eleccion';

export type EstadoEntrada = 'valida' | 'usada' | 'anulada' | 'liberada';
export type MedioPagoTaquilla = 'efectivo' | 'tarjeta_datafono';
export type EstadoCaja = 'abierta' | 'cerrada';
export type TipoMovimientoCaja = 'venta' | 'egreso_devolucion';

export type RolBoleteria = 'asistente' | 'taquilla' | 'validador' | 'jefe_sala' | 'programador' | 'administrador';

export type SemaforoValidacion = 'verde' | 'ambar' | 'rojo';

export type CodigoValidacion =
  | 'valida'
  | 'doble_lectura_reciente'
  | 'ya_usada'
  | 'otra_funcion'
  | 'anulada'
  | 'liberada'
  | 'firma_invalida'
  | 'fuera_de_horario'
  | 'no_encontrada';
