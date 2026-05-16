# Mua Ops

Aplicacion local para gestionar la operativa de Mua Kit: materiales,
proveedores, facturas, adjuntos, lineas de compra, costes medios, kits,
cobros, Shopify sync e historial.

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
en `data\mua_ops_test`. Valida API, Shopify mock, cobros, facturas, costes,
migraciones, backups, health check y reinicio con base existente.

## Datos

La base operativa local esta en:

```text
data\mua_ops\mua_ops.sqlite
```

Los adjuntos se copian dentro de:

```text
data\mua_ops\uploads
```

Los backups locales se guardan en:

```text
data\mua_ops\backups
```

Importante: los backups contienen toda la base local, incluida configuracion
privada como credenciales de Shopify. Tratalos como datos privados.

El fichero tactico anterior queda solo como fuente de migracion historica:

```text
data\mua_ops\mua_ops.json
```

## Backups y salud tecnica

Antes de aplicar migraciones pendientes sobre una base existente, la app crea
un backup automatico. Tambien se puede crear uno manualmente:

```text
POST /api/system/backup
```

Estado tecnico:

```text
GET /api/system/health
```

Devuelve integridad SQLite, migraciones aplicadas, ultimo backup, tamano de DB
y estado basico de Shopify sin exponer tokens completos.

## Shopify

El flujo principal es la sincronizacion directa con Shopify Admin API desde
Configuracion > Shopify. La app puede sincronizar catalogo/imagenes, inventario,
pedidos y payouts de Shopify.

Los CSV historicos quedan como fallback puntual:

```text
shopify\inventario\products_export_1.csv
shopify\inventario\inventory_export_1.csv
shopify\pagos\payouts_export_1.csv
```

Shopify es la fuente real de stock. Mua Ops conserva el catalogo interno de
materiales, costes medios, puntos de reposicion y composicion de kits.

## Flujo Recomendado

1. Sincronizar Shopify desde Configuracion cuando haya cambios de catalogo,
   inventario, pedidos o payouts.
2. Revisar materiales internos y sus enlaces con productos Shopify.
3. Crear o editar proveedores cuando sea necesario.
4. Crear factura manual y adjuntar PDF/imagen como soporte documental.
5. Anadir lineas de factura con paquetes, unidades por paquete y coste.
6. Revisar costes medios, ultimo coste y composicion de kits.
7. Revisar dashboard para gastos, cobros, stock a reponer y datos pendientes.

## Versionado

El MVP estable esta etiquetado como:

```text
mua-ops-mvp-v0.1
```

La estabilizacion tecnica se trabaja en:

```text
codex/technical-stabilization
```

## Criterio

Los PDFs e imagenes son soporte documental. La verdad operativa es el dato
introducido manualmente en la app. Los borrados funcionales son archivados
logicos y quedan registrados en `audit_log`.
