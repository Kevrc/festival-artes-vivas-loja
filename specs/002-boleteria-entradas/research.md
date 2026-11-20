# Research: Boletería y control de acceso (002)

**Fase 0 de `/speckit-plan`.** Cada decisión parte de un requisito de la [spec](spec.md), de la
[constitución](../../.specify/memory/constitution.md) o de un driver de
[00-drivers.md](../../docs/arquitectura/00-drivers.md). El stack base (NestJS, Next.js, PostgreSQL 16,
Prisma multiSchema, pg-boss) ya está definido en [ADR-0002](../../docs/adr/0002-stack-por-necesidades.md)
y el esqueleto del monorepo ya existe desde la spec 001. Aquí se resuelven las decisiones propias
de **Boletería**.

---

## R1. Control de aforo sin sobreventa y retención temporal de 10 minutos

- **Necesidad**: FR-003, FR-004, RN-001, RNF-001, SC-001, QA-1 y [ADR-0004](../../docs/adr/0004-control-de-aforo.md) (500 compras simultáneas sobre 100 lugares → exactamente 100 entradas emitidas, compartiendo inventario entre web, taquilla y reservas).
- **Decisión**:
  1. Mantener una sola fila por función en `boleteria.inventario_funcion` (`aforo_habilitado`, `retenidos`, `emitidos`, `usados`).
  2. Toda retención para pago en línea ejecuta la sentencia atómica condicional:
     ```sql
     UPDATE boleteria.inventario_funcion
     SET retenidos = retenidos + :n, actualizado_en = now()
     WHERE funcion_id = :id
       AND estado_funcion IN ('programada', 'reprogramada')
       AND aforo_habilitado - emitidos - retenidos >= :n
     RETURNING *;
     ```
     El pedido se crea como `pendiente` con `vence_en = ahora + 10 minutos`.
  3. Las **reservas gratuitas** y las **ventas en taquilla** (sin cobro asíncrono en línea) incrementan directamente `emitidos = emitidos + :n` con la misma condición `aforo_habilitado - emitidos - retenidos >= :n`, evitando estados intermedios innecesarios.
  4. Al confirmarse un pago web en plazo, la misma transacción pasa `retenidos -= n` y `emitidos += n`. Si el pago es rechazado, pasa `retenidos -= n` de inmediato.
  5. Un trabajo programado en el `worker` cada **30 segundos** (`boleteria.expirar-retenciones`) toma pedidos `pendiente` con `vence_en <= ahora` (bloqueando con `FOR UPDATE SKIP LOCKED`), los marca `expirado`, decrementa `retenidos` y encola `DisponibilidadCambiada`.
  6. Si el `UPDATE` devuelve `0` filas porque no alcanza el cupo, se consulta `disponibles = max(0, aforo_habilitado - emitidos - retenidos)` para devolver `409` con el mensaje exacto ("Agotado" o "Solo quedan N lugares", US1-AS3 y US4-AS1).
- **Por qué**: garantiza el invariante `emitidos + retenidos <= aforo_habilitado` en PostgreSQL sin `SELECT ... FOR UPDATE` prolongados ni contadores duplicados en memoria.
- **Alternativas descartadas**: leer cupo y luego actualizar (condición de carrera); bloquear toda la función en Redis (doble fuente de verdad frente a dinero/entradas y componente nuevo contra Constitución X).

## R2. Idempotencia en compra, reserva, webhook y confirmación tardía

- **Necesidad**: FR-005, US1-AS4, US1-AS6, SC-005, QA-9 y Constitución V.
- **Decisión**:
  1. Toda operación de creación (`POST /pedidos`, `POST /reservas`, `POST /taquilla/ventas`) exige cabecera `Idempotency-Key` (UUID/token generado por el cliente por intención de compra) guardada en `boleteria.pedido.clave_idempotencia` con restricción `UNIQUE`. Un reintento con la misma clave devuelve el pedido ya creado (y su URL de pago o entradas) sin volver a retener ni cobrar.
  2. La clave `Idempotency-Key` valida coincidencia de `(canal, cuenta_id, funcion_id, cantidad)`; si el cliente reutiliza la misma clave con parámetros distintos, responde `409`.
  3. Toda confirmación de cobro o devolución (por webhook o conciliación) registra una fila inmutable en `boleteria.movimiento_pago` con índice único parcial por `(proveedor, referencia_proveedor, tipo)`. Un webhook repetido encuentra el movimiento ya registrado y responde `200 OK` sin duplicar entradas ni devoluciones.
  4. **Confirmación tardía sobre pedido `expirado` (US1-AS6)**: al llegar una aprobación de pago para un pedido cuyo estado ya pasó a `expirado`, el servidor intenta atómicamente `UPDATE ... SET emitidos = emitidos + cantidad WHERE aforo_habilitado - emitidos - retenidos >= cantidad`:
     - Si logra retener los lugares: registra el cobro en `movimiento_pago`, pasa el pedido a `pagado`, emite las entradas y encola `EntradasEmitidas` + `DisponibilidadCambiada`.
     - Si ya no hay lugares (`0` filas): registra el cobro en `movimiento_pago`, solicita la **devolución total automática** al `ProveedorPagos`, registra el movimiento compensatorio `reembolso`, marca el pedido como `reembolsado` y encola `PedidoReembolsado` (para que Identidad notifique al asistente).
