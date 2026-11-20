import { Module } from '@nestjs/common';
import { DatosModule } from './common/datos/datos.module';
import { ObservabilidadModule } from './common/observabilidad/observabilidad.module';
import { BoleteriaModule } from './modules/boleteria/boleteria.module';
import { ProgramacionModule } from './modules/programacion/programacion.module';

@Module({
  imports: [
    DatosModule,
    ObservabilidadModule,
    ProgramacionModule.registrar({ consumidores: false }),
    BoleteriaModule.registrar({ consumidores: false }),
  ],
})
export class AppModule {}
