# ADR-0005: Entradas con QR firmado y validador PWA que funciona sin conexión

- Estado: aceptada
- Fecha: 2026-11-19 · Autor: @Kevrc · Specs: 002

## Contexto

La validación debe tardar < 2 s y funcionar sin internet en la puerta de las salas (spec 002,
US2). Un QR no debe poder falsificarse ni usarse dos veces.

## Decisión

- El QR contiene un **token firmado con Ed25519**: id de entrada, id de función y fecha de emisión.
  La llave privada está solo en el servidor; la pública viaja al validador.
- El validador es una **PWA** (Next.js + Service Worker). Al abrir la función descarga la lista
  de entradas válidas y la guarda en IndexedDB.
- Sin conexión: verifica la firma, comprueba que la entrada está en la lista y no fue usada en ese
  dispositivo, y guarda el ingreso en una cola local.
- Al reconectar sincroniza los ingresos; el servidor conserva el **primero** por hora de escaneo y
  marca los demás como `ConflictoDeIngreso`.
- Un **código corto** de 8 caracteres bajo el QR permite validar a mano.

## Alternativas

| Opción | En contra |
|--------|-----------|
| QR con id aleatorio y consulta al servidor | No funciona sin internet |
| App móvil nativa | Instalarla en celulares del personal y publicarla en tiendas; fuera de alcance |
| JWT con HMAC | La llave secreta tendría que estar en cada validador |

## Consecuencias

- (+) Validación local en milisegundos; la puerta no depende de la red.
- (−) Dos validadores sin conexión pueden aceptar la misma entrada; se detecta al sincronizar y
  se alerta a Operación (riesgo aceptado y acotado a una función).
- Vistas afectadas: procesos, física, escenarios.
