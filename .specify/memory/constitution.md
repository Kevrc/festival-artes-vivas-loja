<!--
Sync Impact Report
- Versión: 2.1.1 → 2.2.0 (MINOR: la puerta Q4 pasa de aprobación obligatoria a CI obligatoria;
  la revisión de un integrante queda recomendada)
- Historial: 2.1.0 → 2.1.1 (PATCH: se asignan responsables y revisores por spec en §11)
- Historial: 2.0.0 → 2.1.0 (MINOR: equipo de 4 integrantes, un spec por persona; la spec 005
  Identidad se integra en la 004 como segundo módulo del mismo responsable)
- Historial: 1.0.0 → 2.0.0 (MAJOR: principios redefinidos con obligaciones verificables)
- Principios: I–VII reescritos con reglas, justificación y verificación; añadidos
  VI (Seguridad y privacidad), VIII (Resiliencia ante picos) y IX (Observabilidad y trazabilidad)
- Secciones añadidas: Propósito y alcance, Actores, Puertas de calidad, Definición de Listo y
  de Terminado, Trazabilidad SDD, Correspondencia con el modelo 4+1, Entregables académicos,
  Responsabilidades del equipo, Plantilla de ADR
- Plantillas: plan-template.md ✅ (Constitution Check = principios I–X + puertas de calidad),
  spec-template.md ✅, tasks-template.md ✅ (tareas de prueba obligatorias por Principio IV)
- Pendientes: ninguno
-->

# Constitución del proyecto
## Plataforma digital del Festival Internacional de Artes Vivas de Loja (FIAVL)

> Esta constitución define los principios **no negociables** con los que el equipo especifica,
> diseña, construye, prueba y defiende la plataforma. Todo `plan.md` se evalúa contra ella
> antes de diseñar y otra vez antes de implementar.

---

## 1. Propósito y alcance

El FIAVL es un festival de artes escénicas creado en 2016 e institucionalizado por ley en 2018:
se realiza **cada noviembre, durante 11 días, con Loja como sede permanente**. Reúne cada año más
de 300 actividades, más de 100 elencos de una docena de países y más de 160 000 asistencias, en
teatros (programación *In*, curada y en parte con boleto) y en calles, plazas y parques
(programación *Off*, de acceso libre). Ver [`docs/investigacion-festival.md`](../../docs/investigacion-festival.md).

La plataforma cubre el **ciclo anual completo de una edición**:

```
Convocatoria → Curaduría → Programación → Venta/Reserva → Festival (acceso) → Informe de cierre
```

**Dentro del alcance**: cartelera pública, boletería y control de acceso, convocatorias y
curaduría, operación (sedes, agenda, cambios, estadísticas), cuentas, roles y notificaciones.

**Fuera del alcance (v1)**: contratos y honorarios de artistas, logística de hospedaje y
transporte, butacas numeradas, aplicación móvil nativa, idiomas distintos del español,
transmisión en vivo.

## 2. Actores

| Actor | Descripción | Módulo principal |
|-------|-------------|------------------|
| Visitante | Cualquier persona, sin cuenta | Cartelera |
| Asistente | Persona con cuenta que obtiene entradas | Boletería |
| Postulante / Elenco | Artista o agrupación que se presenta a una convocatoria | Convocatorias |
| Curador | Evaluador experto de propuestas | Convocatorias |
| Coordinación de convocatorias | Abre convocatorias y publica resultados | Convocatorias |
| Programador | Arma la agenda de funciones | Operación |
| Taquilla | Vende y entrega entradas presenciales | Boletería |
| Validador | Controla el ingreso en sala | Boletería |
| Dirección del festival | Consulta estadísticas e informes | Operación |
| Administrador | Gestiona ediciones, sedes y cuentas del personal | Cuentas / Operación |
| Proveedor de pagos (externo) | Procesa cobros y devoluciones | Boletería |

---

## 3. Principios fundamentales

Cada principio tiene **reglas** (obligatorias, con MUST/NUNCA), su **justificación** y la forma
en que se **verifica**.

### I. Especificación primero (SDD) — NO NEGOCIABLE

**Reglas**
- Ningún código de producción se escribe sin `spec.md` aprobada, `plan.md` y `tasks.md` en
  `specs/NNN-nombre/`, siguiendo `specify → clarify → plan → tasks → implement`.
- La spec describe **qué** y **por qué**, en lenguaje del festival y sin tecnología. El **cómo**
  vive en `plan.md`, `data-model.md`, `contracts/` y `research.md`.
