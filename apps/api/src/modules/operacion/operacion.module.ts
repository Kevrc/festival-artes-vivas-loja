import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { relojDelEntorno } from '../../common/reloj';
import { AlRecibirPostulacionSeleccionada } from './application/eventos/postulacion-seleccionada';
import { FuncionesServicio } from './application/funciones/funciones.servicio';
import { GrillaDelDia } from './application/funciones/grilla-del-dia';
import { ObrasServicio } from './application/obras/obras.servicio';
import { PublicacionServicio } from './application/publicacion/publicacion.servicio';
import {
  AUDITORIA_OPERACION,
  type AuditoriaOperacion,
  MANEJADORES_OPERACION,
  PUBLICADOR_OPERACION,
  type PublicadorOperacion,
  RELOJ_OPERACION,
  type RelojOperacion,
  REPOSITORIO_OPERACION,
  type RepositorioOperacion,
} from './application/puertos';
import { ConsumidoresOperacion } from './infrastructure/consumidores.pgboss';
import { AuditoriaPrismaOperacion, procesarUnaVezOperacion } from './infrastructure/persistencia.prisma';
import { PrismaOperacionRepository } from './infrastructure/prisma-operacion.repository';
import { PublicadorPgBossOperacion } from './infrastructure/publicador.pgboss';
import { CONTROLADORES_OPERACION } from './interface';

/**
 * Módulo Operación (spec 004, Parte A): ediciones, sedes, obras, funciones, incidencias y
 * estadísticas. Esquema `operacion` propio. En el API sirve HTTP; en el worker consume eventos.
 * La autorización usa el contrato IDENTIDAD_PUBLICA que ofrece el módulo Identidad (global).
 */
@Module({})
export class OperacionModule {
  static registrar(opciones: { consumidores: boolean }): DynamicModule {
    const providers: Provider[] = [
      { provide: RELOJ_OPERACION, useValue: relojDelEntorno() },
      PublicadorPgBossOperacion,
      { provide: PUBLICADOR_OPERACION, useExisting: PublicadorPgBossOperacion },
      { provide: AUDITORIA_OPERACION, inject: [PrismaService], useFactory: (db: PrismaService) => new AuditoriaPrismaOperacion(db) },
      { provide: REPOSITORIO_OPERACION, inject: [PrismaService], useFactory: (db: PrismaService) => new PrismaOperacionRepository(db) },
      {
        provide: FuncionesServicio,
        inject: [REPOSITORIO_OPERACION, AUDITORIA_OPERACION],
        useFactory: (r: RepositorioOperacion, a: AuditoriaOperacion) => new FuncionesServicio(r, a),
      },
      { provide: GrillaDelDia, inject: [REPOSITORIO_OPERACION], useFactory: (r: RepositorioOperacion) => new GrillaDelDia(r) },
      {
        provide: ObrasServicio,
        inject: [REPOSITORIO_OPERACION, AUDITORIA_OPERACION],
        useFactory: (r: RepositorioOperacion, a: AuditoriaOperacion) => new ObrasServicio(r, a),
      },
      {
        provide: PublicacionServicio,
        inject: [REPOSITORIO_OPERACION, PUBLICADOR_OPERACION, AUDITORIA_OPERACION, RELOJ_OPERACION],
        useFactory: (r: RepositorioOperacion, pub: PublicadorOperacion, a: AuditoriaOperacion, reloj: RelojOperacion) =>
          new PublicacionServicio(r, pub, a, reloj),
      },
      // Consumidores de eventos de otros módulos; cada historia añade los suyos.
      {
        provide: MANEJADORES_OPERACION,
        inject: [PrismaService, REPOSITORIO_OPERACION, AUDITORIA_OPERACION],
        useFactory: (db: PrismaService, r: RepositorioOperacion, a: AuditoriaOperacion) => {
          const unaVez = (e: { id: string; tipo: string }, fn: () => Promise<void>) => procesarUnaVezOperacion(db, e, fn);
          return [new AlRecibirPostulacionSeleccionada(r, a, unaVez)];
        },
      },
    ];
    if (opciones.consumidores) providers.push(ConsumidoresOperacion);
    return {
      module: OperacionModule,
      providers,
      controllers: opciones.consumidores ? [] : (CONTROLADORES_OPERACION as Type[]),
      exports: [MANEJADORES_OPERACION, REPOSITORIO_OPERACION],
    };
  }
}
