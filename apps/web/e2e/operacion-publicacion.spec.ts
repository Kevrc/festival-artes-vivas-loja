import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { type APIRequestContext, expect, test } from '@playwright/test';
import { idDe, sinViolacionesAxe } from './ayuda';

/**
 * T050 · US2 — corregir los errores de publicación, publicar y ver la función en la cartelera en
 * menos de 1 minuto (SC-003), con axe. Requiere API, worker y web en marcha (quickstart.md).
 * Cada proyecto usa su propia obra y su propio día en el Teatro Segundo Cueva Celi.
 */
const API = process.env.API_URL ?? 'http://localhost:4000';
const EDICION = idDe('edicion-2026');
const CUEVA = idDe('sede:cueva');
const PROGRAMADOR = { 'x-cuenta-dev': '00000000-0000-4000-8000-0000000000e3', 'x-roles-dev': 'programador' };
/** Imagen mínima en línea: la publicación exige al menos una imagen por obra (R4). */
const IMAGEN = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"><rect width="4" height="3" fill="#a3201c"/></svg>')}`;
const DIAS = { escritorio: '2026-11-16', movil: '2026-11-19' } as const;

interface Db {
  $executeRawUnsafe(sql: string, ...valores: unknown[]): Promise<number>;
  $disconnect(): Promise<void>;
}
function abrirDb(): Db {
  const req = createRequire(import.meta.url);
  const raiz = resolve(import.meta.dirname, '../../..');
  const env = resolve(raiz, '.env');
  const url =
    process.env.DATABASE_URL ??
    (existsSync(env) ? readFileSync(env, 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='))?.slice(13).trim() : undefined) ??
    'postgresql://fiavl:fiavl@localhost:5433/fiavl';
  const { PrismaClient } = req(resolve(raiz, 'apps/api/src/generated/prisma/index.js')) as { PrismaClient: new (o: unknown) => Db };
  return new PrismaClient({ datasources: { db: { url } } });
}

/** Solo pruebas: borra la obra de la prueba y lo que generó en Operación, Cartelera y Boletería. */
async function limpiar(db: Db, obraId: string) {
  const sql = [
    `DELETE FROM boleteria.inventario_funcion WHERE obra_id = $1::uuid`,
    `DELETE FROM programacion.funcion_cartelera WHERE obra_id = $1::uuid`,
    `DELETE FROM programacion.obra_cartelera WHERE id = $1::uuid`,
    `DELETE FROM operacion.funcion WHERE obra_id = $1::uuid`,
    `DELETE FROM operacion.obra WHERE id = $1::uuid`,
  ];
  for (const s of sql) await db.$executeRawUnsafe(s, obraId).catch(() => 0);
}

async function prepararBorrador(request: APIRequestContext, titulo: string, dia: string) {
  const obra = await request.post(`${API}/api/operacion/ediciones/${EDICION}/obras`, {
    headers: PROGRAMADOR,
    data: {
      titulo, sinopsis: 'Obra creada por la prueba de publicación', disciplina: 'teatro', componente: 'nacional', duracionMin: 60, edadMinima: 0,
      imagenes: [IMAGEN], elenco: { nombre: `Elenco ${titulo}`, pais: 'Ecuador' },
    },
  });
  expect(obra.status()).toBe(201);
  const obraId = (await obra.json()).id as string;
  // Borrador sin tipo de acceso: bloquea la publicación (US2-AS2).
  const f = await request.post(`${API}/api/operacion/ediciones/${EDICION}/funciones`, {
    headers: PROGRAMADOR,
    data: { obraId, sedeId: CUEVA, inicio: `${dia}T20:00:00-05:00`, publico: 'familiar', aforoHabilitado: null, tipoAcceso: null },
  });
  expect(f.status()).toBe(201);
  return { obraId, funcionId: (await f.json()).id as string };
}

test.describe('US2 · Publicar la programación', () => {
  test('US2-AS2, US2-AS3: el error se lista enlazado, se corrige, se publica y aparece en la cartelera', async ({ page, request }, info) => {
    test.setTimeout(120_000);
    const dia = DIAS[info.project.name as keyof typeof DIAS] ?? DIAS.escritorio;
    const titulo = `Obra E2E publicación ${info.project.name}`;
    const db = abrirDb();
    await db.$executeRawUnsafe(`SELECT 1`);
    const previa = await request.get(`${API}/api/operacion/ediciones/${EDICION}/obras?q=${encodeURIComponent(titulo)}&incluirDesistidas=true`, { headers: PROGRAMADOR });
    for (const o of (await previa.json()) as { id: string }[]) await limpiar(db, o.id);
    const { obraId, funcionId } = await prepararBorrador(request, titulo, dia);

    try {
      await page.addInitScript((sesion) => window.localStorage.setItem('fiavl.sesion_dev_operacion', sesion), JSON.stringify({ cuentaId: randomUUID(), rol: 'programador' }));

      // 1. La validación lista el error, enlazado a la función, y bloquea "Publicar".
      await page.goto('/programacion/publicar');
      const enlace = page.getByRole('link', { name: new RegExp(`${titulo}.*falta el tipo de acceso`) });
      await expect(enlace).toBeVisible();
      await expect(page.getByRole('button', { name: 'Publicar', exact: true })).toBeDisabled();
      await sinViolacionesAxe(page);

      // 2. El enlace abre la grilla en ese día con la función elegida; se corrige.
      await enlace.click();
      const formulario = page.getByRole('form', { name: `Editar: ${titulo}` });
      await expect(formulario).toBeVisible();
      await formulario.getByLabel('Tipo de acceso').selectOption('pagada');
      await formulario.getByLabel('Aforo habilitado').fill('300');
      await formulario.getByRole('button', { name: 'Guardar cambios' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Guardada en borrador' })).toBeVisible();

      // 3. Sin errores para esta función: con la edición ya publicada se publica sola (US2-AS3).
      await page.goto('/programacion/publicar');
      await expect(page.getByRole('heading', { name: 'Publicar la programación' })).toBeVisible();
      await expect(page.getByRole('link', { name: new RegExp(titulo) })).toHaveCount(0);
      await page.goto(`/programacion?funcion=${funcionId}`);
      await page.getByRole('form', { name: `Editar: ${titulo}` }).getByRole('button', { name: 'Publicar esta función' }).click();
      await expect(page.getByRole('status').filter({ hasText: `Publicada: ${titulo}` })).toBeVisible();
      await sinViolacionesAxe(page);

      // 4. SC-003: la ficha pública de la obra la muestra en menos de 1 minuto.
      await expect(async () => {
        await page.goto(`/obras/${obraId}`);
        await expect(page.getByRole('heading', { name: titulo, level: 1 })).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 60_000, intervals: [2_000] });
    } finally {
      await limpiar(db, obraId);
      await db.$disconnect();
    }
  });
});
