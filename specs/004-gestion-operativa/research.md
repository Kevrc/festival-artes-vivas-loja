# Research: Gestión operativa, cuentas y notificaciones (004)

**Fase 0 de `/speckit-plan`.** Cada decisión parte de un requisito de la [spec](spec.md), de la
[constitución](../../.specify/memory/constitution.md) o de un driver de
[00-drivers.md](../../docs/arquitectura/00-drivers.md). El stack base (NestJS 11, Next.js 15.5,
PostgreSQL 16, Prisma 6.19 multiSchema, pg-boss 10, zod) ya está fijado en
[ADR-0002](../../docs/adr/0002-stack-por-necesidades.md) y el monorepo existe desde las specs 001
y 002. Aquí se resuelven las decisiones propias de **Operación** (R1–R9) e **Identidad**
(R10–R20), más la integración con los módulos existentes (R21–R23).

Restricción transversal acordada en la clarificación del 2026-11-20: **ningún cambio en la
spec 002**. Todo lo que Identidad y Operación necesitan de Boletería sale de los eventos que
Boletería ya publica hacia las colas `operacion.*` e `identidad.*`
(`apps/api/src/modules/boleteria/infrastructure/publicador.pgboss.ts`).

---

## Parte A — Operación

### R1. Detección de cruces de sede y de elenco (RN-001, FR-002, FR-003, SC-001)

- **Necesidad**: cero cruces en la programación publicada, incluso si dos programadores guardan
  a la vez; el usuario debe ver **qué función** choca (US1-AS2).
- **Decisión** (dos capas, [ADR-0010](../../docs/adr/0010-cruces-con-restriccion-de-exclusion.md)):
  1. **Dominio puro** `agenda.ts`: `ocupacionSede(funcion, montajeMin) = [inicio, fin + montaje)` y
     `ocupacionElenco(funcion) = [inicio, fin)`. RN-001 (`inicioB < finA + montaje ∧ inicioA <
     finB + montaje`) es exactamente el solapamiento de esos intervalos semiabiertos. El caso de
     uso consulta las funciones vecinas y devuelve `409` con la lista de conflictos. Se desarrolla
     **probando primero** (Constitución IV).
  2. **Garantía en PostgreSQL**: tabla `operacion.bloque_ocupacion` con dos restricciones
     `EXCLUDE USING gist (sede_id WITH =, rango_sede WITH &&) WHERE (activo)` y
     `EXCLUDE USING gist (elenco_id WITH =, rango_elenco WITH &&) WHERE (activo)` (extensión
     `btree_gist`). Si una carrera esquiva la comprobación del dominio, la base rechaza la
     inserción (`23P01`) y se traduce al mismo `409`.
  3. Cada función genera **uno o más bloques**: uno normal; en actividades **continuas**
     (exposiciones) un bloque por día con su horario (caso borde de la spec). Las funciones
     canceladas desactivan sus bloques (`activo = false`) y liberan la sede.
  4. Las funciones que cruzan medianoche pertenecen al día de su inicio (`dia_festival`, igual que
     en Cartelera, `America/Guayaquil`).
- **Por qué**: la regla queda explicada y probada en el dominio; la restricción hace imposible el
  cruce bajo concurrencia sin bloqueos explícitos (mismo enfoque que el `UPDATE` condicional de
  [ADR-0004](../../docs/adr/0004-control-de-aforo.md)).
- **Alternativas descartadas**: solo validar en la aplicación (carrera entre dos programadores);
  `SELECT … FOR UPDATE` sobre la sede (serializa toda la grilla del día); `SERIALIZABLE` (reintentos
  frecuentes y poco explicables).

### R2. Ediciones concurrentes de una función (FR-013, caso borde)

- **Decisión**: control **optimista**. Toda función tiene `version` (entero que también viaja en
  los eventos, contrato `FuncionDto.version`). Las operaciones de escritura exigen la cabecera
  `If-Match: "<version>"`; el `UPDATE … WHERE id = :id AND version = :v` que afecta 0 filas
  responde `412 Precondition Failed` con la versión vigente y quién la cambió.
