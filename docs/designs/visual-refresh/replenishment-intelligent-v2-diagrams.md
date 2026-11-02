# Reposición inteligente v2: diagramas de implementación

Este documento complementa
`replenishment-intelligent-v2-functional.md` y define el recorrido, los datos,
las visualizaciones y la persistencia necesarios para que la recomendación sea
entendible y auditable.

## 1. Recorrido operativo

```mermaid
flowchart LR
  A[Entrar en Reposición] --> B[Leer resumen de riesgo]
  B --> C{Qué quiero resolver?}
  C -->|Roturas| D[Comprar ahora]
  C -->|Próximas necesidades| E[Comprar pronto]
  C -->|Datos dudosos| F[Revisar]
  D --> G[Abrir detalle del material]
  E --> G
  F --> G
  G --> H[Contrastar demanda, cobertura y fuentes]
  H --> I{La recomendación convence?}
  I -->|Sí| J[Ajustar o aceptar cantidad]
  I -->|No| K[Corregir stock, plazo, pack o proveedor]
  K --> L[Recalcular]
  L --> H
  J --> M[Seleccionar material]
  M --> N[Preparar plan por proveedor]
```

Principio: la aplicación propone y explica; la persona selecciona y confirma.

## 2. Fuentes y cálculo

```mermaid
flowchart TB
  subgraph Fuentes operativas
    S1[Stock Shopify actual]
    S2[Stock manual si no hay Shopify]
    D1[Líneas de pedidos vinculadas]
    D2[Componentes activos del set aplicado]
    P1[Proveedor y plazo real]
    P2[Pack y pedido mínimo]
    C1[Coste medio del material]
  end

  subgraph Calidad
    Q1[Stock conocido]
    Q2[Muestra de consumo]
    Q3[Plazo configurado]
    Q4[Proveedor disponible]
  end

  S1 --> E[Motor de reposición]
  S2 --> E
  D1 --> E
  D2 --> E
  P1 --> E
  P2 --> E
  C1 --> E
  Q1 --> E
  Q2 --> E
  Q3 --> E
  Q4 --> E

  E --> R1[Acción]
  E --> R2[Cantidad sugerida]
  E --> R3[Fecha probable de rotura]
  E --> R4[Confianza]
  E --> R5[Inversión estimada]
  E --> R6[Motivos y supuestos]
```

El coste se usa únicamente para valorar la inversión. Nunca cambia la urgencia
ni la cantidad física recomendada.

## 3. Demanda observada

La ficha mostrará doce semanas con dos fuentes apiladas y una línea de demanda
ponderada.

```mermaid
xychart-beta
  title "Demanda semanal del material"
  x-axis [S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12]
  y-axis "Unidades" 0 --> 8
  bar [1, 2, 1, 3, 2, 2, 4, 3, 5, 4, 6, 5]
  line [1.2, 1.3, 1.4, 1.7, 1.9, 2.1, 2.6, 2.9, 3.4, 3.8, 4.2, 4.5]
```

Implementación real:

- Barras verdes: consumo directo de líneas Shopify.
- Barras doradas: consumo indirecto por sets activos.
- Línea: demanda semanal derivada de la ponderación 30/90 días.
- Tooltip: semana, directo, sets, total y pedidos implicados.
- Una semana sin consumo se muestra como cero, no como dato ausente.

## 4. Proyección de stock

```mermaid
flowchart LR
  A[Hoy: stock disponible] --> B[Consumo previsto hasta llegada]
  B --> C{Se agota antes?}
  C -->|Sí| D[Rotura prevista]
  C -->|No| E[Stock al recibir]
  D --> F[Fecha de rotura]
  E --> G[Recepción estimada]
  F --> H[Compra prioritaria]
  G --> I[Sumar cantidad propuesta]
  H --> I
  I --> J[Cobertura tras compra]
```

### Series del gráfico

```mermaid
xychart-beta
  title "Proyección de stock"
  x-axis [Hoy, +7d, Llegada, +21d, +35d, Objetivo]
  y-axis "Stock" 0 --> 14
  line [8, 5, 2, 0, 0, 0]
  line [8, 5, 11, 8, 4, 2]
```

