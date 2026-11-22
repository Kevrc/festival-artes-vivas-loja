import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { relojDelEntorno } from '../../common/reloj';
import { CambiosServicio } from './application/cambios/cambios.servicio';
import { AlRecibirEntradasEmitidas, AlRecibirIngresoRegistrado, AlRecibirPedidoReembolsado } from './application/eventos/proyeccion-boleteria';
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
  REPOSITORIO_ESTADISTICAS,
  REPOSITORIO_INCIDENCIAS,
  REPOSITORIO_MAESTROS,
  type RepositorioMaestros,
  REPOSITORIO_OPERACION,
  type RepositorioEstadisticas,
  type RepositorioIncidencias,
  type RepositorioOperacion,
} from './application/puertos';
import { AlRecibirAforoExcedido, AlRecibirConflictoDeIngreso, AlRecibirSeleccionDesistida } from './application/eventos/alertas';
import { EstadisticasServicio } from './application/estadisticas/estadisticas.servicio';
import { MaestrosServicio } from './application/maestros/maestros.servicio';
import { PrismaMaestrosRepository } from './infrastructure/prisma-maestros.repository';
import { IncidenciasServicio } from './application/incidencias/incidencias.servicio';
import { PrismaEstadisticasRepository } from './infrastructure/prisma-estadisticas.repository';
import { PrismaIncidenciasRepository } from './infrastructure/prisma-incidencias.repository';
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
        inject: [REPOSITORIO_OPERACION, AUDITORIA_OPERACION, PUBLICADOR_OPERACION, RELOJ_OPERACION],
        useFactory: (r: RepositorioOperacion, a: AuditoriaOperacion, pub: PublicadorOperacion, reloj: RelojOperacion) =>
          new FuncionesServicio(r, a, pub, reloj),
      },
      {
        provide: CambiosServicio,
        inject: [REPOSITORIO_OPERACION, PUBLICADOR_OPERACION, AUDITORIA_OPERACION, RELOJ_OPERACION],
        useFactory: (r: RepositorioOperacion, pub: PublicadorOperacion, a: AuditoriaOperacion, reloj: RelojOperacion) =>
          new CambiosServicio(r, pub, a, reloj),
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
      { provide: REPOSITORIO_MAESTROS, inject: [PrismaService], useFactory: (db: PrismaService) => new PrismaMaestrosRepository(db) },
      {
        provide: MaestrosServicio,
        inject: [REPOSITORIO_OPERACION, REPOSITORIO_MAESTROS, PUBLICADOR_OPERACION, AUDITORIA_OPERACION, RELOJ_OPERACION],
        useFactory: (r: RepositorioOperacion, m: RepositorioMaestros, pub: PublicadorOperacion, a: AuditoriaOperacion, reloj: RelojOperacion) => new MaestrosServicio(r, m, pub, a, reloj),
      },
      { provide: REPOSITORIO_ESTADISTICAS, inject: [PrismaService], useFactory: (db: PrismaService) => new PrismaEstadisticasRepository(db) },
      {
        provide: EstadisticasServicio,
        inject: [REPOSITORIO_OPERACION, REPOSITORIO_ESTADISTICAS, AUDITORIA_OPERACION, RELOJ_OPERACION],
        useFactory: (r: RepositorioOperacion, e: RepositorioEstadisticas, a: AuditoriaOperacion, reloj: RelojOperacion) => new EstadisticasServicio(r, e, a, reloj),
      },
      { provide: REPOSITORIO_INCIDENCIAS, inject: [PrismaService], useFactory: (db: PrismaService) => new PrismaIncidenciasRepository(db) },
      {
        provide: IncidenciasServicio,
        inject: [REPOSITORIO_OPERACION, REPOSITORIO_INCIDENCIAS, AUDITORIA_OPERACION, RELOJ_OPERACION],
        useFactory: (r: RepositorioOperacion, i: RepositorioIncidencias, a: AuditoriaOperacion, reloj: RelojOperacion) => new IncidenciasServicio(r, i, a, reloj),
      },
      {
        provide: MANEJADORES_OPERACION,
        inject: [PrismaService, REPOSITORIO_OPERACION, AUDITORIA_OPERACION, REPOSITORIO_INCIDENCIAS],
        useFactory: (db: PrismaService, r: RepositorioOperacion, a: AuditoriaOperacion, inc: RepositorioIncidencias) => {
          const unaVez = (e: { id: string; tipo: string }, fn: () => Promise<void>) => procesarUnaVezOperacion(db, e, fn);
          return [
            new AlRecibirPostulacionSeleccionada(r, a, unaVez),
            new AlRecibirEntradasEmitidas(r, unaVez),
            new AlRecibirPedidoReembolsado(r, unaVez),
            new AlRecibirIngresoRegistrado(r, unaVez),
            new AlRecibirAforoExcedido({ repo: r, incidencias: inc, auditoria: a, unaVez }),
            new AlRecibirConflictoDeIngreso({ repo: r, incidencias: inc, auditoria: a, unaVez }),
            new AlRecibirSeleccionDesistida({ repo: r, incidencias: inc, auditoria: a, unaVez }),
          ];
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
