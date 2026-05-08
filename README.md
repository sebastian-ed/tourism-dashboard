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



## ✳️ Observaciones puntuales por dato

Ahora cada dato mensual puede marcarse como **provisorio** y/o llevar una **observación libre**.

- Se configura desde el modal **Cargar datos**, seleccionando una celda puntual.
- En las tablas se muestra con un **asterisco (")** junto al valor.
- Al pasar el mouse sobre el valor se ve el detalle de la observación.


## Duplicación de destinos

Desde el panel admin podés crear un destino nuevo copiando la estructura completa de otro destino existente.

La duplicación copia:
- indicadores
- unidades
- descripciones
- claves comparables
- fórmulas anuales
- títulos agrupadores
- orden visual
- aclaraciones metodológicas

No copia datos mensuales, observaciones puntuales ni marcas de dato provisorio. Esto evita contaminar el destino nuevo con valores del destino base.

## Corrección de duplicación masiva de destinos

Esta versión corrige un problema operativo que aparecía cuando la base acumulaba muchos indicadores:

- la app ahora pagina la lectura completa de `indicators`, no solo el primer bloque devuelto por Supabase;
- los destinos duplicados ya no deberían aparecer con 0 indicadores por lectura parcial;
- la duplicación valida que se hayan copiado todos los indicadores esperados;
- si una duplicación falla, se revierte el destino nuevo para no dejar destinos basura;
- los destinos sin nombre se muestran como `Destino sin nombre` para poder identificarlos y editarlos;
- se puede eliminar un destino aunque no tenga datos cargados. Si sus indicadores tampoco tienen datos, la app también elimina esos indicadores para no acumularlos en `Sin destino`.

No requiere cambios nuevos de SQL.

## Gestión de “Sin destino”

El bucket **Sin destino** ahora se puede gestionar desde admin:

- **Editar “Sin destino”** crea un destino real con el nombre indicado y mueve allí todos los indicadores sin destino.
- **Eliminar “Sin destino”** borra completamente los indicadores sin destino y sus datos asociados.

No requiere cambios de SQL.

## Comparador más simple

La comparación de destinos ahora muestra solo indicadores que existen en dos o más destinos. El selector ya no expone la clave/slug interna: muestra nombre limpio, unidad y cantidad de destinos disponibles.

También se agregó:
- buscador rápido de indicador comparable
- agrupación visual por título agrupador
- lista de destinos disponibles solo para el indicador elegido
- botones para seleccionar todos o limpiar selección

No requiere cambios de base de datos.

## Mejora de visualización de gráficos densos

Cuando hay muchos años seleccionados, la app ahora muestra el tooltip de forma individual, tomando el punto más cercano al cursor. Esto evita que se corte una lista enorme de valores sobre el gráfico.

También se oculta automáticamente la leyenda interna cuando hay demasiadas series, porque los años ya se controlan desde los chips superiores. El gráfico gana altura cuando hay muchas líneas para mejorar la lectura.


## Ordenamiento de tabla comparativa

La tabla del comparador permite ordenar los destinos por el año que el usuario elija:

- orden original por defecto;
- mayor a menor;
- menor a mayor;
- los destinos sin dato para ese año quedan al final.

Esta mejora es solo de visualización. No modifica registros, indicadores ni datos cargados.

## Comparador: orden de tabla

La tabla comparativa mantiene por defecto el orden original de selección. También permite elegir un año de referencia y decidir si se conserva ese orden original o si se ordena por rendimiento de mayor a menor o de menor a mayor. No modifica los datos cargados.

## Comparador: medidas de tabla

La tabla comparativa permite elegir qué medida mostrar por año:

- medida anual aplicada por el indicador
- promedio mensual
- mediana mensual
- máximo mensual del año
- mínimo mensual del año
- desvío estándar mensual

El desvío estándar queda disponible como lectura avanzada de variabilidad/estacionalidad, pero no es la medida recomendada para ranking principal.

## Comparador: medidas también en gráficos

La medida seleccionada en la tabla comparativa ahora también controla el gráfico de comparación.
Podés graficar la medida anual aplicada, promedio mensual, mediana, máximo, mínimo o desvío estándar mensual sin alterar los datos cargados.

## v2.4.7.6 · Medidas por años seleccionados

En la vista individual del indicador, los chips de años ahora también controlan el bloque de medidas:

- muestra KPIs de la serie visible seleccionada
- muestra una tabla con medidas individuales por cada año activo
- mantiene un bloque separado de histórico global con todos los años cargados
- no modifica datos, fórmulas ni estructura de Supabase
