# Research: Cartelera pública de programación (001)

**Fase 0 de `/speckit-plan`.** Cada decisión parte de un requisito de la [spec](spec.md) o de un
driver de [00-drivers.md](../../docs/arquitectura/00-drivers.md). El stack base (NestJS, Next.js,
PostgreSQL, pg-boss) ya está decidido en [ADR-0002](../../docs/adr/0002-stack-por-necesidades.md);
aquí solo se resuelve lo propio de la cartelera.

---

## R1. Cómo filtrar sin perder la caché de CDN

- **Necesidad**: filtros combinables y compartibles por enlace (FR-003, FR-005) **y** páginas
  servidas desde CDN para aguantar el pico (QA-2, QA-3, ADR-0006).
- **Problema**: si cada combinación de filtros es una URL distinta en el servidor, la CDN no
  puede cachearlas todas (combinaciones prácticamente infinitas).
- **Decisión**: una página **por día** (`/cartelera/2026-11-14`) generada con ISR y cacheada en la
  CDN con **todas** las funciones del día. Los filtros viajan en la *query string*
  (`?disciplina=circo&acceso=libre`) y se aplican **en el navegador** sobre ese conjunto.
- **Por qué alcanza**: un día tiene como máximo ~60–100 funciones (439 actividades / 11 días en
  2026 ≈ 40, con picos el fin de semana); el JSON del día pesa < 100 KB comprimido.
- **Alternativas**: filtrar en el servidor por petición (pierde la CDN en el pico); generar
  estáticamente cada combinación (explosión combinatoria).

## R2. Búsqueda sin distinguir mayúsculas ni tildes, con coincidencias parciales

- **Necesidad**: FR-004 ("zombi" y "ZOMBÍ" encuentran "Zombi Manifiesto").
- **Decisión**: extensión **`pg_trgm`** de PostgreSQL. La aplicación guarda `texto_busqueda`
  normalizado (sin tildes ni mayúsculas, `normalizarBusqueda`) al proyectar y normaliza igual la
  consulta; búsqueda con `LIKE '%q%'` o `similarity > 0.3`, ordenada por similitud, con índice GIN
  trigram.
- **Ajuste durante la implementación**: se descartó la columna generada con `unaccent` porque Prisma
  no modela columnas generadas y una migración posterior la habría borrado; normalizar en la
  aplicación da el mismo resultado sin esa fragilidad.
- **Por qué**: ~200 obras por edición; no justifica un motor de búsqueda aparte (constitución X).
- **Alternativas**: Elasticsearch/Meilisearch (otro servicio con estado para 200 filas);
  búsqueda solo en el navegador (no cubriría toda la edición desde cualquier página).

## R3. Asignar cada función a su "día de festival"

- **Necesidad**: listar por día en hora de Ecuador (UTC-5) sin depender del dispositivo; las que
  cruzan medianoche cuentan el día en que inician (casos borde).
- **Decisión**: guardar `inicio` y `fin` como `timestamptz`; al proyectar, calcular
  `dia_festival = (inicio AT TIME ZONE 'America/Guayaquil')::date`. La web formatea siempre con
  `timeZone: 'America/Guayaquil'` (Intl, sin librería).
- **Alternativas**: guardar hora local sin zona (ambigua); calcular el día en el navegador
  (depende de la zona del dispositivo, viola el caso borde).

## R4. Disponibilidad sin depender de Boletería en línea

- **Necesidad**: mostrar disponible / últimos lugares / agotado (FR-009, RN-002) y seguir
  funcionando si Boletería cae (RNF-003).
- **Decisión**: Programación guarda en su **proyección** la disponibilidad que le llega por el
  evento `DisponibilidadCambiada`. Un endpoint ligero `GET /api/cartelera/disponibilidad?fecha=`
  la sirve con caché de CDN de 15 s; la web la pide aparte de la página. Si la última
  actualización tiene más de 5 minutos, la web muestra "Consultar disponibilidad".
- **Alternativas**: consultar a Boletería en cada visita (acopla y propaga su caída);
  incluirla en la página ISR (se regeneraría a cada venta).

## R5. Revalidación de páginas ante cambios (< 1 minuto)

- **Necesidad**: RNF-004, SC-004; cambios de último minuto visibles aunque la página esté abierta.
- **Decisión**: el consumidor de eventos del módulo llama a una ruta interna de Next.js protegida
  por secreto que ejecuta `revalidateTag()` sobre las etiquetas afectadas (`dia:2026-11-14`,
  `obra:{id}`, `sede:{id}`). La página abierta vuelve a pedir la disponibilidad cada 60 s y, si
  cambió la versión del día, muestra el aviso "La programación se actualizó".
- **Alternativas**: caducidad fija de 60 s sin revalidación (peor caso de 60 s + propagación);
  WebSockets (infraestructura y conexiones abiertas a miles de clientes sin necesidad).

## R6. Vista "Ahora" y cercanía sin guardar la ubicación

- **Necesidad**: FR-007 (en curso o en los próximos 60 min, ordenable por cercanía) y FR-014 (la
  ubicación nunca se almacena).
- **Decisión**: el servidor devuelve las funciones del intervalo con las **coordenadas de su
  sede**; el navegador obtiene la posición con la Geolocation API (con permiso) y ordena por
  distancia **en el dispositivo**: fórmula de haversine × 1,3 (factor de recorrido urbano) y
  5 km/h para estimar minutos a pie. La posición nunca se envía al servidor.