- Línea roja: proyección sin comprar.
- Línea verde: proyección incluyendo la compra propuesta en la fecha de llegada.
- Línea horizontal: punto de seguridad.
- Banda suave: cobertura objetivo.
- Marcadores: fecha de rotura, fecha de pedido y fecha estimada de recepción.

La proyección usa demanda constante ponderada en la primera versión. No se
presentará como predicción estadística ni como stock histórico.

## 5. Urgencia y confianza

```mermaid
quadrantChart
  title Urgencia operativa frente a confianza
  x-axis Confianza baja --> Confianza alta
  y-axis Cubierto --> Rotura inmediata
  quadrant-1 Comprar ahora
  quadrant-2 Revisar antes de comprar
  quadrant-3 Mantener en revisión
  quadrant-4 Comprar pronto
  "Stock 0, demanda estable, plazo real": [0.90, 0.95]
  "Stock 0, sin consumo observado": [0.25, 0.90]
  "Cobertura 12d, llegada 14d": [0.82, 0.72]
  "Objetivo manual, stock conocido": [0.38, 0.42]
  "Cobertura 60d": [0.88, 0.12]
```

Consecuencia visual:

- El color principal de la fila representa urgencia.
- La etiqueta `Alta`, `Media`, `Manual` o `Incompleta` representa confianza.
- Nunca se usa el mismo color o etiqueta para ambas dimensiones.

## 6. Explicación de una cantidad

```mermaid
flowchart LR
  A[Demanda diaria 0,21] --> B[Horizonte 51 días]
  B --> C[Objetivo 10,7 ud]
  D[Stock disponible 2 ud] --> E[Déficit 8,7 ud]
  C --> E
  E --> F[Pack 1 ud]
  G[Mínimo 1 ud] --> F
  F --> H[Comprar 9 ud]
```

El detalle mostrará también la descomposición del objetivo:

```mermaid
flowchart LR
  A[Demanda hasta llegada] --> T[Stock objetivo]
  B[Stock de seguridad] --> T
  C[Cobertura adicional] --> T
  T --> D[Restar stock disponible]
  D --> E[Redondear a pack y mínimo]
```

## 7. Arquitectura de pantalla

```mermaid
flowchart TB
  H[Cabecera Materiales + navegación] --> K[4 KPI de decisión]
  K --> O[Resumen de riesgo | Compra por proveedor]
  O --> F[Filtros + acciones + supuestos]
  F --> S[Barra de selección supervisada]
  S --> T[Tabla densa de materiales]
  T --> X[Detalle desplegable]
  X --> X1[Fórmula]
  X --> X2[Demanda 12 semanas]
  X --> X3[Proyección de stock]
  X --> X4[Fuentes y calidad]
  X --> X5[Simulador de cantidad y fecha]
  T --> M[Ver ficha completa del material]
  M --> M1[Sección Demanda y reposición]
```

### Escritorio

- Resumen y lista permanecen en la misma vista.
- Solo una fila puede mostrar gráficos expandidos simultáneamente.
- Los gráficos se organizan en dos columnas: demanda y proyección.
- La fórmula y los supuestos quedan debajo de los gráficos.

### Móvil

```mermaid
flowchart TB
  A[KPI desplazables en 2 columnas] --> B[Pestañas de decisión]
  B --> C[Filtros esenciales]
  C --> D[Tarjeta compacta del material]
  D --> E[Stock + cobertura + cantidad]
  E --> F[Botón Ver explicación]
  F --> G[Detalle a ancho completo]
  G --> H[Demanda]
  H --> I[Proyección]
  I --> J[Fórmula y fuentes]
```

En móvil se ocultan métricas secundarias de la fila, pero nunca el motivo, la
confianza, la cobertura ni la cantidad propuesta.

## 8. Datos históricos necesarios

