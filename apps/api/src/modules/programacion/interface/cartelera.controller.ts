import { Controller, Get, Header, Inject, NotFoundException, Param, Query } from '@nestjs/common';
import { validar } from '../../../common/http/validar';
import { ConsultasDia } from '../application/consultas/consultas-dia';
import { Fecha } from './esquemas';

const CACHE_PAGINA = 'public, s-maxage=60, stale-while-revalidate=300';

/** US1: edición, programación del día y disponibilidad (OpenAPI: tag cartelera). */
@Controller('api/cartelera')
export class CarteleraController {
  constructor(@Inject(ConsultasDia) private readonly consultas: ConsultasDia) {}

  @Get('ediciones/actual')
  @Header('Cache-Control', CACHE_PAGINA)
  async edicionActual() {
    return (await this.consultas.edicionActual()) ?? noEncontrado('No hay ediciones publicadas');
  }

  @Get('dias/:fecha')
  @Header('Cache-Control', CACHE_PAGINA)
  async dia(@Param('fecha') fecha: string) {
    return (await this.consultas.dia(validar(Fecha, fecha))) ?? noEncontrado('Ese día no pertenece a una edición publicada');
  }

  @Get('disponibilidad')
  @Header('Cache-Control', 'public, s-maxage=15')
  disponibilidad(@Query('fecha') fecha: string) {
    return this.consultas.disponibilidad(validar(Fecha, fecha));
  }
}

export function noEncontrado(mensaje: string): never {
  throw new NotFoundException(mensaje);
}