- **Alternativas**: API de rutas a pie (envía la ubicación a un tercero y tiene costo); enviar la
  posición al servidor (viola FR-014).

## R7. Mapa

- **Necesidad**: sedes y funciones *Off* en un mapa (FR-008), sin costo (C-2).
- **Decisión**: **Leaflet** con teselas de OpenStreetMap servidas por un **proveedor con plan
  gratuito** (p. ej. MapTiler o Stadia), porque la política de uso de los servidores públicos de
  OSM no permite el tráfico de un evento masivo. El recorrido del desfile se dibuja como polilínea.
- **Riesgo**: superar el plan gratuito en el pico; mitigación: el mapa se carga solo bajo demanda
  (pestaña "Mapa"), no en la lista.

## R8. Favoritos sin cuenta y fusión al iniciar sesión

- **Necesidad**: US5-AS3 (favoritos en el dispositivo; al iniciar sesión se fusionan sin duplicar).
- **Decisión**: sin cuenta → `localStorage` (lista de ids, envuelto en try/catch). Con cuenta →
  tabla `programacion.favorito` con clave única `(cuenta_id, funcion_id)`; al iniciar sesión la
  web envía la lista local a `POST /favoritos/fusion`, que inserta con `ON CONFLICT DO NOTHING`.
- **Avisos de cruce y traslado** (RN-004): función pura en la web sobre los favoritos; no
  necesita servidor.

## R9. Programa de mano y calendario

- **Necesidad**: FR-012 (documento imprimible, completo o filtrado; evento de calendario).
- **Decisión**: página `/programa` con los mismos filtros y hoja de estilos `@media print`; el
  usuario imprime o guarda como PDF desde el navegador. El calendario es un archivo **`.ics`**
  (RFC 5545) generado por el API con `DTSTART` en UTC.
- **Alternativas**: generar PDF en el servidor (librería pesada y trabajo en el worker para algo
  que el navegador ya hace).

## R10. Contrato de los eventos que consume la cartelera

- **Necesidad**: Programación depende de eventos de Operación (004) y Boletería (002), que aún
  no están implementados (constitución III: contract-first).
- **Decisión**: contrato **dirigido por el consumidor** en
  [contracts/eventos-consumidos.md](contracts/eventos-consumidos.md), con esquemas **zod** en
  `packages/contracts/eventos`. Los responsables de 002 y 004 lo revisan en el PR; las pruebas de
  contrato validan que lo que publican cumple el esquema.
- **Por qué zod**: valida en ejecución (los eventos son datos externos al módulo) y da tipos
  TypeScript compartidos; sin generador de código.

## R11. Pruebas y verificación de los criterios de éxito

| Criterio | Cómo se verifica | Herramienta |
|----------|------------------|-------------|
| Reglas RN-001…RN-006, día de festival, cruces | Pruebas unitarias de funciones puras | Vitest |
| Proyección idempotente, búsqueda con tildes | Integración contra PostgreSQL real | Vitest + Testcontainers |
| Eventos consumidos cumplen el esquema | Pruebas de contrato | zod |
| US1–US6 de punta a punta | E2E en navegador | Playwright |
| SC-005 WCAG 2.1 AA | Auditoría automática en E2E | @axe-core/playwright |
| SC-002 < 3 s en 4G | Perfil "Fast 4G" de Lighthouse CI sobre `/cartelera/{día}` | Lighthouse CI |
| SC-003 5 000 simultáneos | Prueba de carga en staging (CDN incluida) | k6 |

k6 y Lighthouse CI son herramientas de prueba (no van a producción); se justifican porque
SC-002 y SC-003 no se pueden verificar de otra forma.

## R12. Dependencias de soporte (constitución X)

Cada dependencia que no es de producción del dominio también se justifica:

| Dependencia | Necesidad | Driver | Alternativa descartada |
|-------------|-----------|--------|------------------------|
| `openapi-typescript` (desarrollo) | Tipos de la API generados desde [el OpenAPI](contracts/api-cartelera.openapi.yaml), sin escribirlos dos veces | Constitución III (contract-first), QA-10 | Tipos a mano: se desincronizan del contrato |
| `@commitlint/cli` + `husky` (desarrollo) | Verificar en cada commit la convención exigida por la constitución §6 | Constitución §6, QA-10 | Revisarlo a mano en cada PR: se olvida |
| `nestjs-pino` (pino) | Logs JSON estructurados con id de correlación por petición | Constitución IX | `console.log`: sin estructura ni correlación |
| `prom-client` | Endpoint `/metrics` con peticiones, errores y latencia para el Prometheus de la [vista física](../../docs/arquitectura/04-vista-fisica.md) | Constitución IX | Solo logs: no dan percentiles de latencia (RNF-001) |
| `@vitest/coverage-v8` (desarrollo) | Medir la cobertura ≥ 80 % de `domain/` exigida por la puerta Q2 | Constitución §4 Q2 | Sin medición: la puerta no se puede verificar |
| `gitleaks` (acción de CI) | Detectar secretos en el diff (puerta Q8) | Constitución §4 Q8, VI | Revisión manual: no detecta llaves en archivos grandes |

---

**Resultado**: no quedan `NEEDS CLARIFICATION` en el contexto técnico.
