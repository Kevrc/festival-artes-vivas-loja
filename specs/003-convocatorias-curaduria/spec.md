# Feature Specification: Convocatorias y curaduría

**Feature Branch**: `003-convocatorias-curaduria`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "La coordinación publica convocatorias por edición y componente (Programación Nacional, Camino a Loja por provincia, Internacional por invitación); los elencos postulan con su obra y documentos; hay un periodo de subsanación; un comité de curadores evalúa con criterios ponderados, sin ver puntajes ajenos y sin conflicto de interés; la coordinación aprueba seleccionados según cupos y lista de espera; los resultados se notifican y las obras pasan a la programación."

**Contexto acotado**: Convocatorias. Dueño de Convocatorias, Postulaciones, Evaluaciones y
Curadores.

## Contexto del problema

La programación nacional del FIAVL se elige por concurso público (bases publicadas en el portal
de fomento del Ministerio) y el programa **Camino a Loja**, ejecutado por la Casa de la Cultura
Ecuatoriana y sus núcleos en las 24 provincias, selecciona propuestas por provincia con bases
técnicas propias; sus bases excluyen obras ya presentadas en ediciones anteriores. El componente
**Internacional** se arma por invitación. Hoy el proceso se gestiona con formularios, correos y
hojas de cálculo, lo que dificulta la trazabilidad de las decisiones y la comunicación de
resultados a cientos de postulantes.

## Actores

- **Postulante / Elenco**: crea su perfil, postula, subsana y recibe resultados.
- **Curador**: evalúa las postulaciones asignadas.
- **Coordinación de convocatorias**: crea convocatorias, revisa admisibilidad, asigna curadores,
  aprueba seleccionados y publica resultados.
- **Coordinación provincial** (Camino a Loja): igual que la coordinación, limitada a su provincia.
- **Operación** (spec 004): recibe las obras seleccionadas.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Postular una propuesta artística (Priority: P1)

Un elenco crea su perfil (nombre, responsable, contacto, provincia o país, integrantes,
trayectoria), elige una convocatoria abierta, completa la ficha de la obra (título, disciplina,
sinopsis, duración, público, ficha técnica, necesidades de montaje, número de integrantes en
gira, enlace de video de registro, dossier) y la envía antes del cierre.

**Why this priority**: Sin postulaciones no hay programación nacional.

**Independent Test**: Con una convocatoria abierta, enviar una postulación completa y verificar
que queda "enviada" con acuse y número.

**Acceptance Scenarios**:

1. **Given** "Programación Nacional 2026" abierta, **When** el elenco completa todo lo
   obligatorio y envía, **Then** queda "enviada" y recibe acuse con número `PN-2026-0001`.
2. **Given** faltan documentos obligatorios, **When** intenta enviar, **Then** se indica qué falta
   y se conserva el borrador.
3. **Given** la convocatoria cerró, **When** intenta enviar, **Then** se impide; los borradores
   quedan visibles pero no editables.
4. **Given** una postulación enviada, **When** el elenco quiere editarla antes del cierre,
   **Then** puede retirarla a borrador, editarla y reenviarla; el número se mantiene.
5. **Given** el cierre es a las 23:59 del 31 de julio, **When** el envío se completa a las 23:59:30,
   **Then** se acepta; a las 00:00:01 del día siguiente se rechaza.

---

### User Story 2 - Revisión de admisibilidad y subsanación (Priority: P1)

La coordinación revisa que cada postulación cumpla los requisitos formales; si falta algo
subsanable, el elenco tiene un plazo para corregirlo; si no cumple, queda "no admitida" con
motivo.

**Why this priority**: Evita que los curadores pierdan tiempo con propuestas inadmisibles y da
garantías al postulante.

**Independent Test**: Marcar una postulación como "requiere subsanación", corregirla en plazo y
verificar que pasa a "admitida".

**Acceptance Scenarios**:

1. **Given** una postulación con el dossier ilegible, **When** la coordinación pide subsanación,
   **Then** el elenco recibe aviso con el detalle y un plazo de 72 horas.
2. **Given** el elenco corrige en plazo, **When** reenvía, **Then** vuelve a revisión de
   admisibilidad.
