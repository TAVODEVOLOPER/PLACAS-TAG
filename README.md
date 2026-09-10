# PLACAS-TAG DW / BW

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
5. La app añade cuatro columnas más a la derecha (**M: Editor**, **N:
   Actualizado**, **O: Entregado DW**, **P: Entregado BW**)
   automáticamente la primera vez que alguien guarda un cambio, para saber
   quién tocó cada fila, cuándo, y si esa placa ya fue entregada — por
   separado para el área DW y para el área BW, ya que hay TAGs que tienen
   ambos paquetes a la vez. Si quieres que las columnas tengan encabezado,
   escribe "ENTREGADO_DW" en O1 y "ENTREGADO_BW" en P1 — la app funciona
   igual aunque esas celdas queden vacías.

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

> ⚠️ **Cambio de estructura en tu Sheet: ahora hay DOS columnas de
> Entregado.** Antes había una sola columna `ENTREGADO` (columna O). Como
> algunos TAGs tienen paquete DW y BW a la vez, esa única columna era
> ambigua. Ahora:
> - **Columna O** pasa a ser **`ENTREGADO_DW`** — los valores que ya
>   tenías ahí **se conservan tal cual**, no hay que mover nada. Si
>   quieres, cambia el título de O1 a "ENTREGADO_DW".
> - **Columna P** es nueva: **`ENTREGADO_BW`**, empieza vacía. Ponle el
>   título "ENTREGADO_BW" en P1 si quieres.
>
> Copia el `Code.gs` nuevo (agregó la columna `ENTREGADO_BW`, el contador
> de folios del Vale de Entrega, y subir/listar/eliminar en Drive) y
> pégalo en tu Apps Script. Luego **Implementar > Gestionar
> implementaciones > ✏️ (editar) > Versión: Nueva versión > Implementar**
> — si solo guardas el script sin crear una nueva versión, lo nuevo no va
> a funcionar.
>
> **Si quieres usar "Subir a Google Drive"** (opcional): antes de
> redesplegar, crea o elige una carpeta en tu Drive, copia su ID desde la
> URL (`drive.google.com/drive/folders/`**`ESTE-ID`**) y pégalo en la
> constante `FOLDER_ID` al inicio de `Code.gs`. Al volver a implementar,
> Google te va a pedir autorizar un permiso nuevo (acceso a Drive) — es
> normal, acéptalo. Si dejas `FOLDER_ID` sin configurar, esa opción
> simplemente muestra un error si alguien intenta usarla; todo lo demás
> sigue funcionando igual.

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
  **Entregado**). El botón **Paquetes** abre una ventana para elegir uno o
  varios paquetes DW/BW específicos, y junto a él hay un atajo rápido
  **Todos / Solo DW / Solo BW** para filtrar por tipo de paquete sin tener
  que marcar cada número (muy útil en celular) — ambos comparten el mismo
  filtro. Los administradores editan `PQT DW`, `PQT BW`, `GQE`,
  **`ENTREGADO_DW`**, **`ENTREGADO_BW`** y `OBS` en línea, con su propio botón **Guardar** por
  fila (marca `Y` en Entregado cuando la placa ya se entregó al
  subcontratista — útil porque las entregas se hacen por partes). Los
  usuarios ven la tabla en modo solo lectura.
- **Importar Excel** (solo administradores): para cuando prefieres llenar
  `PQT DW`, `PQT BW`, `GQE`, `ENTREGADO_DW`, `ENTREGADO_BW` u `OBS` en tu propio Excel (por
  ejemplo tu archivo original con macros, porque ahí escribes más rápido) y
  después traer esos cambios a la app de una sola vez:
  1. Botón **"Importar Excel"** > elige el archivo (`.xlsx`, `.xls` o
     `.xlsm`) > **"Analizar archivo"**.
  2. La app busca cada fila por su **TAG** (no por ITEM) y compara
     `PQT DW`, `PQT BW`, `GQE`, `ENTREGADO_DW`, `ENTREGADO_BW` y `OBS` contra lo que ya está
     guardado:
     - Si el campo estaba **vacío** en tu Sheet, lo rellena directo, sin
       preguntar.
     - Si el campo **ya tenía un valor distinto**, lo lista como
       conflicto para que decidas, fila por fila o con los botones
       "Usar Excel en todos" / "Mantener actual en todos".
     - Los TAGs del Excel que no existen en tu Sheet, o que están
       duplicados en tu Sheet, se omiten y se informan en el resumen (no
       crea TAGs nuevos ni adivina cuál actualizar si hay duplicados).
  3. **"Aplicar cambios"** guarda todo de una vez en tu Google Sheet.

  Tu Excel de importación necesita al menos las columnas `TAG` y una o más
  de `PQT DW`, `PQT BW`, `GQE`, `ENTREGADO_DW`, `ENTREGADO_BW`, `OBS` con esos nombres exactos
  en la primera fila — el resto de columnas (ITEM, INSTALL, DISCIPLINE...)
  pueden estar o no, la app las ignora para esta importación.
