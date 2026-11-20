import { ConflictException } from '@nestjs/common';
import { validarDecisionAdmisibilidad, type DecisionAdmisibilidad } from '../../domain/admisibilidad';
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
    validarDecisionAdmisibilidad(input);
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
}
