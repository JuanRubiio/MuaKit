# Spec: Ingresos Y Dashboard Financiero

## Estado

Implementada retrospectivamente.

## Contexto

Una vez controlados gastos y materiales, Mua Ops necesitaba registrar ingresos
reales para preparar el salto a margen. En esta fase el foco no era pedido a
pedido, sino cobros/payouts por canal y lectura financiera agregada.

## Objetivo

Registrar ingresos por canal, visualizar gastos e ingresos en dashboard y crear
una base de analisis financiero sin mezclar aun margen formal.

## No objetivos

- No repartir fees hasta nivel de pedido.
- No conciliar banco formalmente.
- No calcular margen neto definitivo.
- No modelar Etsy con detalle de pedido, solo como ingreso neto.

## Usuarios y flujos

- Crear ingresos manuales para Bizum, Etsy u otros casos no sincronizados.
- Sincronizar payouts Shopify.
- Filtrar ingresos por canal, estado y fechas.
- Ver KPIs, graficas mensuales o diarias y reparto por canal.
- Consultar balance simple de gastos frente a ingreso neto.

## Modelo de datos

Entidades:

- `sales_channels`
- `channel_payouts`
- `channel_payout_imports`
- `sales_orders`
- `audit_log`

Fuente de verdad:

- Shopify payouts: sincronizacion Shopify.
- Bizum: alta manual.
- Etsy: ingreso neto manual o historico resumido.

## Reglas funcionales

- Los ingresos se muestran como "Ingresos" en UI.
- "Cobrado neto" se conserva como nombre de metrica precisa.
- Los estados internos pueden estar en ingles, pero UI debe mostrarlos en espanol.
- Los filtros de ingresos afectan a KPIs del modulo.
- Dashboard permite ventana temporal y granularidad automatica, mensual o diaria.

## API / UI

Vistas:

- Ingresos
- Dashboard
- Configuracion > Ingresos

APIs:

- `GET /api/income/summary`
- `GET /api/channel-payouts`
- `GET /api/channel-payouts/:id`
- `POST /api/channel-payouts`
- `PATCH /api/channel-payouts/:id`
- `DELETE /api/channel-payouts/:id`
- `GET /api/dashboard/finance`

## Seguridad y datos

- Los ingresos archivados no computan en resumen activo.
- Cambios manuales quedan auditados.
- Importes se formatean en EUR en UI.

## Migracion y rollback

La capa de ingresos se anadio sin sustituir facturas ni costes. Si una sync de
Shopify produce datos erroneos, se puede archivar o corregir manualmente y
recuperar backup.

## Test plan

- Crear ingreso manual.
- Editar y archivar ingreso.
- Verificar resumen de ingresos filtrado.
- Verificar dashboard con cero datos, un mes y varios meses.
- Ejecutar `npm test`.

## Criterios de aceptacion

- Ingresos se pueden consultar y filtrar sin CSV.
- Dashboard muestra gasto, ingreso, balance y canales.
- La ventana temporal afecta a KPIs y graficas.
- La app queda preparada para margen por pedido.