- **Alternativas**: bloqueo pesimista de edición ("X está editando") — requiere expiraciones y
  heartbeat; *last-write-wins* — viola FR-013.

### R3. Publicación y eventos de Operación (FR-005, FR-006, RNF-002, SC-003)

- **Decisión**:
  1. Operación **cumple sin cambios** los contratos ya existentes en
     `packages/contracts/src/eventos/operacion.ts` (`ProgramacionPublicada`, `FuncionProgramada`,
     `FuncionActualizada`, `FuncionReprogramada`, `FuncionCancelada`, `AforoCambiado`), que hoy
     consumen Cartelera y Boletería.
  2. Publicación transaccional con pg-boss dentro de la misma transacción del cambio
     ([ADR-0003](../../docs/adr/0003-eventos-outbox.md)), reutilizando `ColaEventos` y
     `transaccionActual()` de `apps/api/src/common/datos/`.
  3. Destinos por tipo:

     | Evento | `programacion` | `boleteria` | `identidad` |
     |--------|:-:|:-:|:-:|
     | `ProgramacionPublicada` | ● | ● | ● (fin de edición, RN-012) |
     | `FuncionProgramada` / `FuncionActualizada` | ● | ● | ● (datos para avisos) |
     | `FuncionReprogramada` | ● | ● | ● |
     | `FuncionCancelada` | ● | ● | ● |
     | `AforoCambiado` | | ● | |

  4. Qué emite cada acción:
     - **Publicar edición** (US2-AS1): una transacción que pasa los borradores válidos a
       `programada`, emite un `FuncionProgramada` por función y al final `ProgramacionPublicada`.
     - **Publicar una función suelta** en edición ya publicada (US2-AS3): solo `FuncionProgramada`.
     - **Editar datos no horarios** de una función publicada (público, tipo de acceso): `FuncionActualizada`.
     - **Cambiar aforo habilitado**: `AforoCambiado` (+ `FuncionActualizada` para Cartelera).
     - **Reprogramar** (horario o sede): `FuncionReprogramada` con `anterior`, `nuevo`, `motivo`
       y `sede` cuando cambia.
     - **Cancelar**: `FuncionCancelada`.
     Cada evento incrementa `version` de la función; los consumidores ya descartan versiones viejas.
  5. Las funciones en **borrador no emiten eventos** (no existen para los demás módulos).
- **Por qué**: Cartelera y Boletería ya funcionan con estos contratos vía la semilla y
  `pnpm events:emit`; Operación pasa a ser la fuente real sin tocar sus consumidores.

### R4. Validación previa a la publicación (FR-005, US2-AS2)

- **Decisión**: función de dominio `validarPublicacion(edicion, funciones, obras, sedes)` que
  devuelve **todos** los errores (no solo el primero): función sin sede activa, sin tipo de acceso,
  aforo habilitado ausente en funciones con aforo, aforo > sede (FR-004), obra sin imagen, obra
  desistida, cruces (R1) y fechas fuera de la edición. La publicación se bloquea si la lista no
  está vacía; la grilla muestra los errores enlazados a cada función.
- **Funciones al aire libre sin aforo** (caso borde): en sedes `espacio_publico`/`recorrido` con
  `tipoAcceso = gratuita_libre` el aforo habilitado es `null` y no pasan por Boletería.

### R5. Reprogramación con menos aforo que entradas vendidas (US3-AS2)

- **Necesidad**: advertir la cifra en exceso sin consultar las tablas de Boletería (Constitución III).
- **Decisión**: Operación mantiene su **proyección de métricas por función** (R7), alimentada por
  `EntradasEmitidas` y `PedidoReembolsado`. Al reprogramar a una sede de aforo `A` con `E`
  entradas activas, si `E > A` responde `409` con `{ exceso: E - A }`; el cliente reintenta con
  `confirmarExceso: true`. La resolución de los excedentes la hace Boletería (spec 002, ya
  implementada con `AforoExcedido`).
- **Riesgo aceptado**: la proyección puede ir unos segundos por detrás de Boletería (consistencia
  eventual, RNF-002 < 1 min). Es una advertencia, no un control de aforo.

