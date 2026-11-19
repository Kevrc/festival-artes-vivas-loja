# Feature Specification: Gestión operativa, cuentas y notificaciones

**Feature Branch**: `004-gestion-operativa`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "Parte A — Operación: La organización administra ediciones, sedes, obras y elencos; arma la agenda de funciones en una grilla por sede y día evitando cruces y respetando montaje; publica la programación; reprograma o cancela con motivo; gestiona incidencias durante el festival; registra asistencia estimada en espacios públicos; y consulta estadísticas e informe de cierre de la edición. Parte B — Identidad: cuentas con correo verificado, personal con roles y alcance, segundo factor, derechos LOPDP y un servicio único de notificaciones por correo para todos los módulos."

**Contextos acotados**: **Operación** (Ediciones, Sedes, Obras, Elencos, Funciones, Cambios de
función, Incidencias, Estadísticas) e **Identidad** (Cuentas, Roles, Sesiones, Consentimientos,
Notificaciones). Ambos los lidera el mismo integrante, pero siguen siendo **módulos separados**
con contratos propios (Constitución III). Historias US1–US6 = Operación; US7–US12 = Identidad.

## Contexto del problema

En 2025 el festival cerró con 313 actividades, 116 elencos, 125 obras y 163 162 asistencias; en
2026 programó 439 funciones y actividades con 165 elencos en cuatro teatros, un museo y espacios
públicos, más un desfile inaugural con 11 delegaciones. La organización (Municipio de Loja y
Ministerio) necesita armar esa agenda sin choques de sala, reaccionar a cambios (lluvia,
retrasos de elencos, fallas técnicas) y **rendir cuentas** con cifras confiables al cierre. Hoy
esas cifras se consolidan a mano.

### Identidad

La plataforma tiene públicos muy distintos: miles de asistentes que solo quieren su entrada,
cientos de elencos que postulan una vez al año y unas decenas de personas del personal con
permisos sensibles (taquilla con dinero, curadores con documentos, programadores que cancelan
funciones). Cada módulo necesita saber **quién es** el usuario y **qué puede hacer**, y todos
necesitan **avisar** a las personas (entradas, cambios de función, resultados de convocatoria).
Centralizarlo evita que cada módulo resuelva seguridad y correo por su cuenta (Constitución III y VI).

## Actores

- **Administrador**: ediciones, sedes y parámetros.
- **Programador**: obras, elencos, funciones, publicación y cambios.
- **Jefe de sala**: registra incidencias y conteos estimados en su sede.
- **Dirección del festival**: consulta estadísticas e informe (solo lectura).
- **Convocatorias** (spec 003): entrega obras seleccionadas.
- **Boletería** (spec 002): entrega ventas e ingresos.
- **Visitante / Asistente / Postulante**: crea y gestiona su cuenta y sus datos (Identidad).
- **Módulos del sistema**: consultan permisos y piden enviar notificaciones (Identidad).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Programar funciones en la grilla (Priority: P1)

El programador ve una grilla por día con una columna por sede y crea funciones eligiendo obra,
sede, fecha, hora de inicio (la de fin se calcula con la duración de la obra), tipo de acceso,
público y aforo habilitado. El sistema impide cruces en la misma sede, respetando el tiempo de
montaje y desmontaje.

**Why this priority**: Sin funciones programadas no hay cartelera ni boletería.

**Independent Test**: Crear una función, intentar otra que se cruce (se rechaza) y publicar la
edición; la función válida aparece en la cartelera.

**Acceptance Scenarios**:

1. **Given** "El Cura sin cabeza" (90 min) y el Teatro Nacional libre el 12 de noviembre,
   **When** se programa a las 20:00, **Then** se crea en borrador con fin a las 21:30.
2. **Given** el Teatro Bolívar ocupado de 19:00 a 21:00 con 30 min de montaje, **When** se intenta
   otra función a las 21:15, **Then** se rechaza y se muestra la función en conflicto; a las
   21:30 se acepta.
3. **Given** una sede con aforo 800, **When** se configura aforo habilitado 900, **Then** se
   rechaza.
