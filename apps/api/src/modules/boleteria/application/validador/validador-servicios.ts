import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { evaluarEscaneoEntrada } from '../../domain/evaluador-ingreso';
import { type ParLlavesQr, normalizarCodigoCorto, verificarTokenQr } from '../../domain/firma-qr';
import {
  boleteriaConflictosIngresoTotal,
  boleteriaLatenciaOperacion,
  boleteriaValidacionesTotal,
} from '../../infrastructure/metricas-boleteria';
import { verificarAlcanceSede } from '../../interface/boleteria.guard';
import { publicarConflictoDeIngreso, publicarIngresoRegistrado } from '../eventos/helpers-eventos';
import {
  type ContextoUsuario,
  LLAVES_QR,
  PUBLICADOR_BOLETERIA,
  type PublicadorEventosBoleteria,
  RELOJ_BOLETERIA,
  REPOSITORIO_BOLETERIA,
  type RelojBoleteria,
  type RepositorioBoleteria,
} from '../puertos';

const SESENTA_MINUTOS_MS = 60 * 60_000;

@Injectable()
export class ValidadorServicios {
  constructor(
    @Inject(REPOSITORIO_BOLETERIA) private readonly repo: RepositorioBoleteria,
    @Inject(PUBLICADOR_BOLETERIA) private readonly publicador: PublicadorEventosBoleteria,
    @Inject(RELOJ_BOLETERIA) private readonly reloj: RelojBoleteria,
    @Inject(LLAVES_QR) private readonly llaves: ParLlavesQr,
  ) {}

  async descargarPaquete(funcionId: string, usuario: ContextoUsuario) {
    const fn = await this.repo.obtenerFuncionConEdicion(funcionId);
    if (!fn) throw new NotFoundException('Función no encontrada.');
    verificarAlcanceSede(usuario, ['validador', 'jefe_sala'], fn.sedeId);

    const entradas = await this.repo.listarEntradasParaPaquete(funcionId);
    const ahora = this.reloj();

    return {
      funcionId: fn.funcionId,
      obraTitulo: fn.obraTitulo,
      sedeId: fn.sedeId,
      sedeNombre: fn.sedeNombre,
      inicio: fn.inicio.toISOString(),
      fin: fn.fin.toISOString(),
      ventanaInicio: new Date(fn.inicio.getTime() - SESENTA_MINUTOS_MS).toISOString(),
      llavePublicaEd25519Spki: this.llaves.publicaSpkiBase64,
      horaServidor: ahora.toISOString(),
      entradas: entradas.map((e) => ({
        id: e.id,
        codigoCorto: e.codigoCorto,
        estado: e.estado,
        usadaEn: e.usadaEn ? e.usadaEn.toISOString() : null,
        puerta: e.puerta,
        dispositivoId: e.dispositivoId,
      })),
    };
  }

