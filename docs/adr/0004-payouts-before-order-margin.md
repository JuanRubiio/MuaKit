# ADR-0004: Ingresos por payout antes que margen por pedido

## Estado

Aceptada.

## Contexto

El objetivo final es margen, pero repartir ingresos, fees, envios y materiales a
nivel pedido requiere datos base fiables. Antes era necesario saber cobros reales
por canal y tener payouts de Shopify controlados.

## Decision

Modelar primero `channel_payouts` e ingresos por canal. El margen por pedido se
construira despues sobre `sales_orders`, recetas de kit y costes medios.

## Consecuencias

Beneficios:

- Lectura financiera temprana sin sobredimensionar.
- Base preparada para conciliacion futura.
- Etsy y Bizum pueden convivir con Shopify sin complejidad excesiva.

Costes:

- Todavia no hay rentabilidad por pedido.
- Los fees no se reparten a cada venta.
- El dashboard muestra balance simple, no margen formal.

## Alternativas consideradas

- Ir directo a margen por pedido: mas valioso, pero demasiado fragil sin compras al dia.
- Solo ventas Shopify: dejaria fuera Bizum y Etsy.

## Revisitaremos cuando

- Las facturas esten al dia.
- Kits y costes medios esten suficientemente completos.
- Se escriba la spec de margen por pedido.