### R6. Obras y elencos desde Convocatorias; desistimiento (FR-007, US1-AS5)

- **Decisión**:
  1. Operación define en `@fiavl/contracts` los esquemas **provisionales** `PostulacionSeleccionada`
     (obra, elenco, componente, ficha técnica; contenido fijado en la spec 003 §Eventos) y
     `SeleccionDesistida` (`postulacionId`, `obraId`), marcados como *propiedad de 003* y
     acordados con su responsable antes de fusionar (Constitución III, contract-first).
  2. El consumidor crea o actualiza `obra` y `elenco` con `origen = convocatoria` y
     `postulacion_id` único (idempotencia por postulación, además de `evento_procesado`).
  3. `SeleccionDesistida` (clarificación 2026-11-20): la obra pasa a `desistida` (no programable)
     y, por cada función no cancelada de esa obra, se crea una **incidencia** tipo
     `desistimiento` visible al programador. Las funciones no se modifican.
  4. Mientras 003 no publique eventos, `pnpm events:emit postulacion-seleccionada` (extensión del
     script existente) los simula en desarrollo.

### R7. Estadísticas: proyección y consultas (FR-009, RN-003, RN-004, RNF-003, SC-005)

- **Decisión**:
  1. Operación consume `EntradasEmitidas`, `PedidoReembolsado` e `IngresoRegistrado` (ya
     enrutados a `operacion.*`) y mantiene, idempotentemente:
     - `pedido_registrado` (pedido → función, cantidad, importe, tipo, canal): necesario porque
       `PedidoReembolsado` no trae cantidad.
     - `metrica_funcion` (emitidas, reembolsadas, ingresos validados, recaudación en centavos).
     - `ingreso_registrado` (id de ingreso único, para no contar dos veces un `IngresoRegistrado` repetido).
  2. Los indicadores se calculan con **SQL agregado** sobre `funcion × sede × obra × elenco ×
     metrica_funcion × conteo_estimado` por dimensión (día, sede, disciplina, componente, país).
     Los consumidores actualizan en tiempo casi real, lo que cumple "≤ 5 min" (RNF-003) sin
     vistas materializadas.
  3. Fórmulas puras en `domain/indicadores.ts` (probadas primero):
     `ocupacion = ingresos ÷ aforoHabilitado` (solo funciones con aforo, RN-003);
     `asistenciaTotal = ingresosValidados + conteosEstimados` con desglose (RN-004);
     importes siempre en centavos enteros (Constitución V).
  4. **Exportación CSV** (US5-AS3) generada en el servidor con los mismos filtros; separador `;`,
     UTF-8 con BOM (se abre bien en Excel en español), sin dependencias.
- **Alternativas**: consultar las tablas de Boletería (viola III); vistas materializadas con
  refresco programado (más piezas; innecesario al volumen de una edición, < 500 funciones).

### R8. Informe de cierre y comparación interanual (FR-010, RN-007, SC-004)

- **Decisión**:
  1. Trabajo programado diario del worker (`operacion.cerrar-ediciones`, 03:00
     `America/Guayaquil`): pasa a `cerrada` la edición cuyo día siguiente a la última función ya
     llegó (RN-007). Desde ahí el dominio rechaza escrituras sobre esa edición (`409`).
  2. Al cerrar se calcula y **congela** el informe en `informe_cierre.datos` (jsonb): actividades,
     elencos, obras, países, asistencia (validada + estimada), ocupación media, recaudación y
     variación frente a la edición anterior. Se puede regenerar a pedido (< 5 min, SC-004; en la
     práctica segundos).
  3. Las ediciones anteriores al sistema (2025: 313 actividades, 116 elencos, 125 obras, 163 162
     asistencias) se cargan como **cifras históricas** sembradas (`cifras_historicas`), para que la
     comparación de 2026 funcione.
- **Funciones finalizadas**: el estado `finalizada` se **deriva** (`fin < ahora` y no cancelada) en
  vez de guardarse con un trabajo programado; RN-005 se comprueba contra el reloj inyectado.
  Menos piezas, mismo comportamiento observable.

