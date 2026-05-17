# SDD Ligero Para Mua Ops

## Objetivo

Usamos Spec Driven Development para reducir improvisacion en cambios con riesgo
de negocio. La documentacion debe ayudarnos a construir mejor, no frenar el
trabajo.

## Cuando hace falta spec

Crear una spec antes de implementar cuando el cambio toque:

- dinero, ingresos, gastos, fees o margen;
- stock, reposicion o sincronizacion Shopify;
- pedidos, kits, materiales o costes medios;
- migraciones, backups o seguridad;
- flujos que puedan afectar datos historicos.

Los cambios visuales pequenos, correcciones de texto y ajustes de bajo riesgo
pueden ir directamente a implementacion con commit claro.

## Flujo recomendado

1. Crear spec en `docs/specs/`.
2. Acordar alcance, no objetivos y criterios de aceptacion.
3. Implementar en rama `codex/<feature>`.
4. Validar con pruebas automaticas y checks manuales.
5. Actualizar la spec si la implementacion real se desvia.
6. Commit final con referencia a la spec.

## Niveles de rigor

- `S`: cambio pequeno. Sin spec, pero con test o validacion clara.
- `M`: cambio funcional medio. Spec corta con flujos, datos y tests.
- `L`: cambio de negocio o datos sensibles. Spec completa y ADR si hay decision tecnica duradera.
- `XL`: cambio estructural o migracion. Spec completa, ADR, runbook y plan de rollback.

## Definicion de listo

Una spec esta lista para implementar cuando:

- se entiende el problema de negocio;
- hay criterios de aceptacion medibles;
- quedan claros los datos afectados;
- hay plan de pruebas;
- los riesgos principales tienen mitigacion;
- sabemos como revertir o recuperar datos si algo sale mal.
