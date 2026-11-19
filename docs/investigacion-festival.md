# Investigación del caso: Festival Internacional de Artes Vivas de Loja (FIAVL)

Recopilación de fuentes públicas (consultadas el 2026-11-19) para fundamentar las specs.

## Qué es

- Festival de artes escénicas (teatro, danza, circo, música, títeres, exposiciones, talleres,
  ferias, encuentros literarios) que se realiza cada **noviembre en Loja, Ecuador**, durante
  **11 días**. Primera edición: **2016**.
- **Institucionalizado por ley**: la Asamblea Nacional aprobó el 20 de diciembre de 2018 (101
  votos) la ley que lo hace permanente, obligatorio cada noviembre y con Loja como sede
  permanente. Las actividades las articulan la Presidencia, el Ministerio de Cultura y el
  Municipio de Loja; el financiamiento sale del presupuesto del Ministerio y del GAD de Loja.
- Hoy lo organizan el **Municipio de Loja** y el **Ministerio de Educación, Deporte y Cultura**.
- **Origen**: impulsado por el alcalde Bolívar Castillo y el ministro de Cultura Guillaume Long,
  inspirado en el Festival de Aviñón (Francia) y su división **In** (programación curada en
  salas, en parte con boleto) / **Off** (calles, plazas y parques, acceso libre). Se apoyó en la
  tradición musical de Loja y su candidatura a Ciudad Creativa de la Música de la UNESCO.
- Presentado como ejemplo de **descentralización cultural**; en 2019 el Ministerio señaló un
  recorte del 15 % frente a la primera edición y cuestionó sobreprecios de 2017–2018.

## Componentes (ejes del sitio oficial)

| Eje | Descripción |
|-----|-------------|
| Internacional | Elencos extranjeros, por invitación; cada año hay un país invitado de honor |
| Nacional | Elencos ecuatorianos seleccionados por convocatoria pública ("Programación Nacional", portal de fomento del Ministerio) |
| Camino a Loja | Programa de circulación de las 24 provincias, ejecutado por la Casa de la Cultura Ecuatoriana y sus núcleos; concurso con bases técnicas; no admite propuestas ya presentadas antes |
| Escuela del festival | Talleres y formación |
| Salud + Arte | Eje de arte y bienestar |

## Sedes

Teatro Nacional Benjamín Carrión Mora · Teatro Bolívar · Teatro Segundo Cueva Celi ·
Centro Cultural Alfredo Mora Reyes · Museo de Loja · calles, plazas, parques y centro histórico.

## Boletería

- Funciones pagadas a **USD 5** (2026: 23 obras / 28 funciones con entrada); el resto es gratuito.
- Venta en línea en **cultura.ec** (plataforma externa) y en **taquillas físicas** de los cuatro
  espacios cerrados. El sitio oficial no tiene cuentas de usuario ni venta propia.
- En 2023 la mayoría de las entradas fueron gratuitas.

## Cifras por edición

| Edición | Año | Fechas | Datos |
|---------|-----|--------|-------|
| I | 2016 | una semana, nov | Más de 30 000 visitantes; inversión citada de USD 1,93 M |
| IV | 2019 | nov | Presupuesto USD 1,64 M; Camino a Loja con USD 160 000 |
| VI | 2021 | nov | Edición pospandemia: ≈14 900 asistentes a teatros; 99 % público ecuatoriano y 9 de cada 10 residentes en Loja; quejas principales: ventas informales (49 %) y congestión vehicular (40 %) (Observatorio Turístico UTPL) |
| VIII | 2023 | desde 15 nov | Más de 200 actividades; país invitado **México**; todas las entradas gratuitas con reserva web desde el 1 de noviembre |
| IX | 2024 | 14–23 nov | Más de 300 propuestas en siete componentes; invitado de honor la **Unión Europea** con Alemania, Francia, España e Italia |
| X | 2025 | 13–23 nov | 313 actividades, 116 elencos, 125 obras, 18 países, país invitado **Chile**, 163 162 asistencias, 6 301 trabajadores de la cultura, inversión USD 1,35 M; inauguró "El Amor Brujo" de Falla; Unión Europea como socio |
| XI | 2026 | 12–22 nov | 439 funciones/actividades, 165 elencos, 173 obras, 846 artistas, país invitado **Alemania**, asistencia proyectada 160 000–200 000, inversión USD 750 000 (según Primicias), desfile inaugural "Pinceladas en movimiento" con 11 delegaciones; feriado nacional el 20 nov |

Otras ediciones invitaron a Francia; una edición anterior reunió propuestas de 25 países. En
2026 las fuentes no coinciden en el número de países participantes (10, 12 o 13).

Hallazgos adicionales relevantes para el diseño:
- Algunas funciones gratuitas son **solo para estudiantes** (público restringido).
- El ingreso gratuito está **sujeto al aforo** y a las indicaciones de cada sede.
- Según una tesis de FLACSO sobre 2022, el 82 % de los expositores de la modalidad *Off* se
  dedicaba al comercio y el 13 % al arte.