4. **Given** un elenco con función a las 19:00 en el Teatro Bolívar, **When** se le programa otra
   función que se solapa en otra sede, **Then** se rechaza (un elenco no puede estar en dos
   lugares a la vez).
5. **Given** una obra seleccionada en convocatoria, **When** el programador busca obras,
   **Then** aparece con su ficha técnica, sin recargar datos.

---

### User Story 2 - Publicar la programación (Priority: P1)

El programador revisa la edición (funciones sin sede, sin tipo de acceso u obras sin imagen) y
la publica; a partir de ahí la cartelera es visible y la boletería puede vender.

**Why this priority**: La publicación es el hito que activa a los otros módulos.

**Independent Test**: Publicar una edición con 3 funciones válidas y verificar
`ProgramacionPublicada`.

**Acceptance Scenarios**:

1. **Given** funciones en borrador sin errores, **When** se publica, **Then** pasan a
   "programadas" y se emite `ProgramacionPublicada`.
2. **Given** una función sin tipo de acceso, **When** se intenta publicar, **Then** se bloquea y
   se lista el error.
3. **Given** una edición publicada, **When** se añade una función nueva, **Then** puede publicarse
   sola sin republicar toda la edición.

---

### User Story 3 - Reprogramar o cancelar funciones (Priority: P1)

El programador cambia horario o sede de una función, o la cancela, siempre con motivo; el cambio
se propaga a Cartelera, Boletería y a los asistentes afectados.

**Why this priority**: En 11 días de festival los cambios son inevitables (clima, logística).

**Independent Test**: Cancelar una función con entradas y verificar que Boletería recibe
`FuncionCancelada`.

**Acceptance Scenarios**:

1. **Given** una función programada, **When** se reprograma con motivo "lluvia", **Then** queda
   "reprogramada", se guarda el horario anterior y se emite `FuncionReprogramada`.
2. **Given** una reprogramación a una sede con aforo menor que las entradas vendidas, **When** se
   intenta, **Then** se advierte la cifra en exceso y exige confirmación explícita.
3. **Given** una función con entradas, **When** se cancela, **Then** se emite `FuncionCancelada` y
   Boletería inicia anulaciones y devoluciones.
4. **Given** un cambio sin motivo, **When** se guarda, **Then** se rechaza.
5. **Given** una función ya finalizada, **When** se intenta cambiar, **Then** se rechaza.

---

### User Story 4 - Incidencias y asistencia en espacios públicos (Priority: P2)

Durante el festival, el jefe de sala registra incidencias (retraso, falla técnica, clima,
emergencia médica, aforo superado) y, en funciones de acceso libre, un conteo estimado de
público.

**Why this priority**: La asistencia *Off* no tiene entradas; sin conteos el informe queda
incompleto.

**Independent Test**: Registrar un conteo estimado de 1 200 personas en una función en plaza y
verificar que suma a la asistencia estimada del día.

**Acceptance Scenarios**:

1. **Given** una función de Chacovachi en la Plaza San Sebastián, **When** el jefe de sala
   registra 1 200 personas, **Then** suma a la asistencia "estimada" del día.
2. **Given** una incidencia "retraso de 20 min", **When** se registra, **Then** queda visible para
   Dirección y, si se marca "afecta al público", se ofrece reprogramar la función.
3. **Given** una alerta `AforoExcedido` o `ConflictoDeIngreso` de Boletería, **When** llega,
   **Then** se crea una incidencia automática en la sede.

---

### User Story 5 - Panel de estadísticas e informe de cierre (Priority: P2)

La Dirección ve indicadores por día, sede, disciplina, componente y país: funciones realizadas,
canceladas, entradas emitidas, ingresos validados, asistencia estimada, ocupación y recaudación;
y al cierre obtiene un informe de la edición comparado con la anterior.

**Why this priority**: El festival rinde cuentas públicas con estas cifras.

**Independent Test**: Con datos de prueba, verificar ocupación = ingresos ÷ aforo habilitado y el
total de asistencia = validada + estimada.

**Acceptance Scenarios**:

1. **Given** una función con aforo 200 y 150 ingresos, **When** se consulta, **Then** su ocupación
   es 75 %.
