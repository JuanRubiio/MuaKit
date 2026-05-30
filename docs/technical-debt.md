# Deuda Tecnica

Este documento no es una lista de reproches. Es una lista viva para decidir
mejor el orden de trabajo.

## Alta prioridad

### Modularizar backend

`mua_ops_node/server.js` concentra rutas, acceso a datos, servicios, Shopify,
dashboard y utilidades. Hay piezas ya extraidas en `mua_ops_node/lib`, pero el
monolito sigue siendo el principal riesgo de mantenimiento.

Avance ya realizado:

- `mua_ops_node/lib/routes/system.js`
- `mua_ops_node/lib/routes/income.js`
- `mua_ops_node/lib/routes/materials.js`
- `mua_ops_node/lib/routes/invoices.js`
- utilidades ya separadas en `mua_ops_node/lib`

Siguiente paso propuesto:

- seguir separando rutas por dominio;
- separar rutas de `kits`, `costes` y `audit`;
- separar servicios de negocio;
- dejar acceso a datos en una capa clara.

### Modularizar frontend

`mua_ops_node/public/app.js` concentra estado, renders, eventos, graficas y
formularios. `app-core.js` ya extrae helpers base, pero falta dividir por vistas.

Avance ya realizado:

- `mua_ops_node/public/views-dashboard.mjs`
- `mua_ops_node/public/views-income.mjs`
- `mua_ops_node/public/views-system.mjs`
- `mua_ops_node/public/views-materials.mjs`
- `mua_ops_node/public/views-invoices.mjs`

Siguiente paso propuesto:

- `costs.js`;
- `kits.js`;
- `activity.js`.

### Margen por pedido pendiente

La app ya tiene gastos, ingresos, pedidos Shopify, kits y costes medios, pero
no calcula margen por pedido. Este sera el siguiente cambio grande cuando las
facturas esten al dia.

## Media prioridad

### Cifrado de secretos en reposo

Los secretos Shopify no se exponen en UI ni logs, pero siguen guardados dentro
de SQLite. Para uso local es aceptable por ahora, aunque los backups deben
tratarse como privados.

### Migraciones mas formales

Existe `schema_migrations`, pero las migraciones siguen conviviendo con logica
historica de compatibilidad. A medida que crezca el esquema convendra separar
archivos de migracion.

### Tests de frontend

Ya existe un smoke en `mua_ops_node/test-ui-smoke.js` que cubre arranque,
navegacion y apertura de detalle de factura, material e ingreso. Aun asi,
las regresiones visuales o de interaccion mas finas todavia se detectan
manualmente.

### CSV historicos

Los importadores CSV de Shopify e ingresos siguen como fallback. Deben
mantenerse documentados o retirarse cuando confirmemos que la API directa cubre
todo el flujo.

## Baja prioridad

### Multiusuario

No hay login ni roles. Correcto para uso local actual, insuficiente si Mua Ops
pasa a equipo distribuido o producto implantable.

### Motor de base de datos

`sql.js` funciona para la fase local. Si hay concurrencia real, habra que
evaluar `better-sqlite3`, `node:sqlite` o Postgres.

### Packaging

La app se arranca con Node. Si el uso por equipo crece, podria empaquetarse con
instalador local o contenedor.

## Limpieza

- No borrar `tools/` por ahora: son legado tactico y referencia historica.
- `server.out.log` y `server.err.log` estan ignorados por git y son artefactos
  runtime locales.
- Las carpetas `shopify/`, `etsy/`, `declaraciones_trimestrales/` y `data/`
  estan fuera de git por contener datos reales o exportaciones.
