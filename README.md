# OnlineBand · frontend

Interfaz de **OnlineBandApp**, una app web de creación musical colectiva en tiempo real. Cada persona entra a una sala global como tripulante y acopla instrumentos (percusión, armonía y melodía), que se ven como gemas de vidrio metálico flotando en el espacio exterior, con estética de fotografía de los 80 y un HUD aeroespacial.

Hecho con Vite, Three.js, Socket.IO y Tone.js. Cada navegador genera la mezcla completa a partir del estado compartido: no se transmite audio. Necesita el servidor [onlineband-backend](https://github.com/ouiea-studio/onlineband-backend).

## Correrlo en local

Necesitas Node.js 20 o más reciente y el backend encendido en http://localhost:3000.

```bash
npm install
npm run dev
```

Abre http://localhost:5173 en dos ventanas para ver la sincronización entre tripulantes.

Para generar la versión publicable: `npm run build` (queda en `dist/`).

## Variables de entorno

| Variable | Para qué sirve | Por defecto |
| --- | --- | --- |
| `VITE_API_URL` | URL del backend. En Render, la URL del Web Service. | `http://localhost:3000` |

Hay un ejemplo en `.env.example`. Como es una variable de Vite, se lee al construir: si cambia, hay que volver a hacer `npm run build`.

## Cómo se usa

- **ESCUCHAR / SILENCIAR** (arriba a la derecha): el primer clic enciende el audio; después silencia solo lo que escuchas tú.
- **PERC, ARM, MEL** (abajo a la derecha): acoplar un módulo; llega con un patrón que suena de inmediato.
- **Clic en una pieza propia**: abre su editor (pasos, subdivisión, cuadrícula de notas y parámetros).
- **Arrastrar** una pieza propia: moverla; el paneo y el volumen dependen de su posición.
- **Supr** o el botón de la etiqueta: desacoplar la pieza seleccionada.
- **Tempo y escala** (arriba a la izquierda): cambian para todos.
- **H**: panel de ajustes visuales.

## Ajustes visuales

Todos los valores por defecto (material, nubes, gelatina, postproducción) están en `public/ajustes.json`. Se puede editar a mano y basta con recargar. Con `npm run dev`, el botón **Guardar material** del panel escribe ahí el material actual.

## Archivos

- `src/main.js`: conexión con el servidor, estado de la sala e interacción.
- `src/audio.js`: sonido con Tone.js (Transport, escalas, instrumentos y mezcla espacial).
- `src/editor.js`: editor de pasos y parámetros de cada instrumento.
- `src/escena.js`: render, cámara, luces, entornos de reflejo y postproducción.
- `src/gemas.js`: material de vidrio, movimiento gelatinoso y nube interior.
- `src/hud.js` y `src/estilo.css`: HUD y telemetría.
- `src/panel.js`: panel de ajustes (lil-gui).
- `public/assets/`: modelos `.glb` de las gemas y `materiales.json` (datos de Blender).