2. **Given** 50 000 ingresos validados y 113 162 estimados, **When** se ve el total, **Then** es
   163 162, con el desglose visible.
3. **Given** filtros aplicados, **When** se exporta, **Then** se obtiene un CSV con los indicadores
   filtrados.
4. **Given** la edición cerrada, **When** se genera el informe, **Then** incluye actividades,
   elencos, obras, países, asistencia, ocupación media, recaudación y variación frente a la
   edición anterior.

---

### User Story 6 - Ediciones, sedes y parámetros (Priority: P3)

El administrador crea ediciones (número, fechas, país invitado de honor, precio de entrada,
límites de compra) y sedes (tipo, dirección, coordenadas, aforo, accesibilidad, tiempo de montaje,
horario de taquilla).

**Why this priority**: Datos maestros que cambian poco; pueden sembrarse al inicio.

**Independent Test**: Crear la edición 2027 copiando las sedes de 2026 y verificar que no copia
funciones.

**Acceptance Scenarios**:

1. **Given** la edición 2026, **When** se crea la 2027 "a partir de" ella, **Then** copia sedes y
   parámetros, no funciones.
2. **Given** fechas de una edición fuera de noviembre, **When** se guarda, **Then** se advierte
   que la ley fija el festival en noviembre (advertencia, no bloqueo).
3. **Given** una sede con funciones programadas, **When** se intenta eliminar, **Then** se impide;
   solo puede desactivarse sin funciones futuras.

---

## Parte B — Identidad: cuentas, roles y notificaciones

### User Story 7 - Registro y verificación de correo (Priority: P1)

Un visitante crea su cuenta con nombre, correo y contraseña, acepta la política de privacidad
y verifica su correo con un enlace; a partir de ahí puede comprar, reservar o postular.

**Why this priority**: Boletería y Convocatorias necesitan una identidad verificada.

**Independent Test**: Registrar una cuenta, abrir el enlace de verificación y comprobar que la
cuenta pasa a "verificada".

**Acceptance Scenarios**:

1. **Given** un correo no registrado, **When** completa el registro y acepta la política,
   **Then** la cuenta queda "pendiente de verificación" y recibe el enlace.
2. **Given** el enlace de verificación, **When** lo abre dentro de 24 horas, **Then** la cuenta
   queda "verificada".
3. **Given** un correo ya registrado, **When** alguien intenta registrarlo, **Then** el sistema
   responde igual que con uno nuevo y envía al dueño un aviso, sin revelar si la cuenta existe.
4. **Given** una contraseña de menos de 10 caracteres o conocida por filtraciones, **When** se
   registra, **Then** se rechaza con el motivo.
5. **Given** un visitante que no acepta la política de privacidad, **When** intenta registrarse,
   **Then** no se crea la cuenta.

---

### User Story 8 - Inicio de sesión y recuperación (Priority: P1)

El usuario inicia sesión con correo y contraseña, mantiene su sesión en el dispositivo y puede
recuperar la contraseña por correo.

**Why this priority**: Sin sesión no hay "Mis entradas" ni postulaciones.

**Independent Test**: Iniciar sesión, cerrar sesión, recuperar contraseña y volver a entrar con
la nueva.

**Acceptance Scenarios**:

1. **Given** credenciales correctas, **When** inicia sesión, **Then** accede y su sesión dura
   hasta 30 días de inactividad en ese dispositivo (8 horas para el personal).
2. **Given** 5 intentos fallidos en 15 minutos, **When** intenta otra vez, **Then** la cuenta se
   bloquea temporalmente 15 minutos y se avisa al titular.
3. **Given** "olvidé mi contraseña", **When** pide recuperación, **Then** recibe un enlace válido
   por 1 hora y de un solo uso; al cambiarla se cierran sus otras sesiones.
4. **Given** el usuario en "Mis sesiones", **When** cierra una sesión de otro dispositivo,
   **Then** ese dispositivo pierde el acceso.

---

### User Story 9 - Cuentas del personal con roles y alcance (Priority: P1)

El administrador crea cuentas del personal con uno o más roles y, si aplica, un alcance
(sede para taquilla y validador; provincia para coordinación de Camino a Loja; disciplina para
curadores). El personal activa su cuenta con un segundo factor.

