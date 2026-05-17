# Spec: Mua Ops MVP v0.1

## Estado

Implementada retrospectivamente.

## Contexto

Mua Kit necesitaba dejar atras hojas, CSV y extracciones tacticas para controlar
compras, materiales, facturas, costes medios y composicion de kits. El negocio
trabaja con un producto principal compuesto por muchos materiales, por lo que
Shopify no era suficiente para entender coste real y reposicion.

## Objetivo

Crear una app local operativa para introducir facturas manualmente, registrar
lineas de compra, calcular coste medio por material y definir composiciones de
kit.

## No objetivos

- No calcular margen por pedido todavia.
- No sustituir a la gestoria ni llevar contabilidad oficial.
- No tener login, roles ni despliegue cloud.
- No depender de OCR como fuente de verdad.

## Usuarios y flujos

- Registrar proveedores.
- Crear materiales internos y clasificarlos por jerarquia.
- Crear facturas con adjuntos.
- Anadir lineas con paquetes, unidades por paquete y precio por paquete.
- Ver coste medio, ultimo coste, gasto y lotes por material.
- Definir kits y su coste conocido.
- Consultar actividad de negocio.

## Modelo de datos

Entidades principales:

- `materials`
- `suppliers`
- `invoices`
- `invoice_lines`
- `documents`
- `kit_recipes`
- `kit_recipe_items`
- `audit_log`

Fuente de verdad:

- Facturas y lineas: dato manual introducido en Mua Ops.
- Adjuntos: soporte documental, no fuente automatica.
- Costes: derivados de lineas de factura activas.

## Reglas funcionales

- Los borrados funcionales son archivados logicos.
- Las lineas de factura no afectan al stock real.
- El coste unitario sale de `paquetes x unidades por paquete / precio por paquete`.
- Las facturas archivadas no deben computar en costes activos.
- Los kits pueden marcarse como completos para bloquear edicion accidental.

## API / UI

Vistas principales:

- Dashboard
- Facturas
- Ingresos
- Materiales
- Proveedores
- Costes
- Kits
- Actividad
- Configuracion

APIs relevantes:

- `/api/materials`
- `/api/suppliers`
- `/api/invoices`
- `/api/invoices/:id/lines`
- `/api/documents`
- `/api/costs/materials`
- `/api/kit-recipes`
- `/api/audit-log`

## Seguridad y datos

- App local sin autenticacion.
- Datos locales en SQLite.
- Adjuntos copiados a carpeta controlada.
- Cambios de negocio registrados en `audit_log`.

## Migracion y rollback

El MVP sustituyo el fichero tactico `mua_ops.json` por SQLite. El rollback
practico es recuperar el tag `mua-ops-mvp-v0.1` y restaurar un backup de la base
si fuera necesario.

## Test plan

- Crear proveedor, material, factura y linea.
- Editar y archivar entidades.
- Verificar coste medio y ultimo coste.
- Reiniciar servidor y comprobar persistencia.
- Ejecutar `npm test`.

## Criterios de aceptacion

- La app permite trabajar facturas reales sin depender de CSV.
- Los costes medios se recalculan tras editar lineas.
- Los adjuntos quedan vinculados.
- La informacion persiste en SQLite.
- Hay actividad de negocio para cambios relevantes.