```mermaid
erDiagram
  MATERIALS ||--o{ MATERIAL_INVENTORY_SNAPSHOTS : registra
  MATERIALS ||--o{ REPLENISHMENT_RUN_ITEMS : evalua
  REPLENISHMENT_RUNS ||--o{ REPLENISHMENT_RUN_ITEMS : contiene
  PURCHASE_ORDER_LINES o|--o{ REPLENISHMENT_RUN_ITEMS : origina
  SHOPIFY_SYNC_RUNS o|--o{ MATERIAL_INVENTORY_SNAPSHOTS : captura

  MATERIAL_INVENTORY_SNAPSHOTS {
    int id PK
    int material_id FK
    int shopify_sync_run_id FK
    decimal quantity
    string source
    datetime captured_at
  }

  REPLENISHMENT_RUNS {
    int id PK
    string model_version
    json parameters
    datetime generated_at
  }

  REPLENISHMENT_RUN_ITEMS {
    int id PK
    int run_id FK
    int material_id FK
    decimal stock_snapshot
    decimal demand_snapshot
    decimal suggested_quantity
    string action
    string confidence
    json reasons
    int purchase_order_line_id FK
  }
```

### Política de snapshots

1. Guardar stock por material al terminar una sincronización Shopify correcta.
2. No duplicar un snapshot si cantidad y sincronización no han cambiado.
3. Guardar una ejecución de reposición solo cuando se abre la vista tras datos
   nuevos, cuando se fuerza un recálculo o cuando se crea un plan.
4. Conservar el modelo y parámetros usados para poder explicar resultados
   históricos aunque la fórmula evolucione.

## 9. Secuencia de sincronización y recálculo

```mermaid
sequenceDiagram
  participant U as Usuario
  participant UI as Mua Ops
  participant S as Shopify
  participant DB as SQLite
  participant R as Motor reposición

  U->>UI: Sincronizar Shopify
  UI->>S: Productos, inventario y pedidos
  S-->>UI: Datos actualizados
  UI->>DB: Guardar stock y pedidos
  UI->>DB: Crear snapshots de inventario
  UI->>R: Invalidar cálculo anterior
  R->>DB: Leer demanda, stock y proveedores
  R-->>UI: Recomendaciones explicadas
  UI-->>U: Refrescar resumen y materiales
```

## 10. Simulador supervisado

```mermaid
stateDiagram-v2
  [*] --> RecomendacionOriginal
  RecomendacionOriginal --> Simulando: cambia cantidad o fecha
  Simulando --> Simulando: recalcula cobertura
  Simulando --> RecomendacionOriginal: restablecer
  Simulando --> Aceptada: usar cantidad simulada
  RecomendacionOriginal --> Aceptada: aceptar sugerencia
  Aceptada --> PlanDeCompra: seleccionar y preparar plan
  PlanDeCompra --> [*]
```

El simulador no cambia el stock, el material ni la recomendación persistida.
Solo define la cantidad supervisada que se enviará al plan de compra.

## 11. Fases de implementación

```mermaid
flowchart LR
  F1[1. Cálculo y API explicable] --> F2[2. Lista y detalle visual]
  F2 --> F3[3. Gráfico de demanda]
  F3 --> F4[4. Proyección y simulador]
  F4 --> F5[5. Snapshots históricos]
  F5 --> F6[6. Evaluación de recomendaciones]
```

1. Consolidar acciones, confianza, fórmula y fuentes.
2. Afinar la vista principal y el detalle desplegable.
3. Añadir agregación semanal directa/sets y gráfico de doce semanas.
4. Añadir proyección sin/con compra y simulación local.
5. Persistir snapshots en sincronizaciones futuras.
6. Comparar recomendación, compra y rotura posterior para calibrar el modelo.

## 12. Validación funcional

- La suma semanal de demanda reconcilia con consumo 30/90 días.
- La fecha de rotura coincide con `stock / demanda diaria`.
- La proyección con compra aplica el incremento solo en la fecha de llegada.
- El simulador no persiste hasta preparar el plan.
- Un material manual nunca aparece dentro de selección fiable.
- Los snapshots no modifican Shopify ni el stock operativo.
- El detalle histórico indica claramente datos reales frente a proyecciones.