- Toda ambigüedad se marca `[NEEDS CLARIFICATION]`; no se planifica con marcadores abiertos.
- Si el código diverge de la spec, se corrige la spec en el mismo PR o el código vuelve a ella.
  **La spec es la fuente de verdad.**
- Los identificadores (US-n, FR-nnn, RN-nnn, SC-nnn) son estables: no se renumeran; lo que se
  descarta se marca *obsoleto*.

**Justificación**: la metodología del curso es SDD y la defensa exige explicar decisiones; sin
specs trazables no hay evidencia.
**Verificación**: el PR enlaza la spec y las tareas que implementa; `/speckit-analyze` sin
hallazgos críticos antes de `/speckit-implement`.

### II. Arquitectura documentada con el modelo 4+1

**Reglas**
- La arquitectura vive en `docs/arquitectura/` con un archivo por vista:

  | Vista | Pregunta que responde | Diagramas Mermaid |
  |-------|-----------------------|-------------------|
  | Lógica | ¿Qué hace el sistema y con qué conceptos? | `classDiagram`, mapa de contextos |
  | Desarrollo | ¿Cómo se organiza el código y quién es dueño de qué? | `flowchart` de módulos y paquetes |
  | Procesos | ¿Qué pasa en tiempo de ejecución, con concurrencia y picos? | `sequenceDiagram`, `stateDiagram-v2` |
  | Física | ¿Dónde se despliega y cómo se conecta? | `flowchart` de despliegue / C4 |
  | Escenarios (+1) | ¿Qué casos de uso validan las otras cuatro? | `sequenceDiagram` de las US P1 |

- Todos los diagramas se escriben en **Mermaid** (texto versionado, revisable en PR). DeepWiki
  se puede usar como apoyo para generar documentación del repositorio, nunca como única fuente.
- Cada escenario de la vista +1 corresponde a una historia **P1** de alguna spec y recorre las
  otras cuatro vistas.
- Toda decisión relevante se registra como **ADR** en `docs/adr/NNNN-titulo.md` (plantilla en
  §10). Las ADR son el guion del video de defensa.
- Un PR que cambie módulos, integraciones o despliegue **MUST** actualizar la vista afectada en
  el mismo PR.

**Justificación**: el entregable exige el modelo 4+1; documentarlo junto al código evita que se
desactualice.
**Verificación**: revisión de PR; los diagramas se renderizan en GitHub sin errores.

### III. Módulos por contexto del dominio, con contratos explícitos

**Reglas**
- El sistema se organiza en **cinco contextos acotados** (ver [`docs/dominio.md`](../../docs/dominio.md)):
  **Programación** (cartelera), **Boletería**, **Convocatorias**, **Operación** e **Identidad**
  (cuentas, roles, notificaciones).
- Cada contexto es **dueño exclusivo de sus datos**. Ningún módulo lee ni escribe datos de otro;
  solo usa su **contrato público** (API o eventos de dominio) documentado en
  `specs/NNN/contracts/`.
- Los contratos se definen **antes** de implementarse (contract-first) y se versionan; un
  cambio incompatible exige nueva versión y aviso a los módulos consumidores.
- La comunicación entre contextos que no necesita respuesta inmediata se hace con **eventos de
  dominio** (p. ej. `FuncionCancelada`, `PostulacionSeleccionada`).
- Añadir un sexto contexto o partir uno existente exige una ADR.

**Justificación**: los cuatro integrantes trabajan en paralelo sin pisarse, un spec cada uno; las fronteras
claras se explican y defienden en la vista lógica y en la de desarrollo.
**Verificación**: pruebas de contrato por cada integración; revisión de dependencias entre
módulos en cada PR.

### IV. Pruebas como criterio de aceptación

**Reglas**
- Cada escenario *Given/When/Then* tiene al menos **una prueba automatizada** con su identificador
  (p. ej. `US2-AS3`) en el nombre o la descripción.
- Las reglas críticas se desarrollan **probando primero** (rojo → verde → refactor): aforo y
  emisión de entradas, validación de ingreso, cálculo de puntajes, cruces de agenda y cambios de
  estado.
- Pirámide mínima: unitarias de dominio, de integración por módulo, de contrato entre módulos y
  de extremo a extremo para cada historia P1.
- La CI ejecuta lint, pruebas y verificación de contratos en cada PR; **un PR en rojo no se fusiona**.

