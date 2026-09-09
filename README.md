# PLACAS · Control de paquetes

Aplicación web para registrar y visualizar la clasificación de las placas TAG
de equipos/tableros del proyecto en paquetes **PQT DW** / **PQT BW**, con la
Google Sheet como base de datos en vivo y la app publicada gratis en
**GitHub Pages**. Se entra con una contraseña de **Usuario** (ver, filtrar,
exportar PDF) o **Administrador** (todo, incluida la edición).

```
placas-app/
├── index.html          → la app (estructura)
├── style.css           → estilos
├── app.js               → lógica y CONFIGURACIÓN (URL, contraseñas)
├── manifest.json         → permite "Instalar app" en el dispositivo
├── sw.js                 → service worker mínimo (requerido para instalar)
├── assets/
│   ├── login-bg.webp     → imagen de fondo de la pantalla de inicio
│   ├── icon-192.png, icon-512.png, icon-maskable-512.png → íconos de la app
│   └── apple-touch-icon.png → ícono para iPhone/iPad
├── apps-script/
│   └── Code.gs           → backend: convierte tu Sheet en una API JSON
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
5. La app añade tres columnas más a la derecha (**M: Editor**, **N:
   Actualizado**, **O: Entregado**) automáticamente la primera vez que
   alguien guarda un cambio, para saber quién tocó cada fila, cuándo, y si
   esa placa ya fue entregada al subcontratista. Si quieres que la columna
   O tenga encabezado, escribe "ENTREGADO" en O1 — la app funciona igual
   aunque esa celda quede vacía. Es opcional: si no la quieres, bórrala de
   `Code.gs` (línea con `ENTREGADO`).

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
   `/exec`). La necesitarás en el paso 3.
7. **Importante:** cada vez que edites `Code.gs`, tienes que crear una
   **nueva implementación** (o gestionar implementaciones → editar → nueva
   versión) para que los cambios se publiquen. Guardar el script no basta.

## 3. Configura la app UNA sola vez (antes de compartirla)

Abre `app.js` con cualquier editor de texto y edita estas líneas, cerca del
principio del archivo:

```js
const APPS_SCRIPT_URL = 'PON_AQUI_TU_URL_DE_APPS_SCRIPT'; // ← pega la URL del paso 2
const PASSWORDS = {
  admin: 'admin2026',   // ← cambia esta contraseña
  user: 'placas2026'    // ← cambia esta contraseña
};
```

Así, cuando compartas el enlace de la app con tu equipo, **nadie tiene que
pegar ninguna URL** — solo entran con la contraseña que tú les des:
- Contraseña de **usuario**: puede ver, filtrar y **exportar solo en PDF**.
  No puede editar ni exportar CSV/Excel.
- Contraseña de **administrador**: acceso completo (editar, exportar CSV,
  Excel y PDF).

> ⚠️ **Importante sobre seguridad:** esta app es un sitio estático (no tiene
> servidor propio), así que estas contraseñas son una traba de uso para
> evitar ediciones o exportaciones accidentales del personal de campo — no
> son una caja fuerte. Cualquiera con conocimientos técnicos podría verlas
> mirando el código fuente en el navegador. No las uses para datos
> verdaderamente confidenciales, y cámbialas si alguna vez sospechas que se
> filtraron.

## 4. Sube la app a GitHub

> ⚠️ **Esta vez también hay que tocar el backend.** Copia el `Code.gs`
> nuevo (agregó la columna `ENTREGADO`) y pégalo en tu Apps Script,
> reemplazando todo el contenido anterior. Luego **Implementar > Gestionar
> implementaciones > ✏️ (editar) > Versión: Nueva versión > Implementar**
> — si solo guardas el script sin crear una nueva versión, la app seguirá
> usando el código viejo y la columna Entregado no se guardará.

Arrastra **todo** el contenido de la carpeta `placas-app` (incluida la
carpeta `assets/` con la imagen de fondo) a tu repositorio, tal como hiciste
la primera vez. Si ya tienes el repo creado, entra a él, pulsa **Add file >
Upload files** y arrastra los archivos — los que tengan el mismo nombre se
reemplazan solos.

Activa GitHub Pages si no lo has hecho: **Settings > Pages** > Source:
"Deploy from a branch", rama `main`, carpeta `/ (root)` > Save.

## 5. Primer uso de la app

Comparte con tu equipo la URL de GitHub Pages
(`https://TU_USUARIO.github.io/TU_REPO/`) y la contraseña que le
corresponda a cada persona. Verán una pantalla de bienvenida con la
fotografía de la plataforma y el campo de contraseña — nada más que
configurar de su parte.

