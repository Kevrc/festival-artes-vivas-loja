/**
 * Simula los eventos que consumen Operación e Identidad (spec 004) mientras sus productores no los
 * publiquen: los de Convocatorias (003) y las alertas de Boletería (002). Requiere el worker en
 * marcha. Script propio de 004 para no cambiar `emitir-evento.ts` de 001 y 002.
 *
 *   pnpm events:emit:004 postulacion-seleccionada [--titulo "Obra"] [--elenco "Elenco"] [--pais Chile]
 *   pnpm events:emit:004 seleccion-desistida --obra <obraId> --postulacion <postulacionId>
 *   pnpm events:emit:004 resultado-publicado --cuenta <cuentaId> [--resultado seleccionada]
 *   pnpm events:emit:004 postulacion-enviada --cuenta <cuentaId>
 *   pnpm events:emit:004 subsanacion-solicitada --cuenta <cuentaId> [--detalle "Adjunte el dossier"]
 *   pnpm events:emit:004 aforo-excedido --funcion <funcionId> --sede <sedeId> [--aforo 300 --activas 320]
 *   pnpm events:emit:004 conflicto-de-ingreso --funcion <funcionId> --sede <sedeId>
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import {
  AforoExcedido,
  ConflictoDeIngreso,
  PostulacionSeleccionada,
  ResultadoPublicado,
  SeleccionDesistida,
  colaDe,
} from '@fiavl/contracts';
import PgBoss from 'pg-boss';
import { EDICION_2026 } from '../prisma/seed/edicion-2026';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    titulo: { type: 'string', default: 'Obra seleccionada de prueba' },
    elenco: { type: 'string', default: 'Elenco de convocatoria' },
    pais: { type: 'string', default: 'Ecuador' },
    obra: { type: 'string' },
    postulacion: { type: 'string' },
    cuenta: { type: 'string' },
    resultado: { type: 'string', default: 'seleccionada' },
    detalle: { type: 'string', default: 'Adjunte el dossier legible' },
    funcion: { type: 'string' },
    sede: { type: 'string' },
    aforo: { type: 'string', default: '300' },
    activas: { type: 'string', default: '320' },
  },
});

const requerido = (v: string | undefined, nombre: string) => {
  if (!v) throw new Error(`Falta --${nombre}`);
  return v;
};
const meta = () => ({
  id: randomUUID(),
  version: 1 as const,
  ocurridoEn: new Date().toISOString(),
  edicionId: EDICION_2026,
  correlacionId: randomUUID(),
});
const postulacion = () => ({
  postulacionId: values.postulacion ?? randomUUID(),
  convocatoriaId: randomUUID(),
  cuentaPostulanteId: values.cuenta ?? randomUUID(),
  numero: `FIAVL-2026-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
});

/** [destino, evento]. Los de 003 que ya existen en su rama se construyen con su misma forma. */
const eventos: Record<string, () => [string, { id: string; tipo: string }]> = {
  'postulacion-seleccionada': () => [
    'operacion',
    PostulacionSeleccionada.parse({
      ...meta(),
      tipo: 'PostulacionSeleccionada',
      datos: {
        ...postulacion(),
        componente: 'nacional',
        obra: {
          id: randomUUID(), titulo: values.titulo, sinopsis: 'Seleccionada en convocatoria', disciplina: 'teatro', duracionMin: 60,
          edadMinima: 0, imagenes: [], fichaArtistica: [{ rol: 'Compañía', nombre: values.elenco }],
          fichaTecnica: { montajeMin: 30, desmontajeMin: 20, requerimientos: ['Piso de madera', 'Sonido estéreo'] },
        },
        elenco: { id: randomUUID(), nombre: values.elenco, pais: values.pais },
      },
    }),
  ],
  'seleccion-desistida': () => [
    'operacion',
    SeleccionDesistida.parse({
      ...meta(),
      tipo: 'SeleccionDesistida',
      datos: { ...postulacion(), postulacionId: requerido(values.postulacion, 'postulacion'), obraId: requerido(values.obra, 'obra'), motivo: 'Simulación' },
    }),
  ],
  'resultado-publicado': () => [
    'identidad',
    ResultadoPublicado.parse({
      ...meta(),
      tipo: 'ResultadoPublicado',
      datos: { ...postulacion(), cuentaPostulanteId: requerido(values.cuenta, 'cuenta'), resultado: values.resultado },
    }),
  ],
  // Forma de `packages/contracts/src/eventos/convocatorias.ts` en la rama 003 (aún no en main).
  'postulacion-enviada': () => [
    'identidad',
    { ...meta(), tipo: 'PostulacionEnviada', datos: { ...postulacion(), cuentaPostulanteId: requerido(values.cuenta, 'cuenta'), enviadaEn: new Date().toISOString() } },
  ],
  'subsanacion-solicitada': () => [
    'identidad',
    {
      ...meta(),
      tipo: 'SubsanacionSolicitada',
      datos: {
        ...postulacion(), cuentaPostulanteId: requerido(values.cuenta, 'cuenta'), detalle: values.detalle,
        venceEn: new Date(Date.now() + 72 * 3_600_000).toISOString(),
      },
    },
  ],
  'aforo-excedido': () => {
    const aforo = Number(values.aforo);
    const activas = Number(values.activas);
    return [
      'operacion',
      AforoExcedido.parse({
        ...meta(),
        tipo: 'AforoExcedido',
        datos: { funcionId: requerido(values.funcion, 'funcion'), sedeId: requerido(values.sede, 'sede'), aforoHabilitado: aforo, entradasActivas: activas, exceso: activas - aforo },
      }),
    ];
  },
  'conflicto-de-ingreso': () => [
    'operacion',
    ConflictoDeIngreso.parse({
      ...meta(),
      tipo: 'ConflictoDeIngreso',
      datos: {
        entradaId: randomUUID(), funcionId: requerido(values.funcion, 'funcion'), sedeId: requerido(values.sede, 'sede'),
        primerDispositivoId: 'validador-1', segundoDispositivoId: 'validador-2', detectadoEn: new Date().toISOString(),
      },
    }),
  ],
};

const tipo = positionals[0];
const crear = tipo ? eventos[tipo] : undefined;
if (!crear) throw new Error(`Uso: pnpm events:emit:004 <tipo> [...]. Tipos: ${Object.keys(eventos).join(', ')}`);
const [destino, evento] = crear();

const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: 'pgboss' });
await boss.start();
const cola = colaDe(destino, evento.tipo);
await boss.createQueue(cola);
await boss.send(cola, evento);
console.log(`Publicado ${evento.tipo} (${evento.id}) en ${cola}`);
console.log(JSON.stringify(evento, null, 2));
await boss.stop({ graceful: true });
