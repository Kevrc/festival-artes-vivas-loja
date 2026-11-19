# Vista lógica

Describe **qué** hace el sistema en términos del dominio del festival: los módulos, sus
responsabilidades, cómo se comunican y los conceptos de cada uno. Base: [`docs/dominio.md`](../dominio.md).

## 1. Módulos y dependencias

```mermaid
flowchart LR
    subgraph Clientes
        PUB["Web pública<br/>(visitantes, asistentes)"]
        PAN["Paneles del personal<br/>(programación, curaduría, taquilla)"]
        VAL["Validador PWA<br/>(puerta de sala)"]
    end

    subgraph Plataforma["Plataforma FIAVL (monolito modular)"]
        PRO["Programación<br/>cartelera · spec 001"]
        BOL["Boletería<br/>entradas y acceso · spec 002"]
        CON["Convocatorias<br/>postulación y curaduría · spec 003"]
        OPE["Operación<br/>agenda y estadísticas · spec 004"]
        IDE["Identidad<br/>cuentas, roles, avisos · spec 004<br/><i>todos los módulos le consultan<br/>quién es el usuario y qué puede hacer</i>"]
        BUS{{"Eventos de dominio<br/>(outbox + colas)"}}
    end

    PAG[("Proveedor de pagos")]
    COR[("Proveedor de correo")]
    MAP[("Proveedor de mapas")]

    PUB --> PRO & BOL & CON & IDE
    PAN --> OPE & CON & BOL & IDE
    VAL --> BOL

    CON -- publica --> BUS
    OPE -- publica --> BUS
    BOL -- publica --> BUS
    IDE -- publica --> BUS
    BUS -- consume --> PRO & BOL & OPE & IDE

    BOL <--> PAG
    IDE --> COR
    PUB --> MAP
```

| Módulo | Responsabilidad | Dueño de | No hace |
|--------|-----------------|----------|---------|
| Programación | Publicar la cartelera y la agenda personal | Proyección de lectura de funciones, favoritos | No crea funciones (solo las refleja) |
| Boletería | Vender, reservar, validar, devolver | Inventario, pedidos, entradas, ingresos, pagos, cajas | No decide horarios ni aforos |
| Convocatorias | Recibir y evaluar postulaciones | Convocatorias, postulaciones, evaluaciones, curadores | No programa funciones |
| Operación | Armar y cambiar la agenda; rendir cuentas | Ediciones, sedes, obras, elencos, funciones, incidencias, indicadores | No cobra ni envía correos |
| Identidad | Identificar, autorizar y avisar | Cuentas, roles, sesiones, consentimientos, notificaciones | No conoce reglas de negocio de otros módulos |

## 2. Estructura interna de cada módulo (hexagonal)

Todos los módulos siguen la misma forma; el dominio no depende de frameworks ni de la base de datos.

```mermaid
flowchart LR
    subgraph Entrada["Adaptadores de entrada"]
        HTTP["Controladores HTTP"]
        CONS["Consumidores de eventos"]
        JOBS["Trabajos programados"]
    end
    subgraph Aplicacion["Aplicación"]
        CU["Casos de uso<br/>(p. ej. ComprarEntradas)"]
        PU["Puertos<br/>(interfaces)"]
    end
    subgraph Dominio
        ENT["Entidades y agregados"]
        REG["Reglas de negocio<br/>(RN-xxx de la spec)"]
        EVD["Eventos de dominio"]
    end
    subgraph Salida["Adaptadores de salida"]
        REPO["Repositorios<br/>(esquema propio)"]
        OUT["Outbox"]
        EXT["Clientes externos<br/>(pagos, correo)"]
    end
    HTTP & CONS & JOBS --> CU
    CU --> ENT & REG
    ENT --> EVD
    CU --> PU
    PU -. implementado por .-> REPO & OUT & EXT
```

## 3. Modelo de cada contexto

### Programación (proyección de lectura)

```mermaid
classDiagram
    class FuncionCartelera {
        funcionId
        fechaInicio
        fechaFin
        tipoAcceso
        estado
        disponibilidad
        horarioAnterior
    }
    class ObraCartelera {
        obraId
        titulo
        disciplina
        edadRecomendada
        elenco
        pais
        componente
    }
    class SedeCartelera {
        sedeId
        nombre
        tipo
        coordenadas
        accesibilidad
    }
    class Favorito {
        titular
        funcionId
        creadoEn
    }
    FuncionCartelera "*" --> "1" ObraCartelera
    FuncionCartelera "*" --> "1" SedeCartelera
    Favorito "*" --> "1" FuncionCartelera
```

### Boletería

