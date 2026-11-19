# Feature Specification: Cartelera pública de programación

**Feature Branch**: `001-cartelera-programacion`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "Cartelera pública del Festival Internacional de Artes Vivas de Loja: el público consulta obras, elencos, funciones, sedes y horarios de la programación In (salas) y Off (calles, plazas, parques); filtra por fecha, sede, disciplina, país, componente, público y tipo de acceso; ve qué ocurre cerca y ahora; y arma su agenda personal."

**Contexto acotado**: Programación (lectura pública). Los datos los publica Operación (spec 004)
y la disponibilidad la informa Boletería (spec 002).

## Contexto del problema

Cada edición reúne entre 300 y 440 actividades en 11 días, repartidas en cuatro teatros, un
museo y decenas de espacios públicos. En 2026 hubo 28 funciones con boleto (USD 5) y el resto
de acceso libre, algunas solo para estudiantes. El público llega sobre todo desde el celular y
necesita responder rápido tres preguntas: **¿qué hay hoy?, ¿qué hay cerca ahora? y ¿necesito
entrada?** Hoy la programación se publica en un PDF (programa de mano) y en páginas sin filtros.

## Actores

- **Visitante** (sin cuenta): consulta, filtra, busca, guarda favoritos en su dispositivo.
- **Asistente** (con cuenta, spec 004, Identidad): además sincroniza su agenda entre dispositivos.
- **Operación** (spec 004): fuente de la programación publicada.
- **Boletería** (spec 002): fuente de la disponibilidad de entradas.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consultar la programación del día (Priority: P1)

Un visitante abre la cartelera en su celular y ve las funciones de un día del festival,
ordenadas por hora, con obra, elenco, país, disciplina, sede, duración, edad mínima recomendada y tipo
de acceso (pagada, gratuita con reserva, gratuita libre, público restringido).

**Why this priority**: Es la razón principal por la que la gente visita la plataforma; por sí
sola ya es un MVP útil para el festival.

**Independent Test**: Cargar una edición con funciones de prueba y verificar que, sin iniciar
sesión, el visitante ve las funciones del día elegido en orden cronológico con todos sus datos.

**Acceptance Scenarios**:

1. **Given** la edición 2026 publicada con funciones del 12 al 22 de noviembre, **When** el
   visitante abre la cartelera el 14 de noviembre, **Then** ve por defecto las funciones de ese
   día ordenadas por hora de inicio.
2. **Given** que hoy no es día de festival, **When** abre la cartelera, **Then** ve el primer día
   de la edición publicada más próxima (o el último día de la más reciente si ya terminó).
3. **Given** una función "cancelada", **When** aparece en la lista, **Then** se muestra tachada con
   la etiqueta "Cancelada" y no ofrece obtener entrada.
4. **Given** una función "reprogramada", **When** aparece, **Then** muestra el horario nuevo y la
   nota "Antes: <horario anterior>".
5. **Given** una función pagada sin lugares, **When** aparece, **Then** se muestra "Agotado".
6. **Given** un visitante sin cuenta, **When** consulta cualquier día, **Then** accede a toda la
   información pública sin que se le pida registrarse.

---

### User Story 2 - Filtrar y buscar (Priority: P1)

El visitante combina filtros por fecha, franja horaria (mañana, tarde, noche),
sede, disciplina, país, componente (Internacional, Nacional, Camino a Loja, Escuela del
festival), público (familiar, adultos, estudiantes) y tipo de acceso; o busca por obra o elenco.

**Why this priority**: Con más de 400 actividades por edición, sin filtros la cartelera no sirve.

**Independent Test**: Con datos de prueba, aplicar combinaciones de filtros y comprobar que solo
aparecen las funciones que cumplen **todos** los criterios.

**Acceptance Scenarios**:

1. **Given** funciones en el Teatro Bolívar y en plazas, **When** filtra "Gratuita libre" +
   "Circo", **Then** ve solo funciones de circo de acceso libre.
2. **Given** la obra "Zombi Manifiesto" (Uruguay), **When** busca "zombi" o "ZOMBÍ", **Then** la
   obra aparece (sin distinguir mayúsculas ni tildes).
3. **Given** filtros sin resultados, **When** se aplican, **Then** el sistema lo indica y ofrece
   quitar el último filtro o limpiarlos todos.
4. **Given** filtros aplicados, **When** el visitante comparte el enlace, **Then** quien lo abre
   ve la misma lista filtrada.
5. **Given** el filtro de país, **When** se despliega, **Then** solo lista países con al menos una
   función en la edición.

---

### User Story 3 - Fichas de obra, elenco y sede (Priority: P2)

El visitante abre la ficha de una obra (sinopsis, disciplina, duración, edad mínima recomendada,
idioma, imágenes, ficha artística, todas sus funciones), de un elenco (país, ciudad,
componente, obras en la edición) o de una sede (dirección, mapa, aforo, accesibilidad, cómo
llegar, funciones programadas).

**Why this priority**: Ayuda a decidir qué ver y a llegar; depende de la US1.

**Independent Test**: Abrir la ficha de una obra con dos funciones y verificar que lista ambas
con enlace a su sede y su estado.

