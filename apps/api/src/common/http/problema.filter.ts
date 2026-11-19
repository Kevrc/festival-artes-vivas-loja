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
    const detail =
      typeof cuerpo === 'object' && cuerpo && 'message' in cuerpo ? String((cuerpo as { message: unknown }).message) : undefined;
    res
      .status(status)
      .type('application/problem+json')
      .json({ type: 'about:blank', title: HttpStatus[status] ?? 'Error', status, ...(status < 500 && detail ? { detail } : {}) });
  }
}
