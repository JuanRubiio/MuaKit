# ADR-0005: SDD ligero con checklist de robustez

## Estado

Aceptada.

## Contexto

Mua Ops ya maneja datos sensibles y decisiones de negocio. Seguir solo con
implementacion incremental sin specs aumenta el riesgo de recalcular mal,
duplicar datos o cambiar reglas sin memoria.

## Decision

Adoptar Spec Driven Development ligero. Solo exigimos spec para cambios con
impacto relevante en negocio, datos, dinero, stock, Shopify, migraciones o
seguridad.

## Consecuencias

Beneficios:

- Mejor memoria de producto.
- Cambios grandes con alcance claro.
- Menos retrabajo y menos decisiones implicitas.
- Facilita convertir la app en producto implantable mas adelante.

Costes:

- Hay que escribir antes de codificar en cambios importantes.
- Las specs deben mantenerse honestas tras implementar.

## Alternativas consideradas

- No documentar: rapido hoy, caro manana.
- Proceso pesado tipo enterprise: excesivo para el tamano actual.

## Revisitaremos cuando

- El equipo crezca.
- Se incorporen perfiles no tecnicos.
- La app se implante en otros negocios.
