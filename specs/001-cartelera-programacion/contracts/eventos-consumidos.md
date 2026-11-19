# Contrato de eventos consumidos por Programación (001)

Contrato **dirigido por el consumidor** (research R10): define lo mínimo que la cartelera necesita
de cada evento. Los responsables de Operación (004, @jeimytorresg) y Boletería (002,
@By-Alvarez06) deben aprobarlo; sus publicadores pueden enviar más campos, nunca menos.

Esquemas en `packages/contracts/eventos/*.ts` (zod). Cola de destino en pg-boss:
`programacion.<evento-en-kebab-case>` (ADR-0003).

## Sobre común

Todo evento llega envuelto así:

| Campo | Tipo | Uso en la cartelera |
|-------|------|---------------------|
| `id` | uuid | Idempotencia (`programacion.evento_procesado`) |
| `tipo` | string | Enrutamiento |
| `version` | entero ≥ 1 | Versión del **esquema**; se aceptan las versiones conocidas |
| `ocurridoEn` | date-time | Auditoría |
| `edicionId` | uuid | Partición por edición |
| `correlacionId` | uuid | Trazas (constitución IX) |
| `datos` | objeto | Contenido propio del evento |

## Secuencia al publicar una edición

Al publicar, Operación emite **primero** un `FuncionProgramada` por cada función (con obra, elenco
y sede completos) y **después** un único `ProgramacionPublicada`. Como no hay orden garantizado
entre colas, la cartelera guarda las funciones recibidas como no visibles hasta que su edición
esté `publicada`; si `ProgramacionPublicada` llega antes que alguna función, esa función se hace
visible en cuanto llegue. Las funciones añadidas después de publicar solo emiten
`FuncionProgramada` (spec 004, US2-AS3).

## Eventos

### `ProgramacionPublicada` · origen Operación
| Campo de `datos` | Tipo | Efecto |
|------------------|------|--------|
| `edicion` | `{id, anio, numero, fechaInicio, fechaFin, paisInvitado}` | Crea o actualiza `edicion_cartelera`, estado `publicada` |
| `funcionIds` | uuid[] | Lista de control: permite detectar funciones que aún no llegaron (alerta si faltan tras 5 min); revalida todos los días de la edición |

### `FuncionProgramada` / `FuncionActualizada` · origen Operación
| Campo de `datos` | Tipo | Efecto |
|------------------|------|--------|
| `funcion` | `{id, version, inicio, fin, continua, tipoAcceso, publico, aforoHabilitado}` | Inserta o actualiza `funcion_cartelera` (incluido `aforo_habilitado`) si `version` > `version_origen` |
| `obra` | `{id, titulo, sinopsis, disciplina, duracionMin, edadMinima, idioma, imagenes, fichaArtistica, componente}` | Inserta o actualiza `obra_cartelera` |
| `elenco` | `{id, nombre, pais, ciudad}` | Desnormalizado en `obra_cartelera` |
| `sede` | `{id, nombre, tipo, direccion, lat, lng, recorrido, aforo, accesibilidad}` | Inserta o actualiza `sede_cartelera` |

Se envían obra, elenco y sede completos para que la cartelera no tenga que consultar a Operación.

### `FuncionReprogramada` · origen Operación
| Campo de `datos` | Tipo | Efecto |
|------------------|------|--------|
| `funcionId`, `version` | uuid, entero | Ignorar si `version` ≤ `version_origen` |
| `anterior` | `{inicio, fin, sedeId}` | Se guarda en `horario_anterior` |
| `nuevo` | `{inicio, fin, sedeId}` | Actualiza horario, sede y `dia_festival`; revalida el día anterior **y** el nuevo |
| `motivo` | string | No se muestra en v1 |

### `FuncionCancelada` · origen Operación
| Campo de `datos` | Tipo | Efecto |
|------------------|------|--------|
| `funcionId`, `version` | uuid, entero | Estado `cancelada`; revalida día, obra y sede |

### `DisponibilidadCambiada` · origen Boletería
| Campo de `datos` | Tipo | Efecto |
|------------------|------|--------|
| `funcionId` | uuid | — |
| `lugaresRestantes` | entero ≥ 0 | Guarda el valor y calcula el nivel con RN-002 |
| `aforoHabilitado` | entero > 0 | Actualiza `aforo_habilitado`; base del umbral del 10 % |
| `calculadoEn` | date-time | Si es anterior al guardado, se ignora (llegada fuera de orden) |

Boletería puede **agrupar** cambios (p. ej. como máximo uno por función cada 5 s) para no
inundar la cola en la apertura de venta; la cartelera solo necesita el último valor.

## Garantías que asume el consumidor

1. Entrega **al menos una vez** (puede repetirse; el consumidor deduplica por `id`).
2. **Sin orden garantizado** entre eventos de funciones distintas; para una misma función se
   resuelve con `version` (Operación) o `calculadoEn` (Boletería).
3. Un evento con `version` de esquema desconocida se deja en la cola de errores y genera alerta;
   no se descarta en silencio.

## Pruebas de contrato

- `packages/contracts/eventos/*.test.ts`: ejemplos válidos e inválidos de cada esquema.
- En 002 y 004: prueba que cada evento publicado pasa `Esquema.parse()` antes de encolarse.
