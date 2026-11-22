import { type DynamicModule, Global, Module, type Provider, type Type } from '@nestjs/common';
import { IDENTIDAD_PUBLICA } from '@fiavl/contracts';
import { IdentidadPublicaDevProvider } from '../../common/identidad/identidad-publica.dev';
import { RequiereGuard } from '../../common/identidad/requiere.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { relojDelEntorno } from '../../common/reloj';
import { AlRecibirProgramacionPublicada } from './application/eventos/programacion-publicada';
import {
  AUDITORIA_IDENTIDAD,
  type AuditoriaIdentidad,
  LISTA_FILTRADAS,
  type ListaFiltradas,
  MANEJADORES_IDENTIDAD,
  PROVEEDOR_CORREO,
  type ProveedorCorreo,
  PUBLICADOR_IDENTIDAD,
  type PublicadorIdentidad,
  RELOJ_IDENTIDAD,
  REPOSITORIO_IDENTIDAD,
  type RelojIdentidad,
  type RepositorioIdentidad,
} from './application/puertos';
import { RegistroServicio } from './application/registro/registro.servicio';
import { correoDelEntorno } from './infrastructure/correo.adapters';
import { cargarListaFiltradas } from './infrastructure/lista-filtradas';
import { PrismaIdentidadRepository } from './infrastructure/prisma-identidad.repository';
import { ConsumidoresIdentidad } from './infrastructure/consumidores.pgboss';
import { AuditoriaPrismaIdentidad, procesarUnaVezIdentidad } from './infrastructure/persistencia.prisma';
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
      { provide: REPOSITORIO_IDENTIDAD, inject: [PrismaService], useFactory: (db: PrismaService) => new PrismaIdentidadRepository(db) },
      { provide: PROVEEDOR_CORREO, useFactory: () => correoDelEntorno() },
      { provide: LISTA_FILTRADAS, useFactory: () => cargarListaFiltradas() },
      {
        provide: RegistroServicio,
        inject: [REPOSITORIO_IDENTIDAD, PROVEEDOR_CORREO, PUBLICADOR_IDENTIDAD, AUDITORIA_IDENTIDAD, RELOJ_IDENTIDAD, LISTA_FILTRADAS],
        useFactory: (r: RepositorioIdentidad, c: ProveedorCorreo, pub: PublicadorIdentidad, a: AuditoriaIdentidad, reloj: RelojIdentidad, f: ListaFiltradas) =>
          new RegistroServicio(r, c, pub, a, reloj, f, process.env.WEB_URL ?? 'http://localhost:3100'),
      },
      // Consumidores de eventos de otros módulos; cada historia añade los suyos.
      {
        provide: MANEJADORES_IDENTIDAD,
        inject: [PrismaService, REPOSITORIO_IDENTIDAD],
        useFactory: (db: PrismaService, r: RepositorioIdentidad) => {
          const unaVez = (e: { id: string; tipo: string }, fn: () => Promise<void>) => procesarUnaVezIdentidad(db, e, fn);
          return [new AlRecibirProgramacionPublicada(r, unaVez)];
        },
      },
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
