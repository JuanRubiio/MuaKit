# Mua Ops

Aplicacion local para gestionar el catalogo operativo de Mua Kit: materiales,
proveedores, facturas, adjuntos, lineas de compra, costes medios e historial.

## Arrancar

```powershell
npm start
```

Abrir:

```text
http://127.0.0.1:5055
```

## Pruebas

```powershell
npm test
```

La prueba levanta el servidor en el puerto `5065` con una base SQLite temporal
en `data\mua_ops_test`, crea proveedor, material, factura, adjunto y linea, y
valida que archivar/restaurar la factura cambia los costes.

## Datos

La base operativa local esta en:

```text
data\mua_ops\mua_ops.sqlite
```

Los adjuntos se copian dentro de:

```text
data\mua_ops\uploads
```

El fichero tactico anterior queda solo como fuente de migracion historica:

```text
data\mua_ops\mua_ops.json
```

## Importacion Shopify

La app importa productos e imagenes desde:

```text
C:\Users\Portatil\Downloads\products_export_1.csv
shopify\inventario\inventory_export_1.csv
```

El CSV de productos aporta las imagenes desde `Image Src` de Shopify CDN. El
inventario aporta stock por `Handle`. Shopify es fuente de catalogo visual; la
fuente operativa para costes es el catalogo interno de `materials`.

## Flujo Recomendado

1. Revisar productos Shopify e identificar que SKU representa cada material.
2. Crear o editar materiales internos.
3. Vincular productos Shopify con materiales internos cuando proceda.
4. Crear o editar proveedores.
5. Crear factura manual y adjuntar PDF/imagen como soporte documental.
6. Anadir lineas de factura con paquetes, unidades por paquete y coste.
7. Revisar costes medios y ultimo coste en la vista Costes.

## Criterio

Los PDFs e imagenes son soporte documental. La verdad operativa es el dato
introducido manualmente en la app. Los borrados funcionales son archivados
logicos y quedan registrados en `audit_log`.
