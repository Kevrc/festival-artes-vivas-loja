# Feature Specification: Boletería y control de acceso

**Feature Branch**: `002-boleteria-entradas`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "Boletería del festival: el asistente compra entradas para funciones pagadas (precio único por edición) o reserva gratis en funciones gratuitas con aforo; recibe una entrada digital con código QR; la taquilla física comparte el mismo inventario; el personal de sala valida el ingreso incluso sin internet; se respeta el aforo sin sobreventa; las cancelaciones generan devoluciones."

**Contexto acotado**: Boletería. Dueño de Pedidos, Entradas, Ingresos, Pagos, Cajas y del
inventario de lugares por función.

## Contexto del problema

En 2026 hubo 23 obras y 28 funciones con boleto a USD 5, vendidas en una plataforma externa y en
las taquillas de los cuatro espacios cerrados (Teatro Nacional Benjamín Carrión, Teatro Bolívar,
Teatro Segundo Cueva Celi y Centro Cultural Alfredo Mora Reyes). Las funciones gratuitas en
salas también están sujetas a aforo. Los riesgos principales son la **sobreventa** cuando web y
taquilla venden a la vez, los **cobros duplicados**, el **fraude con QR copiados** y la **falta
de internet** en la puerta de las salas. En 2023 todas las entradas fueron gratuitas con reserva
web, lo que muestra que el modelo de precio cambia entre ediciones.

## Actores

- **Asistente**: compra o reserva entradas; necesita cuenta verificada (spec 005).
- **Taquilla**: vende o entrega entradas presenciales; cierra su caja.
- **Validador**: escanea entradas en la puerta.
- **Programador / Operación**: define aforo habilitado y cancela funciones (spec 004).
- **Proveedor de pagos** (externo): autoriza cobros y devoluciones.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Comprar entradas para una función pagada (Priority: P1)

El asistente elige una función pagada, indica cuántas entradas quiere (hasta el máximo por
compra), los lugares quedan retenidos mientras paga en línea y, al confirmarse el pago, recibe
sus entradas con QR por correo y en "Mis entradas".

**Why this priority**: Es el flujo que genera ingresos y el de mayor riesgo (dinero y aforo).

**Independent Test**: Con una función de aforo 10, comprar 2 entradas con el proveedor de pagos
en modo de prueba y verificar 2 entradas únicas y 8 lugares disponibles.

**Acceptance Scenarios**:

1. **Given** una función a USD 5 con 50 lugares, **When** compra 3 y el pago se aprueba,
   **Then** recibe 3 entradas con QR distinto, paga USD 15,00 y quedan 47 lugares.
2. **Given** el pago es rechazado, **When** termina el intento, **Then** no se emite ninguna
   entrada, los lugares se liberan y el asistente puede reintentar.
3. **Given** quedan 2 lugares, **When** pide 3, **Then** se le informa que solo hay 2 y no se
   inicia el pago.
4. **Given** el asistente pulsa "pagar" dos veces o su conexión se corta y reintenta, **When** el
   proveedor confirma, **Then** se cobra y se emite **una sola vez**.
5. **Given** un pedido retenido, **When** pasan 10 minutos sin confirmación de pago, **Then** el
   pedido expira y los lugares vuelven al inventario.
6. **Given** el proveedor confirma un pago de un pedido ya expirado, **When** llega la
   confirmación, **Then** si hay lugares se emiten las entradas; si no, se ordena la devolución
   automática y se avisa al asistente.

---

### User Story 2 - Validar el ingreso en la sala (Priority: P1)

El validador abre la función que controla, escanea el QR con el celular y el sistema responde en
pantalla completa **verde** (válida), **rojo** (rechazada, con motivo) o **ámbar** (ya validada
hace menos de 1 minuto en este mismo dispositivo, para evitar dobles lecturas).

**Why this priority**: Sin validación las entradas no protegen el aforo ni evitan fraude.

**Independent Test**: Escanear una entrada válida (acepta), escanearla otra vez (rechaza como
usada) y escanear una de otra función (rechaza).

**Acceptance Scenarios**:

1. **Given** una entrada válida para la función de hoy a las 19:00, **When** se escanea en esa
   función desde 60 minutos antes del inicio, **Then** se acepta y queda "usada" con hora,
   validador y dispositivo.
2. **Given** una entrada ya usada, **When** se escanea otra vez, **Then** se rechaza mostrando
   cuándo y en qué puerta se usó.
