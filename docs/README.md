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

La versión estable actual es `v1.2.5`, publicada desde la rama `codex/marketing-filter-polish`. Su alcance y validación están documentados en `releases/v1.2.5.md` y el procedimiento de cierre en `runbooks/release-versioning.md`. Las specs `000` a `003` documentan retrospectivamente el trabajo ya implementado:

- `specs/000-retro-mua-ops-mvp-v0.1.md`
- `specs/001-retro-shopify-direct-sync.md`
- `specs/002-retro-income-and-finance-dashboard.md`
- `specs/003-retro-technical-stabilization-v0.2.md`

La spec `004-visual-refresh-v1.md` conserva el alcance y la referencia de diseño
de la evolución visual; su estado es parcial y debe actualizarse junto con cada
fase implementada.

Las specs nuevas deben acompañar cualquier cambio que afecte a dinero, stock, proveedores, facturas, Shopify o cálculos. Los documentos tácticos anteriores se conservan en `legacy/` y no describen el flujo operativo actual.
