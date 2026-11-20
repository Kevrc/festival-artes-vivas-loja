# Implementation Plan: Convocatorias y curaduría

**Branch**: `003-convocatorias-curaduria` | **Date**: 2026-11-19 | **Spec**: [spec.md](spec.md)

**Alcance de esta entrega**: historias P1 US1 (postulación), US2 (admisibilidad y subsanación) y US3 (evaluación ponderada). De FR-007 se cubre en P1 la prevención de conflictos de interés; el balanceo de carga de curadores queda diferido y las asignaciones de esta entrega vienen del seed. Se excluyen US4, US5 y US6; la convocatoria y los datos de demostración necesarios se cargan mediante una semilla idempotente, sin CRUD de configuración.

## Summary

El módulo `convocatorias` será dueño del esquema PostgreSQL `convocatorias` y de los perfiles de elenco, postulaciones, documentos, asignaciones, evaluaciones y auditoría relacionados con las P1. Seguirá el monolito modular NestJS y la separación `domain / application / infrastructure / interface` de ADR-0001. El modelo relacional y los invariantes se detallan en [data-model.md](data-model.md); los endpoints, eventos y rutas de demostración están descritos en [contracts/](contracts/).

Los documentos se cargarán por un puerto de almacenamiento desde application y un adaptador compatible con S3 en infrastructure, con MinIO local. El servidor valida firma mágica, formato y tamaño máximo de 10 MB (10 000 000 bytes), y escanea antes de persistir. `EscanerAntivirusPort` permite un falso configurable en pruebas que simula archivo limpio, infectado o motor caído. El falso se usa en `pnpm test`, `pnpm test:int` y CI; ClamAV real queda en un profile opcional de Compose. En producción se configura el adaptador real y cualquier fallo del escáner rechaza la carga. La descarga devuelve una URL firmada de lectura de 5 minutos únicamente tras validar propiedad de la postulación o permiso de coordinación/curador asignado. La estrategia de cifrado local y su limitación se registran en [research.md](research.md).

La autorización tiene un puerto anticorrupción propio y un adaptador de desarrollo propio, alineado con los headers/cookie que usa Boletería sin modificar ese módulo; Convocatorias nunca consulta las tablas de Identidad. Los roles canónicos y el DTO esperado para Identidad están en [contracts/autorizacion-identidad.md](contracts/autorizacion-identidad.md). El adaptador falla cerrado fuera de `development`/`test`; sustituirlo por el adaptador de Identidad no cambia los casos de uso.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22, NestJS 11.
**Primary Dependencies**: Prisma 6.19 (`multiSchema`), Zod 3, AWS SDK for JavaScript v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) para MinIO/S3; dependencias existentes de pruebas Vitest, Testcontainers y Playwright.
**Storage**: PostgreSQL 16 en el esquema propio `convocatorias`; MinIO local para objetos privados; pg-boss/PostgreSQL para eventos conforme a ADR-0003.
**Testing**: Vitest para dominio (cobertura ≥ 80 %), integración con PostgreSQL y MinIO, adaptador falso de antivirus configurable (limpio/infectado/caído) en unitarias e integración, pruebas de contrato, E2E Playwright para US1–US3 y revisión WCAG 2.1 AA. Ninguna tarea de test requiere ClamAV real.
**Target Platform**: API NestJS y web Next.js existente; Docker Compose local.
**Project Type**: monorepo existente (`apps/api`, `apps/web`, `packages/contracts`, `prisma`).
**Performance Goals**: aceptación dentro de la ventana de cierre definida por convocatoria; archivos de hasta 10 MB (10 000 000 bytes); URL firmada vigente por 5 minutos; cálculo de evaluación con precisión decimal de dos lugares.

**Verificación diferida de capacidad**: RNF-001 pide soportar 500 envíos por hora durante las últimas dos horas antes del cierre. El plan P1 no incluye prueba de carga ni declara verificada esa capacidad; se difiere a una fase de rendimiento previa al despliegue con datos representativos y medición de borradores/envíos sin pérdida.
**Constraints**: hora oficial `America/Guayaquil`; documentos no públicos; autorización en servidor; números de postulación únicos por convocatoria; estados y transiciones auditables; evitar operaciones con coma flotante en el cálculo de puntajes.
**Scope**: US1–US3 P1, FR-003–FR-011, FR-015 y la parte de FR-004/FR-016 necesaria para los flujos incluidos. Seed para configuración y fixtures. Sin selección/publicación de resultados, notificaciones por correo, cuentas ni CRUD de convocatorias.

