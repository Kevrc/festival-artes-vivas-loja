# ADR-0002: Elegir el stack a partir de las necesidades del festival

- Estado: aceptada (revisable si cambia un driver)
- Fecha: 2026-11-19 · Autor: @Kevrc · Specs: 001–004
- Drivers: QA-1, QA-2, QA-5, QA-6, QA-7, QA-8, QA-10, QA-11, C-1, C-2, C-6 ([drivers](../arquitectura/00-drivers.md))

## Contexto

Cada capa se elige por **lo que el festival necesita de ella**. Para cada una se listan las
necesidades (con su driver), los criterios que se derivan y una matriz de evaluación. Escala
1–5; el peso refleja la prioridad del driver. La familiaridad del equipo cuenta solo como
criterio de **riesgo de plazo** (C-1), con peso bajo, nunca como razón principal.

## 1. Base de datos

**Necesidades**

| Necesidad | Driver |
|-----------|--------|
| Reservar lugares sin sobreventa con escrituras simultáneas (actualización atómica condicional) | QA-1 |
| Guardar el cambio de negocio y su evento en **la misma transacción** | QA-6 |
| Separar los datos de cada módulo (un esquema por módulo) | Constitución III, QA-10 |
| Consultas relacionales para estadísticas e informe (funciones × sedes × ingresos) | QA-12 |
| Registros de dinero inmutables y respaldables | Constitución V |
| Gratis y sin licencias | C-2 |

| Criterio (peso) | PostgreSQL | MySQL | MongoDB |
|-----------------|:-:|:-:|:-:|
| Transacciones ACID y `UPDATE … WHERE … RETURNING` (5) | 5 | 4 | 3 |
| Esquemas separados por módulo en una sola instancia (3) | 5 | 3 | 3 |
| Consultas analíticas con agregados y ventanas (3) | 5 | 4 | 3 |
| Puede servir también como cola de trabajos (ver §4) (3) | 5 | 2 | 2 |
| Costo / licencia (2) | 5 | 5 | 5 |
| **Total ponderado** | **80** | 57 | 49 |

**Decisión**: **PostgreSQL 16**. MySQL no tiene `RETURNING` y sus "bases" separadas complican las
transacciones que cruzan el outbox; MongoDB obliga a transacciones de varios documentos para el
inventario y hace más difíciles las consultas del informe.

## 2. Servidor de aplicación

**Necesidades**

| Necesidad | Driver |
|-----------|--------|
| Módulos con fronteras explícitas dentro de un solo despliegue | ADR-0001, QA-10 |
| Puertos y adaptadores intercambiables (pagos simulado/real, correo) | ADR-0007, QA-9 |
| Autorización por rol **y alcance** en cada operación del servidor | QA-7 |
| Trabajos programados (liberar retenciones cada 30 s, conciliar pagos, cerrar edición) | 002 FR-004, FR-013 |
| Contratos de API documentados y verificables (contract-first) | Constitución III |
| **Compartir los tipos de contratos y eventos con la web** sin duplicarlos | QA-10 |
| Riesgo de plazo (C-1) | C-1 |

| Criterio (peso) | NestJS (TypeScript) | Spring Boot (Java) | Express (TypeScript) | Django (Python) |
|-----------------|:-:|:-:|:-:|:-:|
| Módulos e inyección de dependencias nativos (4) | 5 | 5 | 1 | 3 |
| Guardas por rol y alcance (4) | 5 | 5 | 2 | 4 |
| Trabajos programados integrados (2) | 4 | 5 | 2 | 3 |
| OpenAPI generado desde el código (3) | 5 | 5 | 2 | 4 |
| Mismo lenguaje que la web → tipos compartidos (4) | 5 | 1 | 5 | 1 |
| Riesgo de plazo para el equipo (2) | 5 | 2 | 4 | 2 |
| **Total ponderado** | **93** | 73 | 50 | 54 |

**Decisión**: **NestJS**. Spring Boot cumple igual de bien en módulos y seguridad, pero obliga a
mantener los contratos en dos lenguajes (QA-10). Express no da estructura modular ni inyección de
dependencias, que son justamente lo que ADR-0001 y ADR-0007 necesitan.

## 3. Web pública, paneles y validador

**Necesidades**

| Necesidad | Driver |
|-----------|--------|
| Páginas de cartelera **cacheables en CDN** y regenerables por evento (< 1 min) | QA-2, QA-3, QA-4, QA-6 |
| Renderizado en servidor para cargar rápido en celulares 4G | QA-2 |
| Validador que funcione **sin conexión** desde el navegador (sin app nativa) | QA-5, C-6, C-7 |
| Paneles interactivos (grilla de programación, curaduría, taquilla) | 004 US1, 003 US3, 002 US4 |
| Accesibilidad AA verificable automáticamente | QA-11 |
| Un solo proyecto web para los 4 integrantes | QA-10, C-1 |

| Criterio (peso) | Next.js (React) | Astro | SvelteKit | SPA Angular |
|-----------------|:-:|:-:|:-:|:-:|
| Regeneración incremental de páginas por evento (ISR / revalidación bajo demanda) (5) | 5 | 3 | 3 | 1 |
| Renderizado en servidor (4) | 5 | 5 | 5 | 2 |
| PWA con service worker para el validador (4) | 4 | 3 | 4 | 4 |
| Paneles muy interactivos (3) | 5 | 3 | 4 | 5 |
| Ecosistema de componentes accesibles (2) | 5 | 3 | 3 | 4 |
| Riesgo de plazo (2) | 5 | 2 | 2 | 3 |
| **Total ponderado** | **96** | 66 | 73 | 58 |

