# Research: Convocatorias y curaduría (003)

Investigación de decisiones de la fase plan. Las decisiones siguen ADR-0001 (monolito modular), ADR-0002 (NestJS, Prisma, S3 compatible), ADR-0003 (eventos transaccionales en PostgreSQL) y ADR-0008 (Docker Compose local).

## R1. Frontera de alcance P1

**Decisión**: implementar US1, US2 y US3. Se excluyen US4–US6. La convocatoria, criterios, elencos y asignaciones requeridos para ejecutar los flujos se cargan por un seed idempotente propio. No se crean endpoints de CRUD de convocatoria/comité ni selección/resultados.

**Motivo**: autorización explícita del responsable de la spec en clarify; evita ampliar US1–US3 con historias P2/P3.

## R2. Propiedad y esquema de datos

**Decisión**: Prisma con archivo `prisma/schema/convocatorias.prisma` y schema PostgreSQL `convocatorias`; se añade el schema al datasource compartido con un cambio aditivo. Todas las entidades de convocatoria, postulante, obra propuesta, documentos, evaluación y auditoría pertenecen a este módulo. IDs externos se guardan como UUID escalares, sin relaciones Prisma a tablas de otros contextos.

**Alternativas descartadas**: reutilizar tablas de Identidad/Operación o añadir modelos al esquema de otro módulo; ambas rompen la propiedad exclusiva de datos de ADR-0001.

## R3. Archivos y validación

**Decisión**: aceptar PDF, JPEG y PNG hasta 10 MB (10 000 000 bytes) por archivo; comprobar firma mágica además del MIME declarado y extensión; escanear antes de persistir; guardar con key aleatoria opaca. Los bytes se almacenan detrás de `AlmacenamientoDocumentosPort`: en memoria para test/CI, en disco local `.almacen-dev/` para desarrollo y en S3 para producción. Videos permanecen como enlaces validados. No se concede URL de carga sin validar. La descarga se autoriza en el API y se firma por cinco minutos: memoria/disco usan HMAC y un endpoint de descarga de la API; S3 usa `GetObject` prefirmado. `EscanerAntivirusPort` usa ClamAV en producción y `FalsoEscanerAntivirus` configurable en pruebas (`limpio`, `infectado`, `caido`); los dos últimos rechazan sin persistir objeto ni metadata. ClamAV solo se inicia con profile Compose `antivirus`; no es requerido por tests ni CI. En producción cualquier error de scan falla cerrado.

**Alternativas descartadas**: URLs públicas o keys adivinables (violan Constitución VI); guardar bytes en PostgreSQL (respaldo inflado); aceptar MIME de cliente como única validación.

**Cifrado en reposo**: los archivos del adaptador de disco son datos locales de desarrollo y no se consideran almacenamiento seguro para datos reales. Producción debe usar S3 con cifrado administrado (SSE-KMS/KMS), TLS y permisos mínimos. La configuración S3 se documenta, pero este entorno no ejecutará pruebas contra un backend real.

## R4. Adaptador S3 y URLs firmadas

**Decisión**: usar AWS SDK JavaScript v3 (`@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner`) para S3 de producción. La firma de descarga la genera el servidor tras autorizar; `GetObjectCommand` + `getSignedUrl` crea URLs prefirmadas ([documentación oficial AWS SDK v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/)). El adaptador se prueba con cliente SDK simulado; el endpoint/proveedor real y su configuración de bucket/KMS quedan para smoke test previo al despliegue.

**Alternativa descartada**: cliente específico de MinIO, que reduce compatibilidad con el proveedor S3 de despliegue.

## R5. Cifras y promedio ponderado

**Decisión**: representar calificaciones y pesos como enteros de 0 a 100 y calcular internamente con aritmética decimal exacta/enteros escalados; puntaje curador = suma(calificación × peso)/100, redondeo decimal half-up a 2; final = promedio aritmético de puntajes individuales, redondeado half-up a 2. La configuración seed suma 100. La persistencia usa `Decimal(5,2)` o centésimas enteras según la forma final de Prisma/driver, pero la API siempre serializa dos decimales.

**Validación con spec**: 80×50 % + 70×30 % + 90×20 % = 79,00; promedio de 79,00 y 85,00 = 82,00.

## R6. Subsanación y tiempo

**Decisión**: al solicitar subsanación, registrar motivo/detalle, actor y vencimiento de 72 horas desde el reloj inyectado. La modificación solo se permite hasta el vencimiento; reenvío en plazo vuelve a `enviada` para nueva revisión. El vencimiento automático requiere job del worker con pg-boss y transición idempotente a `no_admitida`, guardando motivo. Comparaciones temporales usan instantes UTC y la zona `America/Guayaquil` solo para presentación.

