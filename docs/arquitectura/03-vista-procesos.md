# Vista de procesos

Describe lo que ocurre **en tiempo de ejecución**: los procesos, cómo se comunican, cómo se
resuelve la concurrencia y cómo se comporta el sistema en los picos del festival.

## 1. Procesos en ejecución

```mermaid
flowchart LR
    subgraph Navegadores
        B1["Visitante / asistente"]
        B2["Personal (paneles)"]
        B3["Validador PWA<br/>Service Worker + IndexedDB"]
    end
    CDN["CDN<br/>páginas ISR cacheadas"]
    subgraph Servidor
        WEB["Proceso web<br/>Next.js (SSR / ISR)"]
        API1["Proceso API #1<br/>NestJS"]
        API2["Proceso API #2<br/>NestJS"]
        WRK["Proceso worker<br/>consumidores de colas · trabajos"]
    end
    PG[("PostgreSQL<br/>5 esquemas + colas pg-boss")]

    B1 --> CDN --> WEB
    B1 & B2 & B3 --> API1 & API2
    WEB --> API1 & API2
    API1 & API2 --> PG
    WRK --> PG
    WRK -. revalidar páginas .-> WEB
```

| Proceso | Instancias | Hace | Si falla |
|---------|-----------|------|----------|
| web | 1+ | Renderiza cartelera y paneles | La CDN sigue sirviendo la última versión |
| api | 2+ | Atiende peticiones HTTP; escribe datos y encola eventos en la misma transacción | La otra réplica atiende |
| worker | 1 | Consume colas, ejecuta trabajos programados | Los eventos esperan en la cola; nada se pierde |
| validador | 1 por puerta | Valida QR localmente | Sigue sin red; sincroniza al volver |

### Trabajos programados (worker)

| Trabajo | Frecuencia | Spec |
|---------|-----------|------|
| Liberar retenciones vencidas (10 min) | cada 30 s | 002 FR-004 |
| Liberar reservas no validadas (10 min antes) | cada minuto | 002 FR-013 |
| Conciliar pagos pendientes | cada 2 min | ADR-0007 |
| Marcar funciones finalizadas | cada 5 min | 004 ciclo de función |
| Recalcular indicadores | cada 5 min en festival | 004 RNF-003 |
| Reintentar notificaciones fallidas | espera creciente hasta 24 h | 004 US10 |
| Cerrar edición | diario | 004 RN-007 |

## 2. Eventos de dominio: cola transaccional ([ADR-0003](../adr/0003-eventos-outbox.md))

```mermaid
sequenceDiagram
    autonumber
    participant UC as Caso de uso (Operación)
    participant DB as PostgreSQL
    participant WK as Worker (pg-boss)
    participant C1 as Consumidor Boletería
    participant C2 as Consumidor Programación
    UC->>DB: BEGIN · actualizar función · encolar FuncionCancelada para cada consumidor · COMMIT
    Note over UC,DB: Si la transacción se revierte, el evento no existe
    loop sondeo de colas
        WK->>DB: tomar trabajos pendientes (SKIP LOCKED)
    end
    WK->>C1: FuncionCancelada
    C1->>C1: ¿id ya procesado? no → anular entradas
    WK->>C2: FuncionCancelada
    C2->>C2: actualizar proyección y revalidar páginas
    C1-->>DB: marcar completado (o reintentar con espera creciente)
    Note over C1,C2: Consumo idempotente: un evento repetido se descarta
```

## 3. Compra de entradas (spec 002, US1)

```mermaid
sequenceDiagram
    autonumber
    actor A as Asistente
    participant W as Web
    participant API as API · Boletería
    participant DB as PostgreSQL
    participant PP as Proveedor de pagos
    participant WK as Worker
    A->>W: Elegir función y cantidad (3)
    W->>API: POST /pedidos (Idempotency-Key)
    API->>DB: UPDATE inventario SET retenidos += 3 WHERE disponibles >= 3
    alt sin lugares
        DB-->>API: 0 filas
        API-->>W: 409 Agotado / solo quedan N
    else lugares retenidos
        API->>DB: crear Pedido pendiente (vence en 10 min)
        API->>PP: iniciar cobro (USD 15,00)
        PP-->>API: URL de pago
        API-->>W: redirigir a pago
        A->>PP: Paga
        PP->>API: webhook firmado: aprobado
        API->>DB: BEGIN · Pedido pagado · emitidos += 3, retenidos -= 3 · 3 Entradas con QR firmado · encolar EntradasEmitidas · COMMIT
        API-->>PP: 200 OK
        WK->>WK: Identidad envía correo con entradas
        WK->>WK: Programación actualiza disponibilidad
    end
    opt no llega confirmación en 10 min
        WK->>DB: Pedido expirado · retenidos -= 3
    end
```

## 4. Validación de ingreso sin conexión (spec 002, US2)