**Justificación**: los criterios de aceptación de la spec solo valen si se ejecutan.
**Verificación**: puertas de calidad (§4).

### V. Integridad del aforo, las entradas y el dinero

**Reglas**
- **NUNCA** se emiten más entradas que el aforo habilitado de una función, sumando venta web,
  taquilla y reservas, incluso con operaciones simultáneas.
- Cada entrada es **única, infalsificable y de un solo uso** en el ingreso.
- Compra, reserva, devolución y validación son **idempotentes**: un reintento no duplica entradas,
  cobros ni ingresos.
- Los cobros se delegan a un **proveedor de pagos externo**; la plataforma **nunca** almacena
  datos de tarjeta.
- Los importes se manejan en centavos enteros de USD, sin decimales flotantes.
- Toda operación monetaria queda registrada de forma inmutable (se corrige con una operación
  compensatoria, nunca editando).

**Justificación**: la sobreventa y los cobros dobles son los fallos más graves y visibles para
el público.
**Verificación**: pruebas de concurrencia (SC-001 de la spec 002) y de idempotencia en la CI.

### VI. Seguridad y privacidad por diseño

**Reglas**
- **Mínimo privilegio**: cada rol accede solo a lo que necesita; la autorización se comprueba en
  el servidor en cada operación, no solo en la interfaz.
- Contraseñas con hash robusto y adaptativo; sesiones con expiración; bloqueo temporal tras
  intentos fallidos.
- Toda entrada externa se valida en el borde del sistema (OWASP Top 10 como referencia mínima).
- Los secretos (llaves del proveedor de pagos, firma de QR) nunca se versionan en el repositorio.
- Datos personales según la **Ley Orgánica de Protección de Datos Personales del Ecuador
  (LOPDP)**: se recogen solo los necesarios, con consentimiento y finalidad declarada; el titular
  puede consultarlos, corregirlos y pedir su eliminación.
- Documentos de postulantes y datos de asistentes no son públicos ni se exponen en URLs adivinables.

**Justificación**: la plataforma maneja pagos, identidades y documentos de artistas.
**Verificación**: pruebas de autorización por rol; revisión de seguridad (`/security-review`)
antes de fusionar cambios en Boletería e Identidad.

### VII. Acceso público e inclusivo

**Reglas**
- El festival es un bien cultural público: la cartelera, las convocatorias abiertas y la
  información de funciones gratuitas se consultan **sin cuenta**.
- Interfaz en español, diseñada primero para el **móvil** y conforme a **WCAG 2.1 AA**:
  contraste, navegación por teclado, textos alternativos, formularios etiquetados.
- La información de accesibilidad de cada sede (rampas, baños, espacios para silla de ruedas) es
  obligatoria y visible.
- Ninguna función gratuita exige pago ni datos de tarjeta.

**Justificación**: el público es masivo, diverso y llega sobre todo desde el celular.
**Verificación**: auditoría automática de accesibilidad en la CI sobre las páginas públicas;
revisión manual con lector de pantalla en historias P1.

### VIII. Resiliencia ante picos de demanda

**Reglas**
- El diseño **MUST** contemplar los picos conocidos: apertura de venta, noche de inauguración y
  clausura, y la entrada simultánea de público en la puerta de cada sala.
- Presupuestos de rendimiento (percentil 95):

  | Operación | Objetivo |
  |-----------|----------|
  | Consultar cartelera | < 1 s en servidor, < 3 s en un celular 4G |
  | Confirmar compra o reserva (sin contar el proveedor de pagos) | < 2 s |
  | Validar una entrada en la puerta | < 2 s, también sin conexión |
  | Carga sostenida | 5 000 visitantes simultáneos en la cartelera |

- La caída de un módulo no tumba a los demás: si Boletería falla, la cartelera sigue publicada.
- La validación de ingreso funciona **sin conexión** y sincroniza al reconectar.

**Justificación**: más de 160 000 asistencias en 11 días, concentradas en pocas horas.
**Verificación**: prueba de carga documentada en la vista de procesos antes de la entrega.

### IX. Observabilidad y trazabilidad

**Reglas**
- Logs estructurados con identificador de correlación por petición, que se propaga entre módulos
  y eventos.
- Métricas mínimas: peticiones, errores, latencia, entradas emitidas por función y ocupación.
- Bitácora de **auditoría** inmutable para acciones sensibles: cambios de función, decisiones de
  curaduría, devoluciones, cambios de rol.
