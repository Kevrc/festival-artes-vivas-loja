import { Controller, Get, Header, Inject } from '@nestjs/common';
import { ConsultasFichas } from '../application/consultas/consultas-fichas';

/** US4: en curso o empieza en los próximos 60 minutos (FR-007). */
@Controller('api/cartelera')
export class AhoraController {
  constructor(@Inject(ConsultasFichas) private readonly consultas: ConsultasFichas) {}

  @Get('ahora')
  @Header('Cache-Control', 'public, s-maxage=30')
  ahora() {
    return this.consultas.ahora();
  }
}
