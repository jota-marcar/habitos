---
paths:
  - "src/domain/**"
---

# Dominio

- `src/domain` son reglas puras: no importa paquetes ni otras capas (lo impone ESLint) y su cobertura de tests debe ser del 100 %.
- No consulta el reloj ni genera identificadores: "hoy" y los UUID se le pasan como datos.
- Las reglas que rechazan una operación devuelven códigos de error, no textos.
- Los tests van junto al código (`x.ts` y `x.test.ts`).
