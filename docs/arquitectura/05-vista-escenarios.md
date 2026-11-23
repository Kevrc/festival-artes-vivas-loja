# Vista de escenarios (+1)

Los escenarios unen las otras cuatro vistas: cada uno recorre módulos (lógica), código y dueños
(desarrollo), procesos y eventos (procesos) y nodos (física). Se derivan de las historias **P1**
de las specs y son el guion de la demostración del video.

## 1. Casos de uso por actor

```mermaid
flowchart LR
    VIS(["Visitante"])
    ASI(["Asistente"])
    POS(["Postulante / Elenco"])
    CUR(["Curador"])
    COO(["Coordinación"])
    PRG(["Programador"])
    TAQ(["Taquilla"])
    VAL(["Validador"])
    DIR(["Dirección"])
    ADM(["Administrador"])

    subgraph Plataforma FIAVL
        U1["Consultar cartelera y filtrar"]
        U2["Ver qué hay cerca ahora"]
        U3["Armar mi agenda"]
        U4["Comprar o reservar entradas"]
        U5["Postular una obra"]
        U6["Evaluar postulaciones"]
        U7["Publicar resultados"]
        U8["Programar funciones"]
        U9["Reprogramar o cancelar"]
        U10["Vender en taquilla y cerrar caja"]
        U11["Validar ingreso"]
        U12["Ver estadísticas e informe"]
        U13["Gestionar cuentas y roles"]
    end

    VIS --> U1 & U2 & U3
    ASI --> U4 & U3
    POS --> U5
    CUR --> U6
    COO --> U7
    PRG --> U8 & U9
    TAQ --> U10
    VAL --> U11
    DIR --> U12
    ADM --> U13
```

## 2. Escenarios y cobertura de vistas

| # | Escenario | Historias | Lógica | Desarrollo | Procesos | Física |
|---|-----------|-----------|:------:|:----------:|:--------:|:------:|
| E1 | De la convocatoria a la cartelera | 003-US1, 003-US3, 003-US4, 004-US1, 004-US2, 001-US1 | ● | ● | ● | ○ |
| E2 | Compra en hora pico sin sobreventa | 001-US1, 002-US1 | ● | ○ | ● | ● |
| E3 | Ingreso a sala sin internet | 002-US2 | ○ | ○ | ● | ● |
| E4 | Cancelación por lluvia | 004-US3, 002-US5, 004-US10, 001-US1 | ● | ○ | ● | ○ |

### E1 — De la convocatoria a la cartelera

Una compañía de Azuay postula, es evaluada por dos curadores, queda seleccionada y su función
aparece en la cartelera.

```mermaid
sequenceDiagram
    autonumber
    actor E as Elenco (Azuay)
    actor C as Curadores (2)
    actor K as Coordinación
    actor P as Programador
    participant CON as Convocatorias
    participant OPE as Operación
    participant PRO as Programación
    participant IDE as Identidad
    E->>CON: Enviar postulación PN-2026-0042
    CON-->>IDE: PostulacionEnviada → acuse por correo
    K->>CON: Admitir y asignar 2 curadores sin conflicto
    C->>CON: Calificar (79,00 y 85,00)
    CON->>CON: Puntaje final 82,00 (RN-002)
    K->>CON: Aprobar seleccionados y publicar resultados
    CON-->>IDE: ResultadoPublicado → correo al elenco
    CON-->>OPE: PostulacionSeleccionada (obra + ficha técnica)
    P->>OPE: Programar función en Teatro Segundo Cueva Celi, 16 nov 19:00
    OPE->>OPE: Verificar cruces de sede y de elenco (RN-001)
    P->>OPE: Publicar
    OPE-->>PRO: FuncionProgramada
    PRO->>PRO: Actualizar proyección y revalidar página del 16 nov
```

**Valida**: fronteras entre módulos por eventos (ADR-0003), cálculo de puntajes, regla de cruces,
proyección de lectura de la cartelera.

