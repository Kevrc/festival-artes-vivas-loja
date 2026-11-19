-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "programacion";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";

-- CreateEnum
CREATE TYPE "programacion"."EstadoEdicion" AS ENUM ('borrador', 'publicada', 'cerrada');

-- CreateEnum
CREATE TYPE "programacion"."Disciplina" AS ENUM ('teatro', 'danza', 'circo', 'musica', 'titeres', 'exposicion', 'taller', 'calle', 'cine');

-- CreateEnum
CREATE TYPE "programacion"."Componente" AS ENUM ('internacional', 'nacional', 'camino_a_loja', 'escuela', 'salud_arte');

-- CreateEnum
CREATE TYPE "programacion"."TipoSede" AS ENUM ('teatro', 'centro_cultural', 'museo', 'espacio_publico', 'recorrido');

-- CreateEnum
CREATE TYPE "programacion"."TipoAcceso" AS ENUM ('pagada', 'gratuita_reserva', 'gratuita_libre', 'restringida');

-- CreateEnum
CREATE TYPE "programacion"."Publico" AS ENUM ('familiar', 'adultos', 'estudiantes');

-- CreateEnum
CREATE TYPE "programacion"."EstadoFuncion" AS ENUM ('programada', 'reprogramada', 'cancelada', 'finalizada');

-- CreateEnum
CREATE TYPE "programacion"."NivelDisponibilidad" AS ENUM ('disponible', 'ultimos_lugares', 'agotado', 'no_aplica');

-- CreateTable
CREATE TABLE "programacion"."edicion_cartelera" (
    "id" UUID NOT NULL,
    "anio" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "pais_invitado" TEXT,
    "estado" "programacion"."EstadoEdicion" NOT NULL DEFAULT 'borrador',

    CONSTRAINT "edicion_cartelera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programacion"."obra_cartelera" (
    "id" UUID NOT NULL,
    "edicion_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "sinopsis" TEXT NOT NULL DEFAULT '',
    "disciplina" "programacion"."Disciplina" NOT NULL,
    "duracion_min" INTEGER NOT NULL,
    "edad_minima" INTEGER NOT NULL DEFAULT 0,
    "idioma" TEXT,
    "imagenes" JSONB NOT NULL DEFAULT '[]',
    "ficha_artistica" JSONB NOT NULL DEFAULT '[]',
    "elenco_id" UUID NOT NULL,
    "elenco_nombre" TEXT NOT NULL,
    "elenco_pais" TEXT NOT NULL,
    "elenco_ciudad" TEXT,
    "componente" "programacion"."Componente" NOT NULL,
    "texto_busqueda" TEXT NOT NULL,

    CONSTRAINT "obra_cartelera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programacion"."sede_cartelera" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "programacion"."TipoSede" NOT NULL,
    "direccion" TEXT NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "recorrido" JSONB,
    "aforo" INTEGER,
    "accesibilidad" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "sede_cartelera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programacion"."funcion_cartelera" (
    "id" UUID NOT NULL,
    "edicion_id" UUID NOT NULL,
    "obra_id" UUID NOT NULL,
    "sede_id" UUID NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "dia_festival" DATE NOT NULL,
    "dia_fin" DATE NOT NULL,
    "continua" BOOLEAN NOT NULL DEFAULT false,
    "tipo_acceso" "programacion"."TipoAcceso" NOT NULL,
    "publico" "programacion"."Publico" NOT NULL DEFAULT 'familiar',
    "estado" "programacion"."EstadoFuncion" NOT NULL DEFAULT 'programada',
    "horario_anterior" JSONB,
    "aforo_habilitado" INTEGER,
    "disponibilidad" "programacion"."NivelDisponibilidad" NOT NULL DEFAULT 'disponible',
    "lugares_restantes" INTEGER,
    "disponibilidad_actualizada_en" TIMESTAMPTZ(3),
    "version_origen" INTEGER NOT NULL DEFAULT 0,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funcion_cartelera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programacion"."favorito" (
    "cuenta_id" UUID NOT NULL,
    "funcion_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorito_pkey" PRIMARY KEY ("cuenta_id","funcion_id")
);

-- CreateTable
CREATE TABLE "programacion"."evento_procesado" (
    "evento_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "procesado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_procesado_pkey" PRIMARY KEY ("evento_id")
);

-- CreateIndex
CREATE INDEX "obra_cartelera_elenco_id_idx" ON "programacion"."obra_cartelera"("elenco_id");

-- CreateIndex
CREATE INDEX "obra_cartelera_texto_busqueda_trgm" ON "programacion"."obra_cartelera" USING GIN ("texto_busqueda" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "funcion_cartelera_edicion_id_dia_festival_inicio_idx" ON "programacion"."funcion_cartelera"("edicion_id", "dia_festival", "inicio");

-- CreateIndex
CREATE INDEX "funcion_cartelera_inicio_fin_idx" ON "programacion"."funcion_cartelera"("inicio", "fin");

-- AddForeignKey
ALTER TABLE "programacion"."obra_cartelera" ADD CONSTRAINT "obra_cartelera_edicion_id_fkey" FOREIGN KEY ("edicion_id") REFERENCES "programacion"."edicion_cartelera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programacion"."funcion_cartelera" ADD CONSTRAINT "funcion_cartelera_edicion_id_fkey" FOREIGN KEY ("edicion_id") REFERENCES "programacion"."edicion_cartelera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programacion"."funcion_cartelera" ADD CONSTRAINT "funcion_cartelera_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "programacion"."obra_cartelera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programacion"."funcion_cartelera" ADD CONSTRAINT "funcion_cartelera_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "programacion"."sede_cartelera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programacion"."favorito" ADD CONSTRAINT "favorito_funcion_id_fkey" FOREIGN KEY ("funcion_id") REFERENCES "programacion"."funcion_cartelera"("id") ON DELETE CASCADE ON UPDATE CASCADE;
