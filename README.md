# Dashboard de Indicadores de Turismo

Dashboard web con HTML, CSS y JavaScript puro, con Supabase como backend.

## Qué cambió en esta versión

- agrupación de indicadores por destino
- comparación entre varios destinos usando una **clave comparable** por indicador
- cálculo anual **configurable por indicador**
- posibilidad de ocultar el gráfico anual cuando no tenga sentido
- corrección del alta de años en la carga manual: ya no aparece 2026 por defecto

## Configuración rápida

1. Crear proyecto en Supabase.
2. Ejecutar `supabase_schema.sql` completo en SQL Editor.
3. Configurar `js/config.js` con tu URL y anon key.
4. Crear un usuario admin en Authentication.
5. Subir el proyecto a GitHub Pages.

## Lógica anual configurable

Cada indicador puede usar una de estas reglas:

- **Suma anual**: para volúmenes del período
- **Promedio anual**: para lecturas promedio
- **Último valor del año**: para stocks puntuales
- **Máximo anual** / **Mínimo anual**
- **Recalcular por numerador / denominador**: para tasas y ratios
- **Ocultar valor anual**

### Casos típicos EOH

- **Establecimientos** → `last_value` o `average`, según criterio analítico
- **Viajeros / plazas ocupadas / habitaciones ocupadas / disponibles** → `sum`
- **TOH / TOP / estadía** → `ratio_of_sums`

Ejemplos:

- TOH anual = `habitaciones_ocupadas / habitaciones_disponibles * 100`
- TOP anual = `plazas_ocupadas / plazas_disponibles * 100`
- Estadía anual = `plazas_ocupadas / viajeros`

## Clave comparable

Usá la misma `clave comparable` en todos los destinos para el mismo indicador conceptual.

Ejemplo:

- Mar del Plata → `viajeros`
- Córdoba → `viajeros`
- Bariloche → `viajeros`

Así el comparador puede tomar el mismo indicador y enfrentarlo entre destinos.

## Estructura

```text
/
├── index.html
├── pages/
│   └── admin.html
├── css/
│   └── style.css
├── js/
│   ├── config.js
│   ├── db.js
│   ├── stats.js
│   ├── charts.js
│   └── exports.js
└── supabase_schema.sql
```


## Novedades de esta versión

- títulos agrupadores por indicador para armar ramas visuales dentro de cada destino
- eliminación selectiva de años desde el panel admin
- estado de datos con color en las tarjetas de indicadores

**Importante:** si ya tenías el proyecto en producción, ejecutá nuevamente `supabase_schema.sql` para agregar la columna `group_title` en `indicators`.


## 📝 Aclaración metodológica por indicador

Si un mismo indicador cambia de rotulado, unidad o aclaración entre períodos, no hace falta duplicarlo.

Podés cargar una **aclaración metodológica** en el panel admin, por ejemplo:

- `Hasta 2019: días`
- `Desde 2020: noches`

La app la muestra en admin, en la vista pública y también la incorpora en las exportaciones.

