-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "boleteria";

-- CreateTable
CREATE TABLE "boleteria"."edicion_boleteria" (
    "id" UUID NOT NULL,
    "anio" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "precio_centavos" INTEGER NOT NULL DEFAULT 500,
    "max_pagadas_persona" INTEGER NOT NULL DEFAULT 6,
    "max_reservas_persona" INTEGER NOT NULL DEFAULT 4,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edicion_boleteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boleteria"."inventario_funcion" (
    "funcion_id" UUID NOT NULL,
    "edicion_id" UUID NOT NULL,
    "obra_id" UUID NOT NULL,
    "obra_titulo" TEXT NOT NULL,
    "sede_id" UUID NOT NULL,
    "sede_nombre" TEXT NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "tipo_acceso" TEXT NOT NULL,
    "publico" TEXT NOT NULL DEFAULT 'familiar',
    "estado_funcion" TEXT NOT NULL DEFAULT 'programada',
    "precio_centavos" INTEGER NOT NULL DEFAULT 500,
    "max_por_pedido" INTEGER NOT NULL DEFAULT 6,
    "max_por_persona" INTEGER NOT NULL DEFAULT 6,
    "aforo_habilitado" INTEGER NOT NULL DEFAULT 0,
    "retenidos" INTEGER NOT NULL DEFAULT 0,
    "emitidos" INTEGER NOT NULL DEFAULT 0,
    "usados" INTEGER NOT NULL DEFAULT 0,
    "reservas_liberadas" BOOLEAN NOT NULL DEFAULT false,
    "version_origen" INTEGER NOT NULL DEFAULT 0,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventario_funcion_pkey" PRIMARY KEY ("funcion_id"),
    CONSTRAINT "inventario_funcion_contadores_no_negativos" CHECK ("retenidos" >= 0 AND "emitidos" >= 0 AND "usados" >= 0)
);

