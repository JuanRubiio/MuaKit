# Runbook: Operacion local

## Arranque

Desde la raiz del repo:

```powershell
npm start
```

Abrir:

```text
http://127.0.0.1:5055
```

Tambien existe:

```powershell
.\start-mua-ops.cmd
```

## Pruebas

```powershell
npm test
npm run test:ui:smoke
```

En este entorno Windows puede aparecer algun bloqueo temporal de cache o logs.
La prueba directa de API es:

```powershell
node mua_ops_node/test-api.js
node mua_ops_node/test-ui-smoke.js
```

## Datos locales

Base:

```text
data/mua_ops/mua_ops.sqlite
```

Adjuntos:

```text
data/mua_ops/uploads
```

Backups:

```text
data/mua_ops/backups
```

Los backups contienen configuracion privada, incluidas credenciales Shopify si
estan configuradas.

## Backup manual

Desde la app:

```text
Configuracion > Diagnostico > Crear backup
```

Desde API:

```text
POST /api/system/backup
```

## Diagnostico

Desde la app:

```text
Configuracion > Diagnostico
Configuracion > Logs
Actividad
```

Desde API:

```text
GET /api/system/health
GET /api/audit-log?scope=technical
GET /api/audit-log?scope=business
```

## Shopify

La sincronizacion principal vive en:

```text
Configuracion > Shopify
```

Acciones:

- Probar conexion.
- Guardar Shopify.
- Sincronizar ahora.
- Activar o desactivar auto refresco.

Si Shopify falla, la app debe seguir operativa y no debe borrar datos locales.

## Recuperacion sencilla

1. Parar la app.
2. Copiar el backup elegido desde `data/mua_ops/backups`.
3. Sustituir `data/mua_ops/mua_ops.sqlite`.
4. Arrancar con `npm start`.
5. Revisar `Configuracion > Diagnostico`.
