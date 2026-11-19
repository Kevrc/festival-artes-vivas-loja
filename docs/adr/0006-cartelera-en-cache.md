# ADR-0006: Servir la cartelera desde caché con revalidación por eventos

- Estado: aceptada
- Fecha: 2026-11-19 · Autor: @Kevrc · Specs: 001

## Contexto

La cartelera es la parte más visitada (objetivo: 5 000 visitantes simultáneos, < 3 s en 4G) y
casi todo su contenido cambia poco. Debe seguir disponible aunque Boletería falle
(RNF-003 de 001).

## Decisión

- Las páginas públicas se generan en el servidor con **ISR** de Next.js y se sirven desde una
  **CDN**, con caducidad de 60 s.
- Cuando el módulo de Programación recibe `FuncionReprogramada`, `FuncionCancelada` o
  `ProgramacionPublicada`, **revalida** solo las páginas afectadas (día, obra, sede).
- La disponibilidad de entradas ("últimos lugares", "agotado") se pide aparte desde el navegador a
  un endpoint ligero, cacheado 15 s; si falla se muestra "Consultar disponibilidad".
- Programación mantiene su propia **proyección de lectura** (tablas desnormalizadas por día)
  alimentada por eventos, para que la cartelera no consulte a Operación.

## Alternativas

- Renderizar en cada petición: más carga en el servidor justo en el pico.
- Sitio estático regenerado entero: lento ante cambios de último minuto.

## Consecuencias

- (+) La mayoría de las visitas no llegan al servidor; aguanta la noche de inauguración.
- (+) La cartelera sobrevive a la caída de Boletería o del API.
- (−) Hasta 60 s de desfase en el peor caso; dentro del objetivo de < 1 minuto.
- Vistas afectadas: procesos, física.