```mermaid
sequenceDiagram
    autonumber
    actor V as Validador
    participant P as PWA (IndexedDB)
    participant API as API · Boletería
    V->>P: Abrir función de las 19:00
    P->>API: Descargar lista de entradas + llave pública
    API-->>P: lista (ids, estados) y llave Ed25519
    Note over P: Se corta internet
    V->>P: Escanear QR
    P->>P: Verificar firma Ed25519
    P->>P: ¿Entrada en lista y no usada localmente?
    alt válida
        P-->>V: VERDE · guardar ingreso en cola local
    else usada, anulada u otra función
        P-->>V: ROJO con motivo
    end
    Note over P: Vuelve internet
    P->>API: Sincronizar ingresos (idempotente)
    API->>API: Conservar el primer ingreso por hora
    API-->>P: Conflictos (si dos puertas aceptaron la misma entrada)
    API->>API: encolar ConflictoDeIngreso → incidencia en Operación
```

## 5. Ciclos de vida

### Pedido (Boletería)

```mermaid
stateDiagram-v2
    [*] --> Pendiente: lugares retenidos
    Pendiente --> Pagado: pago aprobado
    Pendiente --> Fallido: pago rechazado
    Pendiente --> Expirado: 10 min sin confirmación
    Pagado --> Reembolsado: devolución confirmada
    [*] --> Confirmado: reserva gratuita
    Fallido --> [*]
    Expirado --> [*]
    Reembolsado --> [*]
```

### Entrada (Boletería)

```mermaid
stateDiagram-v2
    [*] --> Valida: pedido pagado o reserva
    Valida --> Usada: validación en puerta
    Valida --> Anulada: cancelación, devolución
    Valida --> Liberada: reserva sin validar 10 min antes
    Usada --> [*]
    Anulada --> [*]
    Liberada --> [*]
```

### Función (Operación)

```mermaid
stateDiagram-v2
    [*] --> Borrador
    Borrador --> Programada: publicación
    Programada --> Reprogramada: cambio con motivo
    Reprogramada --> Reprogramada: nuevo cambio
    Programada --> Cancelada: cancelación con motivo
    Reprogramada --> Cancelada: cancelación con motivo
    Programada --> Finalizada: pasa la hora de fin
    Reprogramada --> Finalizada: pasa la hora de fin
    Cancelada --> [*]
    Finalizada --> [*]
```

### Postulación (Convocatorias)

```mermaid
stateDiagram-v2
    [*] --> Borrador
    Borrador --> Enviada: envía completa
    Enviada --> Borrador: retira antes del cierre
    Enviada --> Subsanacion: falta un requisito
    Subsanacion --> Enviada: corrige en 72 h
    Subsanacion --> NoAdmitida: vence el plazo
    Enviada --> NoAdmitida: no cumple
    Enviada --> EnEvaluacion: admitida
    EnEvaluacion --> Evaluada: evaluaciones completas
    Evaluada --> Seleccionada: dentro de cupo
    Evaluada --> ListaEspera: reserva
    Evaluada --> NoSeleccionada: fuera de cupo
    ListaEspera --> Seleccionada: desiste un seleccionado
    Seleccionada --> Desistida: elenco desiste
    NoAdmitida --> [*]
    NoSeleccionada --> [*]
    Desistida --> [*]
```

## 6. Concurrencia y consistencia

| Situación | Riesgo | Solución |
|-----------|--------|----------|
| Web y taquilla venden el último lugar | Sobreventa | `UPDATE` atómico condicional ([ADR-0004](../adr/0004-control-de-aforo.md)) |
| Doble clic en "pagar" o reintento | Cobro o pedido duplicado | Clave de idempotencia única por pedido |
| Webhook de pago repetido | Entradas duplicadas | Procesamiento idempotente por referencia del proveedor |
| Dos programadores editan la misma función | Sobrescritura silenciosa | Bloqueo optimista con campo `version` |
| Evento entregado dos veces | Acción repetida | Consumidores registran ids procesados |
| Dos validadores sin red aceptan el mismo QR | Doble ingreso | Primer ingreso gana, conflicto alertado |
| Asignación de curadores concurrente | Carga desbalanceada | Transacción serializable en la asignación |

## 7. Comportamiento en picos

```mermaid
flowchart TB
    PICO["Pico: apertura de venta<br/>o noche de inauguración"] --> C1{"¿Petición de cartelera?"}
    C1 -- sí --> CDN["CDN responde<br/>sin tocar el servidor"]
    C1 -- no --> C2{"¿Compra o reserva?"}
    C2 -- sí --> LIM["Límite de tasa por IP en Nginx"] --> ATOM["Retención atómica"] --> OK["Respuesta < 2 s"]
    C2 -- no --> API["API normal"]
    ATOM -. pesado .-> WK["Correos y estadísticas<br/>van al worker, no bloquean"]
```

| Momento | Carga esperada | Táctica |
|---------|----------------|---------|
| Apertura de venta | Ráfagas de compra sobre pocas funciones | Retención atómica, límite de tasa, cola de correos |
| Inauguración y clausura | Miles consultando la cartelera a la vez | CDN + ISR, disponibilidad aparte cada 15 s |
| Entrada a sala | 300 personas en 15 min por sala | Validación local en la PWA |
| Cierre de convocatoria | ~500 envíos por hora | Borradores guardados, subida de archivos directa al almacenamiento |