  async validarEnLinea(p: {
    usuario: ContextoUsuario;
    funcionId: string;
    tokenQr?: string;
    codigoCorto?: string;
    dispositivoId: string;
    puerta: string;
    correlacionId?: string;
  }) {
    const finTimer = boleteriaLatenciaOperacion.startTimer({ operacion: 'validar_en_linea' });
    const correlacionId = p.correlacionId ?? randomUUID();
    const ahora = this.reloj();

    try {
      if (!p.tokenQr && !p.codigoCorto) {
        throw new BadRequestException('Debes proporcionar tokenQr o codigoCorto.');
      }

      const fn = await this.repo.obtenerFuncionConEdicion(p.funcionId);
      if (!fn) throw new NotFoundException('Función no encontrada.');
      verificarAlcanceSede(p.usuario, ['validador', 'jefe_sala'], fn.sedeId);

      let firmaValida = true;
      let entradaId: string | undefined;
      if (p.tokenQr) {
        const verif = verificarTokenQr(p.tokenQr, this.llaves.publicaSpkiBase64);
        if (!verif.valido) firmaValida = false;
        else entradaId = verif.entradaId;
      }

      const encontrada = firmaValida
        ? await this.repo.buscarEntradaParaValidar(
            entradaId ? { entradaId } : { codigoCorto: normalizarCodigoCorto(p.codigoCorto!) },
          )
        : null;

      const evalRes = evaluarEscaneoEntrada({
        entrada: encontrada
          ? {
              id: encontrada.id,
              funcionId: encontrada.funcionId,
              estado: encontrada.estado,
              usadaEn: encontrada.ultimoIngreso?.escaneadoEn ?? null,
              dispositivoAnterior: encontrada.ultimoIngreso?.dispositivoId ?? null,
              puertaAnterior: encontrada.ultimoIngreso?.puerta ?? null,
              funcionCorrecta:
                encontrada.funcionId !== p.funcionId
                  ? {
                      obraTitulo: encontrada.obraTitulo,
                      sedeNombre: encontrada.sedeNombre,
                      inicio: encontrada.inicio,
                    }
                  : null,
            }
          : null,
        firmaValida,
        funcionAbiertaId: p.funcionId,
        inicioFuncion: fn.inicio,
        finFuncion: fn.fin,
        ahora,
        dispositivoId: p.dispositivoId,
      });

      if (evalRes.semaforo === 'verde' && encontrada) {
        const ing = await this.repo.registrarIngresoEnLinea({
          entradaId: encontrada.id,
          funcionId: p.funcionId,
          validadorId: p.usuario.cuentaId,
          dispositivoId: p.dispositivoId,
          puerta: p.puerta,
          escaneadoEn: ahora,
        });
        if (!ing.duplicado) {
          await publicarIngresoRegistrado(this.publicador, {
            ingresoId: ing.ingresoId,
            entradaId: encontrada.id,
            funcionId: p.funcionId,
            sedeId: fn.sedeId,
            edicionId: fn.edicionId,
            validadorId: p.usuario.cuentaId,
            escaneadoEn: ahora,
            diferido: false,
            ahora,
            correlacionId,
          });
        }
      }

      boleteriaValidacionesTotal.inc({ semaforo: evalRes.semaforo, modo: 'online' });
      return {
        semaforo: evalRes.semaforo,
        codigo: evalRes.codigo,
        mensaje: evalRes.mensaje,
        entradaId: evalRes.entradaId,
        usadaEn: evalRes.usadaEn ? evalRes.usadaEn.toISOString() : null,
        puertaAnterior: evalRes.puertaAnterior,
        funcionCorrecta: evalRes.funcionCorrecta
          ? {
              obraTitulo: evalRes.funcionCorrecta.obraTitulo,
              sedeNombre: evalRes.funcionCorrecta.sedeNombre,
              inicio: evalRes.funcionCorrecta.inicio.toISOString(),
            }
          : null,
      };
    } finally {
      finTimer();
    }
  }

  async sincronizarIngresos(p: {
    usuario: ContextoUsuario;
    ingresos: {
      entradaId: string;
      funcionId: string;
      dispositivoId: string;
      puerta: string;
      escaneadoEn: string;
      desfaseMs: number;
    }[];
    correlacionId?: string;
  }) {
    const correlacionId = p.correlacionId ?? randomUUID();
    const ahora = this.reloj();

    const sedesPorFuncion = new Map<string, string>();
    for (const item of p.ingresos) {
      if (!sedesPorFuncion.has(item.funcionId)) {
        const fn = await this.repo.obtenerFuncionConEdicion(item.funcionId);
        if (fn) {
          verificarAlcanceSede(p.usuario, ['validador', 'jefe_sala'], fn.sedeId);
          sedesPorFuncion.set(item.funcionId, fn.sedeId);
        }
      }
    }

    const corregidos = p.ingresos.map((i) => ({
      entradaId: i.entradaId,
      funcionId: i.funcionId,
      dispositivoId: i.dispositivoId,
      puerta: i.puerta,
      // Corrige un reloj local alterado sumando el desfase respecto a horaServidor (caso borde)
      escaneadoEn: new Date(Date.parse(i.escaneadoEn) + i.desfaseMs),
    }));

    const res = await this.repo.sincronizarIngresosLote({
      validadorId: p.usuario.cuentaId,
      ingresos: corregidos,
      ahora,
    });

    for (const ing of res.nuevosIngresos) {
      boleteriaValidacionesTotal.inc({ semaforo: 'verde', modo: 'offline' });
      await publicarIngresoRegistrado(this.publicador, {
        ...ing,
        diferido: true,
        ahora,
        correlacionId,
      });
    }

    for (const conf of res.conflictos) {
      boleteriaConflictosIngresoTotal.inc();
      await publicarConflictoDeIngreso(this.publicador, {
        entradaId: conf.entradaId,
        funcionId: conf.funcionId,
        sedeId: conf.sedeId,
        edicionId: conf.edicionId,
        primerDispositivoId: conf.primerDispositivoId,
        segundoDispositivoId: conf.segundoDispositivoId,
        detectadoEn: ahora,
        correlacionId,
      });
    }

    return {
      aplicados: res.aplicados,
      duplicados: res.duplicados,
      conflictos: res.conflictos.map((c) => ({
        entradaId: c.entradaId,
        primerIngresoEn: c.primerIngresoEn.toISOString(),
        puertaGanadora: c.puertaGanadora,
        mensaje: c.mensaje,
      })),
    };
  }
}