**Acceptance Scenarios**:

1. **Given** "Cometa" con dos funciones el 15 de noviembre en el Centro Cultural Alfredo Mora
   Reyes, **When** se abre su ficha, **Then** se ven ambas funciones, su disponibilidad y el
   enlace a la sede.
2. **Given** una sede con espacio para silla de ruedas, **When** se abre su ficha, **Then** se
   indica la accesibilidad disponible de forma explícita (y "sin información" si no se cargó).
3. **Given** una obra no apta para menores de 16, **When** se abre su ficha, **Then** la edad
   mínima recomendada se muestra de forma destacada.

---

### User Story 4 - Qué hay cerca y ahora (Priority: P2)

Un turista en el centro histórico abre "Ahora" y ve las funciones que están en curso o empiezan
en los próximos 60 minutos, ordenadas por cercanía si comparte su ubicación, y en un mapa.

**Why this priority**: La programación *Off* ocurre en calles y plazas; el público circula a pie
y decide en el momento.

**Independent Test**: Con funciones de prueba a distintas horas y ubicaciones, simular la hora y
posición del visitante y verificar la lista y el orden.

**Acceptance Scenarios**:

1. **Given** son las 17:10 y hay funciones a las 17:00 (en curso), 17:45 y 19:30, **When** abre
   "Ahora", **Then** ve las de 17:00 y 17:45, no la de 19:30.
2. **Given** el visitante comparte su ubicación, **When** abre "Ahora", **Then** las funciones se
   ordenan por distancia a pie.
3. **Given** el visitante no comparte su ubicación, **When** abre "Ahora", **Then** se ordenan por
   hora y se ofrece elegir un punto de referencia (p. ej. Parque Central).

---

### User Story 5 - Mi agenda del festival (Priority: P3)

El visitante marca funciones como favoritas, ve su agenda por día y recibe un aviso si dos
funciones elegidas se cruzan o si no hay tiempo de traslado entre sedes.

**Why this priority**: Mejora la experiencia, pero el festival funciona sin ella.

**Independent Test**: Marcar dos funciones que se solapan y comprobar el aviso de cruce.

**Acceptance Scenarios**:

1. **Given** favoritas de 19:00–20:30 y 20:00–21:00, **When** ve la agenda, **Then** se avisa del
   cruce.
2. **Given** favoritas que terminan a las 20:00 en el Teatro Bolívar y empiezan a las 20:05 en el
   Teatro Segundo Cueva Celi, **When** ve la agenda, **Then** se avisa de traslado ajustado.
3. **Given** un visitante sin cuenta, **When** marca favoritos, **Then** se guardan en su
   dispositivo; al iniciar sesión se fusionan con los de su cuenta sin duplicar.
4. **Given** una función favorita que se cancela o reprograma, **When** el visitante abre su
   agenda, **Then** el cambio está señalado.

---

### User Story 6 - Programa de mano y difusión (Priority: P3)

El visitante descarga el programa de la edición (completo o filtrado) en un formato imprimible
y añade una función a su calendario personal.

**Why this priority**: Reemplaza el PDF actual; útil pero no crítico.

**Independent Test**: Generar el programa filtrado por un día y verificar que contiene solo esas
funciones con su estado vigente.

**Acceptance Scenarios**:

1. **Given** filtros "16 de noviembre" + "Teatro", **When** descarga el programa, **Then** obtiene
   un documento con esas funciones y la fecha de generación.
2. **Given** una función, **When** pulsa "Añadir a mi calendario", **Then** obtiene un evento con
   título, sede, dirección y horario correctos en hora de Ecuador.

### Edge Cases

- Funciones que cruzan medianoche se listan en el día en que inician.
- Una obra sin imágenes muestra un marcador visual de su disciplina.
- Actividades de varios días (exposición "Buddy Bears", 12–22 nov, 09:00–17:00) se muestran como
  actividad continua cada día, no como 11 funciones repetidas en la lista.
- El desfile inaugural tiene recorrido (varias calles): se muestra el punto de partida y el
  recorrido en el mapa.
- Edición en borrador: no es visible al público, aunque tenga funciones cargadas.
- Un cambio de horario minutos antes de la función debe verse aunque el visitante tenga la
  página abierta.
- Las horas se expresan siempre en hora de Ecuador continental (UTC-5), sin depender de la zona
  horaria del dispositivo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST mostrar públicamente, sin autenticación, la programación de las
  ediciones publicadas.
- **FR-002**: El sistema MUST listar funciones por día en orden cronológico, con obra, elenco,
  país, disciplina, componente, sede, hora de inicio y fin, edad mínima recomendada, tipo de acceso,
  estado y disponibilidad.
- **FR-003**: Los visitantes MUST poder combinar filtros por fecha, franja horaria, sede,
  disciplina, país, componente, público y tipo de acceso.
- **FR-004**: El sistema MUST permitir buscar por obra o elenco sin distinguir mayúsculas ni
  tildes, tolerando coincidencias parciales.
