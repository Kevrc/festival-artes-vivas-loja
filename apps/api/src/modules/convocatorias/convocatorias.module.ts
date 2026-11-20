import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALMACENAMIENTO_DOCUMENTOS, AUTORIZACION_CONVOCATORIAS, ESCANER_ANTIVIRUS } from './application/puertos';
import { crearAlmacenamientoDocumentos } from './infrastructure/almacenamiento.factory';
import { AutorizacionConvocatoriasDevAdapter } from './infrastructure/autorizacion-dev.adapter';
import { crearEscanerAntivirus } from './infrastructure/escaner.factory';
import { ConvocatoriasGuard } from './interface/convocatorias.guard';
import { PostulacionesController } from './interface/postulaciones.controller';
import { PostulacionesPrismaRepository } from './infrastructure/postulaciones-prisma.repository';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PublicadorPgBossConvocatorias } from './infrastructure/publicador.pgboss';
import { PUBLICADOR_CONVOCATORIAS } from './application/puertos';
import { DatosModule } from '../../common/datos/datos.module';

/** Contexto de Convocatorias; sus proveedores se incorporan desde los adaptadores propios del módulo. */
@Module({
  imports: [DatosModule],
  controllers: [PostulacionesController],
  providers: [
    Reflector,
    { provide: ALMACENAMIENTO_DOCUMENTOS, useFactory: () => crearAlmacenamientoDocumentos() },
    { provide: ESCANER_ANTIVIRUS, useFactory: () => crearEscanerAntivirus() },
    { provide: AUTORIZACION_CONVOCATORIAS, useFactory: () => new AutorizacionConvocatoriasDevAdapter(process.env.NODE_ENV) },
    PublicadorPgBossConvocatorias,
    { provide: PUBLICADOR_CONVOCATORIAS, useExisting: PublicadorPgBossConvocatorias },
    {
      provide: PostulacionesPrismaRepository,
      inject: [PrismaService, PUBLICADOR_CONVOCATORIAS],
      useFactory: (db: PrismaService, publicador: import('./application/puertos').PublicadorConvocatoriasPort) => new PostulacionesPrismaRepository(db, publicador),
    },
    ConvocatoriasGuard,
  ],
  exports: [AUTORIZACION_CONVOCATORIAS, ConvocatoriasGuard],
})
export class ConvocatoriasModule {}
