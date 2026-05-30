# Spec: Visual Refresh v1

## Contexto

La fase de estabilizacion tecnica ya dejo la app clasica suficientemente modularizada para abordar una mejora visual sobre la interfaz actual de `http://127.0.0.1:5055/`.

Los disenos aceptados estan en:

- `desings/visual-refresh/dashboard.png`
- `desings/visual-refresh/facturas.png`
- `desings/visual-refresh/editar factura.png`
- `desings/visual-refresh/nueva factura.png`
- `desings/visual-refresh/ingresos.png`
- `desings/visual-refresh/nuevo ingreso.png`
- `desings/visual-refresh/materiales.png`
- `desings/visual-refresh/ver material.png`
- `desings/visual-refresh/nuevo material.png`
- `desings/visual-refresh/proveedores.png`
- `desings/visual-refresh/ver proveedor.png`
- `desings/visual-refresh/nuevo proveedor.png`
- `desings/visual-refresh/costes.png`
- `desings/visual-refresh/ver coste.png`
- `desings/visual-refresh/kits.png`
- `desings/visual-refresh/ver kit.png`
- `desings/visual-refresh/nuevo kit.png`
- `desings/visual-refresh/editar kit.png`
- `desings/visual-refresh/actividad.png`
- `desings/visual-refresh/ver actividad.png`
- `desings/visual-refresh/configuracion.png`
- `desings/visual-refresh/configuracion shopify.png`
- `desings/visual-refresh/configuracion logs.png`

Nota: la carpeta esta escrita como `desings`. Puede renombrarse mas adelante si no rompe referencias locales.

## Objetivo

Elevar Mua Ops de una interfaz funcional a una consola operativa profesional, manteniendo la app clasica y el contrato actual del backend.

El refresh debe priorizar:

- lectura rapida de indicadores;
- listados densos, filtrables y paginados;
- detalle claro arriba/abajo o en pantalla dedicada;
- paneles laterales de revision;
- acciones principales persistentes;
- consistencia visual entre modulos;
- base preparada para margen, pedidos, publicidad y reposicion.

## No objetivos

- No reabrir la app `next` ni migrar a Vite/Preact.
- No cambiar el motor SQLite ni la arquitectura backend base.
- No implementar margen por pedido todavia.
- No automatizar compras o seguimiento de precios de proveedor.
- No introducir multiusuario real, aunque los disenos muestren avatar/actor.

## Sistema visual extraido

### Shell

- Topbar horizontal fija con logo, nombre, navegacion principal, actividad/configuracion, campana y avatar.
- La sidebar clasica desaparece.
- El contenido usa ancho amplio, con ritmo de dashboard profesional.
- El estado activo se marca con subrayado granate o boton negro segun contexto.

### Paleta

- Fondo: blanco calido muy suave, no beige dominante.
- Superficies: blanco con bordes finos y sombra ligera.
- Texto principal: negro suave.
- Muted: gris calido.
- Accento primario: verde petroleo.
- Accento secundario: granate/rosa Mua para navegacion, estados y alertas.
- Semanticos: verde OK, naranja pendiente, rojo critico, azul/menta informativo, arena para packaging/logistica.

### Tipografia

- Titulos principales con serif elegante.
- UI, tablas, botones y controles con sans limpia.
- Etiquetas pequenas en uppercase para dominio/contexto.
- Tablas con texto compacto y buena separacion.

### Componentes recurrentes

- KPI cards con icono en chip tintado, valor grande, subtitulo y variacion.
- Tablas densas con checkbox, icono/thumbnail, chips, acciones iconicas.
- Panel derecho de "cola de revision", "ultimos", "acciones sugeridas" o "resumen".
- Formularios por secciones numeradas.
- Barra inferior de acciones en formularios/detalles.
- Chips de estado y taxonomia.
- Controles segmentados para tabs de tabla.
- Dropzone de documentos/imagenes.
- Mini timeline de actividad contextual.

## Cambios funcionales implicitos

Los disenos no son solo CSS. Introducen o elevan estas capacidades:

