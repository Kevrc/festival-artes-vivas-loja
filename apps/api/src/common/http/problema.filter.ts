import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

/** Errores como RFC 9457 (application/problem+json), según el OpenAPI de la cartelera. */
@Catch()
export class ProblemaFilter implements ExceptionFilter {
  private readonly log = new Logger(ProblemaFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= 500) this.log.error(error);
    const cuerpo = error instanceof HttpException ? error.getResponse() : null;
    const obj = typeof cuerpo === 'object' && cuerpo ? (cuerpo as Record<string, unknown>) : null;
    const detail = obj && 'message' in obj ? String(obj.message) : undefined;
    const lugaresDisponibles =
      obj && typeof obj.lugaresDisponibles === 'number' ? { lugaresDisponibles: obj.lugaresDisponibles } : {};
    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title: HttpStatus[status] ?? 'Error',
        status,
        ...(status < 500 && detail ? { detail } : {}),
        ...(status < 500 ? lugaresDisponibles : {}),
      });
  }
}
