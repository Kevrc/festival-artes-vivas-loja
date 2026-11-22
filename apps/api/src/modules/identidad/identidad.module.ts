import { type DynamicModule, Global, Module, type Provider, type Type } from '@nestjs/common';
import { IDENTIDAD_PUBLICA } from '@fiavl/contracts';
import { IdentidadPublicaDevProvider } from '../../common/identidad/identidad-publica.dev';
import { RequiereGuard } from '../../common/identidad/requiere.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { relojDelEntorno } from '../../common/reloj';
import {
  AUDITORIA_IDENTIDAD,
  MANEJADORES_IDENTIDAD,
  PUBLICADOR_IDENTIDAD,
  RELOJ_IDENTIDAD,
} from './application/puertos';
import { ConsumidoresIdentidad } from './infrastructure/consumidores.pgboss';
import { AuditoriaPrismaIdentidad } from './infrastructure/persistencia.prisma';
import { PublicadorPgBossIdentidad } from './infrastructure/publicador.pgboss';
import { CONTROLADORES_IDENTIDAD } from './interface';

/**
 * Módulo Identidad (spec 004, Parte B): cuentas, sesiones, roles y notificaciones. Esquema
 * `identidad` propio. Es global porque ofrece a todos los módulos el contrato IDENTIDAD_PUBLICA
 * (FR-020) y el guard `RequiereGuard`, sin que nadie importe su código.
 *
 * shortcut: hasta T075, IDENTIDAD_PUBLICA es el proveedor de desarrollo (cabeceras `x-*-dev`),
 * que falla cerrado fuera de development/test.
 */
@Global()
@Module({})
export class IdentidadModule {
  static registrar(opciones: { consumidores: boolean }): DynamicModule {
    const providers: Provider[] = [
      { provide: RELOJ_IDENTIDAD, useValue: relojDelEntorno() },
      { provide: IDENTIDAD_PUBLICA, useFactory: () => new IdentidadPublicaDevProvider() },
      PublicadorPgBossIdentidad,
      { provide: PUBLICADOR_IDENTIDAD, useExisting: PublicadorPgBossIdentidad },
      { provide: AUDITORIA_IDENTIDAD, inject: [PrismaService], useFactory: (db: PrismaService) => new AuditoriaPrismaIdentidad(db) },
      { provide: MANEJADORES_IDENTIDAD, useValue: [] },
    ];
    // El guard es de HTTP: el worker (sin controladores) no lo necesita ni tiene Reflector propio.
    if (opciones.consumidores) providers.push(ConsumidoresIdentidad);
    else providers.push(RequiereGuard);
    return {
      module: IdentidadModule,
      global: true,
      providers,
      controllers: opciones.consumidores ? [] : (CONTROLADORES_IDENTIDAD as Type[]),
      exports: opciones.consumidores ? [IDENTIDAD_PUBLICA] : [IDENTIDAD_PUBLICA, RequiereGuard],
    };
  }
}
