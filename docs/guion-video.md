# Guion del video de sustentación (5 minutos)

Cada integrante defiende las decisiones de **su** spec. Todo lo que se dice está respaldado en el
repositorio: drivers en [arquitectura/00-drivers.md](arquitectura/00-drivers.md), vistas 4+1 en
[arquitectura/](arquitectura/) y decisiones en [adr/](adr/).

**Ritmo:** unas 150 palabras por minuto. Cada bloque está escrito para leerse en voz alta en el
tiempo indicado. Lo que va entre corchetes es lo que se ve en pantalla.

| Tiempo | Quién | Tema | Vista 4+1 |
|--------|-------|------|-----------|
| 0:00–1:15 | @Kevrc (001) | El festival, SDD y la cartelera bajo picos | Física + escenarios |
| 1:15–2:30 | @By-Alvarez06 (002) | Boletería: sin sobreventa y sin internet | Procesos |
| 2:30–3:40 | @Carlos2190 (003) | Convocatorias y cómo se hablan los módulos | Lógica |
| 3:40–4:50 | @jeimytorresg (004) | Operación, identidad y despliegue | Lógica + física |
| 4:50–5:00 | Todos | Cierre | Desarrollo |

---

## 1. @Kevrc — El festival, SDD y la cartelera (0:00–1:15)

**[Portada de la cartelera en el navegador, día de la inauguración]**

> El Festival Internacional de Artes Vivas de Loja reunió más de 163 mil asistencias en 2025.
> En 2026 son once días, del 12 al 22 de noviembre, con Alemania como país invitado. Nuestro
> sistema cubre de la convocatoria a artistas hasta la venta de entradas.

**[Abrir `.specify/memory/constitution.md` y luego `specs/`]**

> Trabajamos con Specification-Driven Development usando spec-kit. Primero escribimos una
> constitución; luego cada integrante escribió su spec, su plan y sus tareas antes de programar. Ninguna tecnología se eligió por costumbre:
> cada una responde a un driver medible.

**[Abrir `docs/arquitectura/00-drivers.md`, tabla de escenarios QA-2, QA-3 y QA-4]**

> Mi spec es la cartelera. Su problema no es el volumen, es el pico: la noche de inauguración miles
> de personas la abren al mismo tiempo desde datos móviles. Por eso, en el ADR 6, la cartelera
> se genera en el servidor con regeneración incremental y se sirve desde una CDN. Cuando una
> función se cancela, un evento revalida solo las páginas afectadas.

**[Vista física, diagrama de despliegue; luego la cartelera en un celular de 320 px]**

> Así la cartelera sigue visible aunque la boletería falle, carga en menos de tres segundos y
> cumple WCAG 2.1 AA desde 320 píxeles.

---

## 2. @By-Alvarez06 — Boletería sin sobreventa y sin internet (1:15–2:30)

**[Vista de procesos, diagrama de secuencia "Compra de entradas"]**

> Yo lideré la boletería. El riesgo principal es la integridad: quinientas personas intentando
> comprar a la vez una función de cien lugares. La respuesta tiene que ser exactamente cien
> entradas y ningún cobro doble.

**[Abrir `docs/adr/0004-control-de-aforo.md`, la sentencia UPDATE]**

> En el ADR 4 descartamos los bloqueos en memoria y las colas de compra. Retener lugares es una
> sola sentencia atómica en PostgreSQL que solo tiene efecto si queda cupo. Lo probamos con
> compras concurrentes reales contra la base de datos.

**[Abrir `docs/adr/0007-pagos-capa-anticorrupcion.md`]**

> El pago va detrás de una capa anticorrupción: un puerto con un adaptador simulado para pruebas y
> otro para el proveedor real. La confirmación llega por webhook idempotente, y si no llega, un
> trabajo concilia cada dos minutos.

**[Vista de procesos, "Validación de ingreso sin conexión"; mostrar el validador]**

> El segundo riesgo es perder internet en la puerta de una sala. En el ADR 5, cada QR lleva una
> firma Ed25519. El validador es una aplicación web que guarda la lista de entradas, verifica la
> firma sin conexión durante horas y sincroniza los ingresos al volver la red.

---

## 3. @Carlos2190 — Convocatorias y cómo se hablan los módulos (2:30–3:40)

**[Vista lógica, diagrama "Módulos y dependencias"]**

> Yo lideré las convocatorias. Antes de entrar a mi módulo, la decisión que nos une a todos: el
> ADR 1. Elegimos un monolito modular y no microservicios. Somos cuatro personas, un semestre y un
> presupuesto académico, y ningún driver justificaba infraestructura distribuida. Son cinco
> módulos, cada uno con su propio esquema en la base de datos, y ninguno lee tablas de otro.

**[Abrir `docs/adr/0003-eventos-outbox.md`, el bloque BEGIN … COMMIT]**

> Los módulos se comunican con eventos. En el ADR 3, cada evento se encola con pg-boss dentro de
> la misma transacción que el cambio de negocio. Si la transacción falla, el evento desaparece con
> ella. Así no perdemos eventos y no necesitamos un broker aparte.

**[Vista de escenarios, E1 "De la convocatoria a la cartelera"; mostrar el formulario de postulación]**

> Mi flujo lo usa de principio a fin: un artista postula y sube su dossier, que solo ven la
> coordinación y los curadores asignados. Se evalúa, se selecciona, y un evento crea la obra en
> Operación, que luego aparece en la cartelera sin que ningún módulo toque los datos de otro.

---

## 4. @jeimytorresg — Operación, identidad y despliegue (3:40–4:50)

**[Grilla de programación del panel de operación]**

> Yo lideré la operación y la identidad. Al armar la programación, dos funciones no pueden cruzarse
> en la misma sede ni con el mismo elenco. En el ADR 10 lo resolvimos en dos capas: una regla de
> dominio que muestra el conflicto y una restricción de exclusión en PostgreSQL que lo impide
> incluso si dos personas guardan al mismo tiempo.

**[Vista de escenarios, E4 "Cancelación por lluvia"]**

> Cuando una función se cancela por lluvia, un solo evento actualiza la cartelera, reembolsa en
> boletería y avisa a cada asistente. Según el ADR 11, los correos salen desde una cola con
> deduplicación y reintentos, así nadie recibe el aviso dos veces.

**[Abrir `docs/adr/0009-sesiones-opacas.md`; luego vista física]**

> Para el personal usamos sesiones opacas guardadas en PostgreSQL con segundo factor, y los permisos
> se verifican en el servidor en cada petición. Todo se despliega en contenedores, con dos réplicas
> del API, un worker separado y la CDN delante. Fuera del festival se reducen recursos sin
> rediseñar nada.

---

## 5. Todos — Cierre (4:50–5:00)

**[Página de pull requests de GitHub con los checks de CI en verde]**

> **@Kevrc:** Trabajamos con ramas por spec, pull requests revisados por un compañero y seis
> verificaciones obligatorias en la integración continua.
>
> **Todos:** Gracias.

---

## Antes de grabar

- [ ] Levantar el sistema con la semilla fresca (`pnpm db:seed`) para que la cartelera tenga fotos y funciones.
- [ ] Abrir en pestañas, en orden: cartelera, constitución, drivers, ADR 4, 5, 7, 1, 3, 10, 11, 9 y las vistas 4+1.
- [ ] Los diagramas Mermaid se ven renderizados en GitHub: grabar desde ahí, no desde el editor.
- [ ] Cada integrante graba su bloque y sale en cámara al menos al empezar.
- [ ] Ensayar con cronómetro: si un bloque pasa de su tiempo, recortar la última frase, no hablar más rápido.