- Nunca se registran contraseñas, tokens ni datos de pago en los logs.

**Justificación**: la organización rinde cuentas públicas y debe explicar cada cambio y cada cifra.
**Verificación**: las pruebas de las acciones auditables comprueban que se generó el registro.

### X. Simplicidad

**Reglas**
- Se construye lo mínimo que cumple la spec (YAGNI): sin capas, opciones ni servicios "para después".
- Toda dependencia o componente de infraestructura nuevo se justifica en `plan.md`
  (alternativas consideradas, por qué esta).
- Se empieza con un **monolito modular** desplegable como una unidad; separar en servicios exige
  una ADR con evidencia (carga, equipo o aislamiento de fallos).
- Cada excepción se anota en la tabla *Complexity Tracking* del plan.

**Justificación**: equipo pequeño, plazo corto; la complejidad sin necesidad no se puede defender
en 5 minutos.
**Verificación**: revisión del *Complexity Tracking* en el Constitution Check.

---

## 4. Puertas de calidad (todas obligatorias para fusionar en `main`)

| # | Puerta | Criterio |
|---|--------|----------|
| Q1 | Compilación y lint | Sin errores ni advertencias nuevas |
| Q2 | Pruebas | 100 % en verde; cobertura ≥ 80 % en la capa de dominio de cada módulo |
| Q3 | Contratos | Las pruebas de contrato de los módulos afectados pasan |
| Q4 | Revisión | CI en verde obligatoria (checks requeridos en `main`); revisión de otro integrante recomendada, y siempre pedida al revisor suplente (§11) cuando se toca Boletería o Identidad |
| Q5 | Trazabilidad | El PR enlaza la spec y las tareas (`T0nn`) que completa |
| Q6 | Arquitectura | Vista 4+1 y ADR actualizadas si el cambio es estructural |
| Q7 | Accesibilidad | Sin violaciones nuevas de nivel A/AA en páginas públicas |
| Q8 | Seguridad | Sin secretos en el diff; revisión de seguridad en módulos sensibles |

## 5. Definición de Listo y de Terminado

**Una spec está Lista para planificar** cuando:
- tiene historias priorizadas con escenarios Given/When/Then, reglas de negocio, casos borde y
  criterios de éxito medibles;
- no le quedan `[NEEDS CLARIFICATION]` y su checklist de calidad está completo;
- sus eventos y dependencias con otros contextos están declarados.

**Una historia está Terminada** cuando:
- todos sus escenarios tienen prueba automatizada en verde;
- cumple las puertas Q1–Q8 y está fusionada en `main`;
- la documentación (spec, contratos, vista 4+1) refleja lo construido;
- se puede demostrar de forma independiente (sirve para el video).

## 6. Flujo de trabajo por ramas

**Modelo**: *trunk-based* con ramas de funcionalidad de vida corta.

| Rama | Uso | Ejemplo |
|------|-----|---------|
| `main` | Siempre estable y desplegable; protegida | — |
| `NNN-nombre` | Trabajo de una spec (una por integrante responsable) | `002-boleteria-entradas` |
| `NNN-nombre-tarea` | Subrama opcional para una tarea grande | `002-boleteria-entradas-validador` |
| `docs/tema` | Arquitectura, ADR, constitución, investigación | `docs/vista-procesos` |
| `chore/tema` | CI, configuración, dependencias | `chore/ci-pruebas` |
| `fix/tema` | Corrección urgente sobre `main` | `fix/sobreventa-taquilla` |

**Reglas**
- `main` protegida: solo por **Pull Request** con todos los checks de CI en verde, historial lineal
  y sin *force push*; la regla también aplica a los administradores.
- Integración frecuente: la rama se actualiza desde `main` al menos cada dos días y siempre antes
  de pedir revisión; los conflictos los resuelve el autor del PR.
- PRs pequeños (idealmente < 400 líneas cambiadas sin contar pruebas ni documentos).
- Fusión con *squash* o *rebase* para mantener un historial lineal y legible.
- Los cambios en archivos compartidos (contratos, `docs/arquitectura/`, esta constitución) van en
  un PR propio y requieren aprobación del responsable de cada contexto afectado.
- Se etiqueta un *release* por hito: `v0.1-specs`, `v0.2-plan-arquitectura`, `v1.0-entrega`.