**Why this priority**: Los módulos dependen de estos roles para autorizar operaciones críticas.

**Independent Test**: Crear un usuario "validador" del Teatro Bolívar y verificar que solo puede
validar entradas de funciones en esa sede.

**Acceptance Scenarios**:

1. **Given** un usuario con rol "taquilla" en el Teatro Bolívar, **When** intenta vender para el
   Teatro Segundo Cueva Celi, **Then** se le niega.
2. **Given** un usuario con rol "taquilla", **When** intenta programar funciones, **Then** se le
   niega.
3. **Given** una cuenta de personal nueva, **When** inicia sesión por primera vez, **Then** debe
   configurar el segundo factor antes de continuar.
4. **Given** un cambio de rol, **When** se guarda, **Then** queda en la bitácora de auditoría y
   las sesiones activas del usuario adoptan el nuevo permiso en menos de 1 minuto.
5. **Given** un integrante que deja el equipo, **When** se desactiva su cuenta, **Then** pierde el
   acceso inmediatamente y su historial se conserva.

---

### User Story 10 - Notificaciones (Priority: P2)

Los módulos piden enviar notificaciones (entradas emitidas, función reprogramada o cancelada,
acuse de postulación, subsanación, resultados); Identidad las envía por correo con plantillas
del festival, reintenta si fallan y deja constancia.

**Why this priority**: Los avisos de cambio son obligatorios frente al público, pero cada módulo
puede operar mientras tanto.

**Independent Test**: Publicar `FuncionCancelada` con 3 compradores y verificar 3 correos
registrados como enviados.

**Acceptance Scenarios**:

1. **Given** `EntradasEmitidas`, **When** se procesa, **Then** el asistente recibe el correo con
   sus entradas en menos de 1 minuto.
2. **Given** el servicio de correo falla, **When** se intenta enviar, **Then** se reintenta con
   espera creciente hasta 24 horas y luego se marca "fallida" para revisión.
3. **Given** el mismo evento llega dos veces, **When** se procesa, **Then** se envía un solo correo.
4. **Given** un asistente que desactivó avisos opcionales (novedades), **When** hay una novedad,
   **Then** no se le envía; los avisos de servicio (entradas, cancelaciones) se envían siempre.
5. **Given** un usuario, **When** abre "Mis notificaciones", **Then** ve el historial de avisos
   recibidos.

---

### User Story 11 - Mis datos personales (LOPDP) (Priority: P2)

El titular consulta, corrige, descarga y solicita la eliminación de sus datos, y gestiona sus
consentimientos.

**Why this priority**: Obligación legal (LOPDP) y principio VI de la constitución.

**Independent Test**: Solicitar la eliminación de una cuenta sin entradas futuras y verificar
que sus datos personales quedan anonimizados.

**Acceptance Scenarios**:

1. **Given** un titular, **When** pide "descargar mis datos", **Then** recibe un archivo con sus
   datos personales, consentimientos y actividad.
2. **Given** un titular sin entradas futuras ni postulaciones en curso, **When** pide eliminar su
   cuenta, **Then** sus datos personales se anonimizan y ya no puede iniciar sesión; los registros
   contables se conservan sin datos identificables.
3. **Given** un titular con entradas para funciones futuras, **When** pide eliminar su cuenta,
   **Then** se le informa y se le permite continuar asumiendo la pérdida de esas entradas o
   esperar a después del festival.
4. **Given** una nueva versión de la política de privacidad, **When** el usuario inicia sesión,
   **Then** se le pide aceptarla y queda registrado qué versión aceptó y cuándo.

---

### User Story 12 - Condición de estudiante (Priority: P3)

Un asistente acredita su condición de estudiante (correo institucional o código de la
institución) para acceder a funciones de público restringido.

**Why this priority**: Algunas funciones gratuitas son solo para estudiantes; afecta a pocas
funciones.

**Independent Test**: Verificar un correo institucional y comprobar que la cuenta puede reservar
una función "solo estudiantes".

**Acceptance Scenarios**:

