# Checklist De Robustez

Usar antes de cerrar una spec o una implementacion con impacto operativo.

## Datos

- La fuente de verdad esta clara.
- Las operaciones son idempotentes cuando pueden repetirse.
- Los borrados criticos son logicos, no fisicos.
- Hay auditoria para cambios de negocio.
- Se evita duplicar entidades por importaciones o sincronizaciones.

## Finanzas

- Los importes se parsean y formatean de forma consistente.
- Los calculos importantes tienen prueba o verificacion manual.
- Los estados visibles estan en espanol aunque los codigos internos sean estables.
- Los datos incompletos se muestran como pendientes, no se esconden.

## Shopify y externos

- Los fallos externos no borran datos locales.
- La sincronizacion registra resumen y errores por bloque.
- Los secretos no aparecen completos en UI, logs ni respuestas.
- El stock real procede de Shopify.

## Base local

- Hay backup antes de migraciones.
- Las migraciones son idempotentes.
- El arranque con base existente no rompe compatibilidad.
- Hay endpoint o vista para diagnostico tecnico.

## UI

- Las listas grandes tienen filtros y paginacion.
- Las vistas de detalle se abren de forma consistente.
- Los formularios evitan pedir datos que no aportan valor.
- Los errores son visibles y accionables.

## Rollback

- El cambio se puede revertir por git.
- Los datos tienen backup reciente.
- Si hay migracion, existe una explicacion de recuperacion.
