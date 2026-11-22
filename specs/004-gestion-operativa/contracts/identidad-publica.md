# Contrato `IdentidadPublica`: identidad, roles y alcance para todos los módulos (FR-020)

Contrato en proceso (mismo despliegue, [ADR-0001](../../../docs/adr/0001-monolito-modular.md))
que Identidad ofrece al resto de módulos para **autorizar en el servidor cada operación**
(Constitución VI). Vive en `packages/contracts/src/identidad/publica.ts`; los módulos dependen de
este contrato, **nunca** del código de `modules/identidad` (vista de desarrollo, regla 1).

## Interfaz

```ts
export const IDENTIDAD_PUBLICA = Symbol.for('fiavl.IdentidadPublica');

export type RolPersonal =
  | 'asistente' | 'postulante' | 'curador' | 'coordinacion_convocatorias'
  | 'coordinacion_provincial' | 'programador' | 'jefe_sala' | 'taquilla'
  | 'validador' | 'direccion' | 'administrador';

export interface AlcanceRol {
  tipo: 'sede' | 'provincia' | 'disciplina';
  valor: string;                 // id de sede, código de provincia o disciplina
}

export interface ContextoIdentidad {
  cuentaId: string;
  sesionId: string;
  correo: string;
  correoVerificado: boolean;     // FR-015
  estudianteAcreditado: boolean; // US12, vigente a la fecha
  segundoFactorOk: boolean;      // personal: false ⇒ solo puede configurar TOTP
  roles: { rol: RolPersonal; alcance: AlcanceRol | null }[];
}

export interface IdentidadPublica {
  /** Lee la cookie `fiavl_sesion`; null si no hay sesión válida, vencida, revocada o la cuenta no está activa. */
  resolverSesion(req: { headers: Record<string, string | string[] | undefined> }): Promise<ContextoIdentidad | null>;
}
```

## Garantías

| Garantía | Detalle |
|----------|---------|
| Falla cerrada | Cualquier error interno ⇒ `null` (el consumidor responde 401) |
| Estado al día | Roles, desactivación y revocación se leen en cada llamada (US9-AS4, US9-AS5) |
| Sin datos sensibles | Nunca expone hash, TOTP ni token |
| Rendimiento | Una consulta indexada; p95 < 20 ms |
| `administrador` | No implica alcance implícito en otros módulos: cada módulo decide (Boletería ya lo trata como comodín) |

## Adaptación en los módulos existentes (sin cambiar sus specs)

| Módulo | Hoy | Con Identidad |
|--------|-----|---------------|
| Boletería (002) | `AutorizacionDevAdapter` implementa `AutorizacionBoleteriaPort` | Nuevo `AutorizacionIdentidadAdapter` implementa el **mismo** puerto: mapea `roles[].alcance(tipo = sede)` a `sedeId` y filtra los roles que Boletería conoce. El adaptador dev queda para sus pruebas |
| Cartelera (001) | `SesionGuard` lee `x-cuenta-dev` | `SesionGuard` usa `IDENTIDAD_PUBLICA` y deja `req.cuentaId` |
| Convocatorias (003) | `AutorizacionConvocatoriasDevAdapter` | `AutorizacionConvocatoriasIdentidadAdapter` traduce códigos a los nombres de FR-019 y el alcance a `{ sedeId \| provincia \| disciplina }`; toda cuenta es además `asistente` y `postulante` |

**Política pendiente** (US11-AS4): `ContextoIdentidad.politicaPendiente` (opcional) es `true` si hay
una versión vigente de la política de privacidad que la cuenta no aceptó. Los consumidores la tratan
como una sesión restringida: no autorizan nada hasta que se acepte.

**Prioridad de la cookie** (implementación, T088–T091): si la petición trae `fiavl_sesion`, manda
Identidad aunque no sea válida (vencida, revocada o inventada ⇒ 401); solo sin cookie, y en
development/test, se usan los puentes de desarrollo de cada módulo. Una sesión del personal sin
segundo factor no autoriza nada en los otros módulos.

Los cambios en 001 y 002 van en un PR propio aprobado por sus responsables (Constitución §6) con
`/security-review` (Q8).

## Pruebas

- Contrato: un doble en memoria de `IdentidadPublica` que cumple las mismas pruebas que la
  implementación real (sesión vencida, revocada, cuenta desactivada ⇒ `null`).
- Matriz de autorización (SC-007) recorriendo cada rol × operación sensible de 002 y 004.