1. **Given** un asistente con correo de un dominio institucional registrado, **When** lo
   verifica, **Then** su cuenta queda acreditada como estudiante hasta el fin de la edición.

### Edge Cases

- Dos programadores editan la misma función a la vez: el segundo recibe aviso de conflicto y no
  sobrescribe en silencio.
- Funciones al aire libre sin aforo: no requieren aforo habilitado ni pasan por Boletería.
- Actividades continuas (exposiciones) ocupan la sede durante su horario cada día.
- El desfile inaugural ocupa varias calles: se modela como sede "recorrido" con puntos de paso.
- Feriado nacional dentro del festival (20 de noviembre de 2026): solo se muestra como
  información; no bloquea.
- Funciones que cruzan medianoche cuentan para el día en que empiezan.
- Cambiar la duración de una obra no mueve funciones ya programadas; se recalculan conflictos y
  se avisa.

**Identidad**

- El enlace de verificación caducó: se puede pedir uno nuevo (máximo 3 por hora).
- Mayúsculas y espacios en el correo se normalizan; `Ana@Mail.com` y `ana@mail.com` son la misma cuenta.
- Un postulante y un asistente pueden ser la misma persona con una sola cuenta.
- El personal pierde el dispositivo del segundo factor: el administrador puede restablecerlo
  tras verificar su identidad, con registro en auditoría.
- Un rol sin alcance cuando el rol lo exige (taquilla sin sede): no se puede guardar.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir crear, editar y publicar funciones con obra, sede, inicio,
  fin, tipo de acceso, público y aforo habilitado, en una grilla por día y sede.
- **FR-002**: El sistema MUST impedir cruces en la misma sede considerando el tiempo de montaje
  configurado por sede (por defecto 30 min).
- **FR-003**: El sistema MUST impedir que un mismo elenco tenga funciones solapadas.
- **FR-004**: El aforo habilitado MUST ser ≤ aforo de la sede.
- **FR-005**: La publicación MUST validar la edición y bloquear si hay errores, listándolos.
- **FR-006**: Reprogramar o cancelar MUST exigir motivo, conservar historial y emitir el evento
  correspondiente.
- **FR-007**: El sistema MUST permitir cargar obras y elencos invitados y recibir los
  seleccionados de Convocatorias.
- **FR-008**: El jefe de sala MUST poder registrar incidencias y conteos estimados.
- **FR-009**: El sistema MUST mostrar indicadores filtrables y exportables en CSV.
- **FR-010**: El sistema MUST generar el informe de cierre de la edición con comparación interanual.
- **FR-011**: El sistema MUST gestionar ediciones, sedes y parámetros (precio, límites de compra,
  montaje).
- **FR-012**: Toda acción administrativa MUST quedar en la bitácora de auditoría.
- **FR-013**: El sistema MUST detectar ediciones concurrentes y evitar sobrescrituras silenciosas.

- **FR-014**: El sistema MUST permitir registrarse con nombre, correo y contraseña, con
  aceptación explícita de la política de privacidad.
- **FR-015**: El sistema MUST verificar el correo antes de permitir comprar, reservar o postular.
- **FR-016**: El sistema MUST autenticar con correo y contraseña, con bloqueo temporal tras
  intentos fallidos y sin revelar si un correo existe.
- **FR-017**: El sistema MUST permitir recuperar la contraseña con enlace de un solo uso y
  vigencia de 1 hora.
- **FR-018**: El sistema MUST exigir segundo factor a toda cuenta del personal.
- **FR-019**: El sistema MUST gestionar los roles: asistente, postulante, curador, coordinación
  de convocatorias, coordinación provincial, programador, jefe de sala, taquilla, validador,
  dirección y administrador; con alcance por sede, provincia o disciplina cuando aplique.
- **FR-020**: El sistema MUST ofrecer a los demás módulos una forma de comprobar identidad, roles
  y alcance en cada operación (Constitución VI: autorización en el servidor).
- **FR-021**: El sistema MUST enviar notificaciones por correo a partir de eventos de los demás
  módulos, con plantillas, reintentos, deduplicación e historial.
- **FR-022**: Los usuarios MUST poder gestionar preferencias de avisos opcionales; los avisos de
  servicio no se pueden desactivar.
