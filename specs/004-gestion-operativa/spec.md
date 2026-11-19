# Feature Specification: Gestión operativa del festival

**Feature Branch**: `004-gestion-operativa`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "La organización administra ediciones, sedes, obras y elencos; arma la agenda de funciones en una grilla por sede y día evitando cruces y respetando montaje; publica la programación; reprograma o cancela con motivo; gestiona incidencias durante el festival; registra asistencia estimada en espacios públicos; y consulta estadísticas e informe de cierre de la edición."

**Contexto acotado**: Operación. Dueño de Ediciones, Sedes, Obras, Elencos, Funciones, Cambios
de función, Incidencias y Estadísticas.

## Contexto del problema

En 2025 el festival cerró con 313 actividades, 116 elencos, 125 obras y 163 162 asistencias; en
2026 programó 439 funciones y actividades con 165 elencos en cuatro teatros, un museo y espacios
públicos, más un desfile inaugural con 11 delegaciones. La organización (Municipio de Loja y
Ministerio) necesita armar esa agenda sin choques de sala, reaccionar a cambios (lluvia,
retrasos de elencos, fallas técnicas) y **rendir cuentas** con cifras confiables al cierre. Hoy
esas cifras se consolidan a mano.

## Actores

- **Administrador**: ediciones, sedes y parámetros.
- **Programador**: obras, elencos, funciones, publicación y cambios.
- **Jefe de sala**: registra incidencias y conteos estimados en su sede.
- **Dirección del festival**: consulta estadísticas e informe (solo lectura).
- **Convocatorias** (spec 003): entrega obras seleccionadas.
- **Boletería** (spec 002): entrega ventas e ingresos.

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

### Ciclo de vida de una función

| Desde | Evento | Hacia |
|-------|--------|-------|
| — | Programador crea | Borrador |
| Borrador | Publicación | Programada |
| Programada / Reprogramada | Cambio de horario o sede con motivo | Reprogramada |
| Programada / Reprogramada | Cancelación con motivo | Cancelada |
| Programada / Reprogramada | Pasa su hora de fin | Finalizada |

### Eventos de dominio

| Evento | Dirección | Contraparte |
|--------|-----------|-------------|
| `ProgramacionPublicada`, `FuncionProgramada`, `FuncionActualizada`, `FuncionReprogramada`, `FuncionCancelada`, `AforoCambiado` | Publica | Cartelera, Boletería, Identidad |
| `PostulacionSeleccionada`, `SeleccionDesistida` | Consume | Convocatorias |
| `EntradasEmitidas`, `IngresoRegistrado`, `PedidoReembolsado` | Consume (estadísticas) | Boletería |
| `AforoExcedido`, `ConflictoDeIngreso` | Consume (incidencias) | Boletería |

### Requisitos no funcionales

- **RNF-001**: La grilla de un día con 60 funciones carga en < 2 s.
- **RNF-002**: Los eventos de cambio de función llegan a los consumidores en < 1 minuto.
- **RNF-003**: El panel de estadísticas se actualiza al menos cada 5 minutos durante el festival.

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

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Cero cruces de sede o de elenco en la programación publicada.
- **SC-002**: Un programador crea una función en menos de 1 minuto.
- **SC-003**: Los cambios de función llegan a Cartelera y Boletería en menos de 1 minuto.
- **SC-004**: El informe de cierre se obtiene en menos de 5 minutos (frente a días de trabajo
  manual).
- **SC-005**: Las cifras del informe cuadran al 100 % con la suma de ingresos y conteos
  registrados.

## Assumptions

- La recaudación proviene de Boletería; este módulo no procesa pagos.
- La "Escuela del festival" (talleres) se modela como funciones de disciplina "taller";
  las inscripciones a talleres quedan fuera de alcance.
- Los conteos estimados los hace el jefe de sala con el método que elija (aforo visual, por
  áreas); el sistema solo registra cantidad y método.

## Fuera de alcance

- Logística de hospedaje, transporte y alimentación de elencos.
- Gestión de voluntarios y personal técnico.
- Planos de escenario y riders técnicos detallados.

## Dependencias

- **003 Convocatorias**: obras seleccionadas.
- **002 Boletería**: ventas, ingresos y alertas.
- **005 Identidad**: roles del personal y notificaciones.
- **001 Cartelera**: consume la programación publicada.