- Navegacion superior con iconos.
- Acciones iconicas: ver, editar, duplicar, archivar, abrir externo, exportar.
- KPIs por modulo: facturas, ingresos, materiales, proveedores, costes, kits, actividad y logs.
- Paneles de revision por modulo.
- Tablas reales para facturas, ingresos, materiales, proveedores, costes, kits, actividad y logs.
- Guardar vista y selector de columnas aparecen en diseno, pero pueden quedar en fase posterior si no hay soporte real.
- Detalles enriquecidos por entidad con actividad contextual.
- Formularios con revision lateral y acciones sugeridas.
- Barra inferior persistente en formularios y detalles.
- Materiales: salud de stock, reposicion sugerida, uso en kits, imagen destacada, galeria, abrir en Shopify.
- Proveedores: plan de compra, materiales suministrados, facturas recientes, fiabilidad/plazo.
- Costes: evolucion por lote, outlier, confianza, composicion del calculo.
- Kits: completitud, stock limitante, impacto en stock, coste por bloque.
- Logs: seleccion de evento, copiar diagnostico, marcar revisado.

## Dependencias recomendadas

La app clasica es vanilla JS. Para no introducir un framework nuevo:

- Mantener ECharts.
- Anadir una capa propia de iconos SVG o instalar `lucide-static`.
- Evitar librerias de tablas pesadas; las tablas actuales pueden renderizarse con HTML nativo y helpers compartidos.
- No introducir Tailwind/shadcn en esta fase porque implicaria toolchain y migracion visual innecesaria.

Decision pendiente:

- `lucide-static` via npm para iconografia consistente.
- O sprite SVG local generado a mano para los iconos usados.

## Estrategia de implementacion

### Fase 1: sistema visual y shell

- Sustituir sidebar por topbar horizontal.
- Crear primitives CSS: shell, page header, cards, kpis, chips, tables, filters, right rail, sticky action bar, icon buttons.
- Introducir iconografia.
- Ajustar tipografia y tokens.
- No cambiar logica de negocio.

### Fase 2: dashboard

- Adaptar `Dashboard` al diseno.
- Reordenar KPIs, balance mensual, atencion inmediata, listas laterales, materiales a reponer y actividad reciente.
- Mantener filtros de ventana temporal/granularidad.

### Fase 3: listados operativos

- Facturas.
- Ingresos.
- Materiales.
- Proveedores.
- Costes.
- Kits.
- Actividad.
- Logs.

Cada listado debe pasar de cards/listas a tabla densa con tabs, filtros compactos, paginacion y panel derecho cuando aplique.

### Fase 4: detalles y formularios

- Nueva factura / editar factura.
- Nuevo ingreso.
- Nuevo material / ver material.
- Nuevo proveedor / ver proveedor.
- Ver coste.
- Nuevo kit / editar kit / ver kit.
- Configuracion general, Shopify, diagnostico y logs.

### Fase 5: QA visual

- Browser plugin si esta disponible.
- Si no hay herramienta callable del Browser plugin, usar Playwright.
- Capturas de referencia vs implementacion por vista.
- Smoke test clasico actualizado.

## Riesgos

- Los disenos muestran datos y capacidades no disponibles aun en el modelo actual.
- Hay que evitar convertir placeholders visuales en datos falsos.
- El cambio de sidebar a topbar afecta `index.html`, CSS, tests y posiblemente responsive.
- Las tablas densas pueden necesitar nuevos helpers compartidos para no volver al monolito.
- La carpeta `desings` tiene typo; renombrarla puede mejorar orden, pero conviene hacerlo una vez y ajustar referencias documentales.

## Criterios de aceptacion

- La app clasica sigue cargando en `/`.
- Navegacion superior activa y usable.
- Cada vista principal se parece razonablemente a su diseno de referencia.
- No hay listas infinitas sin paginacion.
- No hay solapamientos ni texto cortado en escritorio.
- `npm test` pasa.
- `npm run test:ui:smoke` pasa.
- Se revisa al menos una captura desktop por grupo: dashboard, facturas, ingresos, materiales, costes, kits, sistema.

