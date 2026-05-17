# Spec: Sincronizacion Shopify Directa

## Estado

Implementada retrospectivamente.

## Contexto

Los CSV de Shopify eran utiles al principio, pero no sostenibles. El inventario
real vive en Shopify y Mua Ops necesita leer catalogo, imagenes, stock, pedidos
y payouts sin depender de exportaciones manuales.

## Objetivo

Conectar Mua Ops con Shopify Admin API mediante credenciales de custom app o Dev
Dashboard y permitir sincronizacion manual o automatica mientras la app esta
activa.

## No objetivos

- No usar webhooks ni tiempo real.
- No implementar OAuth publico.
- No hacer margen por pedido en esta fase.
- No borrar datos locales si Shopify falla.

## Usuarios y flujos

- Configurar dominio, version API y credenciales.
- Probar conexion.
- Sincronizar productos, inventario, pedidos y payouts.
- Activar auto refresco con frecuencia configurable.
- Consultar estado y resumen de sincronizacion.

## Modelo de datos

Entidades afectadas:

- `app_settings`: configuracion Shopify, estado y preferencias.
- `shopify_products`: catalogo e imagenes.
- `materials`: imagen vinculada y stock efectivo desde Shopify.
- `sales_orders`: pedidos Shopify capturados para fases futuras.
- `channel_payouts`: payouts Shopify como ingresos.
- `audit_log`: eventos de sincronizacion.

Fuente de verdad:

- Stock real: Shopify.
- Imagenes de materiales: Shopify/CDN.
- Costes y jerarquia interna: Mua Ops.

## Reglas funcionales

- La sincronizacion es idempotente.
- El inventario de Shopify actualiza el stock efectivo de materiales vinculados.
- El catalogo Shopify sirve para imagenes y vinculos, no sustituye al catalogo interno.
- Si un bloque falla, los demas pueden quedar reportados con su estado.
- Los secretos se enmascaran en UI, logs y health checks.

## API / UI

Configuracion > Shopify:

- Probar conexion.
- Sincronizar ahora.
- Guardar Shopify.

APIs:

- `GET /api/shopify/connection`
- `PATCH /api/shopify/connection`
- `POST /api/shopify/connection/test`
- `GET /api/shopify/sync-status`
- `POST /api/shopify/sync`
- `POST /api/shopify/sync/products`
- `POST /api/shopify/sync/inventory`
- `POST /api/shopify/sync/orders`
- `POST /api/shopify/sync/payouts`

## Seguridad y datos

- Credenciales persistidas solo en backend/SQLite.
- Respuestas publicas devuelven credenciales enmascaradas.
- Logs y errores usan redaccion de secretos.
- Los backups contienen credenciales y deben tratarse como privados.

## Migracion y rollback

Los importadores CSV historicos quedan como fallback, pero no como flujo
principal. El rollback operativo es desactivar auto sync y trabajar con los
datos ya sincronizados.

## Test plan

- Probar conexion con credenciales mock.
- Sincronizar productos, inventario, pedidos y payouts sin duplicar.
- Verificar que no aparecen secretos completos.
- Verificar que stock de materiales vinculados procede de Shopify.
- Ejecutar `npm test`.

## Criterios de aceptacion

- La app funciona sin credenciales configuradas.
- La sincronizacion manual actualiza datos sin duplicar.
- La sincronizacion automatica no se solapa.
- Los errores quedan visibles en diagnostico/logs.
