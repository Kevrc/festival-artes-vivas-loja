import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  LECTURA_CARTELERA,
  RELOJ,
  REPOSITORIO_CARTELERA,
  REVALIDADOR,
  type Reloj,
  type RepositorioCartelera,
  type Revalidador,
} from './application/puertos';
import { ConsultasDia } from './application/consultas/consultas-dia';
import { ConsultasFichas } from './application/consultas/consultas-fichas';
import { AplicarEvento } from './application/proyeccion/aplicar-evento';
import { ConsumidoresCartelera } from './infrastructure/consumidores.pgboss';
import { PrismaCarteleraLectura } from './infrastructure/prisma-cartelera.lectura';
import { PrismaCarteleraRepository } from './infrastructure/prisma-cartelera.repository';
import { PrismaFavoritosRepository } from './infrastructure/prisma-favoritos.repository';
import { RevalidadorNext } from './infrastructure/revalidador-next';
import { CONTROLADORES } from './interface';

/**
 * shortcut: FIAVL_AHORA fija la hora solo fuera de producción, para la demo y las pruebas E2E
 * (p. ej. 2026-11-14T12:00:00-05:00). En producción siempre es la hora real.
 */
function relojDelEntorno(): Reloj {
  const fija = process.env.NODE_ENV !== 'production' ? process.env.FIAVL_AHORA : undefined;
  if (fija && !Number.isNaN(Date.parse(fija))) return () => new Date(fija);
  return () => new Date();
}

/** Módulo Programación (spec 001). En el API sirve la cartelera; en el worker consume eventos. */
@Module({})
export class ProgramacionModule {
  static registrar(opciones: { consumidores: boolean }): DynamicModule {
    const providers: Provider[] = [
      PrismaService,
      { provide: RELOJ, useValue: relojDelEntorno() },
      { provide: REPOSITORIO_CARTELERA, inject: [PrismaService], useFactory: (db: PrismaService) => new PrismaCarteleraRepository(db) },
      { provide: LECTURA_CARTELERA, inject: [PrismaService], useFactory: (db: PrismaService) => new PrismaCarteleraLectura(db) },
      { provide: REVALIDADOR, useFactory: () => new RevalidadorNext() },
      {
        provide: ConsultasDia,
        inject: [LECTURA_CARTELERA, RELOJ],
        useFactory: (l: PrismaCarteleraLectura, r: Reloj) => new ConsultasDia(l, r),
      },
      {
        provide: ConsultasFichas,
        inject: [LECTURA_CARTELERA, RELOJ],
        useFactory: (l: PrismaCarteleraLectura, r: Reloj) => new ConsultasFichas(l, r),
      },
      { provide: PrismaFavoritosRepository, inject: [PrismaService], useFactory: (db: PrismaService) => new PrismaFavoritosRepository(db) },
      {
        provide: AplicarEvento,
        inject: [REPOSITORIO_CARTELERA, REVALIDADOR],
        useFactory: (repo: RepositorioCartelera, rev: Revalidador) => new AplicarEvento(repo, rev),
      },
    ];
    if (opciones.consumidores) providers.push(ConsumidoresCartelera);
    return {
      module: ProgramacionModule,
      providers,
      controllers: opciones.consumidores ? [] : (CONTROLADORES as Type[]),
      exports: [AplicarEvento],
    };
  }
}