-- CreateTable
CREATE TABLE "boleteria"."caja" (
    "id" UUID NOT NULL,
    "vendedor_id" UUID NOT NULL,
    "sede_id" UUID NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'abierta',
    "fondo_inicial_centavos" INTEGER NOT NULL,
    "efectivo_esperado_centavos" INTEGER,
    "efectivo_declarado_centavos" INTEGER,
    "diferencia_centavos" INTEGER,
    "abierta_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrada_en" TIMESTAMPTZ(3),

    CONSTRAINT "caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boleteria"."pedido" (
    "id" UUID NOT NULL,
    "funcion_id" UUID NOT NULL,
    "cuenta_id" UUID,
    "correo_comprador" TEXT,
    "canal" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario_centavos" INTEGER NOT NULL,
    "importe_centavos" INTEGER NOT NULL,
    "estado" TEXT NOT NULL,
    "clave_idempotencia" TEXT NOT NULL,
    "vence_en" TIMESTAMPTZ(3),
    "caja_id" UUID,
    "resolucion_cancelacion" TEXT,
    "plazo_eleccion_hasta" TIMESTAMPTZ(3),
    "pedido_origen_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boleteria"."entrada" (
    "id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "funcion_id" UUID NOT NULL,
    "token_qr" TEXT NOT NULL,
    "codigo_corto" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'valida',
    "emitida_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boleteria"."ingreso" (
    "id" UUID NOT NULL,
    "entrada_id" UUID NOT NULL,
    "funcion_id" UUID NOT NULL,
    "validador_id" UUID NOT NULL,
    "dispositivo_id" TEXT NOT NULL,
    "puerta" TEXT NOT NULL,
    "escaneado_en" TIMESTAMPTZ(3) NOT NULL,
    "sincronizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diferido" BOOLEAN NOT NULL DEFAULT false,
    "es_conflicto" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ingreso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boleteria"."movimiento_pago" (
    "id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "referencia_proveedor" TEXT,
    "importe_centavos" INTEGER NOT NULL,
    "estado" TEXT NOT NULL,
    "detalle" JSONB NOT NULL DEFAULT '{}',
    "registrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boleteria"."movimiento_caja" (
    "id" UUID NOT NULL,
    "caja_id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "medio_pago" TEXT NOT NULL,
    "importe_centavos" INTEGER NOT NULL,
    "registrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boleteria"."auditoria_boleteria" (
    "id" UUID NOT NULL,
    "accion" TEXT NOT NULL,
    "actor_id" UUID,
    "rol" TEXT,
    "entidad" TEXT NOT NULL,
    "entidad_id" UUID NOT NULL,
    "motivo" TEXT,
    "datos" JSONB NOT NULL DEFAULT '{}',
    "correlacion_id" UUID NOT NULL,
    "registrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_boleteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boleteria"."evento_procesado" (
    "evento_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "procesado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_procesado_pkey" PRIMARY KEY ("evento_id")
);

-- CreateIndex
CREATE INDEX "inventario_funcion_edicion_id_inicio_idx" ON "boleteria"."inventario_funcion"("edicion_id", "inicio");

-- CreateIndex
CREATE INDEX "inventario_funcion_tipo_acceso_reservas_liberadas_inicio_idx" ON "boleteria"."inventario_funcion"("tipo_acceso", "reservas_liberadas", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "pedido_clave_idempotencia_key" ON "boleteria"."pedido"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "pedido_funcion_id_estado_vence_en_idx" ON "boleteria"."pedido"("funcion_id", "estado", "vence_en");

-- CreateIndex
CREATE INDEX "pedido_cuenta_id_funcion_id_idx" ON "boleteria"."pedido"("cuenta_id", "funcion_id");

-- CreateIndex
CREATE INDEX "pedido_estado_plazo_eleccion_hasta_idx" ON "boleteria"."pedido"("estado", "plazo_eleccion_hasta");

-- CreateIndex
CREATE UNIQUE INDEX "entrada_codigo_corto_key" ON "boleteria"."entrada"("codigo_corto");

-- CreateIndex
CREATE INDEX "entrada_funcion_id_estado_idx" ON "boleteria"."entrada"("funcion_id", "estado");

-- CreateIndex
CREATE INDEX "entrada_pedido_id_idx" ON "boleteria"."entrada"("pedido_id");

-- CreateIndex
CREATE UNIQUE INDEX "ingreso_entrada_id_dispositivo_id_escaneado_en_key" ON "boleteria"."ingreso"("entrada_id", "dispositivo_id", "escaneado_en");

-- CreateIndex
CREATE INDEX "ingreso_funcion_id_es_conflicto_idx" ON "boleteria"."ingreso"("funcion_id", "es_conflicto");

-- CreateIndex
CREATE INDEX "movimiento_pago_pedido_id_idx" ON "boleteria"."movimiento_pago"("pedido_id");

-- CreateIndex
CREATE UNIQUE INDEX "movimiento_pago_proveedor_ref_tipo_key" ON "boleteria"."movimiento_pago"("proveedor", "referencia_proveedor", "tipo") WHERE "referencia_proveedor" IS NOT NULL;

-- CreateIndex
CREATE INDEX "caja_vendedor_id_sede_id_estado_idx" ON "boleteria"."caja"("vendedor_id", "sede_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "caja_vendedor_sede_abierta_key" ON "boleteria"."caja"("vendedor_id", "sede_id") WHERE "estado" = 'abierta';

-- CreateIndex
CREATE INDEX "movimiento_caja_caja_id_idx" ON "boleteria"."movimiento_caja"("caja_id");

-- CreateIndex
CREATE INDEX "auditoria_boleteria_entidad_entidad_id_idx" ON "boleteria"."auditoria_boleteria"("entidad", "entidad_id");

-- AddForeignKey
ALTER TABLE "boleteria"."inventario_funcion" ADD CONSTRAINT "inventario_funcion_edicion_id_fkey" FOREIGN KEY ("edicion_id") REFERENCES "boleteria"."edicion_boleteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boleteria"."pedido" ADD CONSTRAINT "pedido_funcion_id_fkey" FOREIGN KEY ("funcion_id") REFERENCES "boleteria"."inventario_funcion"("funcion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boleteria"."pedido" ADD CONSTRAINT "pedido_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "boleteria"."caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boleteria"."entrada" ADD CONSTRAINT "entrada_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "boleteria"."pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boleteria"."entrada" ADD CONSTRAINT "entrada_funcion_id_fkey" FOREIGN KEY ("funcion_id") REFERENCES "boleteria"."inventario_funcion"("funcion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boleteria"."ingreso" ADD CONSTRAINT "ingreso_entrada_id_fkey" FOREIGN KEY ("entrada_id") REFERENCES "boleteria"."entrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boleteria"."movimiento_pago" ADD CONSTRAINT "movimiento_pago_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "boleteria"."pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boleteria"."movimiento_caja" ADD CONSTRAINT "movimiento_caja_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "boleteria"."caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boleteria"."movimiento_caja" ADD CONSTRAINT "movimiento_caja_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "boleteria"."pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
