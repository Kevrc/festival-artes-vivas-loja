import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { boleteriaLatenciaOperacion, boleteriaPedidosTotal } from '../../infrastructure/metricas-boleteria';
import { publicarDisponibilidad } from '../eventos/helpers-eventos';
import {
  type ContextoUsuario,
  PROVEEDOR_PAGOS,
  PUBLICADOR_BOLETERIA,
  type ProveedorPagos,
  type PublicadorEventosBoleteria,
  RELOJ_BOLETERIA,
  REPOSITORIO_BOLETERIA,
  UNIDAD_TRABAJO,
  type UnidadDeTrabajo,
  type RelojBoleteria,
  type RepositorioBoleteria,
} from '../puertos';

const DIEZ_MINUTOS_MS = 10 * 60_000;

@Injectable()
export class CrearPedidoPagado {
  constructor(
    @Inject(REPOSITORIO_BOLETERIA) private readonly repo: RepositorioBoleteria,
    @Inject(PROVEEDOR_PAGOS) private readonly proveedor: ProveedorPagos,
    @Inject(PUBLICADOR_BOLETERIA) private readonly publicador: PublicadorEventosBoleteria,
    @Inject(UNIDAD_TRABAJO) private readonly uow: UnidadDeTrabajo,
    @Inject(RELOJ_BOLETERIA) private readonly reloj: RelojBoleteria,
  ) {}

  async ejecutar(p: {
    usuario: ContextoUsuario;
    funcionId: string;
    cantidad: number;
    claveIdempotencia: string;
    correlacionId?: string;
  }) {
    const finTimer = boleteriaLatenciaOperacion.startTimer({ operacion: 'crear_pedido_pagado' });
    const correlacionId = p.correlacionId ?? randomUUID();
    const ahora = this.reloj();
    const venceEn = new Date(ahora.getTime() + DIEZ_MINUTOS_MS);

    try {
      // Retención y aviso de disponibilidad juntos; el cobro (HTTP) queda fuera de la transacción
      const ret = await this.uow.ejecutar(async () => {
        const r = await this.repo.retenerParaPedidoPagado({
        funcionId: p.funcionId,
        cuentaId: p.usuario.cuentaId,
        correoComprador: p.usuario.correo,
        cantidad: p.cantidad,
        claveIdempotencia: p.claveIdempotencia,
        ahora,
        venceEn,
        estudianteAcreditado: p.usuario.estudianteAcreditado,
        correlacionId,
        });
        if (r.ok && !r.idempotente) await publicarDisponibilidad(this.publicador, r.inventarioActualizado, ahora, correlacionId);
        return r;
      });

      if (!ret.ok) {
        boleteriaPedidosTotal.inc({ canal: 'web', tipo: 'compra', resultado: ret.motivo });
        if (ret.motivo === 'no_encontrada') throw new NotFoundException(ret.detalle);
        if (ret.motivo === 'restringida') throw new ForbiddenException(ret.detalle);
        if (ret.motivo === 'conflicto_idempotencia') throw new ConflictException({ message: ret.detalle });
        if (ret.motivo === 'cupo') {
          throw new ConflictException({ message: ret.detalle, lugaresDisponibles: ret.disponibles ?? 0 });
        }
        throw new UnprocessableEntityException(ret.detalle);
      }

      try {
        const cobro = await this.proveedor.iniciarCobro({
          pedidoId: ret.pedido.id,
          importeCentavos: ret.pedido.importeCentavos,
          descripcion: `${ret.pedido.obraTitulo} (${ret.pedido.cantidad} entradas)`,
          correo: p.usuario.correo,
        });
        if (!ret.idempotente) {
          await this.repo.registrarIntencionPago({
            pedidoId: ret.pedido.id,
            proveedor: this.proveedor.nombre,
            referenciaIntencion: cobro.referenciaIntencion,
            importeCentavos: ret.pedido.importeCentavos,
          });
        }
        boleteriaPedidosTotal.inc({ canal: 'web', tipo: 'compra', resultado: ret.idempotente ? 'idempotente' : 'retenido' });
        return {
          pedido: ret.pedido,
          urlPago: cobro.urlPago,
          referenciaIntencion: cobro.referenciaIntencion,
        };
      } catch (err) {
        await this.uow.ejecutar(async () => {
          const inv = await this.repo.liberarPorFallaInicioPago({
            pedidoId: ret.pedido.id,
            proveedor: this.proveedor.nombre,
            detalle: err instanceof Error ? err.message : 'Falla proveedor de pagos',
          });
          if (inv) await publicarDisponibilidad(this.publicador, inv, ahora, correlacionId);
        });
        boleteriaPedidosTotal.inc({ canal: 'web', tipo: 'compra', resultado: 'proveedor_caido' });
        throw new ServiceUnavailableException('Pago en línea temporalmente no disponible; puedes comprar en taquilla en efectivo.');
      }
    } finally {
      finTimer();
    }
  }
}
