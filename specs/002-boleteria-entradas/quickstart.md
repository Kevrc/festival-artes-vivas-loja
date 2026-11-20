# Quickstart: validar Boletería y control de acceso (002)

Guía para comprobar que el módulo **Boletería** cumple la [spec](spec.md), el
[modelo de datos](data-model.md) y los [contratos](contracts/api-boleteria.openapi.yaml).
Los comandos ejecutables de prueba existirán conforme avance la implementación definida en `tasks.md`.

## Requisitos

- Node.js 22+, pnpm 11, Docker (para PostgreSQL 16 y pruebas de concurrencia con Testcontainers).
- Copiar `.env.example` a `.env` (PostgreSQL en puerto `5433`, API en `4000`, worker métricas en `9464` y web en `3100`).
- Variables propias de Boletería en desarrollo: `BOLETERIA_PAGOS_PROVEEDOR=simulador`, `BOLETERIA_QR_PRIVADA_PEM` (generada en local si se omite) y `FIAVL_AHORA=2026-11-14T12:00:00-05:00` para pruebas temporales deterministas.
- Chromium para Playwright (`pnpm --filter @fiavl/web exec playwright install chromium`).

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

La semilla carga la edición XI (12–22 nov 2026) con funciones pagadas (USD 5,00), gratuitas con
reserva ("Cometa"), de acceso restringido ("Taller de clown para estudiantes") y de entrada libre
(Chacovachi en plaza), además de cuentas y roles de prueba (asistente, taquilla y validador por
sede).

```bash
pnpm dev
```

## Escenarios de validación end-to-end

| # | Flujo y pasos | Resultado esperado | Criterio |
|---|---------------|--------------------|----------|
| 1 | Abrir `/entradas/{id pagada}`, elegir 3 entradas y aprobar pago simulado | Pedido `pagado`, 3 entradas con QR y código corto en `/mis-entradas`, importe `USD 15,00` y disponibilidad reducida en 3 | US1-AS1, SC-004 |
| 2 | Rechazar pago simulado en checkout | Pedido `fallido`, 0 entradas emitidas y los 3 lugares vuelven al inventario | US1-AS2 |
| 3 | Repetir petición `POST /pedidos` con el mismo `Idempotency-Key` | Devuelve el mismo pedido sin retener dos veces ni duplicar cobro | US1-AS4, SC-005 |
| 4 | Dejar vencer un pedido `pendiente` 10 min (o adelantar reloj de prueba) y recibir webhook tardío | El trabajo de expiración libera cupo; si al llegar webhook ya no hay cupo, se registra reembolso automático y `PedidoReembolsado` | US1-AS5, US1-AS6 |
| 5 | Abrir `/validador/{funcionId}`, descargar paquete, desconectar red (`offline`), escanear QR válido, reescanear < 1 min y luego usar código corto | 1.ª lectura **VERDE**; reescaneo < 1 min mismo dispositivo **ÁMBAR**; código corto de entrada no usada **VERDE** y de entrada usada **ROJO** | US2-AS1, AS2, AS7, RNF-005 |
| 6 | Validar la misma entrada en dos dispositivos offline y reconectar ambos | Al sincronizar gana el primer ingreso, el segundo queda como conflicto y se publica `ConflictoDeIngreso` | US2-AS6 |
| 7 | Reservar 2 lugares en función `gratuita_reserva`, intentar reservar 3 más (límite 4) y probar en función `gratuita_libre` | 1.ª reserva confirmada sin pago; 2.ª rechazada por límite por persona; en función libre muestra "Entrada libre" | US3-AS1, AS3, AS4 |
| 8 | Dejar reserva sin validar hasta `inicio - 10 min` y correr job de liberación | Entradas pasan a `liberada`, el cupo vuelve para puerta y Cartelera recibe `DisponibilidadCambiada` | US3-AS2, FR-013 |
| 9 | En `/taquilla`, abrir caja en Teatro Nacional, vender 1 entrada en efectivo sin correo y 1 en datáfono, y cerrar caja declarando efectivo | Inventario baja en 2 en línea, boleto imprimible sin cuenta, cierre con diferencia `0` | US4-AS2, AS3, AS5, SC-006 |
| 10 | Emitir `pnpm events:emit funcion-cancelada --id <funcionId>` sobre función con entradas | Entradas pasan a `anulada`; en `/mis-entradas` ofrece devolución o cambio sin cobro a otra función de la misma obra; en taquilla permite devolución en efectivo | US5-AS1..AS4 |
| 11 | Dejar vencer 7 días sin elección de un comprador afectado por cancelación | El worker dispara devolución automática y emite `PedidoReembolsado` | US5-AS5 |
| 12 | Abrir `/sala/{funcionId}` tras emitir 5 entradas y validar 2 | Muestra emitidas `5`, ingresos `2`, pendientes `3` y libres calculados | US6-AS1 |

## Pruebas automatizadas

```bash
pnpm test
```

Unitarias del dominio de Boletería (`domain/*.test.ts`, cobertura ≥ 80 % por puerta Q2) y pruebas de
contrato Zod de eventos en `@fiavl/contracts`.

```bash
pnpm --filter @fiavl/api test:int
```

Integración contra PostgreSQL real (Testcontainers): prueba de concurrencia **SC-001** (500 compras
simultáneas sobre una función de 100 lugares → exactamente 100 entradas emitidas), idempotencia de
webhooks y pagos tardíos, taquilla y cierre de caja, liberación automática y sincronización offline.

```bash
pnpm --filter @fiavl/web test:e2e
```

Playwright en móvil (320 px) y escritorio con auditoría `@axe-core/playwright` (WCAG 2.1 AA),
incluyendo simulación de corte de red (`setOffline(true)`) en `/validador/{funcionId}`.

```bash
k6 run tests/carga/boleteria.js
```

Prueba de carga sobre retención de pedidos y validación en puerta verificando `RNF-002` y `RNF-003`
(p95 < 2 s).
