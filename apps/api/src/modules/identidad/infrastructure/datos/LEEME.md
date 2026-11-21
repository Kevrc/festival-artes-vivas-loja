# Contraseñas filtradas (RN-008, research R11)

`contrasenas-filtradas.txt`: contraseñas conocidas por filtraciones, una por línea, en minúsculas,
de **10 caracteres o más** (las más cortas ya se rechazan por longitud), sin duplicados.

- Origen: `Passwords/Common-Credentials/100k-most-used-passwords-NCSC.txt` de
  [SecLists](https://github.com/danielmiessler/SecLists) (licencia MIT), lista del NCSC del
  Reino Unido con las 100 000 contraseñas más usadas en filtraciones.
- Filtrado (2026-11-21): 99 840 entradas → 9 126 tras pasar a minúsculas, quitar las de menos de 10
  caracteres y los duplicados.
- Se compara sin distinguir mayúsculas. Ni la contraseña ni ningún derivado suyo salen del servidor.

Para regenerarla:

```bash
curl -sSfL https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/100k-most-used-passwords-NCSC.txt \
  | tr -d '\r' | tr '[:upper:]' '[:lower:]' | awk 'length($0)>=10' | LC_ALL=C sort -u > contrasenas-filtradas.txt
```
