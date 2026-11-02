# Spec: Estabilizacion Tecnica v0.2

## Estado

Implementada retrospectivamente.

## Contexto

Tras el MVP, la app ya contenia datos reales de negocio. Antes de seguir con
margen por pedido, era necesario proteger datos, mejorar diagnostico y preparar
una base tecnica mas mantenible.

## Objetivo

Estabilizar la app sin cambiar comportamiento funcional: backups, migraciones,
health checks, logs, actividad, diagnostico y mejoras de UX para listas grandes.

## No objetivos

- No cambiar de `sql.js` a otro motor.
- No introducir login.
- No desplegar cloud.
- No refactorizar completo backend/frontend todavia.

## Usuarios y flujos

- Ver diagnostico tecnico desde Configuracion.
- Crear backup manual.
- Consultar logs tecnicos filtrados.
- Consultar actividad de negocio limpia.
- Navegar listados grandes con paginacion.

## Modelo de datos

Entidades afectadas:

- `schema_migrations`
- `audit_log`
- `app_settings`

La base principal sigue siendo `data/mua_ops/mua_ops.sqlite`.

## Reglas funcionales

- Antes de migraciones pendientes sobre base existente se crea backup.
- Las migraciones son idempotentes.
- Health check no expone secretos.
- Actividad muestra negocio, no ruido tecnico.
- Logs tecnicos viven en Configuracion > Logs.
- Listados grandes usan paginacion y respetan filtros.

## API / UI

APIs nuevas o reforzadas:

- `GET /api/system/health`
- `POST /api/system/backup`
- `GET /api/audit-log?scope=business|technical`

UI:

- Configuracion > Diagnostico
- Configuracion > Logs
- Actividad
- Paginacion en Facturas, Ingresos, Materiales, Proveedores, Costes, Kits, Actividad y Logs.

## Seguridad y datos

- Redaccion de secretos en errores, logs y health.
- Backups contienen secretos y se consideran privados.
- Errores API normalizados con `{ error, code, details? }`.
- Logs tecnicos se filtran por nivel y origen.

## Migracion y rollback

Se mantiene compatibilidad con la base existente. En caso de fallo se recupera
backup local y se revierte commit.

## Test plan

- `node --check mua_ops_node/public/app.js`
- `node mua_ops_node/test-api.js`
- `npm test` cuando el entorno Windows no bloquee cache/logs temporales.
- Verificar manualmente diagnostico, logs, actividad y listados paginados.

## Criterios de aceptacion

- Arranque con base nueva y existente.
- Backup antes de migrar.
- Health check util y sin secretos.
- Logs tecnicos filtrables.
- Actividad util para negocio.
- Listas grandes sin scroll infinito.
