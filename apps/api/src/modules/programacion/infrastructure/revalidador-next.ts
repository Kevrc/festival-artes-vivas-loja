import { Logger } from '@nestjs/common';
import type { Revalidador } from '../application/puertos';

/** Pide a la web que regenere las páginas ISR con esas etiquetas (research R5). */
export class RevalidadorNext implements Revalidador {
  private readonly log = new Logger(RevalidadorNext.name);

  constructor(
    private readonly webUrl = process.env.WEB_URL ?? 'http://localhost:3100',
    private readonly secreto = process.env.REVALIDATE_SECRET ?? '',
  ) {}

  async revalidar(etiquetas: string[]) {
    try {
      const r = await fetch(`${this.webUrl}/api/revalidar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-revalidate-secret': this.secreto },
        body: JSON.stringify({ etiquetas }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!r.ok) this.log.warn(`Revalidación rechazada (${r.status}) para ${etiquetas.length} etiquetas`);
    } catch (error) {
      // La proyección ya está guardada; la caducidad de 60 s de la CDN es la red de seguridad.
      this.log.warn(`No se pudo revalidar: ${(error as Error).message}`);
    }
  }
}
