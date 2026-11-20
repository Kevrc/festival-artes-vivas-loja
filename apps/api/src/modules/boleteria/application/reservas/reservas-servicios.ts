import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ParLlavesQr } from '../../domain/firma-qr';
import { boleteriaLatenciaOperacion, boleteriaPedidosTotal } from '../../infrastructure/metricas-boleteria';
import { publicarDisponibilidad, publicarEntradasEmitidas } from '../eventos/helpers-eventos';
import {
  type ContextoUsuario,
  LLAVES_QR,
  PUBLICADOR_BOLETERIA,
  type PublicadorEventosBoleteria,
  RELOJ_BOLETERIA,
  REPOSITORIO_BOLETERIA,
  UNIDAD_TRABAJO,
  type UnidadDeTrabajo,
  type RelojBoleteria,
  type RepositorioBoleteria,
} from '../puertos';

@Injectable()
export class CrearReservaGratuita {
  constructor(
    @Inject(REPOSITORIO_BOLETERIA) private readonly repo: RepositorioBoleteria,
    @Inject(PUBLICADOR_BOLETERIA) private readonly publicador: PublicadorEventosBoleteria,
    @Inject(UNIDAD_TRABAJO) private readonly uow: UnidadDeTrabajo,
    @Inject(RELOJ_BOLETERIA) private readonly reloj: RelojBoleteria,
    @Inject(LLAVES_QR) private readonly llaves: ParLlavesQr,
  ) {}

  async ejecutar(p: {
    usuario: ContextoUsuario;
    funcionId: string;
    cantidad: number;
    claveIdempotencia: string;
    correlacionId?: string;
  }) {
    const finTimer = boleteriaLatenciaOperacion.startTimer({ operacion: 'crear_reserva_gratuita' });
    const correlacionId = p.correlacionId ?? randomUUID();
    const ahora = this.reloj();

    try {
      const res = await this.uow.ejecutar(async () => {
        const r = await this.repo.crearReservaGratuita({
        funcionId: p.funcionId,
        cuentaId: p.usuario.cuentaId,
        correoComprador: p.usuario.correo,
        cantidad: p.cantidad,
        claveIdempotencia: p.claveIdempotencia,
        ahora,
        estudianteAcreditado: p.usuario.estudianteAcreditado,
        llaves: this.llaves,
        correlacionId,
        });
        if (r.ok && !r.idempotente) {
          await publicarEntradasEmitidas(this.publicador, { pedido: r.pedido, edicionId: r.inventarioActualizado.edicionId, ahora, correlacionId });
          await publicarDisponibilidad(this.publicador, r.inventarioActualizado, ahora, correlacionId);
        }
        return r;
      });

      if (!res.ok) {
        boleteriaPedidosTotal.inc({ canal: 'web', tipo: 'reserva', resultado: res.motivo });
        if (res.motivo === 'no_encontrada') throw new NotFoundException(res.detalle);
        if (res.motivo === 'restringida') throw new ForbiddenException(res.detalle);
        if (res.motivo === 'conflicto_idempotencia') throw new ConflictException({ message: res.detalle });
        if (res.motivo === 'cupo') {
          throw new ConflictException({ message: res.detalle, lugaresDisponibles: res.disponibles ?? 0 });
        }
        throw new UnprocessableEntityException(res.detalle);
      }

      boleteriaPedidosTotal.inc({ canal: 'web', tipo: 'reserva', resultado: res.idempotente ? 'idempotente' : 'confirmado' });
      return res.pedido;
    } finally {
      finTimer();
    }
  }
}

@Injectable()
export class CancelarReserva {
  constructor(
    @Inject(REPOSITORIO_BOLETERIA) private readonly repo: RepositorioBoleteria,
    @Inject(PUBLICADOR_BOLETERIA) private readonly publicador: PublicadorEventosBoleteria,
    @Inject(UNIDAD_TRABAJO) private readonly uow: UnidadDeTrabajo,
    @Inject(RELOJ_BOLETERIA) private readonly reloj: RelojBoleteria,
  ) {}

  async ejecutar(p: { pedidoId: string; cuentaId: string; correlacionId?: string }) {
    const correlacionId = p.correlacionId ?? randomUUID();
    const ahora = this.reloj();
    const res = await this.uow.ejecutar(async () => {
      const r = await this.repo.cancelarReserva({ pedidoId: p.pedidoId, cuentaId: p.cuentaId, ahora, correlacionId });
      if (r.ok) await publicarDisponibilidad(this.publicador, r.inventario, ahora, correlacionId);
      return r;
    });
    if (!res.ok) {
      if (res.motivo === 'no_encontrado') throw new NotFoundException(res.detalle);
      if (res.motivo === 'no_autorizado') throw new ForbiddenException(res.detalle);
      throw new UnprocessableEntityException(res.detalle);
    }
    boleteriaPedidosTotal.inc({ canal: 'web', tipo: 'reserva', resultado: 'cancelado' });
    return res.pedido;
  }
}

@Injectable()
export class LiberarReservasNoValidadas {
  constructor(
    @Inject(REPOSITORIO_BOLETERIA) private readonly repo: RepositorioBoleteria,
    @Inject(PUBLICADOR_BOLETERIA) private readonly publicador: PublicadorEventosBoleteria,
    @Inject(UNIDAD_TRABAJO) private readonly uow: UnidadDeTrabajo,
    @Inject(RELOJ_BOLETERIA) private readonly reloj: RelojBoleteria,
  ) {}

  async ejecutar(correlacionId: string = randomUUID()): Promise<number> {
    const ahora = this.reloj();
    const liberadas = await this.uow.ejecutar(async () => {
      const lista = await this.repo.liberarReservasNoValidadas(ahora);
      for (const item of lista) await publicarDisponibilidad(this.publicador, item.funcion, ahora, correlacionId);
      return lista;
    });
    return liberadas.reduce((total, item) => total + item.entradasLiberadas, 0);
  }
}
