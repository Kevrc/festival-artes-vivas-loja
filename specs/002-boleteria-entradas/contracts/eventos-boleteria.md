# Contrato de eventos de Boletería (002)

Contrato de eventos de dominio publicados y consumidos por el módulo **Boletería**, validados en
ejecución con esquemas **zod** en `packages/contracts/src/eventos/` (Constitución III y
[ADR-0003](../../../docs/adr/0003-eventos-outbox.md)).

## Sobre común

Todo evento usa el sobre definido en `packages/contracts/src/eventos/sobre.ts`:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | Identificador único del evento para idempotencia (`evento_procesado`) |
| `tipo` | string | Nombre del evento en PascalCase |
| `version` | entero ≥ 1 | Versión del esquema del evento (`1`) |
| `ocurridoEn` | date-time (ISO con zona) | Instante en que ocurrió el hecho |
| `edicionId` | uuid | Edición del festival |
| `correlacionId` | uuid | Propagación de trazabilidad (Constitución IX) |
| `datos` | objeto | Carga útil propia del evento |

---

## Eventos consumidos (desde Operación 004)

Colas de destino en `pg-boss`: `boleteria.<evento-en-kebab-case>`.

| Evento | Cola | Campos usados en `datos` | Efecto en Boletería |
|--------|------|--------------------------|---------------------|
| `ProgramacionPublicada` | `boleteria.programacion-publicada` | `edicion` (`id`, `anio`, `numero`, y opcionalmente `precioCentavos?`, `maxPagadasPersona?`, `maxReservasPersona?`), `funcionIds` | Crea o actualiza `edicion_boleteria` en estado `publicada`; si `edicion` no incluye parámetros opcionales aplica los valores por defecto (`500` centavos, `6` pagadas, `4` reservas) y mantiene compatibilidad con `EdicionDto` de 001 |
| `FuncionProgramada` | `boleteria.funcion-programada` | `funcion` (`id`, `version`, `inicio`, `fin`, `tipoAcceso`, `publico`, `aforoHabilitado`), `obra` (`id`, `titulo`), `sede` (`id`, `nombre`) | Crea `inventario_funcion` si `aforoHabilitado` no es nulo (si `version > version_origen`) |
| `FuncionActualizada` | `boleteria.funcion-actualizada` | Igual a `FuncionProgramada` | Actualiza metadatos, `tipoAcceso`, `publico` o `aforoHabilitado` si `version > version_origen` |
| `FuncionReprogramada` | `boleteria.funcion-reprogramada` | `funcionId`, `version`, `anterior`, `nuevo` (`inicio`, `fin`, `sedeId`), `sede?` | Actualiza horario/sede y `estado_funcion = 'reprogramada'`; mantiene válidas las entradas (RN-005) y habilita devolución opcional (RN-006) |
| `FuncionCancelada` | `boleteria.funcion-cancelada` | `funcionId`, `version` | Marca `cancelada`, anula entradas `valida`, fija `plazo_eleccion_hasta` (+7 días) en pedidos pagados y publica `DisponibilidadCambiada` (0) |
| `AforoCambiado` | `boleteria.aforo-cambiado` | `funcionId`, `version`, `aforoAnterior`, `aforoHabilitado` | Actualiza `aforo_habilitado`; nunca anula entradas ya emitidas; si `emitidos + retenidos > aforo_habilitado` emite `AforoExcedido` |

---

## Eventos publicados por Boletería

Boletería encola estos eventos **en la misma transacción** de PostgreSQL que el cambio de negocio
(ADR-0003) y los valida con `Esquema.parse()` antes de encolar.

### 1. `DisponibilidadCambiada` → Programación (001)
Cola: `programacion.disponibilidad-cambiada` (esquema ya acordado en
[eventos-consumidos.md](../../001-cartelera-programacion/contracts/eventos-consumidos.md) y
`packages/contracts/src/eventos/boleteria.ts`).

| Campo en `datos` | Tipo | Regla |
|------------------|------|-------|
| `funcionId` | uuid | Función afectada |
| `lugaresRestantes` | entero ≥ 0 | `max(0, aforoHabilitado - emitidos - retenidos)` |
| `aforoHabilitado` | entero > 0 | Aforo vigente de la función |
| `calculadoEn` | date-time | Instante del cálculo para descartar eventos atrasados |