3. **Given** vence el plazo sin corrección, **When** se cumple, **Then** queda "no admitida" con
   motivo registrado.
4. **Given** Camino a Loja, **When** se postula una obra ya presentada en una edición anterior,
   **Then** queda "no admitida" por la regla RN-005.

---

### User Story 3 - Evaluar postulaciones (Priority: P1)

Cada curador ve las postulaciones admitidas que tiene asignadas, revisa materiales, califica cada
criterio (0–100) y escribe observaciones; al enviar, su evaluación queda cerrada.

**Why this priority**: La curaduría decide la programación; debe ser trazable y justa.

**Independent Test**: Asignar 2 curadores, registrar sus puntajes y verificar el puntaje final.

**Acceptance Scenarios**:

1. **Given** criterios "calidad artística" 50 %, "viabilidad técnica" 30 % y "aporte al
   territorio" 20 %, **When** un curador califica 80, 70 y 90, **Then** su puntaje es 79,00.
2. **Given** dos curadores con 79,00 y 85,00, **When** se consulta, **Then** el puntaje final es
   82,00.
3. **Given** un curador con conflicto de interés declarado con el elenco, **When** se le intenta
   asignar, **Then** el sistema lo impide.
4. **Given** un curador, **When** evalúa, **Then** no ve los puntajes de otros curadores hasta
   enviar el suyo.
5. **Given** dos puntajes que difieren más de 25 puntos, **When** ambos se envían, **Then** la
   postulación se marca "requiere deliberación" para el comité.
6. **Given** una evaluación enviada, **When** el curador quiere cambiarla, **Then** solo la
   coordinación puede reabrirla, con motivo registrado.

---

### User Story 4 - Selección, resultados y paso a programación (Priority: P2)

La coordinación cierra la evaluación, revisa el ranking, aprueba seleccionados por cupos (por
componente, disciplina o provincia), define una lista de espera, publica resultados y las obras
seleccionadas quedan disponibles para Operación.

**Why this priority**: Conecta la convocatoria con la cartelera.

**Independent Test**: Con 5 postulaciones evaluadas y 2 cupos, aprobar y verificar
notificaciones y que esas obras aparecen como programables.

**Acceptance Scenarios**:

1. **Given** 2 cupos y cinco postulaciones con puntaje, **When** se aprueba, **Then** las 2 de
   mayor puntaje quedan "seleccionadas", la 3.ª "en lista de espera" y el resto "no
   seleccionadas".
2. **Given** resultados publicados, **When** se notifica, **Then** cada postulante recibe su
   resultado, su puntaje final y las observaciones consolidadas (sin identificar al curador).
3. **Given** un seleccionado que desiste, **When** la coordinación lo registra, **Then** el primero
   de la lista de espera pasa a "seleccionado" y es notificado.
4. **Given** una obra seleccionada, **When** se publica, **Then** se emite
   `PostulacionSeleccionada` y Operación ya la tiene sin recargar datos.
5. **Given** cupos por provincia en Camino a Loja, **When** se aprueba, **Then** el ranking y los
   cupos se aplican por provincia.

---

### User Story 5 - Gestionar convocatorias y comité (Priority: P3)

La coordinación crea una convocatoria por edición: componente, provincia (Camino a Loja),
fechas de apertura, cierre, subsanación y resultados, bases en PDF, requisitos documentales,
criterios con peso, cupos, curadores por disciplina y número de curadores por postulación.

**Why this priority**: Puede cargarse a mano al inicio; el valor está en US1–US4.

**Independent Test**: Crear una convocatoria y verificar que aparece abierta solo entre sus fechas.

**Acceptance Scenarios**:

1. **Given** apertura 1 de junio y cierre 31 de julio, **When** hoy es 15 de junio, **Then**
   aparece abierta al público.
2. **Given** criterios cuyos pesos no suman 100 %, **When** se guarda, **Then** se rechaza.
3. **Given** una convocatoria abierta con postulaciones, **When** se intenta cambiar criterios o
   pesos, **Then** se rechaza (solo se pueden ampliar fechas, con aviso a postulantes).