3. **Given** una entrada de otra función, **When** se escanea, **Then** se rechaza indicando la
   función, sede y hora correctas.
4. **Given** una entrada anulada por cancelación o devolución, **When** se escanea, **Then** se
   rechaza como "anulada".
5. **Given** la sala sin internet, **When** se escanean entradas, **Then** el validador decide con
   la lista descargada de la función y sincroniza al reconectar.
6. **Given** dos validadores sin conexión aceptan el mismo QR, **When** sincronizan, **Then** se
   conserva el primer ingreso, el segundo se marca como conflicto y se alerta a Operación.
7. **Given** el QR no se puede leer, **When** el validador escribe el código corto impreso bajo el
   QR, **Then** la validación funciona igual.

---

### User Story 3 - Reservar en función gratuita con aforo (Priority: P2)

En funciones gratuitas en salas, el asistente reserva lugares sin pagar y recibe su entrada con
QR. Las reservas no validadas se liberan poco antes de la función para el público en puerta.

**Why this priority**: La mayor parte del festival es gratuita y las salas igual tienen aforo.

**Independent Test**: Reservar 2 lugares gratis y comprobar que se emite la entrada sin pago y
baja la disponibilidad.

**Acceptance Scenarios**:

1. **Given** una función gratuita con reserva y aforo 300, **When** reserva 2 lugares, **Then**
   recibe su entrada sin pasar por el pago.
2. **Given** reservas no validadas 10 minutos antes del inicio, **When** llega ese momento,
   **Then** esos lugares se liberan para el público en puerta y la entrada queda "liberada".
3. **Given** una función de acceso libre (plaza, calle), **When** el asistente la ve, **Then** no
   se ofrece reserva: se indica "Entrada libre".
4. **Given** un asistente que ya reservó 4 lugares para una función, **When** intenta reservar
   más, **Then** el sistema lo impide (límite por persona y función).
5. **Given** un asistente que no podrá asistir, **When** cancela su reserva antes del inicio,
   **Then** los lugares vuelven al inventario.

---

### User Story 4 - Venta en taquilla física (Priority: P2)

El personal de taquilla vende o entrega entradas presenciales (efectivo o tarjeta en datáfono),
imprime o muestra el QR, y al final de su turno cierra caja.

**Why this priority**: Hay taquillas físicas en las cuatro salas y comparten aforo con la web.

**Independent Test**: Vender 1 entrada en taquilla y verificar que la disponibilidad en línea
baja en 1 y que aparece en el cierre de caja.

**Acceptance Scenarios**:

1. **Given** 1 lugar libre, **When** taquilla y web intentan venderlo a la vez, **Then** solo una
   venta se concreta y la otra recibe "Agotado".
2. **Given** una venta en efectivo, **When** se registra, **Then** queda en la caja abierta del
   vendedor con medio de pago, importe y hora.
3. **Given** el fin del turno, **When** el vendedor cierra caja declarando el efectivo, **Then** el
   sistema muestra el esperado, el declarado y la diferencia, y la caja queda cerrada.
4. **Given** una caja cerrada, **When** se intenta registrar una venta en ella, **Then** se rechaza.
5. **Given** un asistente sin correo, **When** compra en taquilla, **Then** recibe la entrada
   impresa sin necesidad de cuenta.

---

### User Story 5 - Cancelación de función, devoluciones y cambios (Priority: P3)

Si Operación cancela una función, todas sus entradas se anulan, cada comprador es notificado y
elige devolución o cambio a otra función de la misma obra con disponibilidad.

**Why this priority**: Poco frecuente, pero obligatorio frente al público.

**Independent Test**: Cancelar una función con 3 entradas vendidas en línea y verificar 3
notificaciones, 3 anulaciones y las devoluciones registradas.

**Acceptance Scenarios**:

1. **Given** una función con entradas vendidas, **When** llega `FuncionCancelada`, **Then** todas
   sus entradas se anulan y cada comprador recibe aviso con las opciones.
2. **Given** un comprador en línea que elige devolución, **When** confirma, **Then** se solicita al
   proveedor la devolución del importe y el pedido pasa a "reembolsado" al confirmarse.
3. **Given** un comprador que elige cambio, **When** hay lugar en otra función de la misma obra,
   **Then** recibe nuevas entradas sin nuevo cobro.
4. **Given** una compra en efectivo en taquilla, **When** se cancela la función, **Then** la
   devolución se hace en taquilla presentando la entrada y queda en la caja como egreso.