### R9. Ediciones y sedes (FR-011, US6)

- **Decisión**:
  1. Las **sedes pertenecen a una edición** (aforo, montaje y horario de taquilla pueden cambiar
     de un año a otro). "Crear a partir de" copia sedes y parámetros con nuevos ids y guarda
     `sede_origen_id` para comparar sedes entre años; no copia funciones (US6-AS1).
  2. Fechas fuera de noviembre: **advertencia** en la respuesta (`advertencias[]`), no error (US6-AS2).
  3. Una sede con funciones no se elimina; solo se desactiva si no tiene funciones futuras (US6-AS3).
  4. Hasta implementar US6 (P3), la semilla crea la edición XI 2026 y sus sedes en el esquema
     `operacion` reutilizando los ids de `prisma/seed/ids.ts`, de modo que Cartelera y Boletería
     no cambian.

---

## Parte B — Identidad

### R10. Hash de contraseñas (RNF-006, Constitución VI)

- **Decisión**: **scrypt de `node:crypto`** (sin dependencias nuevas), parámetros OWASP
  `N = 2^15, r = 8, p = 3` (32 MiB), `maxmem` ajustado, sal de 16 bytes y comparación con
  `timingSafeEqual`. El hash guarda algoritmo y parámetros (`scrypt$N$r$p$sal$hash`) para poder
  subirlos y rehacer el hash en el siguiente inicio de sesión.
- **Por qué**: hash adaptativo y resistente a GPU sin binarios nativos (Windows/CI); cumple
  RNF-004 (< 1 s p95) con ~60–100 ms por verificación.
- **Alternativas**: Argon2id con `@node-rs/argon2` (mejor en papel, pero dependencia nativa nueva
  sin necesidad que la justifique, Constitución X); bcrypt (límite de 72 bytes).

### R11. Contraseñas filtradas (RN-008, clarificación 2026-11-20)

- **Decisión**: lista **local versionada** derivada del listado público de las 100 000 contraseñas
  más filtradas (SecLists, licencia MIT), **filtrada a las de ≥ 10 caracteres** (las demás ya las
  rechaza la longitud mínima), en minúsculas. Se carga una vez en un `Set` al arrancar. Sin
  llamadas externas.
- **Verificación**: prueba unitaria con contraseñas de la lista y fuera de ella (US7-AS4).

### R12. Sesiones (FR-016, US8, US9-AS4, US9-AS5)

- **Decisión** ([ADR-0009](../../docs/adr/0009-sesiones-opacas.md)): **sesiones opacas en
  PostgreSQL**.
  1. Token aleatorio de 256 bits en la cookie `fiavl_sesion` (`HttpOnly`, `Secure` fuera de
     desarrollo, `SameSite=Lax`, `Path=/`). En la base solo se guarda su **SHA-256**.
  2. Expiración deslizante: 30 días de inactividad para el público y **8 horas** para el personal
     (US8-AS1). `ultima_actividad_en` se actualiza como máximo una vez por minuto para no escribir
     en cada petición.
  3. Roles y estado se leen de la base **en cada petición** (una consulta indexada): un cambio de
     rol o una desactivación se aplican de inmediato (US9-AS4 "< 1 minuto", US9-AS5), y "cerrar
     sesión de otro dispositivo" revoca al instante (US8-AS4).
  4. Cambiar la contraseña revoca las demás sesiones (US8-AS3).
  5. **CSRF**: `SameSite=Lax` + comprobación de `Origin` contra `WEB_URL` en métodos no seguros.
- **Alternativas**: JWT sin estado (no se puede revocar ni cambiar el rol antes de que expire, a
  menos que se añada una lista de revocación, que es volver a tener estado); Redis para sesiones
  (componente nuevo, Constitución X).

### R13. Segundo factor del personal (FR-018, US9-AS3, caso borde)

