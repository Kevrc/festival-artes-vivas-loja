# Contrato de eventos: Operación e Identidad (004)

Todos los eventos usan el **sobre común** de `packages/contracts/src/eventos/sobre.ts`
(`id`, `tipo`, `version: 1`, `ocurridoEn`, `edicionId`, `correlacionId`, `datos`) y se publican
con pg-boss **en la misma transacción** que el cambio de negocio
([ADR-0003](../../../docs/adr/0003-eventos-outbox.md)). Cola de cada consumidor:
`colaDe(modulo, tipo)`, p. ej. `identidad.funcion-cancelada`. Los consumidores son idempotentes
(tabla `evento_procesado`) y descartan versiones de función antiguas.

Ningún evento lleva contraseñas, tokens de sesión ni secretos (Constitución VI y IX).

---

## 1. Publicados por Operación (sin cambios: ya existen)

Esquemas en `packages/contracts/src/eventos/operacion.ts`; ya los consumen Cartelera (001) y
Boletería (002). Operación **no modifica** estos esquemas; solo añade `identidad` como destino.

| Evento | Cuándo | Destinos |
|--------|--------|----------|
| `ProgramacionPublicada` | Se publica la edición (US2-AS1), después de los `FuncionProgramada` | programacion, boleteria, identidad |
| `FuncionProgramada` | Una función pasa de borrador a programada (US2-AS1, US2-AS3) | programacion, boleteria, identidad |
| `FuncionActualizada` | Cambian datos no horarios de una función publicada (público, tipo de acceso, aforo) | programacion, boleteria, identidad |
| `FuncionReprogramada` | Cambio de horario o sede con motivo (US3-AS1) | programacion, boleteria, identidad |
| `FuncionCancelada` | Cancelación con motivo (US3-AS3) | programacion, boleteria, identidad |
| `AforoCambiado` | Cambio del aforo habilitado de una función publicada | boleteria |

Reglas:
- `datos.funcion.version` / `datos.version` crece en 1 con cada evento de la misma función.
- Las funciones en borrador no generan eventos.
- `FuncionReprogramada.datos.sede` se incluye cuando cambia la sede.

## 2. Publicados por Identidad (nuevos)

Se añaden en `packages/contracts/src/eventos/identidad.ts` con pruebas de contrato (ejemplos
válidos e inválidos). En v1 **ningún módulo está obligado a consumirlos** (clarificación
2026-11-20: Boletería no reacciona a `CuentaEliminada`); quedan disponibles para todos.

```ts
CuentaVerificada = sobre('CuentaVerificada', z.object({
  cuentaId: z.string().uuid(),
  verificadaEn: instante,
}));

RolAsignado = sobre('RolAsignado', z.object({
  cuentaId: z.string().uuid(),
  rol: RolPersonal,                                   // enum de los 11 roles
  alcance: z.object({
    tipo: z.enum(['sede', 'provincia', 'disciplina']),
    valor: z.string().min(1),
  }).nullable(),
  operacion: z.enum(['asignado', 'revocado']),
  asignadoPor: z.string().uuid(),
}));

CuentaEliminada = sobre('CuentaEliminada', z.object({
  cuentaId: z.string().uuid(),
  eliminadaEn: instante,
}));
```

`edicionId` del sobre: la edición vigente al momento del hecho.

## 3. Consumidos por Operación

| Evento | Origen | Efecto | Contrato |
|--------|--------|--------|----------|
| `PostulacionSeleccionada` | Convocatorias (003) | Crea/actualiza obra y elenco con `origen = convocatoria` (US1-AS5) | **Provisional**, ver §5 |
| `SeleccionDesistida` | Convocatorias (003) | Obra `desistida` + incidencia por función no cancelada | **Provisional**, ver §5 |
| `EntradasEmitidas` | Boletería | `pedido_registrado` y `metrica_funcion` (estadísticas) | Existente |
| `PedidoReembolsado` | Boletería | Resta entradas y recaudación del pedido | Existente |
| `IngresoRegistrado` | Boletería | Suma ingresos validados (una vez por `ingresoId`) | Existente |
| `AforoExcedido` | Boletería | Incidencia automática `aforo_superado` (US4-AS3) | Existente |
| `ConflictoDeIngreso` | Boletería | Incidencia automática `conflicto_ingreso` (US4-AS3) | Existente |

