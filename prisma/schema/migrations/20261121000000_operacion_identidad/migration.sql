-- Spec 004: esquemas operacion e identidad (data-model.md). Generado con prisma migrate diff;
-- al final, restricciones que Prisma no modela (ADR-0010, research R16 y R20).

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "identidad";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "operacion";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "public";

-- CreateEnum
CREATE TYPE "identidad"."estado_cuenta" AS ENUM ('pendiente_verificacion', 'verificada', 'desactivada', 'eliminada');

-- CreateEnum
CREATE TYPE "identidad"."tipo_token" AS ENUM ('verificacion', 'recuperacion', 'estudiante');

-- CreateEnum
CREATE TYPE "identidad"."rol" AS ENUM ('asistente', 'postulante', 'curador', 'coordinacion_convocatorias', 'coordinacion_provincial', 'programador', 'jefe_sala', 'taquilla', 'validador', 'direccion', 'administrador');

-- CreateEnum
CREATE TYPE "identidad"."tipo_alcance" AS ENUM ('sede', 'provincia', 'disciplina');

-- CreateEnum
CREATE TYPE "identidad"."documento_consentimiento" AS ENUM ('politica_privacidad', 'novedades');

-- CreateEnum
CREATE TYPE "identidad"."categoria_notificacion" AS ENUM ('servicio', 'opcional');

-- CreateEnum
CREATE TYPE "identidad"."estado_notificacion" AS ENUM ('pendiente', 'enviada', 'fallida', 'omitida');

-- CreateEnum
CREATE TYPE "identidad"."estado_postulacion" AS ENUM ('enviada', 'subsanacion', 'cerrada');

-- CreateEnum
CREATE TYPE "operacion"."estado_edicion" AS ENUM ('planificacion', 'publicada', 'cerrada');

-- CreateEnum
CREATE TYPE "operacion"."tipo_sede" AS ENUM ('teatro', 'centro_cultural', 'museo', 'espacio_publico', 'recorrido');

-- CreateEnum
CREATE TYPE "operacion"."disciplina" AS ENUM ('teatro', 'danza', 'circo', 'musica', 'titeres', 'exposicion', 'taller', 'calle', 'cine');

-- CreateEnum
CREATE TYPE "operacion"."componente" AS ENUM ('internacional', 'nacional', 'camino_a_loja', 'escuela', 'salud_arte');

-- CreateEnum
CREATE TYPE "operacion"."tipo_acceso" AS ENUM ('pagada', 'gratuita_reserva', 'gratuita_libre', 'restringida');

-- CreateEnum
CREATE TYPE "operacion"."publico" AS ENUM ('familiar', 'adultos', 'estudiantes');

-- CreateEnum
CREATE TYPE "operacion"."origen_obra" AS ENUM ('invitado', 'convocatoria');

-- CreateEnum
CREATE TYPE "operacion"."estado_obra" AS ENUM ('disponible', 'desistida');

-- CreateEnum
CREATE TYPE "operacion"."estado_funcion" AS ENUM ('borrador', 'programada', 'reprogramada', 'cancelada');

-- CreateEnum
CREATE TYPE "operacion"."tipo_cambio_funcion" AS ENUM ('reprogramacion', 'cambio_sede', 'cancelacion', 'cambio_aforo', 'edicion');

-- CreateEnum
CREATE TYPE "operacion"."tipo_incidencia" AS ENUM ('retraso', 'falla_tecnica', 'clima', 'emergencia_medica', 'aforo_superado', 'conflicto_ingreso', 'desistimiento', 'otra');

-- CreateEnum
CREATE TYPE "operacion"."origen_incidencia" AS ENUM ('manual', 'automatica');

-- CreateEnum
CREATE TYPE "operacion"."estado_incidencia" AS ENUM ('abierta', 'atendida');

-- CreateEnum
CREATE TYPE "operacion"."tipo_pedido" AS ENUM ('compra', 'reserva');

