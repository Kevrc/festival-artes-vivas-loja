# Contrato de rutas web públicas (001)

Rutas de `apps/web/src/app/(publico)/`. Son contrato porque se comparten como enlaces (FR-005) y
la CDN las cachea (ADR-0006).

| Ruta | Render | Caché CDN | Etiquetas de revalidación | Historias |
|------|--------|-----------|---------------------------|-----------|
| `/cartelera` | Redirección al día visible | 60 s | `edicion` | US1-AS1, AS2 |
| `/cartelera/{fecha}` | ISR | 60 s + revalidación por evento | `dia:{fecha}` | US1, US2 |
| `/cartelera/{fecha}?disciplina=…&sede=…&acceso=…&pais=…&componente=…&publico=…&franja=…` | Misma página; filtros en el navegador | igual que la anterior | — | US2-AS1, AS4 |
| `/buscar?q=…` | Cliente sobre `/api/cartelera/buscar` | API 60 s | — | US2-AS2 |
| `/ahora` | Cliente sobre `/api/cartelera/ahora` | API 30 s | — | US4 |
| `/mapa?fecha=…` | Cliente (Leaflet bajo demanda) | — | — | US4, FR-008 |
| `/obras/{id}` | ISR | 60 s | `obra:{id}` | US3-AS1, AS3 |
| `/elencos/{id}` | ISR | 60 s | `elenco:{id}` | US3 |
| `/sedes/{id}` | ISR | 60 s | `sede:{id}` | US3-AS2 |
| `/mi-agenda` | Cliente (favoritos locales o de la cuenta) | sin caché | — | US5 |
| `/programa?fecha=…&…filtros` | Servidor, hoja de estilos de impresión | 60 s | `dia:{fecha}` | US6-AS1 |
| `/api/revalidar` | Interna, protegida por secreto | sin caché | — | research R5 |

## Parámetros de filtro (*query string*)

| Parámetro | Valores | Múltiple |
|-----------|---------|:--------:|
| `disciplina` | enumeración `Disciplina` del OpenAPI | sí (`,`) |
| `sede` | uuid | sí |
| `acceso` | `pagada`, `gratuita_reserva`, `gratuita_libre`, `restringida` | sí |
| `pais` | nombre del país | sí |
| `componente` | enumeración `Componente` | sí |
| `publico` | `familiar`, `adultos`, `estudiantes` | sí |
| `franja` | `manana` (< 12:00), `tarde` (12:00–18:59), `noche` (≥ 19:00) | sí |

Valores desconocidos se ignoran sin error. Entre valores de un mismo parámetro: **O**; entre
parámetros distintos: **Y** (US2-AS1).

## Accesibilidad (FR-013)

- Cada ruta tiene un único `<h1>` y regiones `main`, `nav`.
- Los filtros son controles nativos etiquetados; el número de resultados se anuncia con `aria-live`.
- Estado de la función (cancelada, reprogramada, agotado) con texto, no solo color o tachado.
- Ancho mínimo soportado: 320 px.