- **FR-005**: El estado de los filtros MUST poder compartirse como enlace.
- **FR-006**: El sistema MUST mostrar fichas de obra, elenco y sede según la US3.
- **FR-007**: El sistema MUST ofrecer la vista "Ahora" con funciones en curso o que empiezan en
  los próximos 60 minutos, ordenables por cercanía con consentimiento de ubicación.
- **FR-008**: El sistema MUST mostrar sedes y funciones *Off* en un mapa.
- **FR-009**: El sistema MUST reflejar los estados de función (programada, reprogramada,
  cancelada, finalizada) y la disponibilidad (disponible, últimos lugares, agotado).
- **FR-010**: Desde una función pagada o con reserva, el visitante MUST poder ir a obtener su
  entrada (spec 002).
- **FR-011**: Los visitantes MUST poder marcar favoritos y ver avisos de cruce y de traslado.
- **FR-012**: El sistema MUST generar el programa de mano (completo o filtrado) y eventos de
  calendario por función.
- **FR-013**: La cartelera MUST cumplir WCAG 2.1 AA y funcionar en pantallas desde 320 px.
- **FR-014**: La ubicación del visitante MUST usarse solo en su dispositivo para ordenar
  resultados y nunca almacenarse (Constitución VI).

### Reglas de negocio

- **RN-001**: Solo son visibles las funciones de ediciones en estado *publicada* o *cerrada*.
- **RN-002**: "Últimos lugares" se muestra cuando queda ≤ 10 % del aforo habilitado.
- **RN-003**: Una función se considera "en curso" desde su hora de inicio hasta su hora de fin.
- **RN-004**: El aviso de traslado ajustado se da cuando entre dos favoritas en sedes distintas
  hay menos de 15 minutos.
- **RN-005**: Las funciones de público restringido (p. ej. "solo estudiantes") se muestran con su
  restricción y no ofrecen entrada al público general.
- **RN-006**: El orden por defecto de un día es: hora de inicio, luego sede, luego título.

### Eventos de dominio consumidos

| Evento | Origen | Efecto en la cartelera |
|--------|--------|------------------------|
| `ProgramacionPublicada` | Operación | Las funciones de la edición pasan a ser visibles |
| `FuncionProgramada` / `FuncionActualizada` | Operación | Alta o actualización de la función |
| `FuncionReprogramada` | Operación | Nuevo horario y nota del anterior |
| `FuncionCancelada` | Operación | Marca de cancelada |
| `DisponibilidadCambiada` | Boletería | Disponible / últimos lugares / agotado |

### Requisitos no funcionales

- **RNF-001**: p95 < 1 s en servidor y < 3 s de carga en celular 4G (Constitución VIII).
- **RNF-002**: 5 000 visitantes simultáneos sin degradación.
- **RNF-003**: Si Boletería no responde, la cartelera sigue disponible mostrando "Consultar
  disponibilidad" en lugar del estado de entradas.
- **RNF-004**: Los cambios de función se reflejan en menos de 1 minuto.

### Key Entities

- **Edición**: año, número romano, fechas, país invitado de honor, precio de entrada, estado
  (borrador, publicada, cerrada).
- **Obra**: título, sinopsis, disciplina, duración, edad mínima recomendada, idioma, imágenes, ficha
  artística; pertenece a un Elenco.
- **Elenco**: nombre, país, ciudad o provincia, componente.
- **Sede**: nombre, tipo (teatro, centro cultural, museo, espacio público), dirección,
  coordenadas, aforo, accesibilidad.
- **Función**: presentación de una Obra en una Sede, con inicio, fin, tipo de acceso, público,
  estado y disponibilidad. Puede ser puntual o continua (exposición).
- **Favorito**: relación entre un visitante (dispositivo o cuenta) y una Función.

*En este contexto todas son vistas de solo lectura; el dueño de Edición, Obra, Elenco, Sede y
Función es Operación (spec 004).*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En pruebas con usuarios, el 90 % encuentra una función indicada en menos de
  30 segundos.
- **SC-002**: La cartelera carga en menos de 3 segundos en un celular 4G la noche de inauguración.
- **SC-003**: Soporta 5 000 visitantes simultáneos sin errores (≈160 000–200 000 asistencias por
  edición).
- **SC-004**: El 100 % de los cambios de estado de función se ven en la cartelera en menos de
  1 minuto.
- **SC-005**: Cero violaciones WCAG 2.1 A/AA en la auditoría automática de las páginas públicas.

## Assumptions

- Obras, elencos, sedes y funciones los carga la organización (spec 004).
- El mapa usa un proveedor de mapas externo; se elige en el plan.
- Contenido solo en español en v1.
- Los textos de las obras los entregan los elencos (spec 003) y la organización los revisa.

## Fuera de alcance

- Notificaciones *push* y recomendaciones personalizadas.
- Comentarios o calificaciones del público sobre las obras.
- Traducción a otros idiomas.

## Dependencias

- **002 Boletería**: disponibilidad y acceso a compra o reserva.
- **004 Operación**: programación publicada y cambios de función.
- **004 Identidad**: sincronizar favoritos con la cuenta (opcional para el visitante).