### Adaptador por entorno

| Entorno | Autorización | Antivirus | Almacenamiento |
|---|---|---|---|
| `test` | Puerto sustituido por fixture de identidad de prueba; sin credenciales reales | `FalsoEscanerAntivirus`, seleccionable por caso (`limpio`, `infectado`, `caido`) | Adaptador falso en unitarias |
| `test:int` | Adaptador dev/test con headers y cuentas fixture | Falso configurable; ClamAV no requerido | MinIO Testcontainers para integración S3 y URL firmada |
| CI | Adaptador dev/test con headers y sujetos deterministas | Falso; variable `CONVOCATORIAS_ANTIVIRUS=simulador` | `test:int`: MinIO Testcontainers; E2E: MinIO iniciado con Docker CLI y bucket creado por el código |
| Desarrollo local | `AutorizacionConvocatoriasDevAdapter`, headers/cookie descritos en [contrato](contracts/autorizacion-identidad.md) | Simulador por defecto; profile ClamAV optativo | MinIO por Compose, bucket privado creado idempotentemente por el seed/adaptador |
| Producción | Adaptador conectado al contrato de Identidad; roles y alcance validados en servidor | ClamAV/escáner real obligatorio; caída o error rechaza la carga | S3 privado, TLS y cifrado en reposo con KMS administrado |

### Reglas de negocio puras y pruebas requeridas

| Regla | Función pura de dominio prevista | Prueba requerida |
|---|---|---|
| Transiciones válidas de postulación | `transicionarPostulacion(estado, evento, contexto)` | Tabla de transiciones: permite `enviada → borrador` solo antes del cierre, exige vencimiento para subsanar y rechaza combinaciones inválidas. |
| Plazo de convocatoria/subsanación | `puedeEnviar(ahora, abreEn, cierraEn)` / `puedeSubsanar(ahora, venceEn)` | Límites exactos de apertura/cierre y aceptación hasta `venceEn`; rechazo posterior. |
| Huella de obra | `calcularObraFingerprint(ficha)` | Campos canónicos equivalentes generan el mismo SHA-256; cambio en campo fingerprint genera otro; estable para unicode/espacios. |
| Requisitos documentales | `validarDocumento(nombre, mime, bytes, firma)` | PDF/JPEG/PNG válidos; firma/MIME incoherente y otros formatos rechazados; 10 000 000 bytes aceptados y 10 000 001 rechazados. |
| Capacidad por elenco | `puedePostularOtraObra(enviadas, maxObras)` | Borrador nunca enviado no consume cupo; reenvío de mismo ID cuenta una vez; límite alcanzado rechaza nueva obra. |
| Puntaje de curador | `calcularPuntajePonderado(calificaciones, pesos)` | RN-001: 80/70/90 con 50/30/20 devuelve 79,00; valida criterios completos y calificaciones 0–100. |
| Promedio y deliberación | `calcularResultadoCuraduria(puntajes)` | RN-002: 79,00 y 85,00 da 82,00; diferencia 25 no marca deliberación y diferencia mayor que 25 sí. |
| Conflicto de interés | `tieneConflicto(curador, elenco)` | Integrante, familiar declarado o representante impide asignación; sin conflicto permite continuar (RN-004). |
| Antivirus falso | `FalsoEscanerAntivirus.escanear(bytes)` | Tres pruebas: `limpio` permite, `infectado` rechaza, `caido` rechaza por fail-closed; ninguno persiste si se rechaza. |

### Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Identidad aún no entrega un adaptador de roles/alcances para Convocatorias | Puerto anticorrupción y DTO exacto en contrato; adaptar solo infrastructure al integrarse 004; bloquear acceso fuera de dev/test hasta entonces. |
| MinIO local no habilita SSE-KMS sin KMS; documentos locales sin cifrado de reposo | Solo fixtures locales; producción requiere KMS/TLS antes de guardar documentos reales (detalle en [research.md](research.md)). |
| Escáner caído detiene cargas | Fail-closed, error observable y retry después de restablecer servicio; no almacenar archivo pendiente de escaneo. |
| Fallo entre escritura S3 y transacción PostgreSQL | Borrar objeto si falla transacción de metadatos; limpieza de objetos huérfanos verificable y operación idempotente. |
| Huella textual no detecta obras equivalentes con metadatos distintos | Documentar alcance de deduplicación P1; conservar revisión de coordinación y evitar bloqueo basado en similitud aproximada. |
| Corrida tardía del worker de vencimientos | La regla de dominio compara reloj con `venceEn`; job idempotente, con índice por estado/vencimiento y auditoría. |

## Constitution Check

| Principio | Cumplimiento previsto | Estado |
|---|---|:---:|
| I. Especificación primero | Esta fase produce plan, investigación, modelo, contratos y quickstart; `tasks.md` se elaborará en la siguiente fase y no se implementa antes de analizar. | ✅ |
| II. Arquitectura 4+1 | Se conserva el módulo Convocatorias y el flujo P1; cualquier ajuste de vistas o ADR compartidas se reporta para una rama `docs/...`. | ✅ |
| III. Módulos y contratos | Esquema exclusivo `convocatorias`; contratos aditivos propios; puerto de autorización y puerto de almacenamiento. Sin lectura/escritura de tablas ajenas. | ✅ |
| IV. Pruebas | Cada escenario `USn-ASn` tendrá prueba; dominio con cobertura ≥ 80 %, integración real y E2E para las tres P1; el falso antivirus cubre limpio, infectado y caído. | ✅ |
| V. Integridad del aforo y dinero | No aplica a Convocatorias. | ✅ |
| VI. Seguridad y privacidad | Documentos privados, validación en servidor, URL firmada breve, acceso por dueño/rol y adaptador de autenticación fail-closed fuera de desarrollo/pruebas. | ✅ |
| VII. Acceso público e inclusivo | Convocatoria pública consultable sin cuenta; formularios de postulante y paneles accesibles, móviles y en español. | ✅ |
| VIII. Resiliencia | Envío y transición de estados en transacciones; eventos en la misma transacción mediante pg-boss; objetos subidos sin dejar metadatos huérfanos. | ✅ |
| IX. Observabilidad y trazabilidad | Auditoría append-only con actor, fecha, estado, motivo y correlación; eventos con sobre común. | ✅ |
| X. Simplicidad | Sin servicios de identidad, correo o CRUD duplicados; MinIO y ClamAV son servicios locales acotados para cumplir almacenamiento privado y rechazo de malware definidos por la spec. | ✅ |

**Puertas de calidad Q1–Q8**

| Puerta | Criterio constitucional | Cómo se cumple en 003 |
|---|---|---|
| Q1 | Compilación y lint sin errores ni advertencias nuevas | `pnpm lint && pnpm typecheck`; resolver todos los errores nuevos del módulo y contratos. |
| Q2 | Pruebas 100 % en verde; cobertura ≥80 % en dominio | `pnpm test`, unitarias de dominio y cobertura de `convocatorias/domain`; `pnpm --filter @fiavl/api test:int` sin fallos nuevos. |
| Q3 | Contratos afectados pasan | Tests de esquemas Zod/eventos y contrato API; eventos/versiones aditivos para Identidad. |
| Q4 | CI verde obligatoria; revisión recomendada | CI debe pasar; solicitar revisión del responsable/revisor definido para 003 antes del PR. |
| Q5 | PR enlaza spec y tareas | Referenciar spec 003 y los IDs T0nn de `tasks.md` en el PR/commits de implementación. |
| Q6 | Vista 4+1 y ADR al día si el cambio es estructural | El módulo corresponde al contexto existente; cambios de arquitectura compartida se elevan en rama `docs/...`, no se hacen aquí. |
| Q7 | Sin violaciones nuevas A/AA en páginas públicas | Playwright + axe para convocatoria pública y formularios/paneles; revisión manual de teclado y lector de pantalla para US1–US3. |
| Q8 | Sin secretos; revisión de seguridad en módulos sensibles | Revisar diff/env; no versionar credenciales reales; verificar guardas fail-closed, permisos por objeto, URLs breves y documentos privados. |

