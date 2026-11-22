import { type DynamicModule, Global, Module, type Provider, type Type } from '@nestjs/common';
import { IDENTIDAD_PUBLICA } from '@fiavl/contracts';
import { RequiereGuard } from '../../common/identidad/requiere.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { relojDelEntorno } from '../../common/reloj';
import { crearManejadoresAvisos } from './application/eventos/avisos';
import { AlRecibirProgramacionPublicada } from './application/eventos/programacion-publicada';
import { NotificacionesServicio } from './application/notificaciones/notificaciones.servicio';
import {
  AUDITORIA_IDENTIDAD,
  type AuditoriaIdentidad,
  CIFRADOR,
  COLA_NOTIFICACIONES,
  type ColaNotificaciones,
  type Cifrador,
  LISTA_FILTRADAS,
  type ListaFiltradas,
  MANEJADORES_IDENTIDAD,
  PROVEEDOR_CORREO,
  type ProveedorCorreo,
  PUBLICADOR_IDENTIDAD,
  type PublicadorIdentidad,
  RELOJ_IDENTIDAD,
  RELOJ_TOTP,
  REPOSITORIO_IDENTIDAD,
  type RelojIdentidad,
  type RepositorioIdentidad,
} from './application/puertos';
import { EstudiantesServicio } from './application/estudiantes/estudiantes.servicio';
import { MiCuentaServicio } from './application/mi-cuenta/mi-cuenta.servicio';
import { PersonalServicio } from './application/personal/personal.servicio';
import { RegistroServicio } from './application/registro/registro.servicio';
import { SegundoFactorServicio } from './application/segundo-factor/segundo-factor.servicio';
import { SesionServicio } from './application/sesion/sesion.servicio';
import { cifradorDelEntorno } from './infrastructure/cifrador-aes-gcm';
import { ColaNotificacionesPgBoss } from './infrastructure/cola-notificaciones.pgboss';
import { IdentidadPublicaSesionProvider } from './infrastructure/identidad-publica.provider';
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
 * IDENTIDAD_PUBLICA resuelve la sesión de la cookie `fiavl_sesion` (T075); solo en development/test
 * acepta además las cabeceras `x-*-dev` del proveedor de desarrollo.
 */
@Global()
@Module({})
export class IdentidadModule {
  static registrar(opciones: { consumidores: boolean }): DynamicModule {
    const providers: Provider[] = [
      { provide: RELOJ_IDENTIDAD, useValue: relojDelEntorno() },
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
      {
        provide: SesionServicio,
        inject: [REPOSITORIO_IDENTIDAD, PROVEEDOR_CORREO, AUDITORIA_IDENTIDAD, RELOJ_IDENTIDAD, LISTA_FILTRADAS],
        useFactory: (r: RepositorioIdentidad, c: ProveedorCorreo, a: AuditoriaIdentidad, reloj: RelojIdentidad, f: ListaFiltradas) =>
          new SesionServicio(r, c, a, reloj, f, process.env.WEB_URL ?? 'http://localhost:3100'),
      },
      {
        provide: MiCuentaServicio,
        inject: [REPOSITORIO_IDENTIDAD, SesionServicio, AUDITORIA_IDENTIDAD, RELOJ_IDENTIDAD, PUBLICADOR_IDENTIDAD],
        useFactory: (r: RepositorioIdentidad, s: SesionServicio, a: AuditoriaIdentidad, reloj: RelojIdentidad, p: PublicadorIdentidad) => new MiCuentaServicio(r, s, a, reloj, p),
      },
      {
        provide: EstudiantesServicio,
        inject: [REPOSITORIO_IDENTIDAD, PROVEEDOR_CORREO, AUDITORIA_IDENTIDAD, RELOJ_IDENTIDAD],
        useFactory: (r: RepositorioIdentidad, c: ProveedorCorreo, a: AuditoriaIdentidad, reloj: RelojIdentidad) =>
          new EstudiantesServicio(r, c, a, reloj, process.env.WEB_URL ?? 'http://localhost:3100'),
      },
      { provide: CIFRADOR, useFactory: () => cifradorDelEntorno() },
      { provide: RELOJ_TOTP, useValue: () => new Date() },
      {
        provide: SegundoFactorServicio,
        inject: [REPOSITORIO_IDENTIDAD, CIFRADOR, AUDITORIA_IDENTIDAD, RELOJ_IDENTIDAD, RELOJ_TOTP],
        useFactory: (r: RepositorioIdentidad, c: Cifrador, a: AuditoriaIdentidad, reloj: RelojIdentidad, totp: RelojIdentidad) =>
          new SegundoFactorServicio(r, c, a, reloj, totp),
      },
      {
        provide: PersonalServicio,
        inject: [REPOSITORIO_IDENTIDAD, PROVEEDOR_CORREO, PUBLICADOR_IDENTIDAD, AUDITORIA_IDENTIDAD, RELOJ_IDENTIDAD],
        useFactory: (r: RepositorioIdentidad, c: ProveedorCorreo, pub: PublicadorIdentidad, a: AuditoriaIdentidad, reloj: RelojIdentidad) =>
          new PersonalServicio(r, c, pub, a, reloj, process.env.WEB_URL ?? 'http://localhost:3100'),
      },
      // FR-020: sesión real de la cookie; en development/test cae a las cabeceras x-*-dev (ADR-0009).
      { provide: IDENTIDAD_PUBLICA, inject: [SesionServicio], useFactory: (s: SesionServicio) => new IdentidadPublicaSesionProvider(s) },
      // Consumidores de eventos de otros módulos; cada historia añade los suyos.
      ColaNotificacionesPgBoss,
      { provide: COLA_NOTIFICACIONES, useExisting: ColaNotificacionesPgBoss },
      {
        provide: NotificacionesServicio,
        inject: [REPOSITORIO_IDENTIDAD, COLA_NOTIFICACIONES, PROVEEDOR_CORREO, RELOJ_IDENTIDAD],
        useFactory: (r: RepositorioIdentidad, cola: ColaNotificaciones, c: ProveedorCorreo, reloj: RelojIdentidad) =>
          new NotificacionesServicio(r, cola, c, reloj, process.env.WEB_URL ?? 'http://localhost:3100'),
      },
      {
        provide: MANEJADORES_IDENTIDAD,
        inject: [PrismaService, REPOSITORIO_IDENTIDAD, NotificacionesServicio],
        useFactory: (db: PrismaService, r: RepositorioIdentidad, avisos: NotificacionesServicio) => {
          const unaVez = (e: { id: string; tipo: string }, fn: () => Promise<void>) => procesarUnaVezIdentidad(db, e, fn);
          return [new AlRecibirProgramacionPublicada(r, unaVez), ...crearManejadoresAvisos({ repo: r, avisos, unaVez })];
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
