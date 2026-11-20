import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTORIZACION_CONVOCATORIAS } from './application/puertos';
import { AutorizacionConvocatoriasDevAdapter } from './infrastructure/autorizacion-dev.adapter';
import { ConvocatoriasGuard } from './interface/convocatorias.guard';

/** Contexto de Convocatorias; sus proveedores se incorporan desde los adaptadores propios del módulo. */
@Module({
  providers: [
    Reflector,
    { provide: AUTORIZACION_CONVOCATORIAS, useFactory: () => new AutorizacionConvocatoriasDevAdapter(process.env.NODE_ENV) },
    ConvocatoriasGuard,
  ],
  exports: [AUTORIZACION_CONVOCATORIAS, ConvocatoriasGuard],
})
export class ConvocatoriasModule {}