**Caso de empate temporal**: un reenvío con `ahora <= venceEn` se acepta; si `ahora > venceEn`, se rechaza. El worker puede ejecutarse después del plazo sin alterar el resultado efectivo.

## R7. Secuencia y concurrencia del número

**Decisión**: número legible secuencial por convocatoria, asignado en la misma transacción que pasa el borrador a enviado. Un contador por convocatoria bloqueado/actualizado atómicamente evita duplicados ante envíos concurrentes. El formato de ejemplo `PN-2026-0001` se configura como prefijo de esa convocatoria; no se infiere prefijo desde tipos de componente fuera del seed.

## R8. Identidad y roles

**Hallazgo**: el adaptador actual de Boletería resuelve sesión desde cabeceras/cookie solo en `development`/`test`, y acepta un conjunto de roles que no incluye `curador`, `coordinación de convocatorias` ni `coordinación provincial`. La spec 004 declara esos roles y la capacidad futura de resolver identidad/roles/alcance.

**Decisión de diseño**: `AutorizacionConvocatoriasPort` devuelve sujeto, roles y alcances de provincia/disciplina; guard y casos de uso verifican permisos en servidor. El adaptador de desarrollo de Convocatorias acepta literalmente los valores FR-019 mediante el mismo mecanismo de headers/cookie de Boletería, sin cambiar ese módulo. El contrato de claims esperado por el adaptador de producción está especificado en [contracts/autorizacion-identidad.md](contracts/autorizacion-identidad.md). No se consulta Identidad directamente. En cualquier otro ambiente, ausencia de integración válida produce 401/403.

## R9. Eventos y notificaciones

**Decisión**: publicar `PostulacionEnviada` y `SubsanacionSolicitada` a Identidad en la misma transacción de negocio vía pg-boss/ADR-0003. El evento contiene identificadores, estado, vencimiento o folio y texto de aviso mínimo, nunca documentos ni datos personales innecesarios. No se implementa envío de correo.

## R10. Pruebas y dependencias

| Regla/flujo | Evidencia planeada | Herramienta |
|---|---|---|
| Estados, ventana de convocatoria, número, validaciones y puntaje | Unitarias de dominio, ≥80 % cobertura | Vitest + coverage-v8 |
| Unicidad/número y transiciones concurrentes | PostgreSQL real, reintentos y constraints | Vitest + Testcontainers |
| Validación/aislamiento de documentos y URL firmada | Integración de memoria/disco (permisos, MIME real, 10 MB, HMAC, expiry) y cliente AWS SDK simulado | Vitest |
| Escáner antivirus | Falso configurable: `limpio` permite persistir; `infectado` y `caido` fallan cerrado sin persistir ni objeto ni metadata | Vitest unitario e integración |
| Publicación evento transaccional y deduplicación | Contrato Zod y cola pg-boss | Vitest |
| US1–US3 y accesibilidad | Flujos navegador postulante/coord./curador | Playwright + axe |

Dependencias nuevas esperadas: `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner`, justificadas por el puerto S3 solicitado y URLs firmadas. El cliente ClamAV usa su protocolo TCP tras el puerto, sin dependencia npm adicional. El servicio real es opcional en Compose y no se levanta en tests/CI; el falso configurable prueba los tres resultados.

## R11. Acceso de postulantes a sus documentos

**Interpretación de FR-015**: el texto de `spec.md` dice: “Los documentos de postulantes MUST ser accesibles solo para la coordinación y los curadores asignados (Constitución VI).” Se interpreta como una restricción de acceso de terceros a documentos ajenos; el postulante propietario conserva acceso a sus propios documentos como parte de su postulación y de la descarga prevista por FR-016. El servidor comprueba propiedad antes de emitir una URL firmada de cinco minutos.

**Límite de terceros**: fuera del propietario, solo coordinación autorizada y curadores asignados a esa postulación pueden acceder. Cualquier otra cuenta, incluido otro postulante y un curador sin asignación, recibe 403. La URL firmada se emite después de autorizar y no se registra en logs.

Esta es una interpretación explícita para armonizar FR-015 con FR-016 y US1; no amplía acceso a documentos de otros elencos.

## R12. Backends de almacenamiento sin imagen local

**Decisión**: no iniciar ni depender de imágenes de MinIO o de otro servidor S3 local. Ninguna imagen de MinIO disponible fue accesible desde el entorno (Quay respondió 401 y `minio/minio` no existe en Docker Hub). Los tests usan memoria/disco; el adaptador S3 de producción se verifica con cliente simulado y requiere smoke test explícito en un backend real antes del despliegue.

La auditoría conserva su política de retención mínima de cinco años sin purga automática: la tabla es append-only y no se programa endpoint, tarea ni job de borrado. Una política futura de disposición requiere revisión explícita de cumplimiento.
