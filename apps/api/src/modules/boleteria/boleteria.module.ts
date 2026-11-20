import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CancelacionesServicios } from './application/cancelaciones/cancelaciones-servicios';
import { CrearPedidoPagado } from './application/compras/crear-pedido-pagado';
import {
  ConciliarPagosPendientes,
  ExpirarRetenciones,
  ProcesarWebhookPago,
  ReenviarEntradasCorreo,
} from './application/compras/procesar-webhook';
import { ConsultasBoleteria } from './application/consultas/disponibilidad';
import { ConsultarOcupacionEnVivo } from './application/consultas/ocupacion';
import { AplicarEventoOperacion } from './application/eventos/aplicar-evento-operacion';
import {
  AUTORIZACION_BOLETERIA,
  LLAVES_QR,
  PROVEEDOR_PAGOS,
  PUBLICADOR_BOLETERIA,
  type PublicadorEventosBoleteria,
  RELOJ_BOLETERIA,
  REPOSITORIO_BOLETERIA,
  type RelojBoleteria,
  type RepositorioBoleteria,
} from './application/puertos';
import {
  CancelarReserva,
  CrearReservaGratuita,
  LiberarReservasNoValidadas,
} from './application/reservas/reservas-servicios';
import { TaquillaServicios } from './application/taquilla/taquilla-servicios';
import { ValidadorServicios } from './application/validador/validador-servicios';
import { obtenerLlavesQr } from './domain/firma-qr';
import { AutorizacionDevAdapter } from './infrastructure/autorizacion-dev.adapter';
import { ConsumidoresBoleteria } from './infrastructure/consumidores.pgboss';
import { PayPhonePagosAdapter } from './infrastructure/pagos-payphone.adapter';
import { SimuladorPagosAdapter } from './infrastructure/pagos-simulador.adapter';
import { PrismaBoleteriaRepository } from './infrastructure/prisma-boleteria.repository';
import { PublicadorPgBossBoleteria } from './infrastructure/publicador.pgboss';
import { CONTROLADORES_BOLETERIA } from './interface';
import { elegirProveedorPagos } from './infrastructure/pagos-config';
import { BoleteriaGuard } from './interface/boleteria.guard';

function relojDelEntorno(): RelojBoleteria {
  const fija = process.env.NODE_ENV !== 'production' ? process.env.FIAVL_AHORA : undefined;
  if (fija && !Number.isNaN(Date.parse(fija))) return () => new Date(fija);
  return () => new Date();
}

@Module({})
export class BoleteriaModule {
  static registrar(opciones: { consumidores: boolean }): DynamicModule {
    const usaPayPhone = elegirProveedorPagos() === 'payphone';
    const providers: Provider[] = [
      PrismaService,
      { provide: RELOJ_BOLETERIA, useValue: relojDelEntorno() },
      { provide: LLAVES_QR, useFactory: () => obtenerLlavesQr() },
      {
        provide: REPOSITORIO_BOLETERIA,
        inject: [PrismaService],
        useFactory: (db: PrismaService) => new PrismaBoleteriaRepository(db),
      },
      {
        provide: PROVEEDOR_PAGOS,
        useClass: usaPayPhone ? PayPhonePagosAdapter : SimuladorPagosAdapter,
      },
      PublicadorPgBossBoleteria,
      { provide: PUBLICADOR_BOLETERIA, useExisting: PublicadorPgBossBoleteria },
      { provide: AUTORIZACION_BOLETERIA, useClass: AutorizacionDevAdapter },
      BoleteriaGuard,
      {
        provide: AplicarEventoOperacion,
        inject: [REPOSITORIO_BOLETERIA, PUBLICADOR_BOLETERIA, RELOJ_BOLETERIA],
        useFactory: (
          repo: RepositorioBoleteria,
          publicador: PublicadorEventosBoleteria,
          reloj: RelojBoleteria,
        ) => new AplicarEventoOperacion(repo, publicador, reloj),
      },
      ConsultasBoleteria,
      ConsultarOcupacionEnVivo,
      CrearPedidoPagado,
      ProcesarWebhookPago,
      ExpirarRetenciones,
      ConciliarPagosPendientes,
      ReenviarEntradasCorreo,
      CrearReservaGratuita,
      CancelarReserva,
      LiberarReservasNoValidadas,
      TaquillaServicios,
      ValidadorServicios,
      CancelacionesServicios,
    ];
    if (opciones.consumidores) providers.push(ConsumidoresBoleteria);
    return {
      module: BoleteriaModule,
      providers,
      controllers: opciones.consumidores ? [] : (CONTROLADORES_BOLETERIA as Type[]),
      exports: [
        AplicarEventoOperacion,
        ExpirarRetenciones,
        LiberarReservasNoValidadas,
        CancelacionesServicios,
        ConciliarPagosPendientes,
      ],
    };
  }
}
