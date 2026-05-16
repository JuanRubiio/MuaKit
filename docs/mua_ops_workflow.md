# Mua Ops - Flujo de costes, inventario y margen

Nota: este documento conserva el razonamiento tactico inicial. La fuente
operativa actual es la app local Node/SQLite descrita en `README_MUA_OPS.md`;
los CSV y scripts historicos quedan como apoyo puntual, no como flujo principal.

## Objetivo

Mantener una fuente viva de costes por material para que Mua Kit pueda saber:

- cuanto cuesta preparar cada pedido,
- que materiales consume cada venta,
- que proveedor y coste medio tiene cada componente,
- cuando hay riesgo de quedarse sin stock,
- que margen deja cada pedido antes y despues de marketing.

El sistema no debe depender de una factura aislada. Cada compra entra como un lote historico y el coste de cada material se calcula como coste medio ponderado.

## Tablas principales

### Lotes de compra

Archivo: `data/ops/material_lots_v0.csv`

Cada fila representa una compra o linea de factura:

- material normalizado,
- proveedor,
- fecha,
- cantidad comprada,
- coste unitario,
- total pagado,
- fuente documental,
- confianza del dato.

Esta tabla responde: "que hemos comprado y a que precio".

### Coste medio por material

Archivo: `data/ops/material_average_costs_v0.csv`

Agrupa los lotes y calcula:

- coste medio ponderado IVA incluido,
- minimo y maximo historico,
- proveedor principal,
- ultimo dia de compra,
- nivel de confianza.

Esta tabla responde: "que coste debemos usar hoy para valorar pedidos e inventario".

### Proveedores

Archivo: `data/ops/suppliers_v0.csv`

Resume proveedor, categorias compradas, gasto historico y materiales vistos. En la app final deberia ampliarse con:

- URL de compra,
- plazo medio,
- pedido minimo,
- proveedor alternativo,
- notas de calidad.

### Margen por pedido

Archivo: `data/extracted/order_margin_v0.csv`

Calcula por pedido:

- cobrado,
- coste material conocido,
- envio estimado,
- comision de pago,
- marketing conocido asignado,
- margen parcial,
- costes pendientes.

## Cadencia operativa

### Cada compra

1. Guardar PDF o captura en la carpeta del trimestre.
2. Si el OCR no detecta bien cantidades o total, anadir correccion manual en `data/manual_overrides`.
3. Ejecutar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\ocr_pngs.ps1
.venv\Scripts\python.exe tools\extract_q1_costs.py
.venv\Scripts\python.exe tools\build_material_catalog.py
```

### Cada export de pedidos Shopify

1. Sustituir o anadir el CSV de pedidos en `shopify/ventas`.
2. Ejecutar:

```powershell
.venv\Scripts\python.exe tools\calculate_order_margins.py
```

3. Revisar `data/extracted/mua_order_margins_v0.xlsx`.

### Semanal

Revisar:

- materiales con `confidence = low`,
- materiales con coste vacio,
- materiales vendidos mucho y sin coste,
- stock fisico de P1.

### Mensual

Comparar:

- margen por mes,
- gasto Meta/agencia,
- coste real Correos,
- coste medio de materiales,
- precios de venta.

## Proxima app interna

La app deberia tener estos modulos, en este orden:

1. Costes y proveedores.
2. Margen por pedido.
3. Stock y reposicion.
4. Preparacion diaria de pedidos.
5. Marketing visto contra margen.

La regla de oro: ningun pedido deberia aparecer como "margen fiable" si tiene componentes P1 sin coste.
