# Rutas web de Operación e Identidad (004)

Páginas en `apps/web` (Next.js 15.5, App Router). Español, móvil primero desde 320 px y
**WCAG 2.1 AA** (Constitución VII), auditadas con axe en Playwright. Las páginas solo hablan con
la API por HTTP con los tipos de `@fiavl/contracts` (`credentials: 'include'`). La interfaz oculta
lo que el rol no puede hacer, pero **la autorización real está en el servidor**.

## Públicas y de cuenta (`(publico)`)

| Ruta | Historia | Contenido | Acceso |
|------|----------|-----------|--------|
| `/cuenta/registro` | US7 | Nombre, correo, contraseña con requisitos visibles, casilla de política (enlazada) y de novedades | Sin sesión |
| `/cuenta/verificar?token=…` | US7-AS2 | Consume el enlace; ofrece reenvío si caducó | Sin sesión |
| `/cuenta/ingresar` | US8 | Inicio de sesión; mensaje neutro ante fallo o bloqueo | Sin sesión |
| `/cuenta/recuperar` y `/cuenta/recuperar/nueva?token=…` | US8-AS3 | Pedir enlace y fijar nueva contraseña | Sin sesión |
| `/cuenta/segundo-factor` | US9-AS3 | Alta TOTP con QR y verificación del código | Sesión restringida de personal |
| `/cuenta/politica` | US11-AS4 | Aceptar la nueva versión de la política | Sesión con política pendiente |
| `/mi-cuenta` | US11 | Datos, preferencia de novedades, descargar datos, eliminar cuenta (con aviso de funciones futuras) | Sesión |
| `/mi-cuenta/sesiones` | US8-AS4 | Dispositivos con sesión y botón "cerrar" | Sesión |
| `/mi-cuenta/notificaciones` | US10-AS5 | Historial de avisos | Sesión |
| `/mi-cuenta/estudiante` | US12 | Verificar correo institucional | Sesión |

El encabezado público muestra "Ingresar" o el menú de cuenta. Tras iniciar sesión se vuelve a la
página de origen (`?volver=`, solo rutas relativas).

## Panel del personal (`(panel)`)

| Ruta | Historia | Contenido | Roles |
|------|----------|-----------|-------|
| `/programacion` | US1, US2 | Grilla de un día: columnas por sede, filas por hora; crear/editar función en un panel lateral; conflictos con enlace a la función que choca; selector de día; aviso de feriado | programador (lectura: dirección, jefe de sala) |
| `/programacion/publicar` | US2 | Lista de errores de validación con enlaces; botón "Publicar" | programador |
| `/programacion/funciones/[id]` | US3 | Detalle, historial de cambios, reprogramar (con confirmación de exceso) y cancelar con motivo | programador |
| `/programacion/obras` | US1-AS5, FR-007 | Buscar obras (incluidas las de convocatoria), cargar obra invitada | programador |
| `/sala/incidencias` | US4 | Registrar incidencia y conteo estimado en la sede asignada; lista de incidencias del día | jefe de sala |
| `/estadisticas` | US5 | Indicadores con filtros, tabla accesible y exportar CSV; desglose validada/estimada | dirección, programador, administrador |
| `/estadisticas/informe` | US5-AS4 | Informe de cierre con variación frente a la edición anterior; imprimible | dirección, administrador |
| `/admin/ediciones` y `/admin/sedes` | US6 | Ediciones ("crear a partir de"), sedes, parámetros | administrador |
| `/admin/personal` | US9 | Cuentas de personal, roles con alcance, desactivar, restablecer TOTP | administrador |
| `/admin/notificaciones` | US10-AS2 | Notificaciones fallidas | administrador |

## Accesibilidad de la grilla

- Se presenta como **tabla** (`<table>` con encabezados de sede y de hora) y, en móvil, como lista
  por sede: nunca solo como dibujo de bloques.
- Cada función es un botón con su nombre, horario y estado legibles por lector de pantalla.
- Los conflictos se anuncian en una región `aria-live` y se marcan con texto e icono, no solo color.
- Todos los formularios tienen etiquetas, mensajes de error asociados (`aria-describedby`) y foco
  en el primer error.

## Sustitución de la sesión de desarrollo

`components/boleteria/panel-sesion-dev.tsx` y la cookie `sesion_dev` se retiran del uso normal
cuando exista `/cuenta/ingresar`; los E2E pasan a iniciar sesión con las cuentas sembradas.