- **Decisión**: **TOTP (RFC 6238)** implementado con `node:crypto` (HMAC-SHA1, 30 s, 6 dígitos,
  ventana ±1 paso), probado con los vectores del RFC. El secreto se guarda **cifrado** con
  AES-256-GCM y la llave `IDENTIDAD_CLAVE_CIFRADO` (variable de entorno, nunca en el repo). Se
  guarda el último paso usado para impedir reutilizar un código. El alta muestra un QR `otpauth://`
  generado con `qrcode` (ya es dependencia de la API).
- **Flujo**: una cuenta con algún rol de personal que inicia sesión sin TOTP activo recibe una
  sesión **restringida** (`segundo_factor_ok = false`) que solo permite configurar el TOTP; las
  demás rutas responden `403 requiere_segundo_factor`.
- **Pérdida del dispositivo**: el administrador restablece el TOTP (acción auditada, FR-024).
- **Alternativas**: librería `otpauth` (dependencia para ~40 líneas); SMS (fuera de alcance).

### R14. Bloqueo por intentos fallidos y límites de reenvío (US8-AS2, caso borde)

- **Decisión**: tabla `intento_acceso` por correo normalizado. Con 5 fallos en 15 minutos,
  `cuenta.bloqueada_hasta = ahora + 15 min` y se encola un aviso al titular. La respuesta de un
  login fallido es **la misma** exista o no la cuenta (FR-016). Reenvío de verificación: máximo 3
  por hora por cuenta.
- **Por qué**: cubre la regla de la spec sin servicios de rate limiting externos.

### R15. Registro, verificación y recuperación (US7, US8-AS3, FR-014, FR-015, FR-017)

- **Decisión**:
  1. Correo normalizado (`trim` + minúsculas) con índice único (caso borde `Ana@Mail.com`).
  2. Registro con correo ya existente: misma respuesta `202` y se envía al dueño un aviso
     "alguien intentó registrarse con tu correo" (US7-AS3).
  3. Enlaces de un solo uso: token aleatorio de 256 bits en la URL, en la base solo su SHA-256,
     con `expira_en` (24 h verificación, 1 h recuperación) y `usado_en`.
  4. Aceptar la política de privacidad crea un `consentimiento` con la versión vigente (US7-AS5,
     US11-AS4).
  5. **Verificación exigida** (FR-015): el contexto de identidad expone `correoVerificado`;
     Boletería ya lo comprueba (`RequiereCuentaVerificada`), Convocatorias lo hará igual.

### R16. Roles, alcance y autorización (FR-019, FR-020, RN-009, SC-007)

- **Decisión**:
  1. Roles: `asistente`, `postulante`, `curador`, `coordinacion_convocatorias`,
     `coordinacion_provincial`, `programador`, `jefe_sala`, `taquilla`, `validador`, `direccion`,
     `administrador`. Alcance obligatorio: `taquilla`, `validador`, `jefe_sala` → sede;
     `coordinacion_provincial` → provincia; `curador` → disciplina (caso borde: sin alcance no se
     guarda).
  2. Dentro de Operación e Identidad, un guard `@Requiere(rol, { alcance })` comprueba rol **y**
     alcance en el servidor, como `verificarAlcanceSede` de Boletería.
  3. **Matriz de autorización** en una prueba de integración parametrizada (rol × operación →
     permitido/denegado) que cubre SC-007 y US9-AS1/AS2.
  4. Asignar o revocar roles emite `RolAsignado` y queda en la auditoría (US9-AS4, FR-024).

### R17. Notificaciones por correo (FR-021, FR-022, US10, RNF-005, RNF-007, SC-008)

