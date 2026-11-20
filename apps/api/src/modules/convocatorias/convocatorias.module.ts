import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALMACENAMIENTO_DOCUMENTOS, AUTORIZACION_CONVOCATORIAS, ESCANER_ANTIVIRUS } from './application/puertos';
import { crearAlmacenamientoDocumentos } from './infrastructure/almacenamiento.factory';
import { AutorizacionConvocatoriasDevAdapter } from './infrastructure/autorizacion-dev.adapter';
import { crearEscanerAntivirus } from './infrastructure/escaner.factory';
import { ConvocatoriasGuard } from './interface/convocatorias.guard';

/** Contexto de Convocatorias; sus proveedores se incorporan desde los adaptadores propios del módulo. */
@Module({
  providers: [
    Reflector,
    { provide: ALMACENAMIENTO_DOCUMENTOS, useFactory: () => crearAlmacenamientoDocumentos() },
    { provide: ESCANER_ANTIVIRUS, useFactory: () => crearEscanerAntivirus() },
    { provide: AUTORIZACION_CONVOCATORIAS, useFactory: () => new AutorizacionConvocatoriasDevAdapter(process.env.NODE_ENV) },
    ConvocatoriasGuard,
  ],
  exports: [AUTORIZACION_CONVOCATORIAS, ConvocatoriasGuard],
})
export class ConvocatoriasModule {}
