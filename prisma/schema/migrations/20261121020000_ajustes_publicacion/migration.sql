-- Spec 004 (US2): ajustes hallados al publicar.
-- 1. Un borrador puede no tener tipo de acceso todavía; publicarlo lo exige (US2-AS2).
ALTER TABLE "operacion"."funcion" ALTER COLUMN "tipo_acceso" DROP NOT NULL;
-- 2. La ficha artística es una lista (contrato ObraDto.fichaArtistica), no un objeto.
ALTER TABLE "operacion"."obra" ALTER COLUMN "ficha_artistica" SET DEFAULT '[]';
UPDATE "operacion"."obra" SET "ficha_artistica" = '[]' WHERE jsonb_typeof("ficha_artistica") <> 'array';
