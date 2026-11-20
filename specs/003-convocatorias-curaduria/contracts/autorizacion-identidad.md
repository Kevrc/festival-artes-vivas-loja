# Contrato de autorización esperado de Identidad para Convocatorias

Este documento fija el anticorruption contract que el adaptador propio de Convocatorias consume. No implementa ni modifica Identidad. La integración de producción sustituirá `AutorizacionConvocatoriasDevAdapter` detrás del puerto existente de Convocatorias.

## Roles y alcances de origen

La spec 004, `specs/004-gestion-operativa/spec.md`, FR-019, declara literalmente:

> “El sistema MUST gestionar los roles: asistente, postulante, curador, coordinación de convocatorias, coordinación provincial, programador, jefe de sala, taquilla, validador, dirección y administrador; con alcance por sede, provincia o disciplina cuando aplique.”

FR-020 añade que Identidad debe “ofrecer a los demás módulos una forma de comprobar identidad, roles y alcance en cada operación”. Convocatorias no traduce esos nombres a roles alternativos. La representación canónica en este contrato conserva exactamente los valores de FR-019 (incluidas tildes/espacios):

```ts
type RolIdentidad =
  | 'asistente'
  | 'postulante'
  | 'curador'
  | 'coordinación de convocatorias'
  | 'coordinación provincial'
  | 'programador'
  | 'jefe de sala'
  | 'taquilla'
  | 'validador'
  | 'dirección'
  | 'administrador';

interface ContextoAutorizadoIdentidad {
  cuentaId: string; // UUID autenticado
  correoVerificado: boolean;
  roles: Array<{
    rol: RolIdentidad;
    alcance?: {
      sedeId?: string;
      provincia?: string;
      disciplina?: string;
    };
  }>;
}
```

Un rol puede tener uno o varios alcances según la asignación de Identidad. `convocatorias` comprueba el alcance en cada caso de uso: `postulante` solo opera sobre el elenco/cuenta propia; `curador` solo ve asignaciones propias y sus documentos; `coordinación de convocatorias` opera en el contexto convocatorias; `coordinación provincial` solo opera sobre convocatorias/postulaciones de la provincia presente en su alcance. `administrador` no se interpreta como bypass en Convocatorias hasta que el contrato de Identidad defina explícitamente ese permiso.

### Política de descarga de documentos (FR-015)

FR-015 de `spec.md` dice literalmente: “Los documentos de postulantes MUST ser accesibles solo para la coordinación y los curadores asignados (Constitución VI).” Para armonizarlo con FR-016 y la descarga de la propia postulación, el propietario autenticado puede descargar únicamente los documentos asociados a su elenco/postulación. La comprobación de propiedad ocurre en el servidor antes de emitir una URL firmada de lectura que vence en cinco minutos.

El acceso de terceros sigue limitado a coordinación autorizada y curadores asignados a esa postulación. Otro postulante, un curador sin asignación y cualquier cuenta sin permiso reciben 403. No hay URL pública ni se expone la key del objeto.

## Interfaz del puerto y adaptador de desarrollo

El puerto de Convocatorias recibe una petición y retorna `ContextoAutorizadoIdentidad | null`; no consulta tablas de Identidad. `null` equivale a no autenticado. Los permisos ausentes o alcances no coincidentes producen 403.

En `development` y `test`, `AutorizacionConvocatoriasDevAdapter` conserva el mecanismo de desarrollo existente de Boletería sin editar archivos de Boletería:

| Header/cookie | Significado |
|---|---|
| `x-cuenta-dev` | UUID de cuenta de prueba |
| `x-rol-dev` | Uno de los valores canónicos de `RolIdentidad` |
| `x-correo-dev` | Correo de demo opcional |
| `x-correo-verificado-dev` | `true`/`false`; default `true` solo para fixtures locales |
| `x-provincia-dev` | Alcance provincial de la sesión de prueba |
| `x-disciplina-dev` | Alcance disciplinar de la sesión de prueba |
| cookie `sesion_dev` | Formato compatible actual de Boletería para cuenta/rol; los alcances de Convocatorias se leen de headers dedicados |

El adaptador solo se registra en desarrollo/pruebas; cualquier solicitud sin sujeto válido o en entorno de producción rechaza autenticación. Estos headers nunca son una autenticación de producción.

## Pruebas manuales de acciones de coordinación en desarrollo

Usar la cuenta UUID de coordinación incluida en fixtures. En cada petición, enviar `x-cuenta-dev: <uuid>` y `x-rol-dev: coordinación de convocatorias`:

| Acción | Operación de API prevista | Comprobación |
|---|---|---|
| Admitir | `POST /api/convocatorias/panel/postulaciones/{id}/admisibilidad` con `decision=admitir` | Pasa a admitida/en_evaluacion y registra actor/auditoría. |
| No admitir | Misma operación con `decision=no_admitir` y motivo | Pasa a no_admitida; motivo obligatorio y auditoría. |
| Pedir subsanación | Misma operación con `decision=subsanar`, detalle | Estado requiere_subsanacion, vence 72 h y se publica evento. |
| Reabrir evaluación enviada | `POST /api/convocatorias/panel/evaluaciones/{id}/reabrir` con motivo | Solo coordinación; vuelve evaluación a reabierta/borrador y registra motivo. |

Para coordinación provincial, usar `x-rol-dev: coordinación provincial` junto con `x-provincia-dev: <provincia exacta>`; repetir una acción sobre recurso de otra provincia debe devolver 403. La misma matriz debe existir como prueba automatizada de autorización, no solo como smoke manual.

## Integración de producción pendiente

Identidad debe poder resolver por petición el UUID de cuenta, verificación de correo, roles canónicos y alcances con la forma anterior (o un tipo compartido equivalente con semántica idéntica). Al recibir el contrato definitivo, el adaptador solo transforma el DTO de Identidad a `ContextoAutorizadoIdentidad`; dominio y casos de uso permanecen independientes. El mecanismo actual de Boletería no cubre estos roles y no se modifica en esta spec.
