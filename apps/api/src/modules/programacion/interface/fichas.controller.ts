import { Controller, Get, Header, Inject, Param } from '@nestjs/common';
import { validar } from '../../../common/http/validar';
import { ConsultasFichas } from '../application/consultas/consultas-fichas';
import { noEncontrado } from './cartelera.controller';
import { Uuid } from './esquemas';

const CACHE = 'public, s-maxage=60, stale-while-revalidate=300';

/** US3: fichas de obra, elenco y sede. */
@Controller('api/cartelera')
export class FichasController {
  constructor(@Inject(ConsultasFichas) private readonly consultas: ConsultasFichas) {}

  @Get('obras/:id')
  @Header('Cache-Control', CACHE)
  async obra(@Param('id') id: string) {
    return (await this.consultas.obra(validar(Uuid, id))) ?? noEncontrado('Obra no encontrada');
  }

  @Get('elencos/:id')
  @Header('Cache-Control', CACHE)
  async elenco(@Param('id') id: string) {
    return (await this.consultas.elenco(validar(Uuid, id))) ?? noEncontrado('Elenco no encontrado');
  }

  @Get('sedes/:id')
  @Header('Cache-Control', CACHE)
  async sede(@Param('id') id: string) {
    return (await this.consultas.sede(validar(Uuid, id))) ?? noEncontrado('Sede no encontrada');
  }
}
