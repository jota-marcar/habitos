---
paths:
  - "src/data/**"
  - "src/sync/**"
---

# Datos locales y sincronización

- `src/data` es el acceso a la base local: SQL directo en repositorios que solo dependen del dominio y de la interfaz `Database` (lo impone ESLint), con cobertura del 100 %. Sus tests usan el SQLite integrado en Node (`src/data/testing`).
- Un cambio de esquema es una migración nueva al final de `migrations.ts`; nunca edites una ya publicada (ADR-0009). Una OTA con una migración local no se puede deshacer (`docs/despliegue.md`).
- `src/sync` es la sincronización con Supabase (ADR-0018): el motor depende de la interfaz `Remote` y se prueba con la cuenta en memoria de `src/sync/testing`, con cobertura del 100 %. El adaptador de Supabase se prueba de punta a punta en la CI (`supabase/tests/sync.test.ts`).
- Una tabla sincronizada nueva va en `SYNC_TABLES` y sus columnas en `src/data/sync-repository.ts`. En la nube lleva el trigger `set_updated_at`, Row Level Security y sus tests.
