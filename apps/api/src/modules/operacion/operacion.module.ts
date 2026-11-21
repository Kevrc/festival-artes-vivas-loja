import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { relojDelEntorno } from '../../common/reloj';
import {
  AUDITORIA_OPERACION,
  MANEJADORES_OPERACION,
  PUBLICADOR_OPERACION,
  RELOJ_OPERACION,
} from './application/puertos';
import { ConsumidoresOperacion } from './infrastructure/consumidores.pgboss';
import { AuditoriaPrismaOperacion } from './infrastructure/persistencia.prisma';
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
      // Cada historia añade aquí sus consumidores de eventos (fases 3 a 12 de tasks.md).
      { provide: MANEJADORES_OPERACION, useValue: [] },
    ];
    if (opciones.consumidores) providers.push(ConsumidoresOperacion);
    return {
      module: OperacionModule,
      providers,
      controllers: opciones.consumidores ? [] : (CONTROLADORES_OPERACION as Type[]),
    };
  }
}
