import { Module } from '@nestjs/common';
import { ObservabilidadModule } from './common/observabilidad/observabilidad.module';
import { ProgramacionModule } from './modules/programacion/programacion.module';

@Module({
  imports: [ObservabilidadModule, ProgramacionModule.registrar({ consumidores: false })],
})
export class AppModule {}