- **Alternativas descartadas**: bloquear la página en espera del webhook o rechazar pagos tardíos sin devolver automáticamente el dinero (viola US1-AS6 y Constitución V).

## R3. Límites por pedido y por persona, y funciones de público restringido

- **Necesidad**: FR-006, US3-AS4, RN-002, RN-007.
- **Decisión**:
  1. `inventario_funcion` almacena `precio_centavos`, `max_por_pedido` y `max_por_persona` recibidos de la edición/función (valores por defecto: **6** entradas en funciones `pagada` y **4** entradas en funciones `gratuita_reserva` / `restringida`). Al crear un pedido, `importe_centavos = cantidad * precio_centavos` queda congelado en el pedido (RN-002).
  2. En compras y reservas con cuenta (`cuenta_id` presente), dentro de la misma transacción (bloqueando la fila del usuario o serializando por clave de bloqueo consultivo `pg_advisory_xact_lock(hashtext(cuenta_id || funcion_id))`) se contabilizan las entradas activas (`valida` o `usada`) más la `cantidad` de pedidos `pendiente` del usuario para esa función. Si `acumulado + cantidad > max_por_persona`, se rechaza antes de tocar el inventario.
  3. En funciones con `tipo_acceso = 'restringida'` (`publico = 'estudiantes'`): el canal web exige `estudianteAcreditado === true` en la sesión entregada por Identidad (004 US12); si no lo tiene, se rechaza con `403` indicando que requiere acreditación de estudiante o gestión en taquilla (RN-007).
- **Alternativas descartadas**: validar límites solo en el frontend (fácilmente evadible con dos pestañas o peticiones directas).

## R4. Evaluación del proveedor de pagos ecuatoriano y capa anticorrupción

- **Necesidad**: FR-010, C-3, QA-1, QA-9, Constitución V y [ADR-0007](../../docs/adr/0007-pagos-capa-anticorrupcion.md) (elegir proveedor real que cumpla los criterios obligatorios y mantener adaptador simulado en local/CI).
- **Evaluación frente a los criterios de ADR-0007**:

| Criterio (ADR-0007) | PayPhone (Button/Link v2) | Kushki | Datafast (Web Checkout) |
|---------------------|---------------------------|--------|-------------------------|
| Cobro en USD a tarjetas en Ecuador (obligatorio) | Sí (Visa/Mastercard/saldo) | Sí | Sí |
| Sandbox con tarjetas de prueba (obligatorio) | Sí (entorno developer con token) | Sí (sandbox) | Sí (ambiente de pruebas) |
| Webhook firmado o consulta de estado (obligatorio) | Sí (webhook + `Confirm` / `Sale` query) | Sí (webhook + query) | Sí (consulta de estado / callback) |
| API de devolución total (obligatorio) | Sí (`Reverse` / reembolso por transacción) | Sí (`void` / `refund`) | Sí (anulación / reverso) |
| Página alojada sin tocar tarjeta (obligatorio) | Sí (Cajita / Link de pago alojado) | Sí (SmartLinks / Checkout alojado) | Sí (Dataweb hosted) |
| Referencia propia `pedidoId` para idempotencia (obligatorio) | Sí (`clientTransactionId`) | Sí (`metadata` / `orderId`) | Sí (`merchantTransactionId`) |
| Comisión / fricción frente a entradas de USD 5 (deseable) | Baja sin mensualidad fija en plan estándar | Orientado a volumen empresarial, mayor fricción de alta | Contrato bancario y costo fijo mensual |

