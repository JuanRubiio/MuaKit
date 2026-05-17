# Runbook: Trabajar con specs

## Crear una spec nueva

1. Copiar `docs/sdd/spec-template.md`.
2. Guardarla en `docs/specs/NNN-nombre-corto.md`.
3. Completar contexto, objetivo, no objetivos y criterios de aceptacion.
4. Revisar checklist de robustez.
5. Implementar solo cuando el alcance este claro.

## Numeracion

Usar numeros crecientes de tres digitos:

```text
004-order-margin-v1.md
005-purchase-replenishment-v1.md
```

Las specs `000` a `003` son retrospectivas.

## Cuando crear ADR

Crear ADR si la spec fuerza una decision que condiciona el futuro:

- cambio de motor de base de datos;
- cambio de fuente de verdad;
- nuevo conector externo;
- estrategia de seguridad;
- cambio relevante de arquitectura.

## Actualizar tras implementar

Al cerrar una spec:

- cambiar estado a `Implementada`;
- anadir desviaciones relevantes;
- anadir pruebas ejecutadas;
- enlazar commit si aporta claridad.

## Regla de oro

La spec no debe vender humo. Debe decir que hacemos, que no hacemos y donde
puede romperse.
