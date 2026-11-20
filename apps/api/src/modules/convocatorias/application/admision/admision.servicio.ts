import { BadRequestException, ConflictException } from '@nestjs/common';
import { validarDecisionAdmisibilidad, type DecisionAdmisibilidad } from '../../domain/admisibilidad';
import type { EstadoPostulacion } from '../../domain/estados';
import type { AdmisionRepositorioPort } from './admision.port';

export class AdmisionServicio {
  constructor(
    private readonly repositorio: AdmisionRepositorioPort,
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  resolver(
    postulacionId: string,
    actorCuentaId: string | null,
    input: { decision: DecisionAdmisibilidad; motivo?: string | null; detalle?: string | null },
  ) {
    try {
      validarDecisionAdmisibilidad(input);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Decisión inválida');
    }
    return this.repositorio.resolverAdmisibilidad({
      postulacionId,
      actorCuentaId,
      decision: input.decision,
      motivo: input.motivo ?? null,
      detalle: input.detalle ?? null,
      ahora: this.reloj(),
    });
  }

  async reenviar(postulacionId: string, cuentaId: string) {
    const resultado = await this.repositorio.reenviarSubsanacion({
      postulacionId,
      cuentaId,
      ahora: this.reloj(),
    });
    if (resultado.vencida) throw new ConflictException('Plazo de subsanación vencido');
    return resultado.postulacion;
  }

  expirarVencidas() {
    return this.repositorio.expirarSubsanacionesVencidas(this.reloj());
  }

  listar(input: { estados?: EstadoPostulacion[]; provincia?: string }) {
    return this.repositorio.listarParaAdmision(input);
  }
}