- **FR-023**: Los titulares MUST poder consultar, corregir, descargar y eliminar sus datos y
  gestionar consentimientos (LOPDP).
- **FR-024**: El sistema MUST registrar en auditoría inicios de sesión del personal, cambios de
  rol, restablecimientos de segundo factor y eliminaciones de cuenta.
- **FR-025**: El sistema MUST permitir acreditar la condición de estudiante.

### Reglas de negocio

- **RN-001**: Dos funciones en la misma sede chocan si `inicioB < finA + montaje` y
  `inicioA < finB + montaje`.
- **RN-002**: Fin de función = inicio + duración de la obra (editable solo hacia más tiempo).
- **RN-003**: Ocupación = ingresos validados ÷ aforo habilitado (solo funciones con aforo).
- **RN-004**: Asistencia total = ingresos validados + conteos estimados; siempre se informa el
  desglose.
- **RN-005**: Una función solo puede cancelarse o reprogramarse antes de su hora de fin.
- **RN-006**: El precio y los límites de compra se fijan por edición; cambiarlos no afecta pedidos
  existentes.
- **RN-007**: Una edición pasa a "cerrada" el día siguiente a su última función; desde ahí sus
  datos son de solo lectura.

- **RN-008**: Contraseña mínima de 10 caracteres y no presente en listas de contraseñas filtradas.
- **RN-009**: Un rol con alcance solo autoriza operaciones dentro de su alcance.
- **RN-010**: La eliminación de cuenta anonimiza datos personales; los registros de pagos y
  auditoría se conservan sin datos identificables.
- **RN-011**: Cada notificación tiene una clave de deduplicación (evento + destinatario).
- **RN-012**: La acreditación de estudiante vence al cerrar la edición.

### Ciclo de vida de una función

| Desde | Evento | Hacia |
|-------|--------|-------|
| — | Programador crea | Borrador |
| Borrador | Publicación | Programada |
| Programada / Reprogramada | Cambio de horario o sede con motivo | Reprogramada |
| Programada / Reprogramada | Cancelación con motivo | Cancelada |
| Programada / Reprogramada | Pasa su hora de fin | Finalizada |

### Ciclo de vida de una cuenta

| Desde | Evento | Hacia |
|-------|--------|-------|
| — | Registro | Pendiente de verificación |
| Pendiente de verificación | Abre enlace | Verificada |
| Verificada | 5 intentos fallidos | Bloqueada temporalmente → Verificada (a los 15 min) |
| Verificada | Administrador desactiva | Desactivada |
| Verificada | Titular elimina | Eliminada (anonimizada) |

### Eventos de dominio

| Módulo | Evento | Dirección | Contraparte |
|--------|--------|-----------|-------------|
| Operación | `ProgramacionPublicada`, `FuncionProgramada`, `FuncionActualizada`, `FuncionReprogramada`, `FuncionCancelada`, `AforoCambiado` | Publica | Cartelera, Boletería, Identidad |
| Operación | `PostulacionSeleccionada`, `SeleccionDesistida` | Consume | Convocatorias |
| Operación | `EntradasEmitidas`, `IngresoRegistrado`, `PedidoReembolsado` | Consume (estadísticas) | Boletería |
| Operación | `AforoExcedido`, `ConflictoDeIngreso` | Consume (incidencias) | Boletería |
| Identidad | `EntradasEmitidas`, `PedidoReembolsado` | Consume (avisos) | Boletería |
| Identidad | `FuncionReprogramada`, `FuncionCancelada` | Consume (avisos; destinatarios vía Boletería) | Operación |
| Identidad | `PostulacionEnviada`, `SubsanacionSolicitada`, `ResultadoPublicado` | Consume (avisos) | Convocatorias |
| Identidad | `CuentaVerificada`, `RolAsignado`, `CuentaEliminada` | Publica | Todos los módulos |

### Requisitos no funcionales

- **RNF-001**: La grilla de un día con 60 funciones carga en < 2 s.
- **RNF-002**: Los eventos de cambio de función llegan a los consumidores en < 1 minuto.
- **RNF-003**: El panel de estadísticas se actualiza al menos cada 5 minutos durante el festival.

