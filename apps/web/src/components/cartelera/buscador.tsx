/** Búsqueda en la cabecera (US2-AS2); funciona sin JavaScript como formulario GET. */
export function Buscador() {
  return (
    <form action="/buscar" method="get" role="search" className="buscador">
      <label htmlFor="q-cabecera" className="solo-lectores">
        Buscar obra o elenco
      </label>
      <input id="q-cabecera" name="q" type="search" minLength={2} maxLength={80} placeholder="Buscar obra o elenco" required />
      <button type="submit">Buscar</button>
    </form>
  );
}