5. **Given** que no hubo elección en 7 días, **When** vence el plazo, **Then** se aplica la
   devolución automática.

---

### User Story 6 - Ocupación en vivo para la sala (Priority: P3)

El jefe de sala ve en tiempo real cuántas entradas se emitieron, cuántas personas ingresaron y
cuántos lugares quedan para venta o liberación en puerta.

**Why this priority**: Facilita abrir puertas y liberar lugares, pero la sala opera sin ello.

**Independent Test**: Validar 5 entradas y ver que el contador de ingresos sube a 5.

**Acceptance Scenarios**:

1. **Given** 200 entradas emitidas y 150 validadas, **When** se consulta, **Then** muestra
   emitidas 200, ingresos 150, pendientes 50 y lugares libres según el aforo.

### Edge Cases

- El aforo habilitado se reduce después de vender: no se anulan entradas vendidas; se bloquea la
  venta, se muestra el exceso y se alerta a Operación.
- Función reprogramada: las entradas siguen siendo válidas para el nuevo horario; el comprador es
  avisado y puede pedir devolución si no puede asistir.
- Correo que rebota: la entrada sigue disponible en "Mis entradas" y puede reenviarse.
- QR fotografiado y compartido: solo el primer escaneo es válido.
- La función empezó hace más de 30 minutos: la venta en línea se cierra; la taquilla puede seguir
  vendiendo si la sala lo permite.
- Cambio del reloj del celular del validador: la decisión usa la hora del servidor al sincronizar.
- El proveedor de pagos está caído: la venta en línea muestra "temporalmente no disponible" y la
  taquilla sigue operando con efectivo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST vender entradas para funciones pagadas al precio vigente de la
  edición (USD 5 en 2026).
- **FR-002**: El sistema MUST permitir reservas sin costo en funciones gratuitas con aforo.
- **FR-003**: Las entradas emitidas (web + taquilla + reservas) MUST NUNCA superar el aforo
  habilitado de la función, incluso con operaciones simultáneas.
- **FR-004**: El sistema MUST retener los lugares de un pedido durante el pago por 10 minutos y
  liberarlos si el pago no se confirma.
- **FR-005**: Compra, reserva, devolución y validación MUST ser idempotentes.
- **FR-006**: El sistema MUST limitar las entradas por pedido y por persona y función (valor
  configurable por edición; por defecto 6 en pagadas y 4 en reservas).
- **FR-007**: Cada entrada MUST tener un QR firmado e infalsificable, un código corto legible y
  ser de un solo uso.
- **FR-008**: El sistema MUST validar entradas en la puerta también sin conexión y sincronizar,
  resolviendo conflictos según la US2-AS6.
- **FR-009**: El sistema MUST enviar las entradas por correo y mostrarlas en "Mis entradas",
  con opción de reenvío.
- **FR-010**: El cobro MUST delegarse a un proveedor externo; la plataforma no almacena datos de
  tarjeta.
- **FR-011**: La taquilla MUST poder abrir caja, vender, entregar, devolver y cerrar caja con
  arqueo.
- **FR-012**: Al recibir `FuncionCancelada`, el sistema MUST anular entradas, notificar y
  gestionar devolución o cambio según la US5.
- **FR-013**: El sistema MUST liberar las reservas gratuitas no validadas 10 minutos antes del
  inicio.
- **FR-014**: El sistema MUST publicar la disponibilidad de cada función para la Cartelera.
- **FR-015**: El sistema MUST mostrar la ocupación en vivo por función a los roles autorizados.
- **FR-016**: Comprar o reservar en línea MUST requerir cuenta con correo verificado (spec 005);
  la compra en taquilla no la requiere.

### Reglas de negocio

- **RN-001**: Lugares disponibles = aforo habilitado − entradas válidas − entradas usadas −
  lugares retenidos por pedidos pendientes.
- **RN-002**: El importe de un pedido = cantidad × precio vigente al crear el pedido; un cambio de
  precio posterior no afecta pedidos ya creados.
- **RN-003**: La validación se acepta desde 60 minutos antes del inicio hasta el fin de la función.
- **RN-004**: La venta en línea cierra 30 minutos después del inicio.
- **RN-005**: Una entrada de función reprogramada sigue siendo válida para el nuevo horario.
- **RN-006**: Las devoluciones solo proceden por cancelación o reprogramación; no hay devolución
  por desistimiento en funciones pagadas.
