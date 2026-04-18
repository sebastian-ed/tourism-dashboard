# 📊 Dashboard de Indicadores de Turismo por Destino

Versión mejorada para agrupar indicadores por destino sin tocar la lógica buena que ya tenías: carga mensual, gráficos, KPIs y exportaciones.

## Qué cambia

- Se agrega la entidad **destinos**.
- Cada **indicador** se asigna a un destino.
- La vista pública ahora permite:
  - seleccionar un destino
  - ver todos los indicadores de ese destino en un solo lugar
  - entrar al detalle de cualquier indicador sin perder la estética original
- El panel admin ahora permite:
  - crear, editar y eliminar destinos
  - asignar indicadores a un destino
  - navegar los indicadores agrupados por destino

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

## Paso crítico: migración en Supabase

No alcanza con subir los archivos al repo. También tenés que correr el SQL nuevo.

### Qué hace el script

- crea la tabla `destinations`
- agrega `destination_id` a `indicators`
- crea el destino **General**
- mueve todos los indicadores viejos al destino **General**
- deja listas las políticas RLS para público y admin

### Cómo aplicarlo

1. Abrí Supabase.
2. Andá a **SQL Editor**.
3. Pegá completo el archivo `supabase_schema.sql`.
4. Ejecutalo.

## Flujo recomendado después de migrar

1. Entrá al admin.
2. Creá tus destinos: `Mar del Plata`, `Bariloche`, `Córdoba`, etc.
3. Editá los indicadores existentes y reasignalos desde `General` al destino correcto.
4. Cargá nuevos indicadores ya vinculados a un destino.

## Vista pública

- columna izquierda: destinos
- debajo: indicadores del destino seleccionado
- panel central: resumen del destino + tarjetas de indicadores
- al abrir un indicador: se conserva el dashboard detallado con gráficos y exportación

## Panel admin

- botón `+ Nuevo destino`
- botón `+ Nuevo indicador`
- edición de destino y de indicador
- carga de datos mensual sin cambios de lógica

## Observación importante

Si hoy tenés indicadores de varios destinos mezclados y el nombre del indicador no lo distingue, la migración no puede adivinar a qué destino pertenece cada uno. Por eso el script los manda a **General** y después vos los redistribuís desde el admin. Magia no; control sí.