- **Multiusuario**: el backend usa un bloqueo (`LockService`) al escribir,
  así que dos guardados simultáneos no se pisan entre sí. Pulsa **⟳** para
  traer los últimos cambios de tus compañeros.
- **Exportar**:
  - **CSV**: todas las columnas, con los filtros que tengas aplicados.
  - **Excel** (solo administradores): oculta `GQE`, `ENTREGADO_DW` y `ENTREGADO_BW` (son
    control interno del administrador) y, si el filtro de paquetes usa
    solo DW o solo BW, oculta también la otra columna de paquete. Siempre
    ordenado por número de paquete de menor a mayor.
  - **PDF (tabla)**: todas las columnas en una tabla plana, ordenada por
    paquete. Igual que en Excel, si filtras solo por DW o solo por BW
    oculta la columna del otro tipo. Incluye numeración de página y el
    pie de página "By Gustavo developer" en todas las hojas.
  - **PDF (tarjetas por paquete)**: en vertical, cada paquete queda como
    una tarjeta con encabezado de color (mismo color que usa en el
    Resumen) y título "PQT {número} DW" o "PQT {número} BW", su cantidad
    de TAGs y % de entregados, y debajo la tabla de esos TAGs con el
    estado Entregado resaltado en verde/rojo. Sin filtro de paquetes, solo
    arma tarjetas DW (las BW quedan ocultas por defecto); si filtras
    explícitamente por BW, esas sí aparecen. Pensado para entregar a cada
    subcontratista solo lo suyo. También numerado y con el mismo pie de
    página.
  - **Marcar como entregado y Vale de Entrega**: si eres administrador y
    tienes un filtro de paquetes activo con TAGs pendientes de entregar, al
    pulsar cualquiera de los dos botones de PDF aparece una ventana para
    completar **Almacén de origen**, **Almacén de destino**, **quién
    entrega**, y opcionalmente una **foto**. Si confirmas, la app marca
    esos TAGs como entregados en tu Sheet y descarga dos archivos: el PDF
    que pediste (tabla o tarjetas) y un **Vale de Entrega** aparte, con:
    - Folio correlativo (numeración única server-side, no se repite aunque
      varias personas generen vales desde dispositivos distintos).
    - Fecha y hora, almacén de origen y destino.
    - Resumen de paquetes incluidos (paquete y cantidad de TAGs).
    - La foto adjunta, si la agregaste.
    - Los bloques **"Entregó (Almacén de Origen)"** y **"Recibió (Almacén
      de Destino)"** con líneas para nombre y firma a mano tras imprimir.

    Si prefieres solo exportar sin marcar nada, el botón **"Solo
    exportar"** de esa misma ventana lo hace sin tocar tus datos ni generar
    vale.
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

- **Marcar como entregado al exportar PDF (solo en la app)**: si eres
  administrador y tienes un filtro de paquetes activo con TAGs pendientes,
  al exportar **PDF (tabla)** o **PDF (tarjetas)** la app pregunta si
  quieres marcarlos como entregados. Si aceptas, el cambio queda **solo en
  esta app** (memoria + caché del navegador) — no se sube a tu Google
  Sheet, para que la exportación siga siendo instantánea. Para que quede
  también en tu Sheet, actualízalo tú a mano en la Tabla, o impórtalo
  después con **Importar Excel** usando un archivo que ya traiga esa
  columna marcada.
- **Archivos en Drive** (solo administradores): botón que abre una lista
  de todo lo que hay en la carpeta de Drive configurada (`FOLDER_ID`), con
  nombre, tamaño, fecha, un enlace para abrir cada archivo en Drive, y un
  botón para **eliminarlo** (lo manda a la papelera de Drive). También
  permite **subir cualquier archivo** desde ahí, no solo exportaciones de
  la app. Requiere `FOLDER_ID` configurado (ver paso 4).
- **Subir a Google Drive** (opcional, todas las exportaciones): al
  exportar CSV, Excel, PDF (tabla o tarjetas), o generar un Vale de
  Entrega, la app pregunta si también quieres subir una copia a una
  carpeta de tu Google Drive. Si aceptas, se sube usando tu propio Apps
  Script (sin pedirte ningún login adicional) — funciona desde cualquier
  dispositivo o navegador, a diferencia de la "Carpeta de vales" local que
  es solo Chrome/Edge de escritorio. Requiere configurar `FOLDER_ID` en
  `Code.gs` (ver paso 4); si no lo configuras, simplemente no ofrece subir
  nada distinto a lo normal.
- **Carpeta de vales** (solo administradores, Chrome/Edge de escritorio):
  botón **"Carpeta de vales"** para elegir una carpeta una sola vez; desde
  ahí, cada Vale de Entrega que generes se guarda directo ahí, sin mostrar
  el diálogo de descarga de tu navegador. En Safari, la mayoría de
  navegadores de celular, u otros sin esta función, el botón te avisa que
  no está disponible y los vales se descargan normal como antes. Nota: la
  carpeta elegida se recuerda solo mientras la pestaña sigue abierta —
  hay que volver a elegirla si recargas la página.

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
