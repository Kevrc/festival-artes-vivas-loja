# Vista de desarrollo

Describe cómo se **organiza el código**, quién es dueño de cada parte, qué puede depender de qué
y cómo el equipo integra su trabajo. Tecnología según [ADR-0002](../adr/0002-stack-por-necesidades.md).

## 1. Estructura del monorepo

```
festival-artes-vivas-loja/
├── apps/
│   ├── api/                      # NestJS: HTTP + arranque de módulos
│   │   └── src/modules/
│   │       ├── programacion/     # spec 001
│   │       ├── boleteria/        # spec 002
│   │       ├── convocatorias/    # spec 003
│   │       ├── operacion/        # spec 004 (A)
│   │       └── identidad/        # spec 004 (B)
│   │           ├── domain/       # entidades, reglas, eventos (sin frameworks)
│   │           ├── application/  # casos de uso y puertos
│   │           ├── infrastructure/ # repositorios, cola de eventos, clientes externos
│   │           └── interface/    # controladores HTTP, consumidores, trabajos
│   ├── worker/                   # mismo código, arranca consumidores de colas y trabajos
│   └── web/                      # Next.js: cartelera, paneles y validador PWA
│       └── src/app/
│           ├── (publico)/        # cartelera, fichas, convocatorias abiertas, mis entradas
│           ├── (panel)/          # programación, curaduría, taquilla, estadísticas
│           └── validador/        # PWA con service worker
├── packages/
│   ├── contracts/                # DTO, eventos versionados, AutorizacionPort
│   ├── ui/                       # componentes accesibles compartidos
│   └── config/                   # eslint, tsconfig, prettier
├── prisma/                       # un esquema por módulo
├── docker/                       # docker-compose y Dockerfiles
├── docs/                         # arquitectura 4+1, ADR, dominio, investigación
└── specs/                        # spec-kit: spec, plan, tasks, contratos
```

## 2. Paquetes y dependencias permitidas

```mermaid
flowchart TB
    subgraph apps
        WEB["apps/web"]
        API["apps/api"]
        WRK["apps/worker"]
    end
    subgraph modulos["apps/api/src/modules"]
        PRO["programacion"]
        BOL["boleteria"]
        CON["convocatorias"]
        OPE["operacion"]
        IDE["identidad"]
    end
    subgraph packages
        CTR["packages/contracts"]
        UI["packages/ui"]
        CFG["packages/config"]
    end

    WEB --> CTR & UI
    API --> PRO & BOL & CON & OPE & IDE
    WRK --> PRO & BOL & CON & OPE & IDE
    PRO & BOL & CON & OPE & IDE --> CTR
    WEB & API & WRK -.-> CFG
```

**Reglas de dependencia** (verificadas en la CI con `eslint-plugin-boundaries` o `dependency-cruiser`):

1. Un módulo **no importa** código de otro módulo; solo de `packages/contracts`.
2. Dentro de un módulo: `interface → application → domain`; `infrastructure` implementa los puertos
   de `application`. `domain` no importa nada externo.
3. `apps/web` solo habla con el API por HTTP usando los tipos de `packages/contracts`.
4. Cada módulo solo accede a su esquema de PostgreSQL (`programacion`, `boleteria`,
   `convocatorias`, `operacion`, `identidad`).

```mermaid
flowchart LR
    I["interface<br/>controladores, consumidores"] --> A["application<br/>casos de uso, puertos"]
    A --> D["domain<br/>entidades, reglas, eventos"]
    INF["infrastructure<br/>Prisma, cola pg-boss, clientes"] -. implementa .-> A
    INF --> D
```

## 3. Responsables

| Área | Spec | Responsable (propuesta) | Revisor suplente |
|------|------|-------------------------|------------------|
| `modules/programacion` + `web/(publico)` | 001 | @jeimytorresg | @Kevrc |
| `modules/boleteria` + `web/validador` + taquilla | 002 | @By-Alvarez06 | @jeimytorresg |
| `modules/convocatorias` + curaduría | 003 | @Carlos2190 | @By-Alvarez06 |
| `modules/operacion` + `modules/identidad` + estadísticas | 004 | @Kevrc | @Carlos2190 |
| `packages/*`, `docker/`, CI, `docs/arquitectura` | transversal | rotativo | todos |

Cada integrante construye **su módulo de punta a punta** (dominio, API y pantallas), así todos
tienen commits en backend, frontend y documentación.

## 4. Flujo de ramas

```mermaid
gitGraph
    commit id: "specs v0.1"
    branch "docs/arquitectura-4-1"
    commit id: "ADR + vistas"
    checkout main
    merge "docs/arquitectura-4-1" tag: "v0.2-arquitectura"
    branch "002-boleteria-entradas"
    commit id: "plan 002"
    commit id: "aforo atomico"
    checkout main
    branch "001-cartelera-programacion"
    commit id: "plan 001"
    commit id: "cartelera del dia"
    checkout main
    merge "002-boleteria-entradas"
    merge "001-cartelera-programacion"
    commit id: "v1.0" tag: "v1.0-entrega"
```

- `main` protegida: PR con 1 aprobación (2 en Boletería e Identidad), historial lineal, sin *force push*.
- Una rama por spec (`001-…` a `004-…`); cambios compartidos en ramas `docs/…` o `chore/…`.
- Commits en español con Conventional Commits, ámbito = módulo.

## 5. Integración continua

```mermaid
flowchart LR
    PR["Pull Request"] --> LINT["Lint y formato"]
    LINT --> TYPES["Chequeo de tipos"]
    TYPES --> BOUND["Reglas de dependencia<br/>entre módulos"]
    BOUND --> UNIT["Pruebas unitarias<br/>cobertura dominio ≥ 80 %"]
    UNIT --> INT["Pruebas de integración<br/>con PostgreSQL real (Testcontainers)"]
    INT --> CTRT["Pruebas de contrato<br/>de eventos y API"]
    CTRT --> A11Y["Accesibilidad<br/>páginas públicas"]
    A11Y --> OK{"¿Todo en verde?"}
    OK -- sí --> REV["Revisión y fusión"]
    OK -- no --> FIX["Corregir en la rama"]
```

Corresponde a las puertas de calidad Q1–Q8 de la constitución.
