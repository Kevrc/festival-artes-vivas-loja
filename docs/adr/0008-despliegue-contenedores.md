# ADR-0008: Desplegar en contenedores con réplicas del API y un worker separado

- Estado: aceptada
- Fecha: 2026-11-19 · Autor: @Kevrc · Specs: 001–004

## Contexto

La carga es estacional (pico de 11 días). El presupuesto es académico. Se necesita aislar las
tareas pesadas (informes, envíos de correo, conciliación) de las peticiones del público y
sobrevivir a la caída de una instancia.

## Decisión

- Todo se empaqueta en **contenedores Docker** y se orquesta con **Docker Compose** en un servidor
  en la nube (VPS); en local se usa el mismo `docker-compose.yml`.
- Un **proxy inverso** (Nginx) con TLS reparte el tráfico entre **2 réplicas del API** y la web.
- Un proceso **worker** (la misma base de código, otro punto de entrada) ejecuta el relay del
  outbox, los consumidores de colas y los trabajos programados.
- **CDN** delante de la web pública (ADR-0006).
- PostgreSQL con respaldo diario; almacenamiento de objetos para documentos.
- Para el festival se puede aumentar el número de réplicas del API sin cambiar el código.

## Alternativas

- Kubernetes: autoescalado, pero desproporcionado para 4 personas y un semestre.
- Plataforma serverless: arranques en frío y límites de conexiones a PostgreSQL en el pico.

## Consecuencias

- (+) Mismo entorno en local, en la CI y en producción.
- (+) Una réplica del API puede caer sin cortar el servicio.
- (−) Un solo servidor es punto único de fallo físico; aceptado para el alcance académico y
  documentado como riesgo.
- Vistas afectadas: física, desarrollo.
