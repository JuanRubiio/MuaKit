# Herramientas tacticas historicas

Antes de Mua Ops existio una fase de exploracion con OCR, CSV y scripts Python.
Esa fase ayudo a entender costes y pedidos, pero ya no es el flujo principal.

## Scripts conservados

- `tools/ocr_pngs.ps1`
- `tools/extract_q1_costs.py`
- `tools/build_material_catalog.py`
- `tools/build_margin_inputs.py`
- `tools/calculate_order_margins.py`
- `tools/build_inventory_templates.py`

## Estado

Legado conservado. No se debe usar como fuente de verdad diaria.

## Motivo para conservar

- Sirven como referencia de reglas iniciales.
- Pueden ayudar a reconstruir decisiones si necesitamos validar datos antiguos.
- Permiten rescatar ideas para futuras importaciones asistidas.

## Flujo actual preferido

- Compras y gastos: introducir manualmente en Mua Ops.
- Stock, pedidos y payouts Shopify: sincronizar desde Configuracion > Shopify.
- Bizum/Etsy u otros canales: introducir manualmente si no hay sync.
- Costes y kits: mantener dentro de Mua Ops.

## Criterio para eliminarlos

Solo se deberian borrar cuando:

- exista una spec que declare fuera de alcance el legado tactico;
- los datos historicos importantes ya esten migrados o respaldados;
- no haya referencias pendientes en documentacion o tests.
