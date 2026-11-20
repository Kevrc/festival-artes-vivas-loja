import { Controller, Get, Header, Inject, Param, Req, UseGuards } from '@nestjs/common';
import { validar } from '../../../common/http/validar';
import { ConsultasBoleteria } from '../application/consultas/disponibilidad';
import { ConsultarOcupacionEnVivo } from '../application/consultas/ocupacion';
import { BoleteriaGuard, type PeticionConUsuario, RolesBoleteria } from './boleteria.guard';
import { UuidSchema } from './esquemas';

@Controller('api/boleteria/funciones')
export class DisponibilidadController {
  constructor(
    @Inject(ConsultasBoleteria) private readonly consultas: ConsultasBoleteria,
    @Inject(ConsultarOcupacionEnVivo) private readonly ocupacion: ConsultarOcupacionEnVivo,
  ) {}

  @Get(':funcionId/disponibilidad')
  @Header('Cache-Control', 'no-store')
  disponibilidad(@Param('funcionId') funcionId: string) {
    return this.consultas.disponibilidadFuncion(validar(UuidSchema, funcionId));
  }

  @Get(':funcionId/ocupacion')
  @Header('Cache-Control', 'no-store')
  @UseGuards(BoleteriaGuard)
  @RolesBoleteria('jefe_sala', 'taquilla', 'validador', 'programador')
  ocupacionEnVivo(@Param('funcionId') funcionId: string, @Req() req: PeticionConUsuario) {
    return this.ocupacion.ejecutar(validar(UuidSchema, funcionId), req.usuario!);
  }
}
