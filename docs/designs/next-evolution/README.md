# Diseños de siguiente evolución

Estas vistas exploran el siguiente bloque funcional de `Mua Ops` tras el refresh visual:

1. Automatización asistida de facturas desde PDF o imagen
2. Reposición inteligente basada en consumo real
3. Planificación de compra agrupada por proveedor

## Archivos

- `facturas-bandeja-importacion.png`
  - Bandeja de entrada documental para PDFs e imágenes.
  - Pensada para concentrar documentos pendientes, lectura OCR, confianza y apertura al workspace de validación.

- `facturas-validacion-ocr.png`
  - Workspace de validación humana tras lectura automática.
  - La idea clave es automatización fuerte con supervisión final obligatoria.

- `materiales-reposicion-inteligente.png`
  - Evolución de `Materiales` hacia una lectura más predictiva.
  - Prioriza cobertura, consumo 30/90 días, proveedor, plazo y cantidad sugerida.

- `materiales-planificador-compra.png`
  - Vista operativa de compra agrupada por proveedor.
  - Recoge la sugerencia de reposición y la convierte en plan de compra editable.

## Criterio de producto

- Primero mejorar la entrada de datos de coste (`Facturas`) para elevar la calidad de lo que luego consumen `Materiales` y `Pedidos`.
- Después transformar `Materiales` en motor de decisión de compra, no solo en catálogo o inventario.
- Finalmente llevar esa inteligencia a una vista de compra utilizable en el día a día.

## Secuencia recomendada

1. `Facturas > Bandeja de importación`
2. `Facturas > Validación de factura`
3. `Materiales > Reposición inteligente`
4. `Materiales > Planificador de compra`

## Nota

La recepción por email queda fuera de esta fase a propósito. Estos diseños cubren solo el flujo de importación desde PDF o imagen, que es el MVP recomendado antes de automatizar la entrada documental por correo.