- **Decisión** ([ADR-0011](../../docs/adr/0011-notificaciones-con-cola.md)):
  1. **Puerto `ProveedorCorreo`** con adaptadores: SMTP genérico con **nodemailer** (Mailpit en
     desarrollo, cualquier proveedor SMTP en producción) y uno en memoria para pruebas.
  2. Cada evento a notificar crea filas en `notificacion` con **clave de deduplicación**
     `tipoEvento:eventoId:destinatario` única (RN-011, US10-AS3); un evento repetido no crea otra.
  3. El envío es un trabajo pg-boss `identidad.enviar-notificacion` encolado en la misma
     transacción; reintentos con espera creciente (`retryDelay` 30 s, `retryBackoff`) y corte a las
     **24 h** desde la creación: después queda `fallida` para revisión (US10-AS2). Un fallo del
     correo nunca bloquea compras ni postulaciones porque estas solo encolan (RNF-007).
  4. **Plantillas** en TypeScript (texto + HTML accesible, en español, sin motor de plantillas):
     entradas emitidas (QR en línea como imagen adjunta `cid:` generada con `qrcode`), función
     reprogramada, función cancelada, devolución, acuse de postulación, subsanación, resultado,
     verificación, recuperación, bloqueo, aviso de registro duplicado y "novedad".
  5. Avisos **de servicio** siempre se envían; los **opcionales** (novedades) respetan la
     preferencia (US10-AS4). En v1 no hay productor de novedades (clarificación 2026-11-20).
  6. "Mis notificaciones" (US10-AS5) lista las filas propias.
- **Destinatarios de cambios de función** (clarificación 2026-11-20): `destinatario_funcion` se da
  de alta con `EntradasEmitidas` (cuenta o `correoDestino`) y de baja con `PedidoReembolsado`. Para
  redactar el aviso, Identidad guarda una **ficha mínima de función** (`funcion_aviso`: título,
  sede, inicio, fin) desde `FuncionProgramada`/`FuncionActualizada`/`FuncionReprogramada`, porque
  `FuncionCancelada` solo trae el id.
- **Alternativas**: API HTTP propietaria de un proveedor (acopla al proveedor); enviar el correo
  dentro de la transacción del negocio (viola RNF-007).

### R18. Datos personales LOPDP (FR-023, US11, RN-010, SC-009)

- **Decisión**:
  1. **Descarga**: JSON generado al momento con cuenta, consentimientos, roles, sesiones y
     notificaciones propias (US11-AS1). Cumple SC-009 (< 24 h) de forma inmediata.
  2. **Eliminación**: si el titular tiene funciones futuras según `destinatario_funcion` +
     `funcion_aviso`, o postulaciones en curso según los eventos de 003, se le informa (US11-AS3);
     si continúa, en una transacción: nombre y correo se reemplazan por valores anónimos, se borran
     credencial, TOTP, sesiones, tokens y destinatarios; se conservan auditoría y notificaciones sin
     datos identificables; se emite `CuentaEliminada`. Las entradas ya emitidas siguen válidas con
     su QR (clarificación 2026-11-20).
  3. **Nueva versión de la política** (US11-AS4): si la versión aceptada no es la vigente, la
     sesión queda restringida a aceptar la política.
- **Límite conocido**: el correo del comprador que Boletería guarda en sus pedidos lo rige la
  spec 002 (RN-010 revisada); Identidad no lo modifica.

### R19. Condición de estudiante (FR-025, US12, RN-012)

- **Decisión**: el administrador carga `dominio_institucional`. El asistente pide verificar un
  correo de esos dominios; recibe un enlace (mismo mecanismo que R15) y, al abrirlo, se crea una
  `acreditacion` con `vigente_hasta` = fin de la edición vigente (conocida por
  `ProgramacionPublicada`, RN-012). El contexto de identidad expone `estudianteAcreditado`, que
  Boletería ya usa para funciones `restringida`.

### R20. Auditoría (FR-012, FR-024, Constitución IX)

- **Decisión**: tablas `operacion.auditoria` e `identidad.auditoria` **solo de inserción** (la
  migración revoca `UPDATE`/`DELETE` y añade un trigger que los rechaza), con actor, rol, acción,
  entidad, valores anterior/nuevo y `correlacionId`. Las pruebas de cada acción auditable
  comprueban la fila (Constitución IX). Nunca se registran contraseñas, tokens ni secretos TOTP.

---

## Integración con los módulos existentes

### R21. Reemplazo de los adaptadores temporales de identidad (FR-020)

