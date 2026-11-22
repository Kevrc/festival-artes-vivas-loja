# ADR-0009: Guardar las sesiones como tokens opacos en PostgreSQL

- Estado: propuesta
- Fecha: 2026-11-20 · Autor: @jeimytorresg · Specs: 004 (US8, US9), 001, 002
- Drivers: QA-7, QA-13, C-2 ([drivers](../arquitectura/00-drivers.md))

## Contexto

Todos los módulos necesitan saber **quién** hace cada petición y **qué puede hacer**
(Constitución VI, FR-020). La spec 004 pide además:

| Necesidad | Origen |
|-----------|--------|
| Cerrar la sesión de otro dispositivo y que pierda el acceso de inmediato | US8-AS4 |
| Un cambio de rol se aplica a las sesiones abiertas en menos de 1 minuto | US9-AS4 |
| Desactivar a alguien le quita el acceso de inmediato | US9-AS5 |
| Cambiar la contraseña cierra las demás sesiones | US8-AS3 |
| 30 días de inactividad para el público, 8 horas para el personal | US8-AS1 |
| No añadir infraestructura sin necesidad | Constitución X, C-2 |

## Decisión

La sesión es un **token aleatorio de 256 bits** en una cookie `HttpOnly`, `SameSite=Lax`
(`Secure` fuera de desarrollo). PostgreSQL guarda solo su **SHA-256** en `identidad.sesion` con su
expiración deslizante. En cada petición se busca la sesión y se leen **en ese momento** el estado
de la cuenta y sus roles con alcance; el resultado se ofrece a los demás módulos con el contrato
`IdentidadPublica`.

## Alternativas

| Opción | A favor | En contra |
|--------|---------|-----------|
| **Token opaco en PostgreSQL** (elegida) | Revocación y cambios de rol inmediatos; nada que firmar ni rotar; una consulta indexada por petición | Una lectura a la base por petición autenticada |
| JWT firmado sin estado | No consulta la base | No se puede revocar ni cambiar el rol antes de que venza; para cumplir US8-AS4/US9-AS4 haría falta una lista de revocación (estado otra vez) y rotar llaves |
| Sesiones en Redis | Lectura muy rápida | Un componente más que operar y respaldar sin una carga que lo justifique (< 50 peticiones/s autenticadas) |

## Consecuencias

- **Positivas**: US8-AS4, US9-AS4 y US9-AS5 se cumplen sin código extra; el token robado de la
  base no sirve (solo hay hashes); se explica en un minuto en el video.
- **Negativas**: cada petición autenticada lee la base; se mitiga actualizando
  `ultima_actividad_en` como máximo una vez por minuto.
- **Riesgos**: CSRF por usar cookies; se mitiga con `SameSite=Lax` y la comprobación de `Origin`.
- **Vistas 4+1**: procesos (secuencia de inicio de sesión con segundo factor) y lógica (contrato
  `IdentidadPublica`).
