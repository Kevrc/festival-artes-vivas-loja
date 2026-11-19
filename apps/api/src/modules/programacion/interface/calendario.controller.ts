import { Controller, Get, Header, Inject, Param } from '@nestjs/common';
import { validar } from '../../../common/http/validar';
import { ConsultasFichas } from '../application/consultas/consultas-fichas';
import { noEncontrado } from './cartelera.controller';
import { Uuid } from './esquemas';

/** US6-AS2: evento de calendario de una función. */
@Controller('api/cartelera')
export class CalendarioController {
  constructor(@Inject(ConsultasFichas) private readonly consultas: ConsultasFichas) {}

  @Get('funciones/:id/calendario.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="funcion-fiavl.ics"')
  async calendario(@Param('id') id: string) {
    return (await this.consultas.calendario(validar(Uuid, id))) ?? noEncontrado('Función no encontrada');
  }
}
