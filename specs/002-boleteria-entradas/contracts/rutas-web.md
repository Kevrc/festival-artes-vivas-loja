# Contrato de rutas web de Boletería (002)

Rutas de `apps/web/src/app/` pertenecientes al contexto de Boletería (ver
[vista de desarrollo](../../../docs/arquitectura/02-vista-desarrollo.md)). Ninguna ruta transaccional
se cachea en CDN (`Cache-Control: no-store`).

| Ruta | Zona | Quién accede | Qué hace | Historias |
|------|------|--------------|----------|-----------|
| `/entradas/{funcionId}` | `(publico)` | Visitante / Asistente | Muestra disponibilidad en tiempo real, precio, límites y formulario para comprar (pagada) o reservar (gratuita con aforo), o aviso de "Entrada libre" / "Solo estudiantes". Enlazada desde Cartelera (001 FR-010) | US1, US3 |
| `/pedidos/{pedidoId}/retorno` | `(publico)` | Asistente | Página de retorno tras la pasarela de pagos; consulta el estado del pedido y muestra las entradas emitidas o permite reintentar si falló | US1-AS1, AS2 |
| `/mis-entradas` | `(publico)` | Asistente autenticado | Lista pedidos y entradas con QR SVG, código corto, botón de reenvío de correo, cancelación de reserva gratuita y elección de devolución/cambio ante cancelación | US1, US3-AS5, US5-AS2, AS3, FR-009 |
| `/taquilla` | `(panel)` | Personal `taquilla` (alcance por sede) | Apertura de caja, selección de función de la sede, venta rápida (efectivo o datáfono) sin exigir cuenta, vista imprimible del boleto QR, devoluciones en efectivo y arqueo/cierre de caja | US4, US5-AS4 |
| `/sala/{funcionId}` | `(panel)` | Personal `jefe_sala` / `taquilla` / `validador` | Ocupación en vivo: aforo habilitado, emitidas, ingresos validados, pendientes y libres para puerta | US6, FR-015 |
| `/validador` | `validador` (PWA) | Personal `validador` (alcance por sede) | Selector de función de la sede y descarga del paquete offline en IndexedDB; estado de conexión y cola pendiente de sincronización | US2-AS5 |
| `/validador/{funcionId}` | `validador` (PWA) | Personal `validador` | Escáner de cámara + ingreso manual de código corto; respuesta pantalla completa **verde**, **ámbar** (< 1 min mismo dispositivo) o **rojo** con motivo; funciona sin internet y sincroniza al reconectar | US2, RNF-003, RNF-005 |
| `/validador/sw.js` | `validador` (PWA) | Navegador | Service Worker que precachea el shell de `/validador` para operación offline de al menos 4 horas | US2-AS5, ADR-0005 |

## Accesibilidad y usabilidad móvil (Constitución VII)

- Diseño móvil primero desde **320 px** de ancho, en español, con único `<h1>` y regiones `main` y `nav`.
- En `/validador/{funcionId}`, el resultado **verde / ámbar / rojo** siempre acompaña el color con icono, título textual de alto contraste y región `aria-live="assertive"` (nunca depende solo del color).
- El formulario de código corto manual (US2-AS7) es operable íntegramente por teclado con etiqueta explícita y botón de envío grande para uso táctil en puerta.
- En `/taquilla`, el comprobante/entrada generada incluye vista `@media print` para entrega impresa sin cuenta (US4-AS5).