**Commits**
- Modulares y reversibles: un commit por cambio lógico, que se pueda revertir solo.
- En español con Conventional Commits: `tipo(ámbito): resumen` — tipos `feat`, `fix`, `docs`,
  `test`, `refactor`, `chore`, `ci`; ámbitos `cartelera`, `boleteria`, `convocatorias`,
  `operacion`, `identidad`, `arquitectura`, `specs`.
  Ejemplo: `feat(boleteria): retener lugares durante el pago`.
- Cada integrante debe tener commits y PRs propios: **el historial es la evidencia del trabajo
  colaborativo**.

**Plantilla de PR**: qué cambia y por qué · spec y tareas enlazadas · cómo se probó ·
capturas si hay interfaz · vista 4+1 o ADR afectada · checklist Q1–Q8.

## 7. Trazabilidad SDD

Toda pieza del sistema se puede seguir de punta a punta:

```
Investigación → Spec (US, FR, RN, SC) → Plan (decisiones, ADR) → Tareas (T0nn)
  → Código (commit que cita T0nn) → Prueba (nombrada con US-AS) → Vista 4+1 (escenario)
```

## 8. Correspondencia de principios con el modelo 4+1

| Principio | Lógica | Desarrollo | Procesos | Física | Escenarios |
|-----------|:-----:|:----------:|:--------:|:------:|:----------:|
| III Contextos y contratos | ● | ● | ○ | | ○ |
| IV Pruebas | | ● | | | ● |
| V Integridad del aforo | ● | | ● | | ● |
| VI Seguridad | ○ | ● | ○ | ● | |
| VIII Resiliencia | | | ● | ● | ○ |
| IX Observabilidad | | ○ | ● | ● | |
| X Simplicidad | ○ | ● | | ● | |

● impacto principal · ○ impacto secundario

## 9. Entregables académicos

| Entregable | Criterio de aceptación |
|------------|------------------------|
| Repositorio GitHub | Constitución, specs, planes, tareas, código y pruebas; historial con ramas y PRs de todos |
| Arquitectura 4+1 | Cinco vistas en Mermaid en `docs/arquitectura/` + ADR en `docs/adr/` |
| Video de defensa (5 min) | Participan todos; cada uno explica el contexto que lideró y al menos una ADR; recorre un escenario P1 de extremo a extremo |

Guion sugerido del video: problema y contexto del festival (30 s) → SDD y constitución (45 s) →
vista lógica y contextos (45 s) → procesos y picos de demanda (45 s) → física y despliegue (45 s)
→ escenario +1 en vivo (60 s) → decisiones y lecciones (30 s).

## 10. Plantilla de ADR

```markdown
# ADR-NNNN: Título en imperativo
- Estado: propuesta | aceptada | reemplazada por ADR-XXXX
- Fecha: AAAA-MM-DD · Autor: @usuario · Specs: 00N
## Contexto        (problema, fuerzas, restricciones de la constitución)
## Decisión        (qué se decide, en una frase clara)
## Alternativas    (al menos dos, con pros y contras)
## Consecuencias   (positivas, negativas, riesgos, vista 4+1 afectada)
```

## 11. Responsabilidades del equipo

| Contexto / área | Spec | Responsable | Revisor suplente |
|-----------------|------|-------------|------------------|
| Programación (cartelera) | 001 | @Kevrc | @jeimytorresg |
| Boletería | 002 | @By-Alvarez06 | @Kevrc |
| Convocatorias | 003 | @Carlos2190 | @By-Alvarez06 |
| Operación + Identidad | 004 | @jeimytorresg | @Carlos2190 |
| Arquitectura 4+1, ADR y CI | transversal | rotativo | todos |

## 12. Gobernanza

- Esta constitución prevalece sobre cualquier otra práctica del proyecto.
- El *Constitution Check* de cada `plan.md` se evalúa contra los principios I–X y las puertas
  Q1–Q8 **antes** de la fase 0 y otra vez después del diseño (fase 1).
- **Enmiendas**: PR en una rama `docs/constitucion-...` con justificación e impacto, aprobado por
  la mayoría del equipo. Se actualiza el *Sync Impact Report* y las plantillas afectadas.
- **Versionado semántico**: MAJOR (se elimina o redefine un principio), MINOR (se añade un
  principio o sección), PATCH (aclaraciones de redacción).
- Las excepciones se documentan en el *Complexity Tracking* del plan con fecha de revisión.

**Versión**: 2.2.0 | **Ratificada**: 2026-11-19 | **Última enmienda**: 2026-11-19