- **Decisión**:
  1. Elegir **PayPhone** como proveedor objetivo para staging/producción implementando el puerto `ProveedorPagos` (`iniciarCobro`, `consultarPago`, `devolverPago`, `verificarWebhook`) mediante `PayPhoneAdapter` con `clientTransactionId = pedido.id` y monto entero en centavos (`amount` en centavos USD, tal como exige la API y la Constitución V).
  2. Mantener **`SimuladorPagosAdapter`** para desarrollo local, CI, pruebas de concurrencia (RNF-001) y simulación de proveedor caído (caso borde: si `iniciarCobro` falla por error de red/5xx, la retención se libera de inmediato, el pedido pasa a `fallido` y la API responde `503` con mensaje "Pago en línea temporalmente no disponible; puedes adquirir en taquilla en efectivo").
  3. Un trabajo programado cada **2 minutos** (`boleteria.conciliar-pagos`) consulta `ProveedorPagos.consultarPago` para pedidos `pendiente` creados hace más de 90 segundos cuyo webhook aún no llegó (ADR-0007).
  4. *Nota de gobernanza*: el cambio de estado de ADR-0007 de `propuesta` a `aceptada` se propondrá en PR de documentación/revisión conjunta según Constitución §6.
- **Alternativas descartadas**: Kushki o Datafast por mayor fricción contractual/costos fijos frente a entradas de USD 5; acoplar el SDK directo del proveedor al dominio (viola ADR-0007).

## R5. Firma criptográfica Ed25519 del QR y código corto legible

