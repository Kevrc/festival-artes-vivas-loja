# Feature Specification: Cuentas, roles y notificaciones

**Feature Branch**: `005-cuentas-notificaciones`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "Identidad de la plataforma: el público y los postulantes crean su cuenta con correo verificado; el personal del festival recibe cuentas con roles (y alcance por sede o provincia); inicio de sesión seguro con recuperación de contraseña y segundo factor para el personal; consentimiento y derechos sobre datos personales según la LOPDP; y un servicio único de notificaciones por correo que los demás módulos usan."

**Contexto acotado**: Identidad. Dueño de Cuentas, Roles, Sesiones, Consentimientos y
Notificaciones. Es un contexto de soporte para los otros cuatro.

## Contexto del problema

La plataforma tiene públicos muy distintos: miles de asistentes que solo quieren su entrada,
cientos de elencos que postulan una vez al año y unas decenas de personas del personal con
permisos sensibles (taquilla con dinero, curadores con documentos, programadores que cancelan
funciones). Cada módulo necesita saber **quién es** el usuario y **qué puede hacer**, y todos
necesitan **avisar** a las personas (entradas, cambios de función, resultados de convocatoria).
Centralizarlo evita que cada módulo resuelva seguridad y correo por su cuenta (Constitución III y VI).

## Actores

- **Visitante**: se registra para comprar, reservar o postular.
- **Asistente / Postulante**: gestiona su cuenta y sus datos.
- **Personal**: inicia sesión con rol asignado.
- **Administrador**: crea cuentas del personal y asigna roles.
- **Módulos del sistema**: consultan permisos y piden enviar notificaciones.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registro y verificación de correo (Priority: P1)

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

### User Story 2 - Inicio de sesión y recuperación (Priority: P1)

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

### User Story 3 - Cuentas del personal con roles y alcance (Priority: P1)

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

### User Story 4 - Notificaciones (Priority: P2)

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

### User Story 5 - Mis datos personales (LOPDP) (Priority: P2)

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

### User Story 6 - Condición de estudiante (Priority: P3)

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

- El enlace de verificación caducó: se puede pedir uno nuevo (máximo 3 por hora).
- Mayúsculas y espacios en el correo se normalizan; `Ana@Mail.com` y `ana@mail.com` son la misma cuenta.
- Un postulante y un asistente pueden ser la misma persona con una sola cuenta.
- El personal pierde el dispositivo del segundo factor: el administrador puede restablecerlo
  tras verificar su identidad, con registro en auditoría.
- Un rol sin alcance cuando el rol lo exige (taquilla sin sede): no se puede guardar.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir registrarse con nombre, correo y contraseña, con
  aceptación explícita de la política de privacidad.
- **FR-002**: El sistema MUST verificar el correo antes de permitir comprar, reservar o postular.
- **FR-003**: El sistema MUST autenticar con correo y contraseña, con bloqueo temporal tras
  intentos fallidos y sin revelar si un correo existe.
- **FR-004**: El sistema MUST permitir recuperar la contraseña con enlace de un solo uso y
  vigencia de 1 hora.
- **FR-005**: El sistema MUST exigir segundo factor a toda cuenta del personal.
- **FR-006**: El sistema MUST gestionar los roles: asistente, postulante, curador, coordinación
  de convocatorias, coordinación provincial, programador, jefe de sala, taquilla, validador,
  dirección y administrador; con alcance por sede, provincia o disciplina cuando aplique.
- **FR-007**: El sistema MUST ofrecer a los demás módulos una forma de comprobar identidad, roles
  y alcance en cada operación (Constitución VI: autorización en el servidor).
- **FR-008**: El sistema MUST enviar notificaciones por correo a partir de eventos de los demás
  módulos, con plantillas, reintentos, deduplicación e historial.
- **FR-009**: Los usuarios MUST poder gestionar preferencias de avisos opcionales; los avisos de
  servicio no se pueden desactivar.
- **FR-010**: Los titulares MUST poder consultar, corregir, descargar y eliminar sus datos y
  gestionar consentimientos (LOPDP).
- **FR-011**: El sistema MUST registrar en auditoría inicios de sesión del personal, cambios de
  rol, restablecimientos de segundo factor y eliminaciones de cuenta.
- **FR-012**: El sistema MUST permitir acreditar la condición de estudiante.

### Reglas de negocio

- **RN-001**: Contraseña mínima de 10 caracteres y no presente en listas de contraseñas filtradas.
- **RN-002**: Un rol con alcance solo autoriza operaciones dentro de su alcance.
- **RN-003**: La eliminación de cuenta anonimiza datos personales; los registros de pagos y
  auditoría se conservan sin datos identificables.
- **RN-004**: Cada notificación tiene una clave de deduplicación (evento + destinatario).
- **RN-005**: La acreditación de estudiante vence al cerrar la edición.

### Ciclo de vida de una cuenta

| Desde | Evento | Hacia |
|-------|--------|-------|
| — | Registro | Pendiente de verificación |
| Pendiente de verificación | Abre enlace | Verificada |
| Verificada | 5 intentos fallidos | Bloqueada temporalmente → Verificada (a los 15 min) |
| Verificada | Administrador desactiva | Desactivada |
| Verificada | Titular elimina | Eliminada (anonimizada) |

### Eventos de dominio

| Evento | Dirección | Contraparte |
|--------|-----------|-------------|
| `EntradasEmitidas`, `PedidoReembolsado` | Consume | Boletería |
| `FuncionReprogramada`, `FuncionCancelada` | Consume | Operación (destinatarios vía Boletería) |
| `PostulacionEnviada`, `SubsanacionSolicitada`, `ResultadoPublicado` | Consume | Convocatorias |
| `CuentaVerificada`, `RolAsignado`, `CuentaEliminada` | Publica | Todos los módulos |

### Requisitos no funcionales

- **RNF-001**: Inicio de sesión en < 1 s (p95).
- **RNF-002**: 95 % de las notificaciones de servicio enviadas en < 1 minuto.
- **RNF-003**: Contraseñas almacenadas con hash adaptativo; nunca en logs.
- **RNF-004**: Un fallo del servicio de correo no bloquea compras ni postulaciones (se encola).

### Key Entities

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

- **SC-001**: Un visitante crea y verifica su cuenta en menos de 2 minutos.
- **SC-002**: El 100 % de las operaciones del personal se autorizan según rol y alcance en las
  pruebas de autorización (cero accesos indebidos).
- **SC-003**: El 95 % de los avisos de servicio llegan en menos de 1 minuto y el 100 % se
  reintenta o queda marcado.
- **SC-004**: Las solicitudes de descarga o eliminación de datos se resuelven en menos de 24 horas.

## Assumptions

- Correo electrónico como único canal en v1; se usa un proveedor de envío externo.
- Segundo factor del personal por aplicación de códigos temporales.
- Los dominios institucionales para acreditar estudiantes los carga el administrador.

## Fuera de alcance

- Inicio de sesión con redes sociales o SSO institucional.
- Notificaciones por SMS, WhatsApp o *push*.
- Verificación de identidad con cédula ante el Registro Civil.

## Dependencias

- Todos los módulos (001–004) dependen de este para identidad, autorización y avisos.
