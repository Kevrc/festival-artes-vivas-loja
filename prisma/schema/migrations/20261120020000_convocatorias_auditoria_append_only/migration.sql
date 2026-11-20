CREATE OR REPLACE FUNCTION convocatorias.rechazar_mutacion_auditoria()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'La auditoría de Convocatorias es append-only';
END;
$$;

CREATE TRIGGER auditoria_append_only
BEFORE UPDATE OR DELETE ON convocatorias.auditoria
FOR EACH ROW EXECUTE FUNCTION convocatorias.rechazar_mutacion_auditoria();
