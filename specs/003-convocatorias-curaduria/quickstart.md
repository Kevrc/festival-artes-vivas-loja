# Quickstart: Convocatorias y curaduría (003)

Guía para ejecutar los escenarios de las historias P1 una vez implementados. Los pasos respetan la app y seed existentes; los comandos de verificación se ejecutarán durante la fase implement, no en plan.

## Requisitos y preparación

- Node.js 22+, pnpm 11 y Docker.
- Copiar `.env.example` a `.env`; configurar `DATABASE_URL`, `CONVOCATORIAS_ALMACENAMIENTO=disco` y `CONVOCATORIAS_ANTIVIRUS=simulador`.
- Los documentos de desarrollo se escriben en `.almacen-dev/`, excluido de Git. No se necesita servicio adicional de almacenamiento.

```bash
pnpm install
pnpm db:up
pnpm db:migrate
pnpm db:generate
pnpm db:seed
pnpm dev
```

El seed de Convocatorias es idempotente y se invoca desde `prisma/seed/index.ts`. Carga la convocatoria ejemplo abierta, criterios, perfiles/postulaciones, escribe documentos ficticios mediante `AlmacenamientoDocumentosPort` y crea asignaciones. No crea cuentas ni implementa notificaciones. En desarrollo se pasan los headers de `contracts/autorizacion-identidad.md`; los tests usan almacenamiento en memoria y escáner falso. El backend S3 no forma parte del quickstart local.

Para probar ClamAV real de forma opcional, levantar Compose con el profile `antivirus` y usar `CONVOCATORIAS_ANTIVIRUS=clamav`. En producción el adaptador real falla cerrado si ClamAV no está disponible.

## Flujos de demostración

| Flujo | Acción | Resultado esperado | Traza |
|---|---|---|---|
| Enviar postulación | Como elenco, completar ficha, subir documentos válidos y enviar antes del cierre | Estado `enviada`, folio único y evento `PostulacionEnviada` | US1-AS1 |
| Campo/documento faltante | Intentar enviar borrador sin un requisito | Respuesta con lista de faltantes y borrador conservado | US1-AS2 |
| Cierre | Intentar enviar luego del cierre | Rechazo de envío; borrador legible pero inmutable | US1-AS3/AS5 |
| Retiro/reenvío | Retirar antes del cierre, editar y reenviar | Mismo número y una postulación activa | US1-AS4 |
| Subsanación | Como coordinación, pedir corrección con detalle; como elenco, corregir y reenviar dentro de plazo | Evento de aviso, vencimiento de 72 h y regreso a revisión | US2-AS1/AS2 |
| Vencimiento | Dejar vencer sin corrección y ejecutar/esperar el job | `no_admitida`, motivo y auditoría | US2-AS3 |
| Evaluación ponderada | Como curador asignado, ingresar 80/70/90 con criterios 50/30/20 y enviar | Puntaje propio `79,00`; puntajes ajenos ocultos | US3-AS1/AS4 |
| Promedio y deliberación | Enviar evaluaciones 79,00 y 85,00; luego probar otra pareja con dispersión >25 | Promedio `82,00`; marca de deliberación al superar 25 | US3-AS2/AS5 |
| Conflicto de interés | Intentar asignación o evaluación de curador conflictuado | Rechazo y ninguna evaluación creada | US3-AS3 |
| Reabrir evaluación | Como coordinación con headers de dev, enviar motivo a la operación de reapertura | Evaluación reabierta; motivo, actor y fecha auditados | US3-AS6 |
| Privacidad de archivo | Solicitar descarga propia/asignada y probar usuario no autorizado | URL de descarga breve solo al autorizado; 403 para otros | FR-015 |

## Verificación prevista

- `pnpm lint && pnpm typecheck`
- `pnpm test` con cobertura ≥ 80 % de `convocatorias/domain`.
- `pnpm --filter @fiavl/api test:int` incluyendo PostgreSQL y adaptadores en memoria/disco; ClamAV se sustituye por el falso configurable.
- E2E y accesibilidad de las tres P1 con Playwright/axe.
- Smoke test de arranque con `pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm dev`.
- Pruebas del escáner falso para resultados limpio, infectado y caído; no requieren ClamAV real.
