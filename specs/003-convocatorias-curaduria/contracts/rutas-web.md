# Rutas web de Convocatorias (003)

Rutas previstas para las historias P1 en `apps/web`, siguiendo el App Router existente. Los paneles y toda respuesta que contenga datos personales o documentos usan `Cache-Control: no-store`.

| Ruta | Acceso | Función | Historias |
|---|---|---|---|
| `/convocatorias` | Público | Lista convocatorias abiertas y cronograma | US1, FR-002 |
| `/convocatorias/{convocatoriaId}` | Público | Bases, requisitos, fechas y acceso al formulario | US1 |
| `/convocatorias/{convocatoriaId}/postular` | Postulante autenticado | Perfil, ficha de obra, borradores, carga y envío | US1 |
| `/mis-postulaciones/{postulacionId}` | Dueño autenticado | Estado, faltantes, subsanación, descarga propia y acuse | US1, US2, FR-016 |
| `/admisibilidad` | Coordinación autorizada | Revisar envío, admitir, pedir subsanación o no admitir con motivo | US2 |
| `/curaduria` | Curador asignado | Lista asignada, bloqueo por conflicto de interés y sesión de desarrollo | US3 |
| `/curaduria/{asignacionId}` | Curador asignado | Material autorizado, calificaciones por criterio, observaciones y confirmación de envío | US3 |
| `/evaluaciones` | Coordinación autorizada | Avance de curaduría, puntaje final, deliberación y reapertura con motivo | US3 |

La interfaz se diseña móvil primero, en español y con formularios etiquetados, resumen de errores enfocable y soporte íntegro de teclado. El resultado de carga/validación no se comunica solo por color. La fase de implementación debe validar con axe y una revisión manual de teclado/lector de pantalla.