- **Situación**: Boletería usa `AutorizacionDevAdapter` (cabeceras `x-*-dev`, falla cerrada fuera
  de development/test) detrás de su puerto `AutorizacionBoleteriaPort`; Cartelera usa
  `SesionGuard` (cabecera `x-cuenta-dev`).
- **Decisión**:
  1. `@fiavl/contracts` publica el contrato **`IdentidadPublica`** (ver
     [contracts/identidad-publica.md](contracts/identidad-publica.md)): token de inyección
     `IDENTIDAD_PUBLICA` e interfaz `resolverSesion(req) → ContextoIdentidad | null` con
     `cuentaId`, `correo`, `correoVerificado`, `estudianteAcreditado` y `roles[{ rol, alcance }]`.
  2. El módulo `identidad` lo provee como proveedor **global** de Nest. Los demás módulos dependen
     del contrato, nunca del código de `identidad` (regla 1 de la vista de desarrollo).
  3. **Boletería**: nuevo adaptador `autorizacion-identidad.adapter.ts` que implementa su
     `AutorizacionBoleteriaPort` traduciendo `ContextoIdentidad` (roles y alcance de sede). El
     adaptador dev sigue disponible para sus pruebas. **No cambia la spec 002 ni su puerto**.
  4. **Cartelera**: `SesionGuard` pasa a usar `IDENTIDAD_PUBLICA`.
  4b. **Convocatorias** (rama 003, aún sin fusionar): ya define `AutorizacionConvocatoriasPort`
     con un contexto propio (roles con el texto literal de FR-019, p. ej.
     `'coordinación de convocatorias'`, y alcance `{ sedeId?, provincia?, disciplina? }`). Cuando
     esté en `main`, un adaptador suyo traduce `ContextoIdentidad` con una tabla fija de códigos;
     su contrato `autorizacion-identidad.md` ya lo prevé. Aprobación de @Carlos2190.
  5. Estos cambios tocan código de @By-Alvarez06 y @Kevrc: van en **un PR propio** con su
     aprobación (Constitución §6) y `/security-review` (Q8).
  6. Web: `panel-sesion-dev.tsx` y la cookie `sesion_dev` se sustituyen por el inicio de sesión
     real; quedan solo para E2E mientras se migran.

### R22. Semilla y simulador de eventos

- **Decisión**: la semilla de la edición 2026 pasa a escribir en el esquema `operacion` y a
  publicar sus eventos por el mismo camino que la aplicación (sin cola, como hoy), conservando los
  ids de `prisma/seed/ids.ts`. Siembra también cuentas de prueba con roles (sustituyen a las
  cabeceras dev en E2E). `scripts/emitir-evento.ts` se mantiene para simular eventos de 003.
  La semilla de 003 usa hoy otro `edicionId` (`22222222-…`); al integrarse debe tomar el de
  `prisma/seed/ids.ts` para que sus convocatorias cuelguen de la edición que crea Operación.

### R23. Pruebas y dependencias nuevas

- **Pruebas** (Constitución IV, mismo stack que 002): Vitest con cobertura ≥ 80 % en `domain/` de
  ambos módulos; integración con Testcontainers (PostgreSQL real, necesario para las
  restricciones `EXCLUDE`); contratos zod de eventos nuevos; matriz de autorización; Playwright +
  axe para la grilla, el registro e inicio de sesión; k6 para la grilla de 60 funciones (RNF-001)
  y el inicio de sesión (RNF-004).
- **Dependencias nuevas** (Constitución X, justificadas):

  | Dependencia | Para qué | Por qué no lo existente |
  |-------------|----------|-------------------------|
  | `nodemailer` (+ `@types/nodemailer`) | Envío SMTP de notificaciones | `node:net` a mano no cubre TLS/AUTH/MIME de forma segura |
  | Extensión PostgreSQL `btree_gist` | `EXCLUDE` con igualdad de uuid + rango | Viene con PostgreSQL 16; sin instalar nada |
  | Contenedor **Mailpit** (solo desarrollo) | Ver los correos en `localhost:8025` | Evita enviar correos reales al probar |

  Todo lo demás (scrypt, TOTP, tokens, CSV) usa `node:crypto` y código propio.
