import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALMACENAMIENTO_DOCUMENTOS, AUTORIZACION_CONVOCATORIAS, ESCANER_ANTIVIRUS, PUBLICADOR_CONVOCATORIAS, RELOJ_CONVOCATORIAS, type RelojConvocatorias } from './application/puertos';
import { AdmisionServicio } from './application/admision/admision.servicio';
import { crearAlmacenamientoDocumentos } from './infrastructure/almacenamiento.factory';
import { AutorizacionConvocatoriasDevAdapter } from './infrastructure/autorizacion-dev.adapter';
import { ConsumidoresConvocatorias } from './infrastructure/consumidores.pgboss';
import { crearEscanerAntivirus } from './infrastructure/escaner.factory';
import { ConvocatoriasGuard } from './interface/convocatorias.guard';
import { AdmisionController } from './interface/admision.controller';
import { PostulacionesController } from './interface/postulaciones.controller';
import { PostulacionesPrismaRepository } from './infrastructure/postulaciones-prisma.repository';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PublicadorPgBossConvocatorias } from './infrastructure/publicador.pgboss';
import { DatosModule } from '../../common/datos/datos.module';

function relojDelEntorno(): RelojConvocatorias {
  const fija = process.env.NODE_ENV !== 'production' ? process.env.FIAVL_AHORA : undefined;
  if (fija && !Number.isNaN(Date.parse(fija))) return () => new Date(fija);
  return () => new Date();
}

/** Contexto de Convocatorias; sus proveedores se incorporan desde los adaptadores propios del módulo. */
@Module({})
export class ConvocatoriasModule {
  static registrar(opciones: { consumidores: boolean }): DynamicModule {
    const providers: Provider[] = [
      Reflector,
      { provide: RELOJ_CONVOCATORIAS, useValue: relojDelEntorno() },
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
      {
        provide: AdmisionServicio,
        inject: [PostulacionesPrismaRepository, RELOJ_CONVOCATORIAS],
        useFactory: (repo: PostulacionesPrismaRepository, reloj: RelojConvocatorias) => new AdmisionServicio(repo, reloj),
      },
      ConvocatoriasGuard,
    ];
    if (opciones.consumidores) providers.push(ConsumidoresConvocatorias);
    return {
      module: ConvocatoriasModule,
      imports: [DatosModule],
      providers,
      controllers: opciones.consumidores ? [] : ([AdmisionController, PostulacionesController] as Type[]),
      exports: [AUTORIZACION_CONVOCATORIAS, ConvocatoriasGuard, AdmisionServicio],
    };
  }
}