- **RNF-004**: Inicio de sesión en < 1 s (p95).
- **RNF-005**: 95 % de las notificaciones de servicio enviadas en < 1 minuto.
- **RNF-006**: Contraseñas almacenadas con hash adaptativo; nunca en logs.
- **RNF-007**: Un fallo del servicio de correo no bloquea compras ni postulaciones (se encola).

### Key Entities

- **Edición**: número, año, fechas, país invitado, precio, límites de compra, estado.
- **Sede**: nombre, tipo (teatro, centro cultural, museo, espacio público, recorrido), dirección,
  coordenadas, aforo, accesibilidad, montaje, horario de taquilla, activa.
- **Elenco** y **Obra**: ver spec 001; aquí se crean o se reciben de Convocatorias.
- **Función**: obra, sede, inicio, fin, tipo de acceso, público, aforo habilitado, estado, versión.
- **Cambio de función**: tipo, valores anterior y nuevo, motivo, autor, fecha.
- **Incidencia**: sede, función, tipo, descripción, afecta al público, autor, hora, estado.
- **Conteo estimado**: función, cantidad, método, autor.
- **Indicador**: métrica agregada por dimensión (día, sede, disciplina, componente, país).

- **Cuenta**: nombre, correo normalizado, estado, fecha de verificación, preferencias.
- **Credencial**: hash de contraseña, segundo factor (personal).
- **Sesión**: cuenta, dispositivo, creación, última actividad, expiración.
- **Rol asignado**: cuenta, rol, alcance (sede, provincia o disciplina), asignado por, fecha.
- **Consentimiento**: cuenta, documento y versión, fecha de aceptación o retiro.
- **Notificación**: destinatario, plantilla, evento de origen, clave de deduplicación, estado
  (pendiente, enviada, fallida), intentos.
- **Acreditación**: cuenta, tipo (estudiante), evidencia, vigencia.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Cero cruces de sede o de elenco en la programación publicada.
- **SC-002**: Un programador crea una función en menos de 1 minuto.
- **SC-003**: Los cambios de función llegan a Cartelera y Boletería en menos de 1 minuto.
- **SC-004**: El informe de cierre se obtiene en menos de 5 minutos (frente a días de trabajo
  manual).
- **SC-005**: Las cifras del informe cuadran al 100 % con la suma de ingresos y conteos
  registrados.

- **SC-006**: Un visitante crea y verifica su cuenta en menos de 2 minutos.
- **SC-007**: El 100 % de las operaciones del personal se autorizan según rol y alcance en las
  pruebas de autorización (cero accesos indebidos).
- **SC-008**: El 95 % de los avisos de servicio llegan en menos de 1 minuto y el 100 % se
  reintenta o queda marcado.
- **SC-009**: Las solicitudes de descarga o eliminación de datos se resuelven en menos de 24 horas.

## Assumptions

- La recaudación proviene de Boletería; este módulo no procesa pagos.
- La "Escuela del festival" (talleres) se modela como funciones de disciplina "taller";
  las inscripciones a talleres quedan fuera de alcance.
- Los conteos estimados los hace el jefe de sala con el método que elija (aforo visual, por
  áreas); el sistema solo registra cantidad y método.

- Correo electrónico como único canal en v1; se usa un proveedor de envío externo.
- Segundo factor del personal por aplicación de códigos temporales.
- Los dominios institucionales para acreditar estudiantes los carga el administrador.

## Fuera de alcance

- Logística de hospedaje, transporte y alimentación de elencos.
- Gestión de voluntarios y personal técnico.
- Planos de escenario y riders técnicos detallados.

- Inicio de sesión con redes sociales o SSO institucional.
- Notificaciones por SMS, WhatsApp o *push*.
- Verificación de identidad con cédula ante el Registro Civil.

## Dependencias

- **003 Convocatorias**: obras seleccionadas.
- **002 Boletería**: ventas, ingresos y alertas.
- **001 Cartelera**: consume la programación publicada.
- **Todos los módulos (001–003)** dependen de Identidad para identidad, autorización y avisos.