- **Necesidad**: FR-007, US2-AS7, QA-5, QA-7 y [ADR-0005](../../docs/adr/0005-qr-firmado-validador-offline.md).
- **Decisión**:
  1. Cada entrada emitida recibe un **token firmado con Ed25519** usando `node:crypto`:
     - Carga útil canónica: `v1.<entradaId>.<funcionId>.<emitidaEnEpochSeg>`
     - Token final en el QR: `v1.<entradaId>.<funcionId>.<emitidaEnEpochSeg>.<firmaBase64Url>` (~160 caracteres, densidad baja de QR fácil de escanear en pantallas con poco brillo).
  2. La llave privada (`BOLETERIA_QR_PRIVADA_PEM`, PKCS8 Ed25519) vive **solo** en variables de entorno del servidor (en desarrollo/test se deriva o genera de forma efímera si no se configura, nunca en producción donde es obligatoria). La llave pública (`SPKI` Base64) se entrega al validador en el paquete de función.
  3. En el navegador (`apps/web/src/app/validador`), la verificación offline usa la **Web Crypto API** nativa (`crypto.subtle.verify('Ed25519', publicKey, firma, payload)`), sin dependencias criptográficas de terceros.
  4. Cada entrada también genera un **`codigo_corto`** único de **8 caracteres** sobre el alfabeto sin ambigüedad `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (omite `0, 1, I, L, O`), formateado visualmente como `XXXX-XXXX` bajo el QR para ingreso manual cuando el QR no se lee (US2-AS7).
- **Alternativas descartadas**: UUID aleatorio en el QR (exige conexión en puerta); JWT con HMAC-SHA256 (expondría el secreto compartido en cada celular del validador).

## R6. Validador PWA sin conexión, IndexedDB y resolución de conflictos

- **Necesidad**: US2, FR-008, RN-003, RNF-003, RNF-005, SC-003, QA-5 y ADR-0005.
- **Decisión**:
  1. **Descarga previa (`GET /api/boleteria/validador/funciones/{funcionId}/paquete`)**: devuelve la llave pública Ed25519, datos de la función (obra, sede, `inicio`, `fin`, `ventanaInicio = inicio - 60 min`, `horaServidor`), versión del paquete y todas las entradas de la función con `{ entradaId, codigoCorto, estado, usadaEn, puerta }` — **sin datos personales** del comprador (Constitución VI).
  2. **Almacenamiento local**: **IndexedDB** (`fiavl-validador`) con dos almacenes: `paquetes` (índice por `funcionId` y `codigoCorto`) y `colaIngresos` (pendientes de sincronizar).
  3. **Service Worker** en `/validador/sw.js` (sin librerías externas pesadas) precacheando la ruta `/validador` y los assets estáticos para operar más de 4 horas sin red (RNF-005).
  4. **Regla de respuesta en pantalla completa (< 2 s, RNF-003)**:
     - **Verde**: válida (`estado = 'valida'`, firma Ed25519 correcta o `codigoCorto` en lista, función coincide, dentro de `[inicio - 60 min, fin]` según RN-003). Actualiza localmente la entrada a `usada` con `escaneadoEn` y `dispositivoId` y guarda el ingreso en `colaIngresos`.
     - **Ámbar**: misma entrada ya validada hace `< 60 segundos` en este **mismo `dispositivoId`** (evita rechazar por doble lectura accidental de cámara, US2).
     - **Rojo**: cualquier otro caso, mostrando texto explícito además de color (WCAG 2.1 AA): ya `usada` hace ≥ 60 s o en otra puerta (muestra hora y puerta, US2-AS2), pertenece a otra función (muestra obra, sede y horario correctos cuando hay red o datos conocidos, US2-AS3), `anulada` (US2-AS4), `liberada` (US3-AS2), firma falsa, o fuera de ventana horaria (RN-003).
  5. **Sincronización (`POST /api/boleteria/validador/sincronizar`)**: envía el lote de ingresos locales con el desfase medido respecto a `horaServidor` del último paquete descargado (mitigación ante cambio manual del reloj del celular, caso borde). En servidor:
     - Si un ingreso con mismo `(entradaId, dispositivoId, escaneadoEn)` ya existe, es idempotente.
     - Si ya existe un primer ingreso aceptado de otro dispositivo: conserva el primero por hora efectiva, registra el segundo en `ingreso` con `es_conflicto = true`, devuelve el detalle del conflicto al validador y encola `ConflictoDeIngreso` hacia Operación (US2-AS6).
  6. **Escaneo en cámara**: detección nativa con `BarcodeDetector` cuando el navegador lo soporta y respaldo con lector ligero o campo de código corto accesible por teclado (WCAG).
- **Alternativas descartadas**: `localStorage` (límite de ~5 MB y sin transacciones atómicas); exigir red para validar (falla QA-5).

## R7. Reservas gratuitas y liberación automática 10 minutos antes del inicio

- **Necesidad**: US3, FR-002, FR-013, RN-001.
- **Decisión**:
  1. `POST /reservas` solo acepta funciones en `estado_funcion IN ('programada', 'reprogramada')` y `tipo_acceso IN ('gratuita_reserva', 'restringida')`. Para `gratuita_libre` responde `422` ("Esta función es de entrada libre y no requiere reserva", US3-AS3).
  2. La reserva descuenta cupo con `emitidos += cantidad`, crea un `Pedido` con `tipo = 'reserva'`, `estado = 'confirmado'`, `importe_centavos = 0`, emite las entradas QR y encola `EntradasEmitidas` + `DisponibilidadCambiada`.
  3. El asistente puede cancelar su reserva antes de `inicio` (`POST /pedidos/{id}/cancelar-reserva`, US3-AS5): pasa las entradas `valida` a `anulada`, decrementa `emitidos`, pasa el pedido a `cancelado` (o `anulado`) y libera inmediatamente los lugares.
  4. Un trabajo programado cada **60 segundos** (`boleteria.liberar-reservas`) busca funciones `gratuita_reserva` con `reservas_liberadas = false` y `ahora >= inicio - 10 minutos`: pasa todas sus entradas `valida` (que no tengan `Ingreso`) a estado `liberada`, resta esa cantidad de `emitidos`, marca `reservas_liberadas = true` y publica `DisponibilidadCambiada` (US3-AS2, FR-013).
- **Alternativas descartadas**: programar un job individual por cada reserva (genera cientos de jobs innecesarios; un barrido por función cada minuto es exacto dentro del margen de 60 s y simple).

## R8. Taquilla física, medios de pago y cierre de caja con arqueo

- **Necesidad**: US4, US5-AS4, FR-011, FR-016, RN-004, SC-006.
- **Decisión**:
  1. Un usuario con rol `taquilla` y alcance `sedeId` puede tener a lo sumo **una caja `abierta`** a la vez en su sede (índice único parcial en `boleteria.caja` donde `estado = 'abierta'`).
  2. `POST /taquilla/ventas` exige `caja` abierta del vendedor autenticado en la misma `sedeId` de la función (US4-AS4, Constitución VI), admite `efectivo` o `tarjeta_datafono` (el datáfono es externo, supuestos de spec), no exige cuenta ni correo del comprador (US4-AS5) y permite vender incluso después de los 30 minutos posteriores al inicio si la caja está abierta (caso borde de RN-004: solo la venta en línea cierra a `inicio + 30 min`).
  3. Cada venta en taquilla registra un `movimiento_caja` de tipo `venta` (inmutable) y cada devolución en efectivo de una función cancelada (`POST /taquilla/devoluciones`, US5-AS4) registra un `movimiento_caja` de tipo `egreso_devolucion` al anular la entrada presentada.
  4. `POST /taquilla/cajas/{id}/cerrar` calcula en servidor dentro de una transacción:
     `efectivo_esperado = fondo_inicial + SUM(ventas efectivo) - SUM(egresos_devolucion efectivo)`
     y persiste `efectivo_declarado`, `diferencia = declarado - esperado`, `estado = 'cerrada'`, `cerrada_en` y registro en `auditoria_boleteria` (US4-AS3, SC-006).
- **Alternativas descartadas**: mantener inventario separado para taquilla (viola FR-003 y genera sobreventa).

## R9. Cancelación, reprogramación, cambio de aforo y plazo de 7 días

- **Necesidad**: US5, FR-012, RN-005, RN-006 y casos borde.
- **Decisión**:
  1. **Consumidor de `FuncionCancelada`**:
     - Actualiza `estado_funcion = 'cancelada'`.
     - Anula todas las entradas `valida` de esa función (`estado = 'anulada'`).
     - En cada pedido `pagado` (web o taquilla con pago > 0) fija `plazo_eleccion_hasta = ahora + 7 días` y notifica opciones.
     - Encola `DisponibilidadCambiada` (`lugaresRestantes = 0`).
  2. **Elección del comprador (`POST /pedidos/{id}/eleccion-cancelacion`)**:
     - `devolucion`: en pedidos web ejecuta `ProveedorPagos.devolverPago`, registra `movimiento_pago` (`reembolso`), actualiza `estado = 'reembolsado'`, `resolucion_cancelacion = 'devolucion'` y publica `PedidoReembolsado`.
     - `cambio`: valida que `nuevaFuncionId` pertenezca a la misma `obra_id`, esté `programada` o `reprogramada`, tenga el mismo `tipo_acceso` y precio compatible; consume `cantidad` lugares atómicamente en `nuevaFuncionId`, crea un nuevo pedido en estado `pagado` (`canal = 'cambio'`, `pedido_origen_id = pedido.id`, `importe_centavos = 0`), emite nuevas entradas QR, marca el pedido original con `resolucion_cancelacion = 'cambiado'` y publica `EntradasEmitidas` + `DisponibilidadCambiada` (US5-AS3).
  3. **Plazo vencido de 7 días (US5-AS5)**: trabajo programado cada 15 min (`boleteria.devoluciones-vencidas`) que busca pedidos `pagado` de funciones canceladas con `plazo_eleccion_hasta <= ahora` y `resolucion_cancelacion IS NULL`, y dispara la devolución automática vía `ProveedorPagos`.
  4. **Consumidor de `FuncionReprogramada`**: actualiza `inicio`, `fin`, `sede_id`, `estado_funcion = 'reprogramada'` y `version_origen`. Mantiene todas las entradas en estado `valida` (RN-005) y marca el pedido como elegible para devolución voluntaria por reprogramación (RN-006, caso borde).
  5. **Consumidor de `AforoCambiado`**: actualiza `aforo_habilitado`. Nunca anula entradas ya emitidas; la disponibilidad derivada `max(0, aforo_habilitado - emitidos - retenidos)` bloquea nuevas ventas si `emitidos + retenidos >= aforo_habilitado`. Si `emitidos + retenidos > aforo_habilitado`, encola `AforoExcedido` hacia Operación (caso borde).
- **Alternativas descartadas**: reembolsar automáticamente en el segundo 0 sin dar opción de cambio (incumple US5-AS3).

## R10. Publicación de eventos y frontera con Programación, Operación e Identidad

- **Necesidad**: FR-014, FR-016, Constitución III y contratos existentes en [eventos-consumidos.md](../001-cartelera-programacion/contracts/eventos-consumidos.md) y `packages/contracts/src/eventos/`.
- **Decisión**:
  1. **Contratos de eventos en `@fiavl/contracts`**: reutilizar `DisponibilidadCambiada`, `ProgramacionPublicada`, `FuncionProgramada`, `FuncionActualizada`, `FuncionReprogramada` y `FuncionCancelada` ya existentes; añadir los esquemas Zod de `AforoCambiado` (consumido de Operación) y los eventos publicados por Boletería (`EntradasEmitidas`, `IngresoRegistrado`, `PedidoReembolsado`, `ConflictoDeIngreso`, `AforoExcedido`), probados con `Esquema.parse()` antes de encolar.
  2. **Agrupación de `DisponibilidadCambiada`**: al encolar hacia `programacion.disponibilidad-cambiada` desde una transacción de inventario, se usa `singletonKey: funcionId` en `pg-boss` con `singletonSeconds: 5` (o throttle equivalente cuando no es evento terminal como cancelación/agotamiento) para no inundar la cola durante ráfagas de compra, enviando el `lugaresRestantes` calculado en ese instante (acordado en `001/contracts/eventos-consumidos.md`).
  3. **Autorización (`AutorizacionBoleteriaPort`)**: interfaz hexagonal en `boleteria/application/puertos.ts` que refleja el futuro `AutorizacionPort` de Identidad (spec 004): `{ cuentaId, correoVerificado, estudianteAcreditado, roles: { rol, sedeId? }[] }`. Mientras 004 no esté integrado, la implementación de desarrollo lee las cabeceras de prueba solo si `NODE_ENV === 'development' || NODE_ENV === 'test'` y responde `401`/`403` cerrado en cualquier otro entorno (mismo criterio de `SesionGuard` en 001).
  4. **Consumo de `ProgramacionPublicada`, `FuncionProgramada`, `FuncionActualizada`, `FuncionReprogramada`, `FuncionCancelada` y `AforoCambiado`**: consumidor idempotente en `boleteria.evento_procesado` con control de versión por `funcion_id` (`version > version_origen`). Si `AforoCambiado` aún no es emitido por Operación durante desarrollo independiente, el script `pnpm events:emit` se ampliará para soportarlo en pruebas.
- **Alternativas descartadas**: leer tablas de `operacion` o `identidad` desde PostgreSQL (viola Constitución III y ADR-0001).

## R11. Pruebas, verificación de SC-001..SC-006 y justificación de dependencias

- **Necesidad**: Constitución IV y X; verificación de `SC-001`–`SC-006` y `RNF-001`–`RNF-005`.

| Criterio | Cómo se verifica | Herramienta |
|----------|------------------|-------------|
| Reglas RN-001..RN-007, cálculo de disponibilidad, arqueo, firma Ed25519 y lógica offline | Pruebas unitarias de funciones puras (≥ 80 % cobertura en `domain/`) | Vitest + `@vitest/coverage-v8` |
| SC-001 / RNF-001: 500 compras concurrentes sobre 100 lugares → 100 entradas | Prueba de integración real lanzando 500 solicitudes paralelas contra PostgreSQL | Vitest + Testcontainers |
| SC-005: cero cobros duplicados y webhooks repetidos | Integración con `Idempotency-Key` y webhooks duplicados/tardíos | Vitest + Testcontainers |
| SC-006: cierre de caja con diferencia 0 | Integración venta efectivo + datáfono + devolución + cierre | Vitest + Testcontainers |
| Contratos de eventos publicados y consumidos | Validación de esquemas y ejemplos válidos/inválidos | Vitest + Zod |
| US1–US6 en navegador, validador PWA offline y WCAG 2.1 AA (320 px) | Flujos E2E, `context.setOffline(true)` y auditoría axe | Playwright + `@axe-core/playwright` |
| RNF-002 / RNF-003 (< 2 s p95 en compra/reserva y validación) | Prueba de carga sobre `/pedidos` y `/validador/validar` | k6 |

- **Dependencia nueva a justificar (Constitución X)**:

| Dependencia | Necesidad | Driver | Alternativa descartada |
|-------------|-----------|--------|------------------------|
| `qrcode` (+ `@types/qrcode` en dev) | Generar los QR de entradas en SVG/DataURL en servidor (correos/impresión) y navegador ("Mis entradas", taquilla) sin llamadas externas | FR-007, Constitución VI (no enviar el token firmado Ed25519 a un generador QR externo) | Servicio HTTP externo de QR (filtra el token y falla sin red en taquilla local) |

Para lectura en cámara del validador se usa `BarcodeDetector` nativo del navegador junto con el ingreso por código corto manual (US2-AS7), evitando dependencias pesadas innecesarias salvo que un navegador de prueba sin `BarcodeDetector` lo requiera durante la implementación.

---

**Resultado**: no quedan `NEEDS CLARIFICATION` en el contexto técnico.
