# Verificación final: Gestión operativa, cuentas y notificaciones (004)

Registro de T133 y T133a. Fecha de corte: 2026-11-22, rama `004-gestion-operativa`.

Cada escenario del [quickstart](quickstart.md) se comprueba con una prueba automática contra
PostgreSQL real (integración, Testcontainers) o con el navegador (E2E, Playwright + axe). La tercera
columna dice dónde. **Pendiente**: antes del PR se corre la suite completa (integración y todas las
E2E) y se completa la columna «Corrida final».

Entorno local de las E2E: `NODE_ENV=development`, `FIAVL_AHORA=2026-11-14T12:00:00-05:00` (como CI),
Mailpit en `localhost:8025`, API, worker y web en marcha, y la semilla cargada.

## Operación

| # | Escenario | Prueba automática | Corrida final |
|---|-----------|-------------------|---------------|
| 1 | Crear función con fin calculado | `operacion/grilla.int.test.ts`, `e2e/operacion-grilla.spec.ts` | |
| 2 | Cruce de sede con montaje | `operacion/grilla.int.test.ts`, `operacion/cruces-concurrentes.int.test.ts` | |
| 3 | Aforo mayor que la sede | `operacion/grilla.int.test.ts` | |
| 4 | Cruce de elenco | `operacion/grilla.int.test.ts` | |
| 5 | Dos pestañas, 412 | `operacion/grilla.int.test.ts` | |
| 6 | Publicación con errores | `operacion/publicacion.int.test.ts`, `e2e/operacion-publicacion.spec.ts` | |
| 7 | Publicar y verla en la cartelera | `e2e/operacion-publicacion.spec.ts` (con worker) | |
| 8 | Reprogramar con motivo | `operacion/cambios.int.test.ts`, `e2e/operacion-cambios.spec.ts` | |
| 9 | Reprogramar con exceso de aforo | `operacion/cambios.int.test.ts` | |
| 10 | Cancelar con entradas ⇒ avisos | `operacion/cambios.int.test.ts`, `identidad/notificaciones.int.test.ts` (independent test de US10) | |
| 11 | Sin motivo o función finalizada | `operacion/cambios.int.test.ts` | |
| 12 | Obra seleccionada en convocatoria | `operacion/obras-convocatoria.int.test.ts` (y `pnpm events:emit:004 postulacion-seleccionada`) | |
| 13 | Selección desistida | `operacion/incidencias.int.test.ts` (FR-007) | |
| 14 | Conteo en la plaza | `operacion/incidencias.int.test.ts` (US4-AS1), `e2e/operacion-incidencias.spec.ts` | |
| 15 | Jefe de sala fuera de su sede | `operacion/incidencias.int.test.ts` (RN-009), `e2e/operacion-incidencias.spec.ts` | |
| 16 | Aforo excedido ⇒ incidencia | `operacion/incidencias.int.test.ts` (US4-AS3) | |
| 17 | Ocupación 75 %, total con desglose, CSV | `operacion/domain/indicadores.test.ts`, `operacion/estadisticas.int.test.ts`, `e2e/operacion-estadisticas.spec.ts` | |
| 18 | Cierre e informe con variación | `operacion/estadisticas.int.test.ts` (US5-AS4) | |
| 19 | Edición 2027 a partir de 2026 | `operacion/domain/edicion.test.ts`, `operacion/ediciones-sedes.int.test.ts` | |

## Identidad

| # | Escenario | Prueba automática | Corrida final |
|---|-----------|-------------------|---------------|
| 20 | Registro y verificación por enlace | `identidad/registro.int.test.ts`, `e2e/identidad-registro.spec.ts` | |
| 21 | Correo ya registrado | `identidad/registro.int.test.ts` | |
| 22 | Contraseña corta o filtrada | `identidad/domain/contrasenas.test.ts`, `identidad/registro.int.test.ts` | |
| 23 | 5 fallos ⇒ bloqueo y aviso | `identidad/sesion.int.test.ts` | |
| 24 | Recuperación de un solo uso | `identidad/sesion.int.test.ts`, `e2e/identidad-sesion.spec.ts` | |
| 25 | Cerrar la sesión de otro dispositivo | `identidad/sesion.int.test.ts`, `e2e/identidad-sesion.spec.ts` | |
| 26 | Validador nuevo: TOTP antes de continuar | `identidad/personal.int.test.ts`, `e2e/identidad-personal.spec.ts` | |
| 27 | Validador fuera de sede o de rol ⇒ 403 | `integracion-identidad.int.test.ts`, `operacion/autorizacion.int.test.ts` (matriz SC-007) | |
| 28 | Cambio de rol con la sesión abierta | `identidad/personal.int.test.ts` (US9-AS4) | |
| 29 | Correo con los QR | `identidad/notificaciones.int.test.ts` (US10-AS1); comprobado a mano en Mailpit el 2026-11-22 | |
| 30 | SMTP caído y reintento | `identidad/notificaciones.int.test.ts` (US10-AS2) | |
| 31 | Descargar mis datos y eliminar la cuenta | `identidad/mis-datos.int.test.ts`, `e2e/identidad-mis-datos.spec.ts` | |
| 32 | Eliminar con entradas futuras | `identidad/mis-datos.int.test.ts` (US11-AS3) | |
| 33 | Estudiante por dominio institucional | `identidad/estudiantes.int.test.ts`, `e2e/identidad-estudiante.spec.ts` (reserva el taller) | |

## Revisión transversal

| Tema | Resultado |
|------|-----------|
| Cobertura de dominio (Q2, T131) | `identidad/domain` 98,2 % de líneas · `operacion/domain` 100 % (umbral 80 %) |
| Logs sin secretos (T130) | `identidad/logs.int.test.ts`. **Hallazgo corregido**: pino-http registraba la cabecera `Set-Cookie` con el token de sesión; ahora se oculta. Los errores SMTP se registran sin direcciones de correo |
| Revisión de seguridad (T132) | Revisión dirigida de Identidad y la integración. **Hallazgo corregido**: el puente de demostración de Convocatorias seguía activo fuera de `production` (p. ej. staging); ahora solo en development/test, como Boletería. Comprobado: CORS solo para `WEB_URL`, cookie `HttpOnly` y `SameSite=Lax`, `OrigenGuard` en Identidad, sin redirecciones abiertas (`destinoSeguro`), límites de intentos en contraseña y TOTP, CSV sin inyección de fórmulas. Queda pedir el `/security-review` completo antes del PR (Q8) |
| Carga (T129) | Guion `tests/carga/operacion.js` (grilla < 2 s, ingreso p95 < 1 s). **Pendiente** de correr: k6 no está instalado en el equipo de desarrollo |
| ADR 0009–0011 (T128) | Siguen «propuesta»: pasan a «aceptada» cuando se apruebe el PR |

## Accesibilidad manual (T133a)

**Pendiente**: requiere una persona con NVDA + Firefox y solo teclado. Las E2E pasan axe en todas las
páginas P1 (grilla, publicación, cambio de función, registro, ingreso, segundo factor y personal), lo
que no sustituye la revisión con lector de pantalla. Anotar aquí los hallazgos y su corrección.

| Página | Lector de pantalla | Solo teclado | Hallazgos |
|--------|--------------------|--------------|-----------|
| `/programacion` (grilla) | | | |
| `/programacion/publicar` | | | |
| `/programacion/funciones/[id]` | | | |
| `/cuenta/registro` | | | |
| `/cuenta/ingresar` | | | |
| `/cuenta/segundo-factor` | | | |
| `/admin/personal` | | | |
