import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, test } from '@playwright/test';
import { idDe, sinViolacionesAxe } from './ayuda';
import { API, EDICION_2026 as EDICION, IMAGEN_PRUEBA as IMAGEN, abrirDb, hayWorker } from './ayuda-operacion';

/**
 * T059 · US3 — reprogramar por lluvia (con el aviso de exceso de aforo), cancelar y ver el cambio en
 * la cartelera, con axe. El 22 de noviembre es futuro con el reloj de CI (14/11) y con el real.
 * Las funciones de la prueba quedan canceladas (libres de agenda): el historial es de solo inserción.
 */
const NACIONAL = idDe('sede:nacional');
const BOLIVAR = idDe('sede:bolivar');
const PROGRAMADOR = { 'x-cuenta-dev': '00000000-0000-4000-8000-0000000000e4', 'x-roles-dev': 'programador' };
const CASOS = { escritorio: { hora: '10', nueva: '11' }, movil: { hora: '14', nueva: '15' } } as const;

/** Obra de la prueba (se reutiliza entre ejecuciones) y una función publicada nueva. */
async function funcionPublicada(request: APIRequestContext, titulo: string, inicio: string) {
  const r = await request.get(`${API}/api/operacion/ediciones/${EDICION}/obras?q=${encodeURIComponent(titulo)}`, { headers: PROGRAMADOR });
  const buscadas = (await r.json()) as { id: string; titulo: string }[];
  let obraId = buscadas.find((o) => o.titulo === titulo)?.id;
  if (!obraId) {
    const obra = await request.post(`${API}/api/operacion/ediciones/${EDICION}/obras`, {
      headers: PROGRAMADOR,
      data: {
        titulo, sinopsis: 'Obra de la prueba de cambios', disciplina: 'teatro', componente: 'nacional', duracionMin: 50, edadMinima: 0,
        imagenes: [IMAGEN], elenco: { nombre: `Elenco ${titulo}`, pais: 'Ecuador' },
      },
    });
    obraId = (await obra.json()).id as string;
  }
  const f = await request.post(`${API}/api/operacion/ediciones/${EDICION}/funciones`, {
    headers: PROGRAMADOR,
    data: { obraId, sedeId: NACIONAL, inicio, tipoAcceso: 'pagada', publico: 'familiar', aforoHabilitado: 700 },
  });
  expect(f.status()).toBe(201);
  const id = (await f.json()).id as string;
  const pub = await request.post(`${API}/api/operacion/funciones/${id}/publicacion`, { headers: { ...PROGRAMADOR, 'If-Match': '"1"' } });
  expect(pub.status()).toBe(200);
  return { obraId, funcionId: id };
}

test.describe('US3 · Reprogramar o cancelar funciones', () => {
  test('US3-AS1, AS2, AS3: reprogramar por lluvia confirmando el exceso, cancelar y verlo en la cartelera', async ({ page, request }, info) => {
    test.setTimeout(120_000);
    const caso = CASOS[info.project.name as keyof typeof CASOS] ?? CASOS.escritorio;
    const titulo = `Obra E2E cambios ${info.project.name}`;
    const { obraId, funcionId } = await funcionPublicada(request, titulo, `2026-11-22T${caso.hora}:00:00-05:00`);
    // Solo pruebas: 450 entradas activas en la proyección de Operación, para el aviso de exceso.
    const db = abrirDb();
    await db.$executeRawUnsafe(
      `INSERT INTO operacion.metrica_funcion (funcion_id, entradas_emitidas, actualizado_en) VALUES ($1::uuid, 450, now())
       ON CONFLICT (funcion_id) DO UPDATE SET entradas_emitidas = 450`,
      funcionId,
    );
    await db.$disconnect();

    await page.addInitScript((s) => window.localStorage.setItem('fiavl.sesion_dev_operacion', s), JSON.stringify({ cuentaId: randomUUID(), rol: 'programador' }));
    await page.goto(`/programacion/funciones/${funcionId}`);
    await expect(page.getByRole('heading', { name: titulo, level: 1 })).toBeVisible();
    await sinViolacionesAxe(page);

    const reprogramar = page.getByRole('form', { name: 'Reprogramar' });
    await reprogramar.getByLabel('Hora de inicio').fill(`${caso.nueva}:00`);
    await reprogramar.getByLabel('Sede').selectOption(BOLIVAR);
    await reprogramar.getByLabel('Motivo (obligatorio)').fill('lluvia');
    await reprogramar.getByRole('button', { name: 'Reprogramar' }).click();

    // US3-AS2: el Teatro Bolívar (400) tiene menos lugares que las 450 entradas activas.
    const dialogo = page.getByRole('dialog', { name: 'Hay más entradas que lugares' });
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toContainText('sobran 50 entradas');
    await expect(dialogo.getByRole('button', { name: 'Confirmar y reprogramar' })).toBeFocused();
    await sinViolacionesAxe(page);
    await dialogo.getByRole('button', { name: 'Confirmar y reprogramar' }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: 'Reprogramada' })).toContainText(`${caso.nueva}:00`);
    const historial = page.getByRole('region', { name: 'Historial de cambios' });
    await expect(historial).toContainText('Cambio de sede');
    await expect(historial).toContainText('motivo: lluvia');
    await expect(historial).toContainText('Exceso confirmado: 50 entradas');

    // US3-AS3: cancelar con motivo.
    const cancelar = page.getByRole('form', { name: 'Cancelar la función' });
    await cancelar.getByLabel('Motivo de la cancelación (obligatorio)').fill('Elenco enfermo');
    await cancelar.getByRole('button', { name: 'Cancelar la función' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Función cancelada' })).toBeVisible();
    await expect(page.getByText('ya no se puede reprogramar ni cancelar')).toBeVisible();
    await sinViolacionesAxe(page);

    // La ficha pública muestra la función cancelada (necesita la cola y el worker).
    if (!hayWorker()) {
      info.annotations.push({ type: 'omitido', description: 'Sin cola ni worker (NODE_ENV=test): no se comprueba la cartelera.' });
      return;
    }
    await expect(async () => {
      await page.goto(`/obras/${obraId}`);
      await expect(page.locator(`article[aria-labelledby="t-${funcionId}"]`)).toContainText('Cancelada', { timeout: 2_000 });
    }).toPass({ timeout: 60_000, intervals: [2_000] });
  });
});
