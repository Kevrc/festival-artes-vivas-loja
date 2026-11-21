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

## 5. Contratos con Convocatorias (003)

Convocatorias es la **dueña** de estos eventos y del archivo
`packages/contracts/src/eventos/convocatorias.ts`. Su rama `003-convocatorias-curaduria` (aún sin
fusionar en `main`, revisada el 2026-11-21) ya implementa dos de ellos; los otros tres quedan fuera
de su entrega P1 porque pertenecen a su US4 (P2).

### 5.1 Ya definidos por 003: 004 los consume tal cual

Publicados con destino `identidad` (colas `identidad.postulacion-enviada` e
`identidad.subsanacion-solicitada`):

```ts
// Copia de referencia; la fuente es convocatorias.ts de la rama 003.
const identificadores = {
  postulacionId: z.string().uuid(),
  convocatoriaId: z.string().uuid(),
  cuentaPostulanteId: z.string().uuid(),
  numero: z.string().min(1),                          // p. ej. FIAVL-2026-0001
};
PostulacionEnviada = sobre('PostulacionEnviada', z.object({ ...identificadores, enviadaEn: instante }));
SubsanacionSolicitada = sobre('SubsanacionSolicitada', z.object({
  ...identificadores,
  detalle: z.string().trim().min(1),
  venceEn: instante,
}));
```

Consecuencias para Identidad:

- Los avisos citan el **número** de postulación (el evento no trae el título de la obra).
- `PostulacionEnviada` se repite al reenviar tras subsanar: la notificación se deduplica por
  `eventoId` (son dos avisos distintos, ambos correctos) y `postulacion_en_curso` se actualiza
  con *upsert* por `postulacionId`.
- El destinatario se resuelve con `cuentaPostulanteId` → `identidad.cuenta.correo`.

### 5.2 Pendientes de 003 (US4): propuesta provisional

Los consumen Operación (`PostulacionSeleccionada`, `SeleccionDesistida`) e Identidad
(`ResultadoPublicado`). 004 propone esta forma, siguiendo el estilo de 5.1 (`cuentaPostulanteId`,
`numero`), para que @Carlos2190 la añada a `convocatorias.ts` en un PR propio de contratos
(Constitución §6). Hasta entonces viven en `eventos/convocatorias-pendientes.ts`, marcados
como provisionales, para no editar el archivo de 003, y `pnpm events:emit` los simula.

```ts
PostulacionSeleccionada = sobre('PostulacionSeleccionada', z.object({
  postulacionId: z.string().uuid(),
  componente: Componente,
  obra: ObraDto.omit({ componente: true }).extend({
    fichaTecnica: z.object({
      montajeMin: z.number().int().min(0).optional(),   // informativos: el cruce usa sede.montaje_min
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

ResultadoPublicado = sobre('ResultadoPublicado', z.object({
  postulacionId: z.string().uuid(),
  convocatoriaId: z.string().uuid(),
  cuentaPostulanteId: z.string().uuid(),
  numero: z.string().min(1),
  resultado: z.enum(['seleccionada', 'lista_espera', 'no_seleccionada', 'no_admitida']),
}));
```

Destinos propuestos: `PostulacionSeleccionada` y `SeleccionDesistida` → `operacion`;
`ResultadoPublicado` → `identidad`. Mientras 003 no los publique, `pnpm events:emit` se amplía con
`postulacion-seleccionada`, `seleccion-desistida` y `resultado-publicado`.

### 5.3 Otros puntos de encaje con la rama 003

| Tema | Rama 003 | 004 | Acuerdo |
|------|----------|-----|---------|
| Nombres de rol | `'coordinación de convocatorias'`, `'jefe de sala'`… (texto literal de FR-019) | Códigos `coordinacion_convocatorias`, `jefe_sala`… | `IdentidadPublica` mantiene los códigos; el adaptador de Convocatorias los traduce con una tabla fija, como ya prevé su `autorizacion-identidad.md` |
| Alcance | `{ sedeId?, provincia?, disciplina? }` | `{ tipo, valor } \| null` | El adaptador lo traduce; misma semántica |
| `edicionId` | Su semilla usa `22222222-2222-4222-8222-222222222222` | Operación siembra la edición con `idDe('edicion-2026')` | Que la semilla de 003 lea el id de `prisma/seed/ids.ts` al integrarse |
| Archivos compartidos | Edita `schema.prisma` (`schemas`), `docker/docker-compose.yml` (ClamAV), `prisma/seed/index.ts`, `app.module.ts`, `worker.module.ts`, `eventos/index.ts` | Edita los mismos | Cambios solo aditivos; quien fusione segundo resuelve el conflicto |
| Rutas web | Grupo `(coordinacion)` | Grupo `(panel)` | Sin choque de URLs |

## 6. Pruebas de contrato

- `packages/contracts/src/eventos/eventos.test.ts`: ejemplos válidos e inválidos de cada evento
  nuevo (§2 y §5).
- Integración: Operación publica eventos que **pasan** `EventoCartelera` y
  `EventoOperacionBoleteria` (los discriminados que ya usan 001 y 002).
- Integración: reentrega del mismo evento ⇒ un solo efecto (una notificación, un conteo).
