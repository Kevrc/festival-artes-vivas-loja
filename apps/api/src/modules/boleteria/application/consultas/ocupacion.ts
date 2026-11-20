import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { calcularDisponibilidad } from '../../domain/reglas-aforo';
import { verificarAlcanceSede } from '../../interface/boleteria.guard';
import { type ContextoUsuario, REPOSITORIO_BOLETERIA, type RepositorioBoleteria } from '../puertos';

@Injectable()
export class ConsultarOcupacionEnVivo {
  constructor(@Inject(REPOSITORIO_BOLETERIA) private readonly repo: RepositorioBoleteria) {}

  async ejecutar(funcionId: string, usuario: ContextoUsuario) {
    const fn = await this.repo.obtenerFuncionConEdicion(funcionId);
    if (!fn) throw new NotFoundException('Función no encontrada.');
    verificarAlcanceSede(usuario, ['jefe_sala', 'taquilla', 'validador', 'programador'], fn.sedeId);

    const pendientes = Math.max(0, fn.emitidos - fn.usados);
    const libres = calcularDisponibilidad({
      aforoHabilitado: fn.aforoHabilitado,
      emitidos: fn.emitidos,
      retenidos: fn.retenidos,
    });

    return {
      funcionId: fn.funcionId,
      aforoHabilitado: fn.aforoHabilitado,
      retenidos: fn.retenidos,
      emitidas: fn.emitidos,
      ingresos: fn.usados,
      pendientes,
      libres,
    };
  }
}
