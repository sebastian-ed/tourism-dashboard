# 📊 Dashboard de Indicadores de Turismo

Dashboard web para visualizar y analizar indicadores del sector turismo de Argentina. Desarrollado con HTML, CSS y JavaScript puro, con Supabase como backend.

---

## 🚀 Configuración rápida

### 1. Crear proyecto en Supabase

1. Ir a [supabase.com](https://supabase.com) y crear una cuenta gratuita
2. Crear un nuevo proyecto
3. Ir a **SQL Editor** y ejecutar el contenido de `supabase_schema.sql`
4. En **Project Settings → API**, copiar:
   - `Project URL`
   - `anon public` key

### 2. Configurar credenciales

Abrir el archivo `js/config.js` y reemplazar:

```javascript
SUPABASE_URL: 'https://TU_PROYECTO.supabase.co',
SUPABASE_ANON_KEY: 'TU_ANON_KEY_AQUI',
```

### 3. Crear usuario admin

En Supabase → **Authentication → Users → Invite user**, crear el usuario administrador con email y contraseña.

### 4. Subir a GitHub Pages

1. Crear repositorio en GitHub
2. Subir todos los archivos
3. En el repo → **Settings → Pages → Source**: seleccionar `main / (root)`
4. En unos minutos estará disponible en `https://tu-usuario.github.io/tu-repo/`

---

## 📁 Estructura del proyecto

```
/
├── index.html              ← Vista pública (usuarios finales)
├── pages/
│   └── admin.html          ← Panel de administración
├── css/
│   └── style.css           ← Estilos
├── js/
│   ├── config.js           ← ⚙️ CONFIGURAR AQUÍ las credenciales
│   ├── db.js               ← Cliente Supabase
│   ├── stats.js            ← Cálculos estadísticos
│   ├── charts.js           ← Gráficos (Chart.js)
│   └── exports.js          ← Exportación Excel y PDF
└── supabase_schema.sql     ← Schema de base de datos
```

---

## 👤 Roles de usuario

| Rol | Acceso | URL |
|-----|--------|-----|
| **Público** | Solo lectura (gráficos, estadísticas, exportar) | `/index.html` |
| **Admin** | Crear/editar indicadores, cargar datos | `/pages/admin.html` |

---

## 📋 Cómo cargar datos

1. Ingresar al panel admin (`/pages/admin.html`)
2. Hacer clic en **"+ Nuevo indicador"** → completar nombre, unidad y descripción
3. Con el indicador seleccionado, hacer clic en **"📋 Cargar datos"**
4. **Método rápido (Excel):**
   - En Excel, seleccionar la fila con los 12 meses del indicador
   - Copiar (Ctrl+C)
   - Pegar en el área de texto del modal
   - Elegir el año y hacer clic en **"Aplicar pegado ▶"**
5. Revisar los valores en la grilla mensual
6. Hacer clic en **"💾 Guardar datos"**

### Formatos de pegado soportados
- Separado por **tabs** (Excel por defecto)
- Separado por **comas** o **punto y coma**
- Los números pueden tener puntos como separador de miles

---

## 📊 Estadísticas calculadas

Por cada indicador e histórico se calculan automáticamente:

- **Suma** total anual
- **Promedio** mensual
- **Mediana** mensual
- **Mínimo** y **Máximo** mensual
- **Desvío estándar**
- **Variación interanual** (%) entre años consecutivos

---

## 📥 Exportaciones

Desde cualquier vista (pública o admin):
- **Excel (.xlsx):** Hoja de datos + hoja de estadísticas
- **PDF:** Portada con KPIs + gráficos + tabla de estadísticas

---

## 🔧 Agregar más estadísticas

Para agregar nuevas métricas, editar `js/stats.js` → función `calcStats()` y agregar los campos deseados.

Luego mostrarlos en los archivos HTML en las secciones de KPIs y tablas.

---

## 📦 Dependencias (CDN, sin instalación)

- [Supabase JS v2](https://supabase.com/docs/reference/javascript)
- [Chart.js v4](https://www.chartjs.org/)
- [SheetJS / XLSX](https://sheetjs.com/)
- [jsPDF](https://github.com/parallax/jsPDF) + autoTable
- Google Fonts: DM Sans + JetBrains Mono