La implementación debe respetar los archivos compartidos solo con cambios mínimos y aditivos. No se actualizan `docs/arquitectura/`, `docs/adr/` ni specs ajenas desde esta rama.

### Hallazgo de autorización que requiere revisar

El adaptador actual de Boletería solo reconoce `asistente`, `taquilla`, `validador`, `jefe_sala`, `programador` y `administrador`. Convocatorias tendrá su adaptador propio, sin tocar Boletería, y usará los mismos headers/cookie de desarrollo (`x-cuenta-dev`, `x-rol-dev`, `sesion_dev`) más headers propios para alcance provincial o disciplinar. Los valores de rol se copian literalmente de 004, FR-019: “asistente, postulante, curador, coordinación de convocatorias, coordinación provincial, programador, jefe de sala, taquilla, validador, dirección y administrador; con alcance por sede, provincia o disciplina cuando aplique”. El contrato de claims que deberá implementar Identidad está en [contracts/autorizacion-identidad.md](contracts/autorizacion-identidad.md). El adaptador de desarrollo permite probar admitida/no admitida/subsanación/reapertura con `x-rol-dev: coordinación de convocatorias`; el rol `coordinación provincial` exige coincidencia del header de provincia con el alcance del recurso. Fuera de development/test el adaptador temporal falla cerrado. No se cambian los archivos de Boletería.

## Project Structure

```text
specs/003-convocatorias-curaduria/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-convocatorias.openapi.yaml
│   ├── eventos-convocatorias.md
│   ├── autorizacion-identidad.md
│   └── rutas-web.md
└── tasks.md                         # fase tasks

apps/api/src/modules/convocatorias/
├── domain/                          # estados, transiciones, validación y puntaje puro
├── application/                     # casos de uso, puertos y políticas
├── infrastructure/                  # Prisma, S3, pg-boss y adaptador de auth
├── interface/                       # guard, controladores, DTOs
└── convocatorias.module.ts

prisma/schema/convocatorias.prisma   # schema PostgreSQL propio
prisma/seed/convocatorias.ts         # fixtures idempotentes, invocado desde seed/index.ts
packages/contracts/src/eventos/convocatorias.ts
apps/web/src/app/(publico)/convocatorias/...
apps/web/src/app/(panel)/convocatorias/...
```

Los cambios previstos en archivos compartidos son aditivos: añadir `convocatorias` a la lista de schemas de `prisma/schema/schema.prisma`, exportar nuevos contratos desde `packages/contracts/src/index.ts`, registrar el módulo en `apps/api/src/app.module.ts`, invocar la semilla nueva desde `prisma/seed/index.ts`, y añadir MinIO/variables a Compose y `.env.example`. Se verificará que cada diff preserve orden y contenido previo.

## Dependency boundaries

| Necesidad | Contexto/contrato | Límite |
|---|---|---|
| Sesión, cuenta, rol y alcance | Identidad (004), detrás de `AutorizacionConvocatoriasPort` | Sin consultas a sus tablas; roles pendientes señalados arriba. |
| Notificar envío/subsanación | Eventos publicados a Identidad por pg-boss | No implementar correo ni notificación local. |
| Obra seleccionada para Operación | Fuera de alcance (US4 P2) | No publicar `PostulacionSeleccionada` en esta fase. |
| Archivos | `AlmacenamientoDocumentosPort` y adaptador S3 | Bucket privado; key opaca; no registrar URL firmada ni contenido sensible. |

## Complexity Tracking

| Excepción | Motivo | Control |
|---|---|---|
| MinIO local + SDK S3 | Requisito de documentos privados y almacenamiento compatible con S3 fijado por la spec/decisión de clarify. | Un bucket local; SDK S3 detrás del puerto de almacenamiento. |
| ClamAV opcional | La spec exige rechazar archivos infectados. | Profile Compose solo para demostración real; tests/CI usan falso configurable; producción falla cerrado. |
| Adaptador temporal de autorización | Identidad aún está en otra spec. | Adaptador propio de desarrollo; contrato de Identidad explícito; fail-closed fuera de development/test. |

## Cambios compartidos previstos (aditivos)