*Agrupación en picos*: se usa `singletonKey: funcionId` (ventana de 5 s) salvo en eventos
terminales (agotado o función cancelada).

### 2. `EntradasEmitidas` → Operación (004) e Identidad (004)
Colas: `operacion.entradas-emitidas`, `identidad.entradas-emitidas`.

| Campo en `datos` | Tipo | Uso en consumidores |
|------------------|------|---------------------|
| `pedidoId` | uuid | Trazabilidad e idempotencia |
| `funcionId` | uuid | Operación (estadísticas) |
| `sedeId` | uuid | Operación (estadísticas por sede) |
| `canal` | `web` \| `taquilla` \| `cambio` | Operación (desglose por canal) |
| `tipo` | `compra` \| `reserva` | Operación |
| `cantidad` | entero ≥ 1 | Operación (entradas emitidas) |
| `importeCentavos` | entero ≥ 0 | Operación (recaudación) |
| `cuentaId` | uuid opcional | Identidad (preferencias y destinatario) |
| `correoDestino` | email opcional | Identidad (envío de correo con QR y códigos cortos; omitido en venta sin correo de taquilla) |
| `entradas` | lista `{ entradaId, codigoCorto, tokenQr }` | Identidad (plantilla de correo) |

### 3. `IngresoRegistrado` → Operación (004)
Cola: `operacion.ingreso-registrado`.

| Campo en `datos` | Tipo | Uso en Operación |
|------------------|------|------------------|
| `ingresoId` | uuid | Idempotencia |
| `entradaId` | uuid | Trazabilidad |
| `funcionId` | uuid | Sumar a `ingresos validados` y ocupación (004 RN-003) |
| `sedeId` | uuid | Estadísticas por sede |
| `validadorId` | uuid | Auditoría |
| `escaneadoEn` | date-time | Hora real de ingreso |
| `diferido` | boolean | Indica si ocurrió sin conexión |

### 4. `PedidoReembolsado` → Operación (004) e Identidad (004)
Colas: `operacion.pedido-reembolsado`, `identidad.pedido-reembolsado`.

| Campo en `datos` | Tipo | Uso en consumidores |
|------------------|------|---------------------|
| `pedidoId` | uuid | Referencia del pedido |
| `funcionId` | uuid | Operación (ajuste de recaudación) |
| `sedeId` | uuid | Operación |
| `importeCentavos` | entero > 0 | Operación (recaudación neta) |
| `canal` | `web` \| `taquilla` | Identidad / Operación |
| `motivo` | `funcion_cancelada` \| `funcion_reprogramada` \| `pago_tardio_sin_cupo` \| `plazo_7_dias_vencido` | Identidad (plantilla de aviso) |
| `cuentaId` | uuid opcional | Identidad |
| `correoDestino` | email opcional | Identidad |

### 5. `ConflictoDeIngreso` → Operación (004)
Cola: `operacion.conflicto-de-ingreso`.

| Campo en `datos` | Tipo | Uso en Operación |
|------------------|------|------------------|
| `entradaId` | uuid | Entrada con doble validación offline |
| `funcionId` | uuid | Función afectada |
| `sedeId` | uuid | Crea incidencia automática en la sede (004 US4-AS3) |
| `primerDispositivoId` | string | Puerta/dispositivo ganador |
| `segundoDispositivoId` | string | Puerta/dispositivo en conflicto |
| `detectadoEn` | date-time | Momento de sincronización |

### 6. `AforoExcedido` → Operación (004)
Cola: `operacion.aforo-excedido`.

| Campo en `datos` | Tipo | Uso en Operación |
|------------------|------|------------------|
| `funcionId` | uuid | Función cuyo nuevo aforo es menor a lo vendido |
| `sedeId` | uuid | Crea incidencia automática en la sede (004 US4-AS3) |
| `aforoHabilitado` | entero ≥ 0 | Nuevo aforo recibido |
| `entradasActivas` | entero > 0 | `emitidos + retenidos` al aplicar el cambio |
| `exceso` | entero > 0 | `entradasActivas - aforoHabilitado` |

---

## Pruebas de contrato

- `packages/contracts/src/eventos/eventos.test.ts`: ejemplos válidos e inválidos para cada evento de Boletería y de Operación.
- En el módulo `boleteria`: cada evento emitido se valida con `Esquema.parse()` antes de entregarlo al puerto de publicación `pg-boss`.