4. **Given** la asignación automática, **When** se ejecuta, **Then** cada postulación recibe el
   número configurado de curadores de su disciplina, sin conflictos y con carga equilibrada
   (diferencia máxima de 1 postulación entre curadores).

---

### User Story 6 - Invitación al componente Internacional (Priority: P3)

La coordinación invita a un elenco extranjero; este recibe un enlace privado para completar la
misma ficha de obra sin pasar por concurso, y su obra queda seleccionada al confirmarla.

**Why this priority**: El internacional es por invitación; basta con reutilizar la ficha.

**Independent Test**: Enviar una invitación, completar la ficha y verificar que la obra queda
seleccionada y programable.

**Acceptance Scenarios**:

1. **Given** una invitación enviada a "Los Nadies Circo" (Chile), **When** completan la ficha,
   **Then** la obra queda "seleccionada" en el componente Internacional.
2. **Given** una invitación vencida (30 días), **When** se abre el enlace, **Then** se indica que
   expiró y se ofrece contactar a la coordinación.

### Edge Cases

- Empate en el último cupo: la coordinación decide con justificación escrita registrada.
- Un curador no termina en plazo: la coordinación reasigna sus postulaciones pendientes.
- Videos: solo por enlace a plataforma de video; no se suben archivos de video.
- La misma obra no puede postularse dos veces a la misma convocatoria.
- Un elenco puede postular varias obras distintas, hasta el máximo de la convocatoria.
- Archivo con virus o formato no permitido: se rechaza al subir, sin afectar el borrador.
- La convocatoria se amplía: todos los postulantes con borrador reciben aviso.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La coordinación MUST crear convocatorias por edición, componente y, si aplica,
  provincia, con fechas, bases, requisitos, criterios ponderados (suma 100 %), cupos y comité.
- **FR-002**: El sistema MUST mostrar públicamente las convocatorias abiertas, sus bases y su
  cronograma.
- **FR-003**: Los elencos MUST poder crear perfil, guardar borradores y enviar postulaciones solo
  con la convocatoria abierta.
- **FR-004**: El sistema MUST validar campos y documentos obligatorios (PDF o imagen, máximo
  10 MB por archivo, video por enlace).
- **FR-005**: El sistema MUST emitir acuse con número único por convocatoria.
- **FR-006**: La coordinación MUST poder admitir, pedir subsanación (con plazo) o no admitir con
  motivo.
- **FR-007**: El sistema MUST asignar curadores (manual o automáticamente) sin conflicto de
  interés y con carga equilibrada.
- **FR-008**: Los curadores MUST calificar por criterio y dejar observaciones; el sistema calcula
  el puntaje ponderado por curador y el promedio final con dos decimales.
- **FR-009**: Los puntajes ajenos MUST permanecer ocultos al curador hasta que envíe el suyo.
- **FR-010**: El sistema MUST marcar las postulaciones con dispersión > 25 puntos para
  deliberación.
- **FR-011**: Cada cambio de estado MUST quedar en la bitácora de auditoría (quién, cuándo,
  motivo).
- **FR-012**: La coordinación MUST aprobar seleccionados por cupos, con lista de espera, y
  publicar resultados con notificación a cada postulante.
- **FR-013**: Las obras seleccionadas MUST quedar disponibles para Operación mediante
  `PostulacionSeleccionada`.
- **FR-014**: La coordinación MUST poder invitar elencos internacionales con enlace privado.
- **FR-015**: Los documentos de postulantes MUST ser accesibles solo para la coordinación y los
  curadores asignados (Constitución VI).
- **FR-016**: El postulante MUST poder descargar su postulación y su resultado.

### Reglas de negocio

- **RN-001**: Puntaje del curador = Σ (calificación del criterio × peso del criterio).
- **RN-002**: Puntaje final = promedio aritmético de los puntajes de los curadores asignados,
  redondeado a dos decimales.
- **RN-003**: Para publicar resultados, toda postulación admitida debe tener todas sus
  evaluaciones enviadas o reasignadas.
- **RN-004**: Un curador tiene conflicto de interés si es integrante, familiar declarado o
  representante del elenco.
- **RN-005**: En Camino a Loja no se admiten obras ya presentadas en ediciones anteriores del
  programa.