| Archivo compartido | Diff previsto | Motivo |
|---|---|---|
| `prisma/schema/schema.prisma` | Añadir solo `"convocatorias"` a `datasource db.schemas`; conservar proveedor, URL, extensiones y schemas existentes. | Registrar el schema propiedad de este módulo para Prisma multiSchema. |
| `docker/docker-compose.yml` | Añadir servicio `minio/minio` con volumen persistente, API `9000`, consola `9001`, credenciales locales de ejemplo, healthcheck y creación del bucket privado. Añadir `clamav/clamav` solo bajo `profiles: ["antivirus"]` (puerto interno 3310); no hacer que `db:up` arranque ClamAV. | Storage de documentos en demo; escáner real optativo. |
| `.env.example` | Añadir `CONVOCATORIAS_S3_ENDPOINT`, `CONVOCATORIAS_S3_BUCKET`, `CONVOCATORIAS_S3_ACCESS_KEY`, `CONVOCATORIAS_S3_SECRET_KEY`, `CONVOCATORIAS_S3_REGION`, `CONVOCATORIAS_S3_PATH_STYLE`, `CONVOCATORIAS_ANTIVIRUS` y `CONVOCATORIAS_CLAMAV_HOST/PORT`; simulador solo dev/test, adaptador real obligatorio en producción. | Configuración sin secretos reales y arranque local reproducible. |
| `apps/api/src/app.module.ts` | Añadir import y registro de `ConvocatoriasModule`; no mover ni reordenar imports/providers existentes. | Activar el módulo en el API. |
| `apps/api/src/worker.module.ts` | Añadir import y registro del consumidor de expiración de Convocatorias; preservar imports y registros existentes. | Registrar el job pg-boss idempotente de vencimiento de subsanaciones (T037). |
| `apps/api/package.json` | Añadir `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner`; no añadir cliente ClamAV si se usa protocolo TCP simple. | S3 compatible y URLs firmadas. |
| `pnpm-lock.yaml` | Actualización generada por pnpm para las dos dependencias AWS SDK y sus dependencias transitivas; sin edición manual ni actualización ajena de versiones. | Reproducibilidad de instalación. |
| `packages/contracts/src/index.ts` | Añadir exports de los esquemas/tipos `PostulacionEnviada` y `SubsanacionSolicitada` desde el archivo nuevo de eventos; conservar exports actuales en su orden. | Contrato consumible por Identidad. |
| `packages/contracts/src/eventos/convocatorias.ts` | Crear archivo nuevo con el sobre/esquemas aditivos de los dos eventos P1; sin editar archivos de eventos de otras specs. | Contrato propio del contexto. |
| `prisma/seed/index.ts` | Añadir una llamada a `seedConvocatorias` después de inicializar base/fixtures comunes, sin reordenar ni modificar el flujo existente. | Sembrar convocatoria y datos de demo de forma aditiva. |
| `.github/workflows/ci.yml` | No tocar el job `integracion`: `test:int` inicia MinIO mediante Testcontainers. En `e2e`, añadir variables S3/antivirus y dos pasos nuevos antes del seed: `docker run -d ... minio/minio server /data` y espera de readiness. No modificar ningún paso existente ni añadir `mc`; T019 crea el bucket en código. | Validar almacenamiento/descarga reproducible en CI sin requerir el escáner real. |

Los archivos nuevos propios de 003 (módulo, Prisma, seed, eventos y puertos/adaptadores) no alteran esos archivos compartidos. El seed sube documentos ficticios a MinIO para que la descarga privada se pueda demostrar.

### Diff previsto final para `.github/workflows/ci.yml`

El cambio es únicamente aditivo: no modifica ningún paso existente ni toca el job `integracion`. `test:int` inicia MinIO mediante Testcontainers. En `e2e` se agregan variables S3/antivirus y dos pasos nuevos antes del seed. No se agrega ClamAV ni `mc`; T019 crea el bucket mediante código.

