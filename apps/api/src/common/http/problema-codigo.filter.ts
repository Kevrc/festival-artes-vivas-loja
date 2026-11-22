import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Error HTTP con `codigo` estable del enum `Problema.codigo` de los OpenAPI de la spec 004 y
 * campos extra (p. ej. `conflictos`, `exceso`, `version`).
 */
export class ErrorConCodigo extends HttpException {
  constructor(
    status: number,
    readonly codigo: string,
    detalle: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super({ message: detalle, codigo, ...extra }, status);
  }
}

/**
 * RFC 9457 con `codigo` (spec 004). Se aplica con `@UseFilters` en los controladores de Operación
 * e Identidad; no cambia el filtro global que usan 001 y 002.
 */
@Catch()
export class ProblemaCodigoFilter implements ExceptionFilter {
  private readonly log = new Logger(ProblemaCodigoFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= 500) this.log.error(error);
    const cuerpo = error instanceof HttpException ? error.getResponse() : null;
    const obj = typeof cuerpo === 'object' && cuerpo ? (cuerpo as Record<string, unknown>) : {};
    const { message, codigo, error: _nombre, statusCode: _s, ...extra } = obj;
    const detalle = Array.isArray(message) ? message.join('; ') : typeof message === 'string' ? message : undefined;
    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title: HttpStatus[status] ?? 'Error',
        status,
        ...(status < 500 && detalle ? { detail: detalle } : {}),
        ...(status < 500 && typeof codigo === 'string' ? { codigo } : {}),
        ...(status < 500 ? extra : {}),
      });
  }
}
