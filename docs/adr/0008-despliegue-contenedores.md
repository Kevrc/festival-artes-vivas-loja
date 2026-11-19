# ADR-0008: Desplegar en contenedores con réplicas del API y un worker separado

- Estado: aceptada
- Fecha: 2026-11-19 · Autor: @Kevrc · Specs: 001–004
- Drivers: QA-3, QA-4, QA-7, QA-8, QA-13, C-1, C-2 ([drivers](../arquitectura/00-drivers.md))

## Contexto

La carga es estacional (pico de 11 días). El presupuesto es académico. Se necesita aislar las
tareas pesadas (informes, envíos de correo, conciliación) de las peticiones del público y
sobrevivir a la caída de una instancia.

## Decisión

- Todo se empaqueta en **contenedores Docker** y se orquesta con **Docker Compose** en un servidor
  en la nube (VPS); en local se usa el mismo `docker-compose.yml`.
- Un **proxy inverso** (Nginx) con TLS reparte el tráfico entre **2 réplicas del API** y la web.
- Un proceso **worker** (la misma base de código, otro punto de entrada) ejecuta los consumidores
  de colas y los trabajos programados (ADR-0003).
- **CDN** delante de la web pública (ADR-0006).
- PostgreSQL con respaldo diario; almacenamiento de objetos para documentos.
- Para el festival se puede aumentar el número de réplicas del API sin cambiar el código.

## Alternativas evaluadas por necesidad

| Necesidad (driver) | VPS + Docker Compose | Kubernetes gestionado | Serverless (funciones + BD gestionada) |
|--------------------|:-:|:-:|:-:|
| ~25 escrituras/s y 5 000 lectores en el pico; la CDN absorbe las lecturas (QA-3) | ✔ con 2 réplicas del API | ✔ autoescalado | ✔ |
| Sobrevivir a la caída de una instancia del API (QA-4) | ✔ réplicas detrás de Nginx | ✔ | ✔ |
| Trabajos programados cada 30 s y consumidores de larga vida (002 FR-004) | ✔ proceso worker | ✔ | ✘ ejecuciones cortas, arranques en frío |
| Conexiones a PostgreSQL acotadas en el pico (QA-1) | ✔ pool fijo | ✔ | ✘ cada función abre conexiones |
| Mismo entorno en local, CI y producción (QA-10) | ✔ un `docker-compose.yml` | ~ manifiestos distintos | ✘ difícil de reproducir en local |
| Bajar costo fuera del festival (QA-13, C-2) | ✔ reducir el VPS | ✘ el plano de control cuesta siempre | ✔ |
| Operable por 4 estudiantes en un semestre (C-1) | ✔ | ✘ curva de aprendizaje | ~ |

Solo el VPS con Docker Compose cumple todas las necesidades.

## Consecuencias

- (+) Mismo entorno en local, en la CI y en producción.
- (+) Una réplica del API puede caer sin cortar el servicio.
- (−) Un solo servidor es punto único de fallo físico; aceptado para el alcance académico y
  documentado como riesgo.
- Vistas afectadas: física, desarrollo.
