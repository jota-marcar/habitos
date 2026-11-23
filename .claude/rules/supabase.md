---
paths:
  - "supabase/**"
---

# Supabase

- `supabase/` es el esquema de la nube (ADR-0003). Un cambio de esquema es un fichero nuevo `supabase/migrations/<AAAAMMDDhhmmss>_<nombre>.sql`, en el mismo PR que la migración local equivalente; nunca edites uno ya aplicado.
- Sus tests son pgTAP en `supabase/tests/database/` y, con `supabase/tests/schema-alignment.test.ts` y `supabase/tests/sync.test.ts`, solo corren en el job `Database` de la CI, porque necesitan Docker (ADR-0015). Tras tocar `supabase/`, espera a la CI antes de dar el cambio por bueno.
- `supabase/functions/` son las Edge Functions, en Deno (ADR-0019). Su lógica no importa nada de Deno, para probarla con Jest con cobertura del 100 %; `index.ts` solo la conecta y se prueba de punta a punta en la CI. Las importaciones relativas llevan la extensión `.ts` y los paquetes salen del `deno.json` de cada función.
- `updated_at` lo asigna el trigger `set_updated_at` con un bloqueo por usuario (ADR-0016). Toda tabla sincronizada nueva lleva ese trigger, Row Level Security y sus tests.
