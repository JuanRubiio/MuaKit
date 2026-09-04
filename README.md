# Mua Ops

Aplicación local para gestionar materiales, proveedores, facturas, costes, pedidos, cobros y sincronización con Shopify.

Versión estable: **v1.2.4** · [notas de release](docs/releases/v1.2.4.md)

## Inicio rápido

```powershell
npm install
npm start
```

Abre `http://127.0.0.1:5055`.

## Validación

```powershell
npm test
npm run test:ui:smoke
```

Las pruebas usan datos temporales y no modifican la base operativa local.

## Documentación

- [Guía completa de Mua Ops](README_MUA_OPS.md)
- [Índice de documentación](docs/README.md)
- [Operación local](docs/runbooks/local-operations.md)
- [Versionado y releases](docs/runbooks/release-versioning.md)
- [Release v1.2.4](docs/releases/v1.2.4.md)
- [Decisiones técnicas](docs/adr/)
- [Specs y retrospectivas](docs/specs/)

La aplicación es local-first: la base SQLite y los adjuntos viven bajo `data/mua_ops`. Los backups pueden contener credenciales de Shopify y deben tratarse como información privada.