# ADR-0003: Facturas manuales como fuente de verdad de compras

## Estado

Aceptada.

## Contexto

Las facturas y capturas de proveedores tienen formatos muy variables. El OCR y
las extracciones tacticas ayudaron a entender el problema, pero no daban
fiabilidad suficiente para datos financieros.

## Decision

Las facturas se introducen manualmente. PDFs e imagenes son soporte documental.
Los calculos usan los datos escritos en Mua Ops, no extraccion automatica.

## Consecuencias

Beneficios:

- Mayor precision.
- Menos errores silenciosos de OCR.
- Auditoria clara de cambios manuales.

Costes:

- Requiere trabajo operativo al dia.
- La calidad de costes depende de completar lineas.
- No todos los gastos necesitan linea de material.

## Alternativas consideradas

- OCR como fuente de verdad: rapido, pero poco confiable.
- Importar CSV de proveedores: no existe formato comun.

## Revisitaremos cuando

- El volumen haga inviable introducir facturas manualmente.
- Se pueda incorporar OCR asistido con revision humana.
