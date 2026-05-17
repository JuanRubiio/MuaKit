# Mua Ops Documentation

Este directorio es la memoria tecnica y funcional de Mua Ops.

La app se seguira desarrollando con una metodologia SDD ligera: cada cambio
importante que toque dinero, stock, pedidos, Shopify, migraciones o calculos de
margen debe tener una spec antes de implementarse.

## Estructura

- `sdd/`: metodologia, plantillas y checklist de robustez.
- `specs/`: especificaciones funcionales y tecnicas, incluidas las retrospectivas.
- `adr/`: decisiones tecnicas relevantes y su razonamiento.
- `runbooks/`: guias operativas para arrancar, probar, respaldar y versionar.
- `technical-debt.md`: deuda tecnica viva, priorizada y revisable.
- `legacy/`: contexto tactico anterior que ya no es el flujo principal.

## Estado actual

La version MVP queda documentada retrospectivamente en:

- `specs/000-retro-mua-ops-mvp-v0.1.md`
- `specs/001-retro-shopify-direct-sync.md`
- `specs/002-retro-income-and-finance-dashboard.md`
- `specs/003-retro-technical-stabilization-v0.2.md`

La siguiente spec nueva deberia escribirse cuando las facturas esten al dia y
tengamos una foto real del negocio.
