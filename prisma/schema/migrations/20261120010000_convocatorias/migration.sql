CREATE SCHEMA IF NOT EXISTS "convocatorias";

CREATE TABLE "convocatorias"."convocatoria" (
    "id" UUID NOT NULL,
    "edicion_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "componente" TEXT NOT NULL,
    "provincia" TEXT,
    "abre_en" TIMESTAMPTZ(3) NOT NULL,
    "cierra_en" TIMESTAMPTZ(3) NOT NULL,
    "siguiente_numero" INTEGER NOT NULL DEFAULT 1,
    "max_obras_por_elenco" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    CONSTRAINT "convocatoria_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "convocatoria_siguiente_numero_check" CHECK ("siguiente_numero" > 0),
    CONSTRAINT "convocatoria_max_obras_check" CHECK ("max_obras_por_elenco" > 0),
    CONSTRAINT "convocatoria_estado_check" CHECK ("estado" IN ('borrador', 'abierta', 'cerrada', 'en_evaluacion', 'resultados_publicados')),
    CONSTRAINT "convocatoria_fechas_check" CHECK ("abre_en" < "cierra_en")
);

CREATE TABLE "convocatorias"."criterio" (
    "id" UUID NOT NULL,
    "convocatoria_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "peso" INTEGER NOT NULL,
    CONSTRAINT "criterio_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "criterio_peso_check" CHECK ("peso" BETWEEN 1 AND 100),
    CONSTRAINT "criterio_convocatoria_id_fkey" FOREIGN KEY ("convocatoria_id") REFERENCES "convocatorias"."convocatoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "convocatorias"."elenco" (
    "id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "responsable" TEXT NOT NULL,
    "correo_contacto" TEXT NOT NULL,
    "provincia_pais" TEXT NOT NULL,
    "integrantes" JSONB NOT NULL,
    "trayectoria" TEXT NOT NULL,
    CONSTRAINT "elenco_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "convocatorias"."postulacion" (
    "id" UUID NOT NULL,
    "convocatoria_id" UUID NOT NULL,
    "elenco_id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "obra_fingerprint" TEXT NOT NULL,
    "titulo_obra" TEXT NOT NULL,
    "disciplina" TEXT NOT NULL,
    "sinopsis" TEXT NOT NULL,
    "duracion_min" INTEGER NOT NULL,
    "publico" TEXT NOT NULL,
    "ficha_tecnica" JSONB NOT NULL,
    "video_url" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "enviada_en" TIMESTAMPTZ(3),
    "primera_enviada_en" TIMESTAMPTZ(3),
    "subsanar_hasta" TIMESTAMPTZ(3),
    "puntaje_final" DECIMAL(5,2),
    CONSTRAINT "postulacion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "postulacion_duracion_check" CHECK ("duracion_min" > 0),
    CONSTRAINT "postulacion_puntaje_final_check" CHECK ("puntaje_final" IS NULL OR "puntaje_final" BETWEEN 0 AND 100),
    CONSTRAINT "postulacion_estado_check" CHECK ("estado" IN ('borrador', 'enviada', 'requiere_subsanacion', 'no_admitida', 'admitida', 'en_evaluacion', 'evaluada', 'requiere_deliberacion', 'seleccionada', 'lista_espera', 'no_seleccionada', 'desistida')),
    CONSTRAINT "postulacion_convocatoria_id_fkey" FOREIGN KEY ("convocatoria_id") REFERENCES "convocatorias"."convocatoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "postulacion_elenco_id_fkey" FOREIGN KEY ("elenco_id") REFERENCES "convocatorias"."elenco"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "convocatorias"."documento" (
    "id" UUID NOT NULL,
    "postulacion_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre_original" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "cargado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "documento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "documento_bytes_check" CHECK ("bytes" BETWEEN 1 AND 10000000),
    CONSTRAINT "documento_tipo_check" CHECK ("tipo" IN ('dossier', 'ficha_tecnica', 'autorizacion', 'otro')),
    CONSTRAINT "documento_mime_type_check" CHECK ("mime_type" IN ('application/pdf', 'image/jpeg', 'image/png')),
    CONSTRAINT "documento_postulacion_id_fkey" FOREIGN KEY ("postulacion_id") REFERENCES "convocatorias"."postulacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "convocatorias"."curador" (
    "id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "disciplinas" JSONB NOT NULL,
    "conflictos" JSONB NOT NULL,
    CONSTRAINT "curador_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "convocatorias"."asignacion" (
    "id" UUID NOT NULL,
    "postulacion_id" UUID NOT NULL,
    "curador_id" UUID NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'asignada',
    "asignada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asignacion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "asignacion_estado_check" CHECK ("estado" IN ('asignada', 'en_evaluacion', 'completada', 'reasignada')),
    CONSTRAINT "asignacion_postulacion_id_fkey" FOREIGN KEY ("postulacion_id") REFERENCES "convocatorias"."postulacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "asignacion_curador_id_fkey" FOREIGN KEY ("curador_id") REFERENCES "convocatorias"."curador"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "convocatorias"."evaluacion" (
    "id" UUID NOT NULL,
    "asignacion_id" UUID NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "puntaje" DECIMAL(5,2),
    "observaciones" TEXT,
    "enviada_en" TIMESTAMPTZ(3),
    CONSTRAINT "evaluacion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "evaluacion_puntaje_check" CHECK ("puntaje" IS NULL OR "puntaje" BETWEEN 0 AND 100),
    CONSTRAINT "evaluacion_estado_check" CHECK ("estado" IN ('borrador', 'enviada', 'reabierta')),
    CONSTRAINT "evaluacion_asignacion_id_fkey" FOREIGN KEY ("asignacion_id") REFERENCES "convocatorias"."asignacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "convocatorias"."calificacion" (
    "id" UUID NOT NULL,
    "evaluacion_id" UUID NOT NULL,
    "criterio_id" UUID NOT NULL,
    "puntaje" INTEGER NOT NULL,
    CONSTRAINT "calificacion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calificacion_puntaje_check" CHECK ("puntaje" BETWEEN 0 AND 100),
    CONSTRAINT "calificacion_evaluacion_id_fkey" FOREIGN KEY ("evaluacion_id") REFERENCES "convocatorias"."evaluacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "calificacion_criterio_id_fkey" FOREIGN KEY ("criterio_id") REFERENCES "convocatorias"."criterio"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "convocatorias"."auditoria" (
    "id" UUID NOT NULL,
    "actor_cuenta_id" UUID,
    "postulacion_id" UUID NOT NULL,
    "accion" TEXT NOT NULL,
    "estado_anterior" TEXT,
    "estado_nuevo" TEXT,
    "motivo" TEXT,
    "correlacion_id" UUID,
    "registrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auditoria_postulacion_id_fkey" FOREIGN KEY ("postulacion_id") REFERENCES "convocatorias"."postulacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "convocatorias"."historial_obra_camino" (
    "id" UUID NOT NULL,
    "obra_fingerprint" TEXT NOT NULL,
    "edicion_anio" INTEGER NOT NULL,
    "registrada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referencia_fuente" TEXT NOT NULL,
    CONSTRAINT "historial_obra_camino_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "historial_obra_camino_edicion_anio_check" CHECK ("edicion_anio" > 0)
);