- **RN-006**: Solo son seleccionables postulaciones con puntaje final ≥ 60.
- **RN-007**: Criterios y pesos son inmutables una vez recibida la primera postulación.
- **RN-008**: Las observaciones que ve el postulante son las consolidadas por la coordinación,
  sin identificar a los curadores.

### Ciclo de vida de una postulación

| Desde | Evento | Hacia |
|-------|--------|-------|
| — | Elenco crea | Borrador |
| Borrador | Envía con todo completo (convocatoria abierta) | Enviada |
| Enviada | Retira antes del cierre | Borrador |
| Enviada | Coordinación pide corrección | Requiere subsanación |
| Requiere subsanación | Corrige en plazo | Enviada |
| Requiere subsanación | Vence plazo | No admitida |
| Enviada | No cumple requisitos | No admitida |
| Enviada | Cumple requisitos | Admitida → En evaluación |
| En evaluación | Todas las evaluaciones enviadas | Evaluada |
| Evaluada | Aprobación dentro de cupo | Seleccionada |
| Evaluada | Fuera de cupo, en reserva | Lista de espera |
| Evaluada | Fuera de cupo | No seleccionada |
| Lista de espera | Desistimiento de un seleccionado | Seleccionada |
| Seleccionada | Elenco desiste | Desistida |

### Eventos de dominio publicados

| Evento | Consumidor | Contenido |
|--------|-----------|-----------|
| `ConvocatoriaPublicada` | Cartelera (aviso público opcional) | convocatoria, fechas |
| `PostulacionEnviada`, `SubsanacionSolicitada`, `ResultadoPublicado` | Identidad (notificaciones) | postulante, estado |
| `PostulacionSeleccionada` | Operación | obra, elenco, componente, ficha técnica |
| `SeleccionDesistida` | Operación | obra |

### Requisitos no funcionales

- **RNF-001**: Soportar el pico de envíos de las últimas 2 horas antes del cierre (estimado:
  500 envíos/hora) sin perder borradores.
- **RNF-002**: Los documentos se almacenan cifrados y se sirven solo con autorización.
- **RNF-003**: La bitácora de decisiones se conserva al menos 5 años.

### Key Entities

- **Convocatoria**: edición, componente, provincia, cronograma, bases, requisitos, cupos,
  curadores por postulación, estado (borrador, abierta, cerrada, en evaluación, resultados
  publicados).
- **Criterio**: nombre, descripción, peso.
- **Elenco (perfil)**: nombre, responsable, contacto, país o provincia, integrantes, trayectoria.
- **Postulación**: número, convocatoria, elenco, obra propuesta, documentos, estado, puntaje final.
- **Documento**: tipo, archivo o enlace, fecha de carga.
- **Curador**: persona, disciplinas, conflictos declarados.
- **Asignación**: curador ↔ postulación.
- **Evaluación**: calificaciones por criterio, observaciones, estado (borrador, enviada, reabierta).
- **Invitación**: elenco, componente, enlace privado, vencimiento.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un elenco con sus documentos listos envía su postulación en menos de 20 minutos.
- **SC-002**: El 100 % de las decisiones de selección son trazables a puntajes, observaciones y
  autor en la bitácora.
- **SC-003**: El 100 % de los postulantes recibe su resultado el mismo día de la publicación.
- **SC-004**: La coordinación consolida resultados en menos de 1 hora (frente a días con hojas de
  cálculo).
- **SC-005**: Cero asignaciones con conflicto de interés.

## Assumptions

- En la realidad la convocatoria nacional usa el portal de fomento del Ministerio y Camino a Loja
  lo ejecuta la Casa de la Cultura; aquí se unifican en una sola plataforma como caso de estudio.
- La deliberación del comité ocurre fuera del sistema; aquí se registra su resultado.
- Los curadores tienen cuenta creada por la coordinación (spec 004, Identidad).

## Fuera de alcance

- Contratos, honorarios, pagos a artistas y logística de viaje.
- Firma electrónica de documentos.
- Apelaciones formales (se gestionan por correo en v1).

## Dependencias

- **004 Identidad**: cuentas de postulantes y curadores, roles y notificaciones.
- **004 Operación**: consume las obras seleccionadas.
