# PLACAS · Control de paquetes

Aplicación web para registrar y visualizar la clasificación de las placas TAG
de equipos/tableros del proyecto en paquetes **PQT DW** / **PQT BW**, con la
Google Sheet como base de datos en vivo (varias personas pueden editar a la
vez) y la app publicada gratis en **GitHub Pages**.

```
placas-app/
├── index.html          → la app (estructura)
├── style.css           → estilos
├── app.js              → lógica (fetch a Apps Script, tabla, dashboard)
├── apps-script/
│   └── Code.gs          → backend: convierte tu Sheet en una API JSON
└── data/
    └── placas_import.csv → tus 14.439 filas actuales, listas para importar
```

## 1. Prepara tu Google Sheet

1. Crea una Google Sheet nueva (o usa una existente).
2. Renombra la primera pestaña a **`PLACAS`** (la app y el script asumen ese
   nombre; si usas otro, cambia `SHEET_NAME` en `Code.gs`).
3. Archivo > Importar > sube `data/placas_import.csv` > "Reemplazar hoja
   actual" (o "Insertar en nueva hoja" y luego renómbrala a `PLACAS`).
4. Comprueba que la fila 1 tiene los encabezados: `ITEM, INSTALL, DISCIPLINE,
   SUBCONTRACTOR, TAG, SYSTEM, DESCRIPTION, LEVEL, PQT DW, PQT BW, GQE, OBS`
   y que los datos empiezan en la fila 2.
5. La app añade dos columnas más a la derecha (**M: Editor**, **N:
   Actualizado**) automáticamente la primera vez que alguien guarda un
   cambio, para saber quién tocó cada fila y cuándo. Es opcional: si no las
   quieres, bórralas de `Code.gs` (líneas con `EDITOR` y `UPDATED_AT`).

## 2. Publica el backend (Apps Script)

1. En tu Sheet: **Extensiones > Apps Script**.
2. Borra el contenido por defecto y pega todo `apps-script/Code.gs`.
3. Guarda (icono de disco o Ctrl+S).
4. **Implementar > Nueva implementación**.
   - Tipo: **Aplicación web**.
   - Ejecutar como: **Yo** (tu cuenta).
   - Quién tiene acceso: **Cualquier usuario con el enlace** (o "Cualquier
     usuario de tu organización" si es Google Workspace y quieres limitarlo
     a tu equipo).
5. Autoriza los permisos que pida Google (es tu propio script accediendo a
   tu propia hoja).
6. Copia la **URL de la aplicación web** que te entrega (termina en
   `/exec`). La necesitarás en el paso 4.
7. **Importante:** cada vez que edites `Code.gs`, tienes que crear una
   **nueva implementación** (o gestionar implementaciones → editar → nueva
   versión) para que los cambios se publiquen. Guardar el script no basta.

## 3. Sube la app a GitHub

```bash
cd placas-app
git init
git add .
git commit -m "Primera versión de la app PLACAS"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

Luego activa GitHub Pages:
1. En tu repo de GitHub: **Settings > Pages**.
2. Source: **Deploy from a branch** → branch `main`, carpeta `/ (root)`.
3. Guarda. En un minuto tendrás tu app en
   `https://TU_USUARIO.github.io/TU_REPO/`.

Para futuras versiones, simplemente vuelve a hacer `git add . && git commit
-m "..." && git push` — GitHub Pages se actualiza solo.

## 4. Primer uso de la app

1. Abre la URL de GitHub Pages.
2. Pega la URL de Apps Script (`.../exec`) y tu nombre.
3. Pulsa **Conectar**. Cada persona del equipo hace esto una vez en su
   propio navegador (se guarda localmente, no se comparte).

## Cómo funciona

- **Resumen**: totales, % de avance, y desglose por paquete PQT DW, PQT BW y
  por disciplina — se recalcula con cada actualización.
- **Tabla**: buscador + filtros (disciplina, subcontratista, estado, GQE) y
  edición en línea de `PQT DW`, `PQT BW`, `GQE` y `OBS`. Cada fila se guarda
  con su propio botón **Guardar**, para no perder cambios de otra persona
  que esté editando otra fila a la vez.
- **Multiusuario**: el backend usa un bloqueo (`LockService`) al escribir,
  así que dos guardados simultáneos no se pisan entre sí. Pulsa el botón
  **⟳** para traer los últimos cambios de tus compañeros.
- **Exportar CSV**: descarga exactamente lo que estás viendo (con los
  filtros aplicados).

## Notas y límites a tener en cuenta

- La app carga las ~14.400 filas completas al abrir (una sola petición);
  con conexión normal tarda unos segundos. Los filtros y la tabla trabajan
  luego en memoria, sin más llamadas a la red.
- La identificación de fila para guardar usa el número de fila real de la
  hoja (columna oculta `r`), no el TAG, porque hay 10 TAGs duplicados en tus
  datos actuales con distinto `ITEM` (equipos con placas repetidas o
  multipágina). Si reordenas o borras filas manualmente en la Sheet, haz
  después **⟳** en la app antes de seguir editando.
- Si algún día ves el error *"No se pudo conectar"*, lo más habitual es que
  la implementación de Apps Script no esté publicada como "Cualquier
  usuario con el enlace", o que hayas editado `Code.gs` sin crear una nueva
  implementación.