```diff
 jobs:
   e2e:
     services:
       postgres:
         # Definición existente, sin cambios.
     env:
       DATABASE_URL: ... # existente, sin cambios
+      CONVOCATORIAS_S3_ENDPOINT: http://localhost:9000
+      CONVOCATORIAS_S3_BUCKET: convocatorias
+      CONVOCATORIAS_S3_ACCESS_KEY: fiavl
+      CONVOCATORIAS_S3_SECRET_KEY: fiavl-minio-ci
+      CONVOCATORIAS_S3_REGION: us-east-1
+      CONVOCATORIAS_S3_PATH_STYLE: 'true'
+      CONVOCATORIAS_ANTIVIRUS: simulador
     steps:
      # Agregar los dos pasos siguientes antes del seed ya existente.
+      - name: Iniciar MinIO para E2E
+        run: docker run -d --name fiavl-minio -p 9000:9000 -e MINIO_ROOT_USER=fiavl -e MINIO_ROOT_PASSWORD=fiavl-minio-ci minio/minio server /data
+      - name: Esperar a MinIO
+        run: |
+          for intento in {1..30}; do
+            curl --fail --silent http://localhost:9000/minio/health/ready && exit 0
+            sleep 2
+          done
+          exit 1
+      # Todos los pasos existentes permanecen sin cambios.
 ```
+`services.postgres`, las variables existentes y todos los pasos actuales de ambos jobs quedan idénticos. `integracion` no recibe cambios: Testcontainers arranca MinIO dentro de `test:int`.
## Invariantes de estado, fingerprint y validación

- Postulación usa el conjunto cerrado descrito en [data-model.md](data-model.md): `borrador`, `enviada`, `requiere_subsanacion`, `no_admitida`, `admitida`, `en_evaluacion`, `evaluada`, `requiere_deliberacion`, `seleccionada`, `lista_espera`, `no_seleccionada`, `desistida`. Las transiciones a los últimos cuatro estados pertenecen a US4, fuera de este alcance. Para los demás estados se implementan las transiciones de la tabla de ciclo de vida de `spec.md`, líneas 241–251, más `evaluada → requiere_deliberacion` (US3-AS5, líneas 106–107) y la reapertura de evaluación (US3-AS6, línea 109). En particular, se conserva `enviada → borrador` solo antes del cierre (US1-AS4, líneas 55–56).
- Asignación usa `asignada`, `en_evaluacion`, `completada`, `reasignada`; evaluación usa `borrador`, `enviada`, `reabierta`. Coordinación reabre con motivo registrado (US3-AS6, línea 109).
- RN-005 se implementa con `HISTORIAL_OBRA_CAMINO`, tabla propiedad de Convocatorias con huellas de obras presentadas anteriormente en Camino a Loja. Su carga histórica curada y el seed son propios del contexto; no se consultan tablas, eventos ni proyecciones ajenas.
- FR-007 se cubre parcialmente en P1: se impiden asignaciones con conflicto de interés (US3-AS3); el balanceo de carga queda diferido. Los curadores/asignaciones de demostración se proporcionan por seed y no hay flujo P1 de asignación manual ni automática.
- `obra_fingerprint` será SHA-256 de campos canónicos de la obra; índice único por convocatoria. La spec prohíbe repetir una obra en la convocatoria y limita el elenco “hasta el máximo de la convocatoria” (`spec.md`, Edge Cases, línea 186), pero no especifica cifra; la convocatoria de demo fija 3 como configuración de fixture.
- Criterios no tienen snapshot en P1 porque RN-007 dice: “Criterios y pesos son inmutables una vez recibida la primera postulación” (`spec.md`, línea 233). Si una fase posterior hace mutables/versionables los criterios, se añadirá snapshot en CALIFICACION.
- Los `CHECK` de rangos y estados se escribirán con SQL en la migración: Prisma no declara CHECK constraints.
- El seed idempotente subirá archivos de ejemplo a MinIO. Validación respeta FR-004: “PDF o imagen, máximo 10 MB por archivo” (`spec.md`, líneas 200–201); se fija en PDF/JPEG/PNG y 10 MB = 10 000 000 bytes según FR-004. La subsanación vence 72 horas después de solicitarse (US2-AS1, línea 77); dispersión estrictamente mayor que 25 activa deliberación (US3-AS5, líneas 106–107).
- Pruebas del falso antivirus: `limpio` permite almacenar; `infectado` devuelve rechazo y no escribe en S3/metadata; `caido` simula timeout/error y también rechaza sin persistir. Se ejecutan en unitarias e integración; ningún caso arranca ClamAV real.
