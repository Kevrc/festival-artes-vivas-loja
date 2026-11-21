# Contrato de eventos de Convocatorias (003)

Eventos publicados por el módulo para Identidad, con el sobre compartido de `packages/contracts/src/eventos/sobre.ts` y publicación transaccional según ADR-0003. No se publican documentos, URLs firmadas, puntajes de evaluadores ni datos personales innecesarios.

| Evento | Cola destino | Datos mínimos | Momento |
|---|---|---|---|
| `PostulacionEnviada` | `identidad.postulacion-enviada` | `postulacionId`, `convocatoriaId`, `cuentaPostulanteId`, `numero`, `enviadaEn` | Transición a enviada, incluido reenvío tras subsanar |
| `SubsanacionSolicitada` | `identidad.subsanacion-solicitada` | `postulacionId`, `convocatoriaId`, `cuentaPostulanteId`, `numero`, `detalle`, `venceEn` | Coordinación solicita subsanación |

Todos llevan `id`, `tipo`, `version`, `ocurridoEn`, `edicionId` y `correlacionId`. El consumidor de Identidad deduplica por `id` y realiza envío de correo; Convocatorias no realiza envío directo. El evento y el cambio de estado se confirman en una única transacción lógica. La nueva extensión del contrato compartido en `packages/contracts` será aditiva y debe añadirse a `index.ts` sin reordenar ni borrar exportaciones.

`PostulacionSeleccionada` queda fuera porque US4 (P2) no forma parte de esta entrega.

La implementación añadirá el archivo propio `packages/contracts/src/eventos/convocatorias.ts` y una exportación aditiva en `packages/contracts/src/index.ts`; no editará contratos ni schemas de eventos de 001, 002 o 004.
