import { Controller, Get, Header, Inject, Query } from '@nestjs/common';
import { z } from 'zod';
import { validar } from '../../../common/http/validar';
import { ConsultasFichas } from '../application/consultas/consultas-fichas';

/** US2: búsqueda por obra o elenco (FR-004). */
@Controller('api/cartelera')
export class BusquedaController {
  constructor(@Inject(ConsultasFichas) private readonly consultas: ConsultasFichas) {}

  @Get('buscar')
  @Header('Cache-Control', 'public, s-maxage=60')
  buscar(@Query('q') q: string) {
    return this.consultas.buscar(validar(z.string().trim().min(2).max(80), q));
  }
}