CREATE UNIQUE INDEX "convocatoria_codigo_key" ON "convocatorias"."convocatoria"("codigo");
CREATE UNIQUE INDEX "criterio_convocatoria_id_nombre_key" ON "convocatorias"."criterio"("convocatoria_id", "nombre");
CREATE INDEX "elenco_cuenta_id_idx" ON "convocatorias"."elenco"("cuenta_id");
CREATE UNIQUE INDEX "postulacion_convocatoria_id_numero_key" ON "convocatorias"."postulacion"("convocatoria_id", "numero");
CREATE UNIQUE INDEX "postulacion_convocatoria_id_obra_fingerprint_key" ON "convocatorias"."postulacion"("convocatoria_id", "obra_fingerprint");
CREATE INDEX "postulacion_elenco_id_convocatoria_id_idx" ON "convocatorias"."postulacion"("elenco_id", "convocatoria_id");
CREATE INDEX "postulacion_estado_subsanar_hasta_idx" ON "convocatorias"."postulacion"("estado", "subsanar_hasta");
CREATE UNIQUE INDEX "documento_object_key_key" ON "convocatorias"."documento"("object_key");
CREATE INDEX "documento_postulacion_id_idx" ON "convocatorias"."documento"("postulacion_id");
CREATE UNIQUE INDEX "curador_cuenta_id_key" ON "convocatorias"."curador"("cuenta_id");
CREATE UNIQUE INDEX "asignacion_postulacion_id_curador_id_key" ON "convocatorias"."asignacion"("postulacion_id", "curador_id");
CREATE INDEX "asignacion_curador_id_estado_idx" ON "convocatorias"."asignacion"("curador_id", "estado");
CREATE UNIQUE INDEX "evaluacion_asignacion_id_key" ON "convocatorias"."evaluacion"("asignacion_id");
CREATE UNIQUE INDEX "calificacion_evaluacion_id_criterio_id_key" ON "convocatorias"."calificacion"("evaluacion_id", "criterio_id");
CREATE INDEX "auditoria_postulacion_id_registrado_en_idx" ON "convocatorias"."auditoria"("postulacion_id", "registrado_en");
CREATE UNIQUE INDEX "historial_obra_camino_obra_fingerprint_key" ON "convocatorias"."historial_obra_camino"("obra_fingerprint");