- **RN-007**: Las funciones de público restringido (p. ej. estudiantes) solo emiten entradas a
  cuentas con la condición acreditada o vía taquilla.

### Ciclos de vida

**Pedido**

| Desde | Evento | Hacia |
|-------|--------|-------|
| — | Asistente solicita lugares disponibles | Pendiente (lugares retenidos) |
| Pendiente | Pago aprobado | Pagado (emite entradas) |
| Pendiente | Pago rechazado | Fallido (libera lugares) |
| Pendiente | 10 min sin confirmación | Expirado (libera lugares) |
| Pagado | Devolución confirmada | Reembolsado |
| — | Reserva gratuita confirmada | Confirmado (emite entradas) |

**Entrada**

| Desde | Evento | Hacia |
|-------|--------|-------|
| — | Pedido pagado o reserva confirmada | Válida |
| Válida | Validación en puerta | Usada |
| Válida | Cancelación de función, devolución o cancelación de reserva | Anulada |
| Válida (reserva) | 10 min antes del inicio sin validar | Liberada |

### Eventos de dominio

| Evento | Dirección | Contraparte |
|--------|-----------|-------------|
| `FuncionProgramada`, `AforoCambiado`, `FuncionReprogramada`, `FuncionCancelada` | Consume | Operación |
| `DisponibilidadCambiada` | Publica | Cartelera |
| `EntradasEmitidas`, `IngresoRegistrado`, `PedidoReembolsado` | Publica | Operación (estadísticas), Identidad (notificaciones) |
| `ConflictoDeIngreso`, `AforoExcedido` | Publica | Operación (alertas) |

### Requisitos no funcionales

- **RNF-001**: 500 compras simultáneas sobre una función de 100 lugares → exactamente 100
  entradas emitidas.
- **RNF-002**: Confirmación de compra o reserva en < 2 s (p95), sin contar el proveedor.
- **RNF-003**: Validación en < 2 s, con o sin conexión.
- **RNF-004**: Cada operación de dinero queda en registro inmutable (Constitución V).
- **RNF-005**: El validador sin conexión funciona al menos 4 horas con la lista descargada.

### Key Entities

- **Inventario de función**: aforo habilitado, lugares retenidos, emitidos y usados.
- **Pedido**: asistente o taquilla, función, cantidad, importe en centavos, canal (web,
  taquilla), estado, clave de idempotencia, vencimiento de retención.
- **Entrada**: pedido, función, código QR firmado, código corto, estado.
- **Ingreso**: entrada, fecha y hora, validador, dispositivo, en línea o diferido.
- **Pago**: referencia del proveedor, importe, resultado, devoluciones asociadas.
- **Caja**: vendedor, sede, apertura, cierre, efectivo esperado y declarado, movimientos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Cero sobreventa en la prueba de carga de RNF-001.
- **SC-002**: Un asistente completa una compra en menos de 3 minutos desde la ficha de la función.
- **SC-003**: La validación en la puerta tarda menos de 2 segundos y una fila de 300 personas
  ingresa en menos de 15 minutos con 3 validadores.
- **SC-004**: El 100 % de las entradas llegan por correo o están en "Mis entradas" en menos de
  1 minuto tras el pago.
- **SC-005**: Cero cobros duplicados en pruebas de reintento.
- **SC-006**: Cierre de caja diario cuadrado (diferencia 0) en el 100 % de los turnos de prueba.

## Assumptions

- Proveedor de pagos ecuatoriano con modo de prueba (p. ej. PayPhone u otro); se elige en el plan.
- En 2026 la venta real se hizo en cultura.ec; aquí se modela una boletería propia como caso de
  estudio académico.
- Aforo general, sin butacas numeradas.
- Los validadores usan celulares del personal con cámara.
- Las tarjetas en taquilla se cobran en un datáfono externo; la plataforma solo registra el medio
  de pago.

## Fuera de alcance

- Butacas numeradas, abonos o paquetes de varias funciones, descuentos y códigos promocionales.
- Reventa o transferencia de entradas entre personas.
- Facturación electrónica ante el SRI (se registra el dato, la emisión queda fuera).

## Dependencias

- **004 Operación**: funciones, aforo habilitado y cancelaciones.
- **005 Identidad**: cuentas, roles (taquilla, validador) y envío de notificaciones.
- **001 Cartelera**: consume la disponibilidad.
