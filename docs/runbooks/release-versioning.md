# Runbook: Versionado y cierre de fases

## Ramas

Usamos ramas con prefijo:

```text
codex/<nombre>
```

Ramas importantes:

- `codex/shopify-direct-sync`: base del MVP v0.1.
- `main`: rama objetivo de integración.
- `codex/intelligent-replenishment-v2`: rama de esta release, publicada en GitHub.

## Cierre de una fase

1. Ejecutar pruebas.
2. Revisar `git status`.
3. Commit con mensaje claro.
4. Crear tag si es punto estable.
5. Crear nueva rama para la siguiente fase.

Comandos orientativos:

```powershell
npm test
& 'C:\Program Files\Git\cmd\git.exe' status --short
& 'C:\Program Files\Git\cmd\git.exe' tag -a <tag> -m "<mensaje>"
& 'C:\Program Files\Git\cmd\git.exe' switch -c codex/<siguiente-fase>
```

## Tags actuales

- `mua-ops-mvp-v0.1`: MVP operativo antes de la estabilizacion tecnica.
- `v1.1.0`: cierre de la remodelacion visual.
- `v1.2.0`: gastos automatizados y primera version de reposicion.
- `v1.2.1`: refuerzo de la bandeja de importacion.
- `v1.2.2`: Dashboard de control y estabilización previa al rediseño de reposición.
- `v1.2.3`: estabilización adicional de smoke tests.
- `v1.2.4`: cierre de importación OCR, patrones por proveedor, proveedores y control contable.

## Preparación de PR a main

Antes de abrir el PR:

1. Confirmar `git status --short` vacío.
2. Ejecutar `npm test` y `npm run test:ui:smoke`.
3. Revisar migraciones, documentación de release y cambios de datos.
4. Comparar la rama contra `main` y revisar que no haya archivos generados o secretos.
5. Publicar la rama y el tag; el merge a `main` debe hacerse mediante PR.

## Antes de cambios con datos

- Crear o confirmar backup.
- Revisar si hace falta spec.
- Revisar checklist de robustez.
- Evitar borrar datos fisicamente salvo que la spec lo justifique.

## Commit recomendado

Un commit debe dejar claro:

- que cambio funcional o tecnico introduce;
- si toca datos, migraciones o seguridad;
- si responde a una spec.

Ejemplo:

```text
Implement order margin v1 from spec 004
```