```mermaid
classDiagram
    class InventarioFuncion {
        funcionId
        aforoHabilitado
        retenidos
        emitidos
        usados
        disponibles()
        retener(n)
    }
    class Pedido {
        pedidoId
        canal
        cantidad
        importeCentavos
        estado
        claveIdempotencia
        venceEn
        confirmarPago()
        expirar()
    }
    class Entrada {
        entradaId
        tokenQR
        codigoCorto
        estado
        usar()
        anular()
    }
    class Ingreso {
        fechaHora
        validador
        dispositivo
        diferido
    }
    class Pago {
        referenciaProveedor
        importeCentavos
        resultado
    }
    class Caja {
        vendedor
        sede
        apertura
        cierre
        efectivoDeclarado
        cerrar()
    }
    InventarioFuncion "1" --> "*" Pedido
    Pedido "1" --> "*" Entrada
    Pedido "1" --> "0..*" Pago
    Entrada "1" --> "0..1" Ingreso
    Caja "1" --> "*" Pedido : ventas de taquilla
```

### Convocatorias

```mermaid
classDiagram
    class Convocatoria {
        edicion
        componente
        provincia
        apertura
        cierre
        cupos
        estado
        abierta()
    }
    class Criterio {
        nombre
        peso
    }
    class Postulacion {
        numero
        estado
        puntajeFinal
        enviar()
        subsanar()
        seleccionar()
    }
    class Elenco {
        nombre
        responsable
        provinciaOPais
    }
    class Documento {
        tipo
        archivoOEnlace
    }
    class Curador {
        disciplinas
        conflictos
    }
    class Evaluacion {
        calificaciones
        observaciones
        estado
        puntaje()
    }
    Convocatoria "1" *-- "1..*" Criterio
    Convocatoria "1" --> "*" Postulacion
    Elenco "1" --> "*" Postulacion
    Postulacion "1" *-- "*" Documento
    Postulacion "1" --> "*" Evaluacion
    Curador "1" --> "*" Evaluacion
```

### Operación

```mermaid
classDiagram
    class Edicion {
        numero
        anio
        fechas
        paisInvitado
        precioCentavos
        estado
        publicar()
        cerrar()
    }
    class Sede {
        nombre
        tipo
        aforo
        montajeMin
        accesibilidad
    }
    class Elenco {
        nombre
        pais
        componente
    }
    class Obra {
        titulo
        disciplina
        duracionMin
        edadRecomendada
    }
    class Funcion {
        inicio
        fin
        tipoAcceso
        aforoHabilitado
        estado
        version
        reprogramar()
        cancelar()
    }
    class CambioFuncion {
        tipo
        anterior
        nuevo
        motivo
        autor
    }
    class Incidencia {
        tipo
        afectaPublico
        estado
    }
    class ConteoEstimado {
        cantidad
        metodo
    }
    Edicion "1" --> "*" Funcion
    Elenco "1" --> "*" Obra
    Obra "1" --> "*" Funcion
    Sede "1" --> "*" Funcion
    Funcion "1" --> "*" CambioFuncion
    Funcion "1" --> "*" Incidencia
    Funcion "1" --> "0..1" ConteoEstimado
```

### Identidad

```mermaid
classDiagram
    class Cuenta {
        correo
        nombre
        estado
        verificar()
        bloquear()
        anonimizar()
    }
    class Credencial {
        hashContrasena
        segundoFactor
    }
    class Sesion {
        dispositivo
        ultimaActividad
        expira
    }
    class RolAsignado {
        rol
        alcanceTipo
        alcanceId
    }
    class Consentimiento {
        documento
        version
        aceptadoEn
    }
    class Notificacion {
        plantilla
        claveDedup
        estado
        intentos
    }
    Cuenta "1" *-- "1" Credencial
    Cuenta "1" --> "*" Sesion
    Cuenta "1" --> "*" RolAsignado
    Cuenta "1" --> "*" Consentimiento
    Cuenta "1" --> "*" Notificacion
```

## 4. Contratos entre módulos

| Contrato | Tipo | Proveedor | Consumidores | Ubicación |
|----------|------|-----------|--------------|-----------|
| API pública de cartelera | HTTP (lectura) | Programación | Web pública | `specs/001-*/contracts/` |
| API de boletería | HTTP | Boletería | Web, taquilla, validador | `specs/002-*/contracts/` |
| API de convocatorias | HTTP | Convocatorias | Web, paneles | `specs/003-*/contracts/` |
| API de operación | HTTP | Operación | Paneles | `specs/004-*/contracts/` |
| `AutorizacionPort` | Interfaz interna | Identidad | Todos | `packages/contracts` |
| Eventos de dominio | Mensajes versionados | Cada módulo | Ver catálogo | `packages/contracts/eventos` |

Todo evento lleva `id`, `tipo`, `version`, `ocurridoEn`, `edicionId` y `correlacionId`.
