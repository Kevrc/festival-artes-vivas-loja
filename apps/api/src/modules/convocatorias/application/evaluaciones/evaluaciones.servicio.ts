import { BadRequestException } from '@nestjs/common';
import type { EvaluacionInput, EvaluacionesRepositorioPort } from './evaluaciones.port';

/** Casos de uso de curaduría (US3). Las reglas de cálculo y estado viven en el dominio y en el repositorio transaccional. */
export class EvaluacionesServicio {
  constructor(
    private readonly repositorio: EvaluacionesRepositorioPort,
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  asignaciones(cuentaId: string) { return this.repositorio.listarAsignaciones(cuentaId); }
  asignacion(cuentaId: string, asignacionId: string) { return this.repositorio.obtenerAsignacion(cuentaId, asignacionId); }
  guardar(cuentaId: string, asignacionId: string, input: EvaluacionInput) {
    return this.repositorio.guardarEvaluacion(cuentaId, asignacionId, input);
  }
  enviar(cuentaId: string, asignacionId: string) {
    return this.repositorio.enviarEvaluacion(cuentaId, asignacionId, this.reloj());
  }

  /** Solo coordinación; el motivo es obligatorio y queda en la auditoría. */
  reabrir(
    evaluacionId: string, actorCuentaId: string, motivo: string | null | undefined,
    provinciaPermitida: (provincia: string | null) => boolean,
  ) {
    const texto = motivo?.trim();
    if (!texto) throw new BadRequestException('El motivo es obligatorio para reabrir una evaluación');
    return this.repositorio.reabrirEvaluacion({ evaluacionId, actorCuentaId, motivo: texto, ahora: this.reloj(), provinciaPermitida });
  }

  panel() { return this.repositorio.listarEvaluacionesPanel(); }
  agregado(postulacionId: string) { return this.repositorio.obtenerAgregado(postulacionId); }
}
