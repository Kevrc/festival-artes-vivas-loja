# Drivers arquitectónicos

Toda decisión de arquitectura y de tecnología se justifica **con una necesidad de este documento**,
no por preferencia ni costumbre. Los drivers salen de las specs (FR, RNF, SC), de la constitución
y de la [investigación del caso](../investigacion-festival.md).

## 1. Restricciones (no negociables)

| ID | Restricción | Origen |
|----|-------------|--------|
| C-1 | 4 integrantes, un semestre; cada uno lidera un spec | Enunciado, constitución §11 |
| C-2 | Presupuesto académico: infraestructura de bajo costo, sin licencias | Enunciado |
| C-3 | Pagos en USD con un proveedor que opere en Ecuador y tenga modo de prueba | 002 FR-010, ADR-0007 |
| C-4 | Ley Orgánica de Protección de Datos Personales (LOPDP) | Constitución VI, 004 FR-023 |
| C-5 | Festival fijo por ley: 11 días en noviembre, en Loja | Ley de 2018, investigación |
| C-6 | Sin aplicación móvil nativa en v1; todo por navegador | Constitución §1 (fuera de alcance) |
| C-7 | El personal usa sus propios celulares para validar | 002 supuestos |
| C-8 | Arquitectura documentada en 4+1 con Mermaid | Enunciado, constitución II |

## 2. Escenarios de atributos de calidad

Formato: **estímulo → respuesta esperada (medida)**. Prioridad = importancia para el festival /
dificultad técnica (A alta, M media, B baja).

| ID | Atributo | Escenario | Medida | Origen | Prioridad |
|----|----------|-----------|--------|--------|-----------|
| QA-1 | Integridad | 500 compras simultáneas sobre una función de 100 lugares | Exactamente 100 entradas, 0 cobros dobles | 002 RNF-001, SC-001, SC-005 | A / A |
| QA-2 | Rendimiento | Noche de inauguración: miles consultan la cartelera desde 4G | < 3 s de carga, p95 < 1 s en servidor | 001 RNF-001, SC-002 | A / M |
| QA-3 | Escalabilidad | Pico de visitantes simultáneos en la cartelera | 5 000 sin errores | 001 RNF-002, SC-003 | A / M |
| QA-4 | Disponibilidad | Boletería o el API fallan durante el festival | La cartelera sigue visible | 001 RNF-003 | A / M |
| QA-5 | Operación sin red | Se cae internet en la puerta de una sala | Validación < 2 s, hasta 4 h sin conexión | 002 FR-008, RNF-003, RNF-005 | A / A |
| QA-6 | Consistencia | Se cancela una función con entradas | Cartelera, boletería y avisos actualizados en < 1 min, sin perder eventos | 004 RNF-002, SC-003 | A / M |
| QA-7 | Seguridad | Un usuario intenta una operación fuera de su rol o alcance | Rechazada en el servidor, 0 accesos indebidos | 004 FR-020, SC-007 | A / M |
| QA-8 | Privacidad | Un postulante sube su dossier | Solo coordinación y curadores asignados lo ven | 003 FR-015, RNF-002 | A / B |
| QA-9 | Confiabilidad | El proveedor de pagos confirma tarde o dos veces | Un solo cobro; devolución automática si el pedido expiró | 002 US1-AS6, ADR-0007 | A / M |
| QA-10 | Mantenibilidad | 4 integrantes trabajan en paralelo en módulos distintos | PRs que no se cruzan; contratos verificados en la CI | Constitución III, C-1 | M / M |
| QA-11 | Accesibilidad | Cualquier página pública | WCAG 2.1 AA, desde 320 px | 001 FR-013, SC-005 | M / B |
| QA-12 | Trazabilidad | La dirección rinde cuentas al cierre | Cifras que cuadran 100 % con ingresos y conteos | 004 SC-005, constitución IX | M / B |
| QA-13 | Costo | 10 meses al año casi sin uso | Bajar recursos fuera del festival sin rediseñar | C-2, C-5 | M / B |

## 3. Dimensionamiento (estimaciones)

Cifras reales de la investigación y **supuestos** marcados para el cálculo.

| Magnitud | Cálculo | Resultado | Driver |
|----------|---------|-----------|--------|
| Asistencias por edición | Real: 163 162 (2025); proyección 160 000–200 000 (2026) | ~200 000 | — |
| Entradas pagadas por edición | 28 funciones × 800 lugares (supuesto: aforo máximo, Teatro Nacional) | ≤ 22 400 | QA-1 |
| Reservas gratuitas en salas | Supuesto: 100 funciones × 500 lugares | ≤ 50 000 | QA-1 |
| Visitantes en la hora pico | Supuesto: 10 000 visitantes en la hora de la inauguración, sesión de 5 min | ≈ 830 simultáneos; el objetivo de 5 000 deja un margen de 6× | QA-2, QA-3 |
| Ráfaga de compras | Supuesto: 1 500 intentos en el primer minuto de una función estrella | ≈ 25 peticiones/s de escritura | QA-1 |
| Eventos de dominio en el día pico | ≈ 7 000 entradas emitidas + cambios y avisos × 3 consumidores | ≈ 25 000/día; picos < 50/s | QA-6 |
| Ingresos en puerta | 300 personas en 15 min por sala, 3 validadores | ≈ 1 validación cada 9 s por validador | QA-5 |
| Datos de negocio | Ediciones, funciones, pedidos, entradas | < 1 GB por edición | — |
| Documentos de postulantes | Supuesto: 500 postulaciones × 30 MB | ≈ 15 GB por edición | QA-8 |

**Conclusión del dimensionamiento**: el volumen es **modesto y concentrado**. El problema no es
el volumen total sino la **concurrencia puntual** (QA-1), los **picos de lectura** (QA-2, QA-3) y la
**operación sin red** (QA-5). Ningún driver justifica infraestructura distribuida.

## 4. Matriz drivers → decisiones

| Driver | ADR-0001 Monolito modular | ADR-0002 Stack | ADR-0003 Eventos | ADR-0004 Aforo | ADR-0005 QR offline | ADR-0006 Cartelera CDN | ADR-0007 Pagos | ADR-0008 Despliegue |
|--------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| QA-1 Integridad | | ● | | ● | | | ● | |
| QA-2 Rendimiento | | ● | | | | ● | | ○ |
| QA-3 Escalabilidad | ○ | | | | | ● | | ● |
| QA-4 Disponibilidad | ○ | | ● | | | ● | | ● |
| QA-5 Sin red | | ● | | | ● | | | |
| QA-6 Consistencia | | ● | ● | | | ○ | | |
| QA-7 Seguridad | | ● | | | ○ | | | ● |
| QA-8 Privacidad | | ● | | | | | | ● |
| QA-9 Confiabilidad | | | ○ | ○ | | | ● | |
| QA-10 Mantenibilidad | ● | ● | ● | | | | ○ | |
| QA-11 Accesibilidad | | ● | | | | | | |
| QA-12 Trazabilidad | | | ● | | | | ● | |
| QA-13 Costo | ● | ○ | ○ | | | ● | | ● |
| C-1 Equipo y plazo | ● | ● | | | | | | ● |
| C-2 Presupuesto | ● | ● | ● | | | | | ● |
| C-3 Pagos Ecuador | | | | | | | ● | |
| C-6 Sin app nativa | | ● | | | ● | | | |

● driver principal de la decisión · ○ driver secundario