-- CreateTable
CREATE TABLE "identidad"."cuenta" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "estado" "identidad"."estado_cuenta" NOT NULL DEFAULT 'pendiente_verificacion',
    "verificada_en" TIMESTAMPTZ(3),
    "bloqueada_hasta" TIMESTAMPTZ(3),
    "es_personal" BOOLEAN NOT NULL DEFAULT false,
    "preferencias" JSONB NOT NULL DEFAULT '{"novedades":false}',
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identidad"."credencial" (
    "cuenta_id" UUID NOT NULL,
    "hash_contrasena" TEXT NOT NULL,
    "totp_secreto_cifrado" BYTEA,
    "totp_activo" BOOLEAN NOT NULL DEFAULT false,
    "totp_ultimo_paso" BIGINT,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credencial_pkey" PRIMARY KEY ("cuenta_id")
);

-- CreateTable
CREATE TABLE "identidad"."sesion" (
    "id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "hash_token" BYTEA NOT NULL,
    "dispositivo" TEXT NOT NULL,
    "segundo_factor_ok" BOOLEAN NOT NULL DEFAULT false,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_actividad_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "revocada_en" TIMESTAMPTZ(3),

    CONSTRAINT "sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identidad"."token_cuenta" (
    "id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "tipo" "identidad"."tipo_token" NOT NULL,
    "hash_token" BYTEA NOT NULL,
    "dato" JSONB,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "usado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_cuenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identidad"."intento_acceso" (
    "id" UUID NOT NULL,
    "correo" TEXT NOT NULL,
    "exito" BOOLEAN NOT NULL,
    "ocurrido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intento_acceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identidad"."rol_asignado" (
    "id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "rol" "identidad"."rol" NOT NULL,
    "alcance_tipo" "identidad"."tipo_alcance",
    "alcance_valor" TEXT,
    "asignado_por" UUID NOT NULL,
    "asignado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocado_en" TIMESTAMPTZ(3),

    CONSTRAINT "rol_asignado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identidad"."documento_legal" (
    "documento" "identidad"."documento_consentimiento" NOT NULL,
    "version" INTEGER NOT NULL,
    "vigente_desde" TIMESTAMPTZ(3) NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "documento_legal_pkey" PRIMARY KEY ("documento","version")
);

-- CreateTable
CREATE TABLE "identidad"."consentimiento" (
    "id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "documento" "identidad"."documento_consentimiento" NOT NULL,
    "version" INTEGER NOT NULL,
    "aceptado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retirado_en" TIMESTAMPTZ(3),

    CONSTRAINT "consentimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identidad"."notificacion" (
    "id" UUID NOT NULL,
    "cuenta_id" UUID,
    "correo_destino" TEXT NOT NULL,
    "plantilla" TEXT NOT NULL,
    "categoria" "identidad"."categoria_notificacion" NOT NULL,
    "evento_origen_id" UUID,
    "clave_dedup" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "estado" "identidad"."estado_notificacion" NOT NULL DEFAULT 'pendiente',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_error" TEXT,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviada_en" TIMESTAMPTZ(3),

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identidad"."funcion_aviso" (
    "funcion_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "sede_nombre" TEXT NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "estado" TEXT NOT NULL,
    "version" INTEGER NOT NULL,

    CONSTRAINT "funcion_aviso_pkey" PRIMARY KEY ("funcion_id")
);

-- CreateTable
CREATE TABLE "identidad"."destinatario_funcion" (
    "pedido_id" UUID NOT NULL,
    "funcion_id" UUID NOT NULL,
    "cuenta_id" UUID,
    "correo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "destinatario_funcion_pkey" PRIMARY KEY ("pedido_id")
);

-- CreateTable
CREATE TABLE "identidad"."postulacion_en_curso" (
    "postulacion_id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "estado" "identidad"."estado_postulacion" NOT NULL,

    CONSTRAINT "postulacion_en_curso_pkey" PRIMARY KEY ("postulacion_id")
);

-- CreateTable
CREATE TABLE "identidad"."edicion_vigente" (
    "edicion_id" UUID NOT NULL,
    "fecha_fin" DATE NOT NULL,

    CONSTRAINT "edicion_vigente_pkey" PRIMARY KEY ("edicion_id")
);

-- CreateTable
CREATE TABLE "identidad"."dominio_institucional" (
    "dominio" TEXT NOT NULL,
    "institucion" TEXT NOT NULL,
    "creado_por" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dominio_institucional_pkey" PRIMARY KEY ("dominio")
);

-- CreateTable
CREATE TABLE "identidad"."acreditacion" (
    "id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'estudiante',
    "evidencia" TEXT NOT NULL,
    "vigente_hasta" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "acreditacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identidad"."auditoria" (
    "id" UUID NOT NULL,
    "accion" TEXT NOT NULL,
    "actor_id" UUID,
    "rol" TEXT,
    "entidad" TEXT NOT NULL,
    "entidad_id" UUID,
    "anterior" JSONB,
    "nuevo" JSONB,
    "correlacion_id" TEXT,
    "registrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identidad"."evento_procesado" (
    "evento_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "procesado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_procesado_pkey" PRIMARY KEY ("evento_id")
);

-- CreateTable
CREATE TABLE "operacion"."edicion" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "pais_invitado" TEXT,
    "precio_centavos" INTEGER NOT NULL,
    "max_pagadas_persona" INTEGER NOT NULL,
    "max_reservas_persona" INTEGER NOT NULL,
    "estado" "operacion"."estado_edicion" NOT NULL DEFAULT 'planificacion',
    "edicion_base_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edicion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacion"."sede" (
    "id" UUID NOT NULL,
    "edicion_id" UUID NOT NULL,
    "sede_origen_id" UUID,
    "nombre" TEXT NOT NULL,
    "tipo" "operacion"."tipo_sede" NOT NULL,
    "direccion" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "recorrido" JSONB,
    "aforo" INTEGER,
    "accesibilidad" JSONB NOT NULL,
    "montaje_min" INTEGER NOT NULL DEFAULT 30,
    "horario_taquilla" JSONB,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sede_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacion"."elenco" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "pais" TEXT NOT NULL,
    "ciudad" TEXT,
    "origen" "operacion"."origen_obra" NOT NULL,
    "postulacion_id" UUID,

    CONSTRAINT "elenco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacion"."obra" (
    "id" UUID NOT NULL,
    "edicion_id" UUID NOT NULL,
    "elenco_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "sinopsis" TEXT NOT NULL,
    "disciplina" "operacion"."disciplina" NOT NULL,
    "componente" "operacion"."componente" NOT NULL,
    "duracion_min" INTEGER NOT NULL,
    "edad_minima" INTEGER NOT NULL DEFAULT 0,
    "idioma" TEXT,
    "imagenes" JSONB NOT NULL DEFAULT '[]',
    "ficha_artistica" JSONB NOT NULL DEFAULT '{}',
    "ficha_tecnica" JSONB NOT NULL DEFAULT '{}',
    "estado" "operacion"."estado_obra" NOT NULL DEFAULT 'disponible',
    "origen" "operacion"."origen_obra" NOT NULL,
    "postulacion_id" UUID,

    CONSTRAINT "obra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacion"."funcion" (
    "id" UUID NOT NULL,
    "edicion_id" UUID NOT NULL,
    "obra_id" UUID NOT NULL,
    "sede_id" UUID NOT NULL,
    "elenco_id" UUID NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "continua" BOOLEAN NOT NULL DEFAULT false,
    "tipo_acceso" "operacion"."tipo_acceso" NOT NULL,
    "publico" "operacion"."publico" NOT NULL DEFAULT 'familiar',
    "aforo_habilitado" INTEGER,
    "estado" "operacion"."estado_funcion" NOT NULL DEFAULT 'borrador',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publicada_en" TIMESTAMPTZ(3),
    "creada_por" UUID NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacion"."bloque_ocupacion" (
    "id" UUID NOT NULL,
    "funcion_id" UUID NOT NULL,
    "sede_id" UUID NOT NULL,
    "elenco_id" UUID NOT NULL,
    "rango_sede" tstzrange NOT NULL,
    "rango_elenco" tstzrange NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "bloque_ocupacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacion"."cambio_funcion" (
    "id" UUID NOT NULL,
    "funcion_id" UUID NOT NULL,
    "tipo" "operacion"."tipo_cambio_funcion" NOT NULL,
    "anterior" JSONB NOT NULL,
    "nuevo" JSONB NOT NULL,
    "motivo" TEXT,
    "exceso_confirmado" INTEGER,
    "autor_id" UUID NOT NULL,
    "registrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cambio_funcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacion"."incidencia" (
    "id" UUID NOT NULL,
    "edicion_id" UUID NOT NULL,
    "sede_id" UUID NOT NULL,
    "funcion_id" UUID,
    "tipo" "operacion"."tipo_incidencia" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "afecta_publico" BOOLEAN NOT NULL DEFAULT false,
    "origen" "operacion"."origen_incidencia" NOT NULL,
    "evento_origen_id" UUID,
    "autor_id" UUID,
    "estado" "operacion"."estado_incidencia" NOT NULL DEFAULT 'abierta',
    "ocurrida_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacion"."conteo_estimado" (
    "id" UUID NOT NULL,
    "funcion_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "metodo" TEXT NOT NULL,
    "autor_id" UUID NOT NULL,
    "registrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conteo_estimado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacion"."pedido_registrado" (
    "pedido_id" UUID NOT NULL,
    "funcion_id" UUID NOT NULL,
    "tipo" "operacion"."tipo_pedido" NOT NULL,
    "canal" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "importe_centavos" INTEGER NOT NULL,
    "reembolsado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pedido_registrado_pkey" PRIMARY KEY ("pedido_id")
);

-- CreateTable
CREATE TABLE "operacion"."metrica_funcion" (
    "funcion_id" UUID NOT NULL,
    "entradas_emitidas" INTEGER NOT NULL DEFAULT 0,
    "entradas_reembolsadas" INTEGER NOT NULL DEFAULT 0,
    "ingresos_validados" INTEGER NOT NULL DEFAULT 0,
    "recaudacion_centavos" INTEGER NOT NULL DEFAULT 0,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrica_funcion_pkey" PRIMARY KEY ("funcion_id")
);

-- CreateTable
CREATE TABLE "operacion"."ingreso_registrado" (
    "ingreso_id" UUID NOT NULL,
    "funcion_id" UUID NOT NULL,
    "escaneado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ingreso_registrado_pkey" PRIMARY KEY ("ingreso_id")
);

-- CreateTable
CREATE TABLE "operacion"."informe_cierre" (
    "edicion_id" UUID NOT NULL,
    "generado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "datos" JSONB NOT NULL,

    CONSTRAINT "informe_cierre_pkey" PRIMARY KEY ("edicion_id")
);

-- CreateTable
CREATE TABLE "operacion"."cifras_historicas" (
    "anio" INTEGER NOT NULL,
    "actividades" INTEGER NOT NULL,
    "elencos" INTEGER NOT NULL,
    "obras" INTEGER NOT NULL,
    "paises" INTEGER NOT NULL,
    "asistencia_total" INTEGER NOT NULL,
    "asistencia_validada" INTEGER,
    "asistencia_estimada" INTEGER,
    "ocupacion_media" DOUBLE PRECISION,
    "recaudacion_centavos" INTEGER,

    CONSTRAINT "cifras_historicas_pkey" PRIMARY KEY ("anio")
);

-- CreateTable
CREATE TABLE "operacion"."auditoria" (
    "id" UUID NOT NULL,
    "accion" TEXT NOT NULL,
    "actor_id" UUID,
    "rol" TEXT,
    "entidad" TEXT NOT NULL,
    "entidad_id" UUID,
    "anterior" JSONB,
    "nuevo" JSONB,
    "correlacion_id" TEXT,
    "registrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacion"."evento_procesado" (
    "evento_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "procesado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_procesado_pkey" PRIMARY KEY ("evento_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cuenta_correo_key" ON "identidad"."cuenta"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_hash_token_key" ON "identidad"."sesion"("hash_token");

-- CreateIndex
CREATE INDEX "sesion_cuenta_id_idx" ON "identidad"."sesion"("cuenta_id");

-- CreateIndex
CREATE UNIQUE INDEX "token_cuenta_hash_token_key" ON "identidad"."token_cuenta"("hash_token");

-- CreateIndex
CREATE INDEX "token_cuenta_cuenta_id_tipo_creado_en_idx" ON "identidad"."token_cuenta"("cuenta_id", "tipo", "creado_en");

-- CreateIndex
CREATE INDEX "intento_acceso_correo_ocurrido_en_idx" ON "identidad"."intento_acceso"("correo", "ocurrido_en");

-- CreateIndex
CREATE INDEX "rol_asignado_cuenta_id_idx" ON "identidad"."rol_asignado"("cuenta_id");

-- CreateIndex
CREATE INDEX "consentimiento_cuenta_id_documento_idx" ON "identidad"."consentimiento"("cuenta_id", "documento");

-- CreateIndex
CREATE UNIQUE INDEX "notificacion_clave_dedup_key" ON "identidad"."notificacion"("clave_dedup");

-- CreateIndex
CREATE INDEX "notificacion_cuenta_id_creada_en_idx" ON "identidad"."notificacion"("cuenta_id", "creada_en");

-- CreateIndex
CREATE INDEX "notificacion_estado_creada_en_idx" ON "identidad"."notificacion"("estado", "creada_en");

-- CreateIndex
CREATE INDEX "destinatario_funcion_funcion_id_activo_idx" ON "identidad"."destinatario_funcion"("funcion_id", "activo");

-- CreateIndex
CREATE INDEX "destinatario_funcion_cuenta_id_idx" ON "identidad"."destinatario_funcion"("cuenta_id");

-- CreateIndex
CREATE INDEX "postulacion_en_curso_cuenta_id_idx" ON "identidad"."postulacion_en_curso"("cuenta_id");

-- CreateIndex
CREATE INDEX "acreditacion_cuenta_id_idx" ON "identidad"."acreditacion"("cuenta_id");

-- CreateIndex
CREATE INDEX "auditoria_entidad_entidad_id_idx" ON "identidad"."auditoria"("entidad", "entidad_id");

-- CreateIndex
CREATE UNIQUE INDEX "edicion_anio_key" ON "operacion"."edicion"("anio");

-- CreateIndex
CREATE UNIQUE INDEX "sede_edicion_id_nombre_key" ON "operacion"."sede"("edicion_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "elenco_postulacion_id_key" ON "operacion"."elenco"("postulacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "obra_postulacion_id_key" ON "operacion"."obra"("postulacion_id");

-- CreateIndex
CREATE INDEX "funcion_edicion_id_inicio_idx" ON "operacion"."funcion"("edicion_id", "inicio");

-- CreateIndex
CREATE INDEX "funcion_sede_id_inicio_idx" ON "operacion"."funcion"("sede_id", "inicio");

-- CreateIndex
CREATE INDEX "funcion_obra_id_idx" ON "operacion"."funcion"("obra_id");

-- CreateIndex
CREATE INDEX "bloque_ocupacion_funcion_id_idx" ON "operacion"."bloque_ocupacion"("funcion_id");

-- CreateIndex
CREATE INDEX "cambio_funcion_funcion_id_registrado_en_idx" ON "operacion"."cambio_funcion"("funcion_id", "registrado_en");

-- CreateIndex
CREATE UNIQUE INDEX "incidencia_evento_origen_id_key" ON "operacion"."incidencia"("evento_origen_id");

-- CreateIndex
CREATE INDEX "incidencia_edicion_id_ocurrida_en_idx" ON "operacion"."incidencia"("edicion_id", "ocurrida_en");

-- CreateIndex
CREATE INDEX "conteo_estimado_funcion_id_registrado_en_idx" ON "operacion"."conteo_estimado"("funcion_id", "registrado_en");

-- CreateIndex
CREATE INDEX "pedido_registrado_funcion_id_idx" ON "operacion"."pedido_registrado"("funcion_id");

-- CreateIndex
CREATE INDEX "ingreso_registrado_funcion_id_idx" ON "operacion"."ingreso_registrado"("funcion_id");

-- CreateIndex
CREATE INDEX "auditoria_entidad_entidad_id_idx" ON "operacion"."auditoria"("entidad", "entidad_id");

-- AddForeignKey
ALTER TABLE "identidad"."credencial" ADD CONSTRAINT "credencial_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "identidad"."cuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identidad"."sesion" ADD CONSTRAINT "sesion_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "identidad"."cuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identidad"."token_cuenta" ADD CONSTRAINT "token_cuenta_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "identidad"."cuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identidad"."rol_asignado" ADD CONSTRAINT "rol_asignado_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "identidad"."cuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identidad"."consentimiento" ADD CONSTRAINT "consentimiento_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "identidad"."cuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identidad"."acreditacion" ADD CONSTRAINT "acreditacion_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "identidad"."cuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion"."sede" ADD CONSTRAINT "sede_edicion_id_fkey" FOREIGN KEY ("edicion_id") REFERENCES "operacion"."edicion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion"."obra" ADD CONSTRAINT "obra_edicion_id_fkey" FOREIGN KEY ("edicion_id") REFERENCES "operacion"."edicion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion"."obra" ADD CONSTRAINT "obra_elenco_id_fkey" FOREIGN KEY ("elenco_id") REFERENCES "operacion"."elenco"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion"."funcion" ADD CONSTRAINT "funcion_edicion_id_fkey" FOREIGN KEY ("edicion_id") REFERENCES "operacion"."edicion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion"."funcion" ADD CONSTRAINT "funcion_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "operacion"."obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion"."funcion" ADD CONSTRAINT "funcion_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "operacion"."sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion"."bloque_ocupacion" ADD CONSTRAINT "bloque_ocupacion_funcion_id_fkey" FOREIGN KEY ("funcion_id") REFERENCES "operacion"."funcion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion"."cambio_funcion" ADD CONSTRAINT "cambio_funcion_funcion_id_fkey" FOREIGN KEY ("funcion_id") REFERENCES "operacion"."funcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion"."incidencia" ADD CONSTRAINT "incidencia_edicion_id_fkey" FOREIGN KEY ("edicion_id") REFERENCES "operacion"."edicion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion"."incidencia" ADD CONSTRAINT "incidencia_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "operacion"."sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion"."incidencia" ADD CONSTRAINT "incidencia_funcion_id_fkey" FOREIGN KEY ("funcion_id") REFERENCES "operacion"."funcion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion"."conteo_estimado" ADD CONSTRAINT "conteo_estimado_funcion_id_fkey" FOREIGN KEY ("funcion_id") REFERENCES "operacion"."funcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion"."informe_cierre" ADD CONSTRAINT "informe_cierre_edicion_id_fkey" FOREIGN KEY ("edicion_id") REFERENCES "operacion"."edicion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Restricciones escritas a mano (Prisma no las modela)
-- ---------------------------------------------------------------------------------------------

-- Cero cruces de sede (con montaje) y de elenco entre bloques activos (ADR-0010, SC-001).
ALTER TABLE "operacion"."bloque_ocupacion"
  ADD CONSTRAINT "bloque_sin_cruce_sede"
  EXCLUDE USING gist ("sede_id" WITH =, "rango_sede" WITH &&) WHERE ("activo");
ALTER TABLE "operacion"."bloque_ocupacion"
  ADD CONSTRAINT "bloque_sin_cruce_elenco"
  EXCLUDE USING gist ("elenco_id" WITH =, "rango_elenco" WITH &&) WHERE ("activo");
ALTER TABLE "operacion"."bloque_ocupacion"
  ADD CONSTRAINT "bloque_rangos_no_vacios" CHECK (NOT isempty("rango_sede") AND NOT isempty("rango_elenco"));

-- Reglas de valores (data-model.md).
ALTER TABLE "operacion"."edicion"
  ADD CONSTRAINT "edicion_fechas" CHECK ("fecha_fin" >= "fecha_inicio"),
  ADD CONSTRAINT "edicion_precio" CHECK ("precio_centavos" >= 0),
  ADD CONSTRAINT "edicion_limites" CHECK ("max_pagadas_persona" > 0 AND "max_reservas_persona" > 0);
ALTER TABLE "operacion"."sede"
  ADD CONSTRAINT "sede_aforo" CHECK ("aforo" IS NULL OR "aforo" > 0),
  ADD CONSTRAINT "sede_aforo_obligatorio" CHECK ("aforo" IS NOT NULL OR "tipo" IN ('espacio_publico', 'recorrido')),
  ADD CONSTRAINT "sede_recorrido_obligatorio" CHECK ("tipo" <> 'recorrido' OR "recorrido" IS NOT NULL),
  ADD CONSTRAINT "sede_montaje" CHECK ("montaje_min" >= 0);
ALTER TABLE "operacion"."obra"
  ADD CONSTRAINT "obra_duracion" CHECK ("duracion_min" > 0),
  ADD CONSTRAINT "obra_edad" CHECK ("edad_minima" >= 0);
ALTER TABLE "operacion"."funcion"
  ADD CONSTRAINT "funcion_rango" CHECK ("fin" > "inicio"),
  ADD CONSTRAINT "funcion_aforo" CHECK ("aforo_habilitado" IS NULL OR "aforo_habilitado" > 0),
  ADD CONSTRAINT "funcion_version" CHECK ("version" >= 1);
ALTER TABLE "operacion"."conteo_estimado"
  ADD CONSTRAINT "conteo_cantidad" CHECK ("cantidad" >= 0);

-- Un rol vigente por cuenta y alcance (research R16).
CREATE UNIQUE INDEX "rol_asignado_vigente_unico"
  ON "identidad"."rol_asignado" ("cuenta_id", "rol", COALESCE("alcance_valor", ''))
  WHERE "revocado_en" IS NULL;

-- Tablas de solo inserción (FR-012, FR-024, Constitución IX).
CREATE OR REPLACE FUNCTION "operacion"."rechazar_modificacion"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla %.% es de solo inserción', TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE OR REPLACE FUNCTION "identidad"."rechazar_modificacion"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla %.% es de solo inserción', TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "auditoria_solo_insercion" BEFORE UPDATE OR DELETE ON "operacion"."auditoria"
  FOR EACH ROW EXECUTE FUNCTION "operacion"."rechazar_modificacion"();
CREATE TRIGGER "cambio_funcion_solo_insercion" BEFORE UPDATE OR DELETE ON "operacion"."cambio_funcion"
  FOR EACH ROW EXECUTE FUNCTION "operacion"."rechazar_modificacion"();
CREATE TRIGGER "conteo_estimado_solo_insercion" BEFORE UPDATE OR DELETE ON "operacion"."conteo_estimado"
  FOR EACH ROW EXECUTE FUNCTION "operacion"."rechazar_modificacion"();
CREATE TRIGGER "auditoria_solo_insercion" BEFORE UPDATE OR DELETE ON "identidad"."auditoria"
  FOR EACH ROW EXECUTE FUNCTION "identidad"."rechazar_modificacion"();
