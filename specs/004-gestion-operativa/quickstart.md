# Quickstart: validar Operación e Identidad (004)

Guía para comprobar que los módulos **Operación** e **Identidad** cumplen la [spec](spec.md), el
[modelo de datos](data-model.md) y los contratos
([API Operación](contracts/api-operacion.openapi.yaml),
[API Identidad](contracts/api-identidad.openapi.yaml),
[eventos](contracts/eventos-operacion-identidad.md),
[IdentidadPublica](contracts/identidad-publica.md)). Los comandos de prueba existirán a medida que
avance `tasks.md`.

## Requisitos

- Node.js 22+, pnpm 11, Docker (PostgreSQL 16, Mailpit y Testcontainers).
- `.env` copiado de `.env.example` con las variables nuevas:
  - `IDENTIDAD_CLAVE_CIFRADO` (32 bytes en base64; cifra los secretos TOTP).
  - `SMTP_URL=smtp://localhost:1025` (Mailpit) y `CORREO_REMITENTE="FIAVL <no-responder@fiavl.ec>"`.
  - `FIAVL_AHORA` opcional para fijar la hora en pruebas de reprogramación y cierre.
- Chromium para Playwright.

## Preparación

```bash
pnpm install
```

```bash
pnpm db:up
```

`db:up` levanta PostgreSQL y **Mailpit** (bandeja de correos de prueba en http://localhost:8025).

```bash
pnpm db:migrate && pnpm db:seed
```

La semilla crea la edición XI 2026 en el esquema `operacion` (mismos ids que hoy), publica sus
eventos hacia Cartelera, Boletería e Identidad, carga las cifras históricas de 2025 y siembra
cuentas de prueba con contraseña y TOTP conocidos (solo desarrollo):

| Cuenta | Rol y alcance |
|--------|---------------|
| `programador@fiavl.test` | programador |
| `direccion@fiavl.test` | dirección |
| `admin@fiavl.test` | administrador |
| `sala.bolivar@fiavl.test` | jefe de sala · Teatro Bolívar |
| `taquilla.bolivar@fiavl.test` | taquilla · Teatro Bolívar |
| `validador.bolivar@fiavl.test` | validador · Teatro Bolívar |
| `asistente@fiavl.test` | asistente verificado |

```bash
pnpm dev
```

## Escenarios de validación

### Operación

| # | Pasos | Resultado esperado | Criterio |
|---|-------|--------------------|----------|
| 1 | Como programador, en `/programacion` día 12, crear "El Cura sin cabeza" (90 min) en el Teatro Nacional a las 20:00 | Borrador con fin 21:30 | US1-AS1, RN-002 |
| 2 | Con una función de 19:00 a 21:00 en el Teatro Bolívar (montaje 30 min), crear otra a las 21:15 y luego a las 21:30 | 21:15 → 409 `cruce_sede` mostrando la función en conflicto; 21:30 → creada | US1-AS2, RN-001 |
| 3 | Aforo habilitado 900 en sede de 800 | 400/409 `aforo_supera_sede` | US1-AS3, FR-004 |
| 4 | Mismo elenco en dos sedes con horarios solapados | 409 `cruce_elenco` | US1-AS4, FR-003 |
| 5 | Dos pestañas editan la misma función; guardar en ambas | La segunda recibe 412 con la versión vigente | FR-013 |
| 6 | Dejar una función sin tipo de acceso y abrir `/programacion/publicar` | Lista de errores; "Publicar" bloqueado | US2-AS2 |
| 7 | Corregir y publicar | Funciones "programadas"; aparecen en `/cartelera` en < 1 min | US2-AS1, SC-003 |
| 8 | Reprogramar una función con motivo "lluvia" | Estado "reprogramada", historial con horario anterior, cartelera actualizada | US3-AS1 |
| 9 | Reprogramar a una sede con menos aforo que entradas vendidas | 409 con la cifra en exceso; confirmar ⇒ reprogramada | US3-AS2 |
| 10 | Comprar 3 entradas (como asistente) y cancelar la función | Boletería anula/devuelve; Mailpit muestra los avisos de cancelación | US3-AS3, US10 |
| 11 | Reprogramar o cancelar sin motivo, o una función ya finalizada (`FIAVL_AHORA` posterior) | 400 `motivo_requerido` / 409 `funcion_finalizada` | US3-AS4, US3-AS5 |
| 12 | `pnpm events:emit:004 postulacion-seleccionada` y buscar la obra en `/programacion/obras` | Aparece con ficha técnica | US1-AS5 |
| 13 | `pnpm events:emit:004 seleccion-desistida` sobre una obra con funciones | Obra desistida, incidencia "desistimiento", funciones intactas | FR-007 |
| 14 | Como jefe de sala del Teatro Bolívar, registrar 1 200 personas en Chacovachi (plaza) | Suma a la asistencia estimada del día | US4-AS1 |
| 15 | El mismo jefe de sala intenta registrar en otra sede | 403 `fuera_de_alcance` | RN-009 |
| 16 | `pnpm events:emit:004 aforo-excedido` | Incidencia automática en la sede | US4-AS3 |
| 17 | `/estadisticas` por función con aforo 200 y 150 ingresos | Ocupación 75 %; total = validada + estimada con desglose; CSV con los filtros | US5-AS1–AS3 |
| 18 | Cerrar la edición (`FIAVL_AHORA` posterior + trabajo de cierre) y abrir `/estadisticas/informe` | Informe con variación frente a 2025; edición en solo lectura | US5-AS4, RN-007, SC-004 |
| 19 | Crear la edición 2027 a partir de 2026 | Copia sedes y parámetros, ninguna función; advertencia si fechas fuera de noviembre | US6-AS1, AS2 |

### Identidad

| # | Pasos | Resultado esperado | Criterio |
|---|-------|--------------------|----------|
| 20 | Registrarse en `/cuenta/registro` y abrir el enlace en Mailpit | Cuenta "verificada" en < 2 min | US7-AS1, AS2, SC-006 |
| 21 | Registrar un correo existente (`Asistente@FIAVL.test `) | Misma respuesta; el dueño recibe un aviso | US7-AS3, caso borde |
| 22 | Contraseña de 9 caracteres o de la lista filtrada | Rechazo con el motivo | US7-AS4, RN-008 |
| 23 | 5 contraseñas incorrectas seguidas | Bloqueo 15 min y aviso al titular | US8-AS2 |
| 24 | Recuperar contraseña, usar el enlace dos veces | La segunda vez "enlace usado"; otras sesiones cerradas | US8-AS3 |
| 25 | Abrir sesión en dos navegadores y cerrar una desde `/mi-cuenta/sesiones` | El otro pierde el acceso | US8-AS4 |
| 26 | Crear un validador del Teatro Bolívar; primer ingreso | Pide configurar TOTP antes de continuar | US9-AS3 |
| 27 | Ese validador valida en otra sede o intenta programar | 403 | US9-AS1, AS2, SC-007 |
| 28 | Cambiar su rol con la sesión abierta | La siguiente petición ya usa el nuevo permiso; auditoría registrada | US9-AS4 |
| 29 | Comprar entradas | Correo con los QR en < 1 min | US10-AS1, RNF-005 |
| 30 | Detener Mailpit, comprar, reiniciarlo | El correo llega al reintentar | US10-AS2, RNF-007 |
| 31 | Descargar mis datos y eliminar una cuenta sin funciones futuras | JSON completo; cuenta anonimizada, no puede iniciar sesión | US11-AS1, AS2 |
| 32 | Eliminar una cuenta con entradas futuras | Aviso de funciones futuras; al confirmar, anonimizada y el QR sigue válido | US11-AS3 |
| 33 | Verificar un correo de un dominio institucional | Acreditado hasta el fin de la edición; puede reservar "solo estudiantes" | US12 |

## Pruebas automatizadas

```bash
pnpm test
```

Unitarias de dominio (cobertura ≥ 80 %): agenda y cruces, validación de publicación, máquina de
estados de función, indicadores, scrypt, TOTP (vectores RFC 6238), contraseñas filtradas,
plantillas.

```bash
pnpm --filter @fiavl/api test:int
```

Integración con PostgreSQL real: restricciones `EXCLUDE` bajo concurrencia (dos programadores a
la vez ⇒ exactamente una función), outbox de eventos, consumidores idempotentes, matriz de
autorización por rol y alcance, notificaciones con reintentos y deduplicación, anonimización.

```bash
pnpm test:e2e
```

Playwright + axe: grilla, publicación, reprogramación, registro, inicio de sesión con TOTP y
estadísticas, sin violaciones A/AA.

```bash
k6 run tests/carga/operacion.js
```

Grilla de 60 funciones < 2 s (RNF-001) e inicio de sesión < 1 s p95 (RNF-004).
