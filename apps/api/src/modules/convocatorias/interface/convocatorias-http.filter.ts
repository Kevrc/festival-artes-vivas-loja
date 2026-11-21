import { Catch, HttpException, HttpStatus, type ExceptionFilter, type ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ConvocatoriasHttpFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const codigo = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    const status = error instanceof HttpException ? error.getStatus() : codigo === 'LIMIT_FILE_SIZE' ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.INTERNAL_SERVER_ERROR;
    const cuerpo = error instanceof HttpException ? error.getResponse() : undefined;
    const payload = typeof cuerpo === 'object' && cuerpo !== null ? cuerpo as Record<string, unknown> : { message: cuerpo };
    const faltantes = Array.isArray(payload.faltantes) ? { faltantes: payload.faltantes } : {};
    response.status(status).type('application/problem+json').json({
      type: 'about:blank', title: error instanceof Error ? error.name : 'Error', status,
      detail: codigo === 'LIMIT_FILE_SIZE' ? 'El archivo excede 10 MB (10 000 000 bytes).' : typeof payload.message === 'string' ? payload.message : typeof payload.error === 'string' ? payload.error : 'Solicitud inválida',
      ...faltantes,
    });
  }
}