Las colas `operacion.*` de Boletería ya existen en su publicador; no requiere cambios en 002.

## 4. Consumidos por Identidad

| Evento | Origen | Efecto |
|--------|--------|--------|
| `EntradasEmitidas` | Boletería | Notificación `entradas_emitidas` (< 1 min, US10-AS1) + alta en `destinatario_funcion` |
| `PedidoReembolsado` | Boletería | Notificación `devolucion` + baja en `destinatario_funcion` |
| `FuncionProgramada`, `FuncionActualizada` | Operación | Actualiza `funcion_aviso` (datos para redactar avisos) |
| `FuncionReprogramada` | Operación | Actualiza `funcion_aviso` + notificación `funcion_reprogramada` a cada destinatario activo |
| `FuncionCancelada` | Operación | `funcion_aviso.estado = cancelada` + notificación `funcion_cancelada` a cada destinatario activo |
| `ProgramacionPublicada` | Operación | `edicion_vigente` (vencimiento de acreditaciones, RN-012) |
| `PostulacionEnviada` | Convocatorias | Notificación `acuse_postulacion` + `postulacion_en_curso` |
| `SubsanacionSolicitada` | Convocatorias | Notificación `subsanacion` |
| `ResultadoPublicado` | Convocatorias | Notificación `resultado` + cierra `postulacion_en_curso` |

Clave de deduplicación de cada notificación: `tipoEvento:eventoId:destinatario` (RN-011).

## 5. Contratos provisionales con Convocatorias (003)

Convocatorias es la **dueña** de estos eventos. Como su plan aún no existe, 004 los propone según
el contenido fijado en la spec 003 (§Eventos de dominio publicados) y los acuerda con su
responsable antes de fusionar. Viven en `packages/contracts/src/eventos/convocatorias.ts`.

```ts
PostulacionSeleccionada = sobre('PostulacionSeleccionada', z.object({
  postulacionId: z.string().uuid(),
  componente: Componente,
  obra: ObraDto.omit({ componente: true }).extend({
    fichaTecnica: z.object({
      montajeMin: z.number().int().min(0).optional(),
      desmontajeMin: z.number().int().min(0).optional(),
      requerimientos: z.array(z.string()),
    }),
  }),
  elenco: ElencoDto,
  provincia: z.string().optional(),                   // Camino a Loja
}));

SeleccionDesistida = sobre('SeleccionDesistida', z.object({
  postulacionId: z.string().uuid(),
  obraId: z.string().uuid(),
  motivo: z.string().optional(),
}));

PostulacionEnviada = sobre('PostulacionEnviada', z.object({
  postulacionId: z.string().uuid(),
  convocatoriaId: z.string().uuid(),
  cuentaId: z.string().uuid(),
  tituloObra: z.string(),
}));

SubsanacionSolicitada = sobre('SubsanacionSolicitada', z.object({
  postulacionId: z.string().uuid(),
  cuentaId: z.string().uuid(),
  requisitos: z.array(z.string()).min(1),
  plazoHasta: instante,
}));

ResultadoPublicado = sobre('ResultadoPublicado', z.object({
  postulacionId: z.string().uuid(),
  cuentaId: z.string().uuid(),
  resultado: z.enum(['seleccionada', 'lista_espera', 'no_seleccionada', 'no_admitida']),
}));
```

Mientras 003 no los publique, `pnpm events:emit` se amplía con `postulacion-seleccionada` y
`seleccion-desistida` para desarrollo y demostración.

## 6. Pruebas de contrato

- `packages/contracts/src/eventos/eventos.test.ts`: ejemplos válidos e inválidos de cada evento
  nuevo (§2 y §5).
- Integración: Operación publica eventos que **pasan** `EventoCartelera` y
  `EventoOperacionBoleteria` (los discriminados que ya usan 001 y 002).
- Integración: reentrega del mismo evento ⇒ un solo efecto (una notificación, un conteo).
