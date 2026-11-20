import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { sinViolacionesAxe } from './ayuda';

const PDF = (nombre: string) => ({ name: nombre, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nFIAVL demo') });

test.describe('US1 · postular una propuesta', () => {
  test('US1-AS1/AS4: guarda, envía, descarga y reenvía conservando el folio', async ({ page }) => {
    const titulo = `Propuesta ${randomUUID().slice(0, 8)}`;
    await page.goto('/convocatorias');
    await expect(page.getByRole('heading', { name: 'Convocatorias abiertas' })).toBeVisible();
    await sinViolacionesAxe(page);
    await page.getByRole('link', { name: 'Ver bases y postular' }).first().click();
    await expect(page.getByRole('heading', { name: 'PN-2026' })).toBeVisible();
    await page.getByRole('link', { name: 'Iniciar postulación' }).click();

    await page.getByLabel('Nombre del elenco').fill('Colectivo E2E Loja');
    await page.getByLabel('Persona responsable').fill('Responsable E2E');
    await page.getByLabel('Correo de contacto').fill('e2e@example.ec');
    await page.getByLabel('Provincia o país').fill('Loja, Ecuador');
    await page.getByLabel('Integrantes (separados por coma)').fill('Ana, Luis');
    await page.getByLabel('Trayectoria').fill('Trayectoria de prueba del elenco');
    await page.getByLabel('Título de la obra').fill(titulo);
    await page.getByLabel('Disciplina').fill('teatro');
    await page.getByLabel('Duración en minutos').fill('55');
    await page.getByLabel('Público').fill('todo público');
    await page.getByLabel('Necesidades de montaje').fill('Espacio de 6 por 6 metros');
    await page.getByLabel('Número de integrantes en gira').fill('5');
    await page.getByLabel('Enlace de video (YouTube o Vimeo)').fill('https://youtu.be/fiavle2e');
    await page.getByLabel('Sinopsis').fill('Una propuesta escénica para Loja.');
    await page.getByLabel(/Dossier/).setInputFiles(PDF('dossier.pdf'));
    await page.getByLabel(/Ficha técnica/).setInputFiles(PDF('ficha-tecnica.pdf'));
    await page.getByRole('button', { name: 'Guardar y enviar' }).click();

    const acuse = page.getByRole('heading', { name: /^Postulación PN-/ });
    await expect(acuse).toBeVisible();
    const folio = (await acuse.textContent())?.replace('Postulación ', '');
    await expect(page.getByText('Estado: enviada')).toBeVisible();
    await expect(page.getByRole('heading', { name: titulo })).toBeVisible();
    await sinViolacionesAxe(page);

    const copia = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar copia de mi postulación' }).click();
    expect((await copia).suggestedFilename()).toContain(folio);
    const documento = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar dossier.pdf' }).click();
    expect((await documento).suggestedFilename()).toContain('dossier.pdf');

    await page.getByRole('button', { name: 'Retirar para editar' }).click();
    await expect(page.getByRole('heading', { name: 'Postular una obra' })).toBeVisible();
    await page.getByLabel('Título de la obra').fill(`${titulo} revisada`);
    await page.getByRole('button', { name: 'Guardar y enviar' }).click();
    await expect(page.getByRole('heading', { name: `Postulación ${folio}` })).toBeVisible();
    await expect(page.getByText('Estado: enviada')).toBeVisible();
  });

  test('US1-AS2: explica faltantes y mantiene el borrador', async ({ page }) => {
    await page.goto('/convocatorias');
    await page.getByRole('link', { name: 'Ver bases y postular' }).first().click();
    await page.getByRole('link', { name: 'Iniciar postulación' }).click();
    await page.getByLabel('Nombre del elenco').fill('Elenco incompleto');
    await page.getByLabel('Persona responsable').fill('Ana');
    await page.getByLabel('Correo de contacto').fill('incompleto@example.ec');
    await page.getByLabel('Provincia o país').fill('Loja');
    await page.getByLabel('Trayectoria').fill('Trayectoria');
    await page.getByLabel('Título de la obra').fill(`Sin documentos ${randomUUID().slice(0, 8)}`);
    await page.getByLabel('Disciplina').fill('teatro');
    await page.getByLabel('Duración en minutos').fill('50');
    await page.getByLabel('Público').fill('todo público');
    await page.getByLabel('Número de integrantes en gira').fill('4');
    await page.getByLabel('Sinopsis').fill('Sinopsis de prueba');
    await page.getByRole('button', { name: 'Guardar y enviar' }).click();
    await expect(page.getByRole('heading', { name: 'Requisitos pendientes' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Requisitos pendientes' }).getByRole('list')).toContainText('documentos.dossier');
    await expect(page.getByRole('alert').filter({ hasText: 'No se pudo completar la acción' })).toContainText('incompleta');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.getByRole('heading', { name: 'Borrador guardado' })).toBeVisible();
    await expect(page.getByText('Estado: borrador')).toBeVisible();
  });
});