**Decisión**: **Next.js**, una sola aplicación con tres zonas: pública (ISR), paneles y validador
(PWA). Astro es excelente para la cartelera estática, pero no resuelve bien los paneles ni la
revalidación por evento.

## 4. Colas, eventos y trabajos en segundo plano

**Necesidades**

| Necesidad | Driver | Volumen |
|-----------|--------|---------|
| Publicar un evento **solo si** la transacción de negocio se confirma | QA-6 | — |
| No perder eventos si un proceso se reinicia | QA-6 | — |
| Reintentos con espera creciente hasta 24 h (avisos) | 004 US10 | — |
| Trabajos diferidos (expirar pedido a los 10 min) y periódicos | 002 FR-004 | — |
| Deduplicar (una notificación por evento y destinatario) | 004 RN-011 | — |
| Rendimiento suficiente | QA-6 | < 50 eventos/s en el pico ([dimensionamiento](../arquitectura/00-drivers.md#3-dimensionamiento-estimaciones)) |
| No añadir componentes con estado sin necesidad | Constitución X, C-2, QA-13 | — |

| Criterio (peso) | Cola en PostgreSQL (pg-boss) | Redis + BullMQ | RabbitMQ | Kafka |
|-----------------|:-:|:-:|:-:|:-:|
| Encolar **dentro** de la misma transacción de negocio (5) | 5 | 1 | 1 | 1 |
| Durabilidad sin configuración extra (4) | 5 | 3 | 4 | 5 |
| Diferidos, periódicos, reintentos y deduplicación (4) | 5 | 5 | 3 | 2 |
| Rendimiento para < 50 eventos/s (2) | 5 | 5 | 5 | 5 |
| Componentes nuevos a operar y respaldar (4) | 5 | 3 | 2 | 1 |
| **Total ponderado** | **95** | 59 | 51 | 47 |

**Decisión**: **cola sobre PostgreSQL con pg-boss**. Es la única opción que encola en la misma
transacción, lo que elimina el *relay* del outbox (ADR-0003), y no añade Redis. Con < 50 eventos/s
PostgreSQL sobra.
**Condición de revisión**: si los eventos superan de forma sostenida ~500/s, o si aparece una
necesidad de caché compartida que la CDN no cubra, se evalúa Redis en una nueva ADR.

## 5. Piezas de soporte

| Pieza | Necesidad (driver) | Elección | Alternativa descartada y motivo |
|-------|--------------------|----------|---------------------------------|
| Acceso a datos | Migraciones versionadas por esquema, tipos generados (QA-10) | **Prisma** con `multiSchema` | TypeORM: tipado más débil; SQL a mano: más código y errores |
| Archivos | 15 GB de documentos privados con acceso temporal (QA-8) | **Almacenamiento compatible con S3** (MinIO en local), URLs firmadas de 5 min | Guardarlos en PostgreSQL: infla los respaldos; disco local: no escala a 2 réplicas |
| Firma de QR | Verificar sin red **sin** poner el secreto en el celular (QA-5) | **Ed25519** (`node:crypto`, sin dependencia) | HMAC: el secreto tendría que viajar al validador |
| Almacenamiento offline | Lista de entradas y cola de ingresos en el celular (QA-5) | **IndexedDB** + Service Worker | localStorage: límite de tamaño y sin transacciones |
| Mapas | Ubicar sedes y funciones *Off*, distancia aproximada (001 FR-007, FR-008) | **OpenStreetMap + Leaflet** | Google Maps: requiere facturación (C-2) |
| Correo | Avisos de servicio con reintentos (004 FR-021) | **SMTP de un proveedor transaccional** detrás de un puerto | Correo propio: entregabilidad baja |
| Contraseñas | Hash adaptativo (004 RNF-006) | **Argon2id** | bcrypt: aceptable, pero Argon2id es la recomendación vigente de OWASP |
| Segundo factor | 2FA del personal (004 FR-018) | **TOTP** (aplicación de códigos) | SMS: costo y fuera de alcance |
| Monorepo | Tipos de contratos compartidos entre API y web (QA-10) | **pnpm + Turborepo** | Repos separados: contratos duplicados |
| Pruebas | Concurrencia real del aforo contra PostgreSQL (QA-1) | **Vitest** + **Testcontainers** + **Playwright** (E2E y accesibilidad con axe) | Mocks de la base: no prueban la carrera |

## Consecuencias

- (+) Cada tecnología responde a un driver con medida; si el driver cambia, se sabe qué revisar.
- (+) Un solo lenguaje y una sola base de datos con estado: menos piezas que operar, respaldar y
  explicar (constitución X).
- (−) PostgreSQL concentra datos y colas: su caída detiene la escritura. Se mitiga con respaldos,
  la cartelera en CDN (ADR-0006) y el validador sin red (ADR-0005).
- (−) Node.js usa un hilo por proceso: el CSV y el informe corren en el worker.
- Vistas afectadas: desarrollo, procesos, física.
