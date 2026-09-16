# Matriz de Eisenhower — PWA

App web (HTML/CSS/JS vanilla, sin frameworks ni dependencias externas) para
organizar tareas en los 4 cuadrantes de la Matriz de Eisenhower. Instalable
como PWA y funciona 100% offline. Los datos se guardan solo en el
`localStorage` del navegador (sin backend).

## Estructura

```
index.html    markup: header, 4 cuadrantes, modal de tarea, modal de reporte
style.css     estilos, grid 2x2 (desktop) / stack vertical (mobile), modo oscuro
storage.js    capa de acceso a localStorage (carga, guarda, migra esquema)
app.js        lógica de la app: CRUD, drag&drop, coaching, reporte, notificaciones
sw.js         service worker (cache-first del app shell, soporte offline)
manifest.json manifest de instalación PWA
icons/        íconos PNG (192/512, normales y maskable)
```

## Correr localmente

No hace falta build. Como el Service Worker requiere `http(s)://` (no
funciona con `file://`), levantá un servidor estático simple desde esta
carpeta:

```bash
python3 -m http.server 8080
# o
npx serve .
```

Y abrí `http://localhost:8080` en el navegador.

## Instalar como PWA

- **Desktop (Chrome/Edge):** ícono de instalación en la barra de direcciones,
  o el botón "📲 Instalar app" que aparece abajo a la derecha.
- **Android (Chrome):** menú ⋮ → "Instalar app" / "Agregar a pantalla de inicio".
- **iOS (Safari):** botón compartir → "Agregar a pantalla de inicio" (iOS no
  dispara el prompt automático, pero el manifest y los íconos ya están
  configurados para que se vea como app nativa).

## Publicar en GitHub Pages

1. Subí esta carpeta a un repo de GitHub (rama `main` o la que uses).
2. Settings → Pages → Source: rama y carpeta raíz (`/`).
3. Esperá a que publique y entrá a la URL que te da GitHub Pages.
4. Desde el celular, abrí esa URL e instalá la app como se explica arriba.

No se necesita configuración adicional: todas las rutas del `manifest.json`
y del `sw.js` son relativas, así que funciona tanto en la raíz de un dominio
como en un subpath de GitHub Pages (`usuario.github.io/repo/`).

## Modelo de datos

Todo se guarda en una sola clave de `localStorage`: `eh-matrix:v1`.

```js
{
  version: 1,
  tasks: [
    {
      id, title, description, dueDate,       // datos básicos
      urgent, important,                      // el cuadrante se deriva de estos dos
      completed, completedAt,
      createdAt, updatedAt,
      subtasks: [{ id, title, completed }],
      quadrantEnteredAt,                      // se resetea al reclasificar; usado para detectar tareas estancadas en el cuadrante 3
      notified,                               // evita repetir notificaciones de vencimiento
    },
  ],
  settings: { theme, notificationsEnabled, overloadThreshold },
}
```

El cuadrante **no** se guarda como campo propio: `quadrant = urgent ? (important ? 1 : 3) : (important ? 2 : 4)`.
Así, reclasificar una tarea (por edición o drag & drop) es simplemente
cambiar `urgent`/`important`, sin riesgo de inconsistencias.

## Backup

Botón "⬇️" exporta un JSON con todo el estado; "⬆️" lo restaura (reemplaza
las tareas actuales, pide confirmación). Sirve como backup manual entre
dispositivos, ya que no hay sincronización en la nube.

## Notas sobre drag & drop en mobile

El drag & drop nativo (HTML5) funciona bien en desktop pero es poco
confiable en pantallas táctiles. En mobile, la forma de reclasificar una
tarea entre cuadrantes es abrirla (tap) y cambiar los toggles de
urgencia/importancia en el modal — siempre funciona, en cualquier
dispositivo.

## Actualizar el Service Worker

Si modificás `index.html`, `style.css`, `storage.js` o `app.js`, subí el
número de `CACHE_VERSION` en `sw.js` (por ejemplo `eh-matrix-v2`) para que
los usuarios con la app ya instalada reciban la actualización.
