import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { calcularDisponibilidad } from '../../domain/reglas-aforo';
import { ventaEnLineaHabilitada } from '../../domain/reglas-acceso';
import { RELOJ_BOLETERIA, REPOSITORIO_BOLETERIA, type RelojBoleteria, type RepositorioBoleteria } from '../puertos';

@Injectable()
export class ConsultasBoleteria {
  constructor(
    @Inject(REPOSITORIO_BOLETERIA) private readonly repo: RepositorioBoleteria,
    @Inject(RELOJ_BOLETERIA) private readonly reloj: RelojBoleteria,
  ) {}

  async disponibilidadFuncion(funcionId: string) {
    const fn = await this.repo.obtenerFuncionConEdicion(funcionId);
    if (!fn) throw new NotFoundException('Función no encontrada.');
    const lugaresDisponibles =
      fn.tipoAcceso === 'gratuita_libre' || fn.estadoFuncion === 'cancelada'
        ? 0
        : calcularDisponibilidad({ aforoHabilitado: fn.aforoHabilitado, emitidos: fn.emitidos, retenidos: fn.retenidos });

    return {
      funcionId: fn.funcionId,
      obraId: fn.obraId,
      obraTitulo: fn.obraTitulo,
      sedeId: fn.sedeId,
      sedeNombre: fn.sedeNombre,
      inicio: fn.inicio.toISOString(),
      fin: fn.fin.toISOString(),
      tipoAcceso: fn.tipoAcceso,
      publico: fn.publico,
      estadoFuncion: fn.estadoFuncion,
      precioCentavos: fn.precioCentavos,
      aforoHabilitado: fn.aforoHabilitado,
      lugaresDisponibles,
      maxPorPedido: fn.maxPorPedido,
      maxPorPersona: fn.maxPorPersona,
      ventaEnLineaAbierta:
        fn.tipoAcceso !== 'gratuita_libre' &&
        ventaEnLineaHabilitada({
          inicio: fn.inicio,
          ahora: this.reloj(),
          estadoFuncion: fn.estadoFuncion,
          estadoEdicion: fn.estadoEdicion,
        }),
    };
  }

  async misEntradas(cuentaId: string) {
    return this.repo.listarPedidosPorCuenta(cuentaId);
  }

  async obtenerPedido(pedidoId: string, cuentaId: string) {
    const pedido = await this.repo.obtenerPedidoPorId(pedidoId);
    if (!pedido) throw new NotFoundException('Pedido no encontrado.');
    if (pedido.cuentaId && pedido.cuentaId !== cuentaId) {
      throw new ForbiddenException('No tienes permiso para ver este pedido.');
    }
    return pedido;
  }
}