## Cómo funciona

- **Resumen**: totales, % de avance, y desglose por paquete PQT DW, PQT BW y
  **avance por disciplina** (qué % de TAGs de cada disciplina ya tiene
  paquete asignado, con color de rojo → ámbar → teal según el avance).
- **Clic en un paquete** (PQT DW o BW): abre una ventana con la lista
  completa de TAGs de ese paquete, con su propio buscador.
- **Tabla**: buscador + filtros (disciplina, subcontratista, estado, GQE,
  **Entregado**) y el botón **Paquetes**, que abre una ventana para elegir
  uno o varios paquetes DW/BW específicos — útil para entregar solo los
  TAGs de un paquete a un subcontratista. Los administradores editan
  `PQT DW`, `PQT BW`, `GQE`, **`ENTREGADO`** y `OBS` en línea, con su
  propio botón **Guardar** por fila (marca `Y` en Entregado cuando la
  placa ya se entregó al subcontratista — útil porque las entregas se
  hacen por partes). Los usuarios ven la tabla en modo solo lectura.
- **Multiusuario**: el backend usa un bloqueo (`LockService`) al escribir,
  así que dos guardados simultáneos no se pisan entre sí. Pulsa **⟳** para
  traer los últimos cambios de tus compañeros.
- **Exportar**: PDF (todos), y CSV/Excel (solo administradores) — siempre
  con los filtros que tengas aplicados en ese momento (incluido el filtro
  de paquetes). El PDF además ordena las filas por número de paquete de
  menor a mayor. Si en el filtro de paquetes eliges **solo** paquetes DW
  (o **solo** BW), el PDF oculta automáticamente la columna del otro tipo
  para no confundir — si eliges de ambos tipos a la vez, muestra las dos.
- **Carga rápida**: la primera vez que alguien entra en un dispositivo, la
  app tarda unos segundos en traer las ~14.400 filas. A partir de ahí,
  guarda una copia en ese navegador y la muestra al instante la próxima vez
  mientras actualiza en segundo plano — así que solo la primera carga por
  dispositivo se siente lenta.

- **Instalar como app**: si el navegador lo permite (Chrome, Edge, Android),
  aparece un botón **"Instalar app"** en la pantalla de inicio y en la
  barra superior. Al instalarla queda como un ícono más en el celular o el
  escritorio (con el ícono "PE · Registro de Placas"), y abre en su propia
  ventana sin barra de navegador. En iPhone/iPad (Safari no dispara ese
  botón) se instala manualmente: Compartir → "Añadir a pantalla de inicio".
- **Se adapta a celular, tablet y escritorio**: los paneles, la tabla y los
  filtros se reacomodan según el ancho de pantalla.

## Notas y límites a tener en cuenta

- La identificación de fila para guardar usa el número de fila real de la
  hoja (columna oculta `r`), no el TAG, porque hay 10 TAGs duplicados en tus
  datos actuales con distinto `ITEM` (equipos con placas repetidas o
  multipágina). Si reordenas o borras filas manualmente en la Sheet, haz
  después **⟳** en la app antes de seguir editando.
- Si algún día ves el error *"No se pudo conectar"*, lo más habitual es que
  la implementación de Apps Script no esté publicada como "Cualquier
  usuario con el enlace", o que hayas editado `Code.gs` sin crear una nueva
  implementación.
- El pie de página ("By Gustavo developer" + versión) sale de la constante
  `APP_VERSION` al principio de `app.js`.
- **Muy importante para que los cambios se vean siempre:** `index.html`
  carga `style.css` y `app.js` con un número de versión al final
  (`style.css?v=1.3.0`). Los navegadores guardan estos archivos en caché
  por nombre, así que si subes una versión nueva y no cambias ese número,
  algunos dispositivos seguirán viendo la versión vieja durante horas o
  días. **Cada vez que subas cambios de diseño o de lógica**, sube también
  el número: cambia `APP_VERSION` en `app.js` Y el `?v=...` de las dos
  líneas correspondientes en `index.html`, todos al mismo valor (por
  ejemplo `v1.4.0`). Así el navegador sabe que debe descargar la versión
  nueva sí o sí.