### E2 — Compra en hora pico sin sobreventa

Se abre la venta de "La Artista" (Los Nadies Circo, Chile), Teatro Nacional, aforo habilitado 800.
En el primer minuto llegan 1 500 intentos de compra.

```mermaid
sequenceDiagram
    autonumber
    actor M as 1 500 asistentes
    participant CDN as CDN
    participant NGX as Nginx (límite de tasa)
    participant API as API x2 · Boletería
    participant DB as PostgreSQL
    M->>CDN: Ver ficha de la función
    CDN-->>M: Página cacheada (sin tocar el servidor)
    M->>NGX: POST /pedidos (1 500 en 60 s)
    NGX->>API: Reparte entre 2 réplicas
    par cada petición
        API->>DB: UPDATE ... WHERE disponibles >= n
    end
    DB-->>API: Las primeras retenciones hasta completar 800 lugares tienen éxito
    DB-->>API: El resto: 0 filas
    API-->>M: Pago para los que retuvieron · "Agotado" para el resto
    Note over DB: Invariante: emitidos + retenidos ≤ 800 siempre
```

**Valida**: ADR-0004, ADR-0006, ADR-0008; SC-001 de la spec 002 (cero sobreventa).

### E3 — Ingreso a sala sin internet

Teatro Bolívar, "Zombi Manifiesto", 300 entradas, 3 validadores; se cae el wifi a las 18:50.

```mermaid
sequenceDiagram
    autonumber
    actor V1 as Validador 1
    actor V2 as Validador 2
    participant P1 as PWA 1
    participant P2 as PWA 2
    participant API as Boletería
    V1->>P1: Abrir función (lista descargada a las 18:00)
    V2->>P2: Abrir función (lista descargada a las 18:00)
    Note over P1,P2: 18:50 sin internet
    V1->>P1: Escanear entrada A
    P1-->>V1: VERDE (firma y lista OK)
    V2->>P2: Escanear entrada A (foto compartida)
    P2-->>V2: VERDE (no sabe del otro dispositivo)
    Note over P1,P2: 19:20 vuelve internet
    P1->>API: Sincronizar (A a las 18:52)
    P2->>API: Sincronizar (A a las 18:55)
    API->>API: Primer ingreso gana (18:52)
    API-->>P2: Conflicto en A
    API->>API: ConflictoDeIngreso → incidencia para Operación
```

**Valida**: ADR-0005, riesgo aceptado y detectado; SC-003 de la spec 002.

### E4 — Cancelación por lluvia

Una función al aire libre con reserva se cancela a las 16:00 por tormenta.

```mermaid
sequenceDiagram
    autonumber
    actor P as Programador
    participant OPE as Operación
    participant OB as Cola en PostgreSQL
    participant BOL as Boletería
    participant IDE as Identidad
    participant PRO as Programación
    actor A as Asistentes con reserva
    P->>OPE: Cancelar función (motivo: lluvia)
    OPE->>OPE: Estado Cancelada + CambioFuncion + auditoría
    OPE->>OB: FuncionCancelada (misma transacción)
    OB->>BOL: FuncionCancelada
    BOL->>BOL: Anular entradas · iniciar devoluciones si hubo pago
    BOL->>OB: PedidoReembolsado (por cada pedido pagado)
    OB->>IDE: FuncionCancelada + destinatarios
    IDE->>A: Correo "Función cancelada" (sin duplicados)
    OB->>PRO: FuncionCancelada
    PRO->>PRO: Marcar cancelada · revalidar páginas en < 1 min
```

**Valida**: ADR-0003 (sin pérdida de eventos), consistencia eventual dentro de 1 minuto,
idempotencia de notificaciones.

## 3. Guion de demostración para el video

El guion completo, con el texto de cada integrante y lo que se muestra en pantalla, está en
[guion-video.md](../guion-video.md).
