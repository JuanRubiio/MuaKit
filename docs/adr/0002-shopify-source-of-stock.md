# ADR-0002: Shopify es la fuente de stock real

## Estado

Aceptada.

## Contexto

El inventario se mantiene operativo en Shopify. Mua Ops inicialmente podia tener
stock manual, pero eso creaba riesgo de divergencia con el canal de venta.

## Decision

Shopify es la fuente de verdad para stock real. Mua Ops guarda punto de
reposicion, stock objetivo, jerarquia, costes y composicion, pero no modifica el
stock real desde lineas de factura.

## Consecuencias

Beneficios:

- Evita doble contabilidad de stock.
- Permite usar Shopify como inventario operativo.
- Mua Ops puede centrarse en compras, costes y alertas.

Costes:

- Requiere sincronizacion Shopify sana.
- Los materiales no vinculados a Shopify no tienen stock real fiable.
- Las compras registradas en facturas no incrementan stock por si mismas.

## Alternativas consideradas

- Stock manual en Mua Ops: flexible, pero alto riesgo de incoherencia.
- Stock mixto manual + Shopify: demasiado confuso para el equipo.

## Revisitaremos cuando

- Se necesite recepcionar compras antes de subirlas a Shopify.
- Haya varios almacenes o ubicaciones.
- Se quiera automatizar ordenes de compra.
