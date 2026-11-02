# Pedidos: tipologías y sets por defecto

## Propósito

La tipología es un atributo del pedido, no una línea de Shopify. Debe explicar qué
clase de producto se ha vendido, qué set fijo corresponde y por qué el coste real
y el margen tienen esos valores.

El rediseño cubre tres superficies:

1. Listado operativo de pedidos.
2. Detalle y auditoría de un pedido.
3. Configuración de sets predeterminados por tipología.

## Diseños

- `pedidos-tipologias-listado-desktop.png`
- `pedidos-tipologias-detalle-desktop.png`
- `pedidos-tipologias-sets-desktop.png`

Estos diseños son conceptuales. La navegación y la marca de la aplicación real se
mantendrán durante la implementación; lo que se valida aquí es la arquitectura de
información y la experiencia del dominio.

## Tipologías cerradas

- `Recuerdos de maternidad`
- `Recuerdos de mascota`
- `Flores y recuerdos de pareja`
- `Lugares y viajes`
- `Memorial`
- `Omoi`
- `Joya extra sin kit`

Si no hay señal suficiente, el pedido queda como `Sin clasificar`. Nunca se fuerza
una tipología ni un set cuando la detección no es fiable.

## Mapa inicial de sets

| Tipología | Set predeterminado | Regla principal |
| --- | --- | --- |
| Recuerdos de maternidad | Kit maternal con pipeta | Incluye pipeta |
| Recuerdos de mascota | Kit mascotas sin pipeta | No incluye pipeta |
| Flores y recuerdos de pareja | Kit pareja y flores | Composición específica |
| Lugares y viajes | Kit lugares y viajes | Composición específica |
| Memorial | Kit memorial | Composición específica |
| Omoi | Set Omoi | Sin componentes extra |
| Joya extra sin kit | Joya extra sin kit | Sin lámpara ni caja MP |

Cada tipología puede tener varias versiones de set, pero solo una versión
predeterminada para pedidos nuevos.

## Diseño 1: listado de pedidos

El listado pasa a ser una herramienta para encontrar excepciones, no solo una
tabla contable.

### Jerarquía

- KPIs limitados a cobertura tipológica, margen fiable y pedidos que requieren
  revisión.
- Filtros de `Tipología`, `Set aplicado` y `Estado del margen` junto a los filtros
  actuales.
- Tabla como elemento principal.
- Rail lateral de revisión con cuatro incidencias accionables:
  `Sin tipología`, `Set no recomendado`, `Sin coste` y `Margen en presión`.
- Paginación visible.

### Contenido de cada fila

- Pedido, fecha y canal.
- Tipología con icono y nombre completo.
- Resumen de líneas reales de Shopify.
- Venta, coste real y porcentaje de margen.
- Estado independiente del color del margen.
- Indicación de si el set aplicado coincide con el recomendado.

La línea Shopify que actualmente representa el nombre del kit no aparece como
producto excluido: se usa como evidencia para clasificar el pedido y después se
oculta del contenido material.

## Diseño 2: detalle del pedido

La parte superior responde en una sola lectura a cuatro preguntas:

1. ¿Qué tipología tiene el pedido?
2. ¿Qué set recomienda esa tipología?
3. ¿Qué set está aplicado realmente?
4. ¿Coinciden o existe una excepción manual?

### Estructura

- Banda de identidad con tipología, origen de la detección y acción de edición.
- Set recomendado y set aplicado, con estado `Coincide` o `Excepción manual`.
- Fórmula económica sin KPIs duplicados:
  `Coste contenido + Set fijo = Coste real -> Margen`, acompañada de la venta
  neta.
- Tabla de contenido Shopify con productos reales.
- Componentes del set aplicado con imagen, cantidad, coste y control de inclusión.
- Rail de validación con tipología, set, líneas y costes.
- Simulación del impacto antes de cambiar la tipología y aplicar otro set.

Cambiar la tipología propone el nuevo set predeterminado. Si el pedido ya tenía
una excepción manual, el cambio requiere confirmación y nunca la pisa en silencio.

## Diseño 3: sets por tipología

La vista deja de ser una colección abstracta de sets. La pregunta principal pasa
a ser: `¿Qué lleva por defecto cada tipo de pedido?`.

### Estructura

- Selector horizontal de las siete tipologías.
- Tabla maestra con tipología, set predeterminado, componentes, coste, pedidos que
  lo usan y estado de configuración.
- Editor de detalle del set seleccionado.
- Componentes con cantidad, coste e interruptor de inclusión.
- Un material puede permanecer en la versión pero quedar desactivado con una nota
  explícita; por ejemplo, la pipeta en `Recuerdos de mascota`.
- Resumen de coste, cobertura de uso e historial de versiones.

Los cambios en el set predeterminado se aplican a pedidos nuevos. Los pedidos ya
confirmados conservan su snapshot salvo modificación manual explícita.

## Detección automática

La clasificación puede usar, por orden de prioridad:

1. Producto principal o variante Shopify.
2. Tags y propiedades de la línea.
3. Reglas normalizadas por términos conocidos.
4. Correcciones humanas previas convertidas en reglas auditables.

La interfaz debe distinguir `Detectada automáticamente`, `Regla aprendida` y
`Asignada manualmente`. La confianza pertenece a la detección de tipología, no al
cálculo del margen.

## Reglas de coste

- El margen conserva la fórmula `Contenido Shopify + Set fijo`.
- La tipología no suma coste por sí misma.
- Los componentes del set pueden activarse o desactivarse por versión y por pedido.
- `Omoi` muestra claramente `Sin componentes extra` y coste fijo `0,00 €`.
- `Joya extra sin kit` excluye lámpara, caja MP y materiales base de presentación.
- La recomendación de set y el set aplicado deben quedar registrados por separado.

## Validación previa a implementación

Antes de desarrollar deben aprobarse estas decisiones:

1. La tipología es visible y editable en listado y detalle.
2. La tipología no aparece como una línea de producto.
3. El set recomendado se deriva de la tipología, pero puede sustituirse por pedido.
4. Los cambios de set predeterminado no reescriben pedidos confirmados.
5. Las excepciones se revisan desde el rail lateral y desde filtros equivalentes.
6. La vista de sets se organiza por tipología y conserva versiones.

## Alcance técnico posterior

La implementación requerirá, como mínimo:

- tipología persistida en `sales_orders`;
- relación entre tipología y versión de set predeterminada;
- detector durante la sincronización Shopify y reprocesado de históricos;
- filtros y estados de revisión;
- trazabilidad de recomendación, aplicación y ajuste manual;
- migración de los sets existentes al nuevo mapa tipológico.
