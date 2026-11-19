import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';

/** Mismos ids deterministas que prisma/seed/ids.ts. */
export function idDe(nombre: string): string {
  const h = createHash('sha1').update(`fiavl:${nombre}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** SC-005: sin violaciones WCAG 2.1 A/AA. */
export async function sinViolacionesAxe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.leaflet-container').analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
}

export const tarjeta = (page: Page, titulo: string) => page.locator('article.tarjeta').filter({ has: page.getByRole('heading', { name: titulo }) });
