# Quickstart: validar la cartelera (001)

Guía para comprobar que la funcionalidad cumple la [spec](spec.md). Los comandos existen cuando
las tareas de preparación del monorepo (`tasks.md`, fase Setup) estén hechas.

## Requisitos

- Node.js 22 o superior, pnpm 11, Docker (para PostgreSQL y las pruebas con Testcontainers).
- Copiar `.env.example` a `.env`. PostgreSQL local usa el puerto **5433**; la API el **4000** y la web el **3100**.
- Navegador Chromium para Playwright (`pnpm --filter @fiavl/web exec playwright install chromium`).

## Preparación

```bash
pnpm install
```

```bash
pnpm db:up
```

```bash
pnpm db:migrate && pnpm db:seed
```

La semilla carga la edición XI (12–22 nov 2026) con obras y sedes reales de la investigación
("El Cura sin cabeza", "Zombi Manifiesto", "Cometa", "La Artista", Chacovachi en plaza, la
exposición "Buddy Bears" y el desfile inaugural) y una función cancelada, una reprogramada y una
agotada.

```bash
pnpm dev
```

Arranca la API, el worker (consumidores de eventos, métricas en `:9464/metrics`) y la web.
Web en `http://localhost:3100`, API en `http://localhost:4000`. Para reproducir los escenarios con
la fecha de la demo, poner `FIAVL_AHORA=2026-11-14T12:00:00-05:00` en `.env` (solo fuera de
producción).

## Escenarios de validación

| # | Pasos | Resultado esperado | Spec |
|---|-------|--------------------|------|
| 1 | Abrir `/cartelera/2026-11-14` sin sesión | Funciones del 14 ordenadas por hora con obra, elenco, país, sede, edad y tipo de acceso | US1-AS1, AS6 |
| 2 | Buscar la función cancelada de la semilla | Texto "Cancelada", sin botón de entrada | US1-AS3 |
| 3 | Buscar la reprogramada | Horario nuevo y "Antes: …" | US1-AS4 |
| 4 | Filtrar `?acceso=gratuita_libre&disciplina=circo` | Solo circo de acceso libre; copiar el enlace en otra pestaña muestra lo mismo | US2-AS1, AS4 |
| 5 | Buscar "ZOMBÍ" | Aparece "Zombi Manifiesto" | US2-AS2 |
| 6 | Abrir `/obras/{id de Cometa}` | Dos funciones del 15 nov con enlace a la sede | US3-AS1 |
| 7 | Abrir `/ahora` con la hora simulada `2026-11-14T17:10-05:00` | Solo funciones en curso o que empiezan antes de las 18:10 | US4-AS1 |
| 8 | Marcar dos favoritos que se cruzan y abrir `/mi-agenda` | Aviso de cruce | US5-AS1 |
| 9 | Publicar `FuncionCancelada` de prueba (`pnpm events:emit funcion-cancelada --id <funcionId>`) | La cartelera lo muestra en < 1 min (medido: 2 s con el build de producción) | SC-004 |
| 10 | Detener el módulo de Boletería (o no emitir disponibilidad 5 min) | La cartelera sigue y muestra "Consultar disponibilidad" | RNF-003 |

## Pruebas automatizadas

```bash
pnpm test
```

Unitarias con cobertura ≥ 80 % del dominio (reglas RN-001…RN-006, día de festival, filtros,
cruces, calendario) y contratos de eventos.

```bash
pnpm --filter @fiavl/api test:int
```

Integración con PostgreSQL real en Testcontainers: proyección idempotente, eventos fuera de orden,
búsqueda sin tildes, fichas, Ahora, disponibilidad y favoritos.

```bash
pnpm --filter @fiavl/web test:e2e
```

Playwright en móvil y escritorio (con la API en `FIAVL_AHORA=2026-11-14T12:00:00-05:00` y la
semilla recién cargada): escenarios de US1–US6, degradación sin disponibilidad y auditoría axe
(WCAG 2.1 AA, SC-005), también a 320 px de ancho.

## Criterios de rendimiento (staging)

```bash
npx @lhci/cli@0.14.0 autorun --collect.url=https://staging.example/cartelera/2026-11-14
```

Lighthouse CI con perfil 4G: carga < 3 s (SC-002).

```bash
k6 run tests/carga/cartelera.js
```

5 000 usuarios virtuales navegando días y fichas durante 10 min: 0 % de errores y p95 < 1 s en
servidor (SC-003, RNF-001).