### Programación destacada 2026 (ejemplos usados en las specs)

- "El Cura sin cabeza" (Cano Artes Escénicas, Ecuador) — inauguración, Teatro Nacional, 12 nov.
- "Zombi Manifiesto" (Santiago Sanguineti, Uruguay) — Teatro Bolívar, 12 nov.
- "Bondi Beach" (Deus Ex Machina, Alemania/Ecuador) — Teatro Bolívar, 13 nov.
- "Cometa" (Roser López Espinosa y Vorpommern Tanz, España/Alemania) — CC Alfredo Mora Reyes, 15 nov, 2 funciones.
- "La Artista" (Los Nadies Circo, Chile) — Teatro Nacional, 19 nov.
- Calle gratuita: Chacovachi (Argentina), Carlos Michelena (Ecuador), Guillari del Diavolo (Italia).
- Exposición "Buddy Bears" en el Museo de Loja, 12–22 nov.

## Implicaciones para el diseño

1. **Picos de carga** muy concentrados (apertura de venta, inauguración) → vista de procesos/física.
2. **Mezcla pagado/gratuito** y aforos distintos por sede → modelo de tipos de acceso.
3. **Ciclo anual por edición** (convocatoria → curaduría → programación → festival → informe) → el
   sistema es multi-edición.
4. **Rendición de cuentas pública** (asistencias, actividades) → módulo de estadísticas.
5. **Varios actores institucionales** (Municipio, Ministerio, CCE) → roles diferenciados.
6. **Modelo de precio variable** entre ediciones (todo gratis en 2023, USD 5 en 2026) → el precio
   es un parámetro de la edición, no una constante.
7. **Programación *Off* sin entradas** → la asistencia en calle solo se puede estimar (conteos).
8. **Público local y móvil** (99 % ecuatoriano, mayoría residente) → diseño móvil primero en español.

## Fuentes

- Hazte Ver Ecuador, historia del festival: <https://hazteverecuador.com/festival-internacional-de-artes-vivas-de-loja-historia-turismo/>
- Observatorio Turístico UTPL, FIAVL 2021: <https://vinculacion.utpl.edu.ec/sites/default/files/inf_obs_turistico_utpl_fiavl2021_febrero_2022_2-4.pdf>
- Delegación UE, IX edición 2024: <https://www.eeas.europa.eu/delegations/ecuador/la-uni%C3%B3n-europea-y-sus-estados-miembros-presentes-en-la-ix-edici%C3%B3n-del-festival-internacional-de_en>
- Metro Ecuador, entradas 2026: <https://www.metroecuador.com.ec/noticias/2026/11/12/festival-de-artes-vivas-de-loja-2026-fechas-precios-de-entradas-y-actividades-gratuitas/>
- Swissinfo, Alemania invitado 2026: <https://www.swissinfo.ch/spa/alemania-ser%C3%A1-el-pa%C3%ADs-invitado-de-honor-al-festival-de-artes-vivas-de-loja,-en-ecuador/91894934>

- Sitio oficial: <https://festivaldeloja.com> · convocatoria: <https://festivaldeloja.com/convocatoria/>
- Primicias, agenda 2026: <https://www.primicias.ec/entretenimiento/cultura/agenda-actividades-festival-internacional-artes-vivas-loja-feriado-noviembre-136925/>
- El Comercio, 2026: <https://www.elcomercio.com/tendencias/cultura/loja-escenario-400-actividade-festival-artes-vivas-2026/>
- El Oriente, balance 2025: <https://www.eloriente.com/articulo/festival-de-loja-2025-reunioacute-a-maacutes-de-163000-asistentes/54169>
- El Comercio, ley 2018: <https://www.elcomercio.com/tendencias/asamblea-aprobacion-proyecto-artes-loja/>
- Asamblea Nacional, proyecto de ley: <https://www.asambleanacional.gob.ec/sites/default/files/artes_vivas.pdf>
- CCE, bases Camino a Loja: <https://casadelacultura.gob.ec/wp-content/uploads/2022/06/Bases-Tecnicas-Camino-a-Loja.pdf>
- El Comercio, Camino a Loja: <https://www.elcomercio.com/tendencias/cce-programa-nacional-camino-loja/>
- Primicias, boletos gratis 2023: <https://primicias.ec/noticias/cultura/agenda-precios-festival-artes-vivas-loja>
- Embajada de España, inauguración 2025: <https://www.exteriores.gob.es/Embajadas/quito/es/Comunicacion/Noticias/Paginas/Articulos/El-Amor-Brujo-de-Manuel-de-Falla-inaugura-el-FIAVL-2025-en-Loja.aspx>
- El Mostrador, Chile invitado 2025: <https://www.elmostrador.cl/cultura/2025/11/13/festival-internacional-de-artes-vivas-de-loja-inicia-su-decima-edicion-con-chile-como-pais-invitado/>
