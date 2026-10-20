// Configuración de Vite. Incluye un plugin solo para desarrollo: el botón "Guardar material"
// del panel envía aquí los valores y este los escribe en public/ajustes.json, como el preset
// elegido y material inicial. En la versión publicada (Render) no existe y el botón copia
// los valores al portapapeles.

import { defineConfig } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ARCHIVO = fileURLToPath(new URL('./public/ajustes.json', import.meta.url));

function guardarMaterial() {
  return {
    name: 'guardar-material',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__guardar-material', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        try {
          let cuerpo = '';
          for await (const trozo of req) cuerpo += trozo;
          const { preset, valores } = JSON.parse(cuerpo);
          if (typeof preset !== 'string' || !valores || typeof valores !== 'object' || Array.isArray(valores)) {
            throw new Error('formato no válido');
          }
          const ajustes = JSON.parse(await readFile(ARCHIVO, 'utf8'));
          ajustes.presetsVidrio[preset] = valores;
          ajustes.presetVidrio = preset;
          await writeFile(ARCHIVO, JSON.stringify(ajustes, null, 2) + '\n');
          res.setHeader('Content-Type', 'application/json');
          res.end('{"ok":true}');
        } catch (err) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [guardarMaterial()],
  // Que guardar el material no recargue la página (se perderían las piezas de la sala).
  server: { watch: { ignored: ['**/public/ajustes.json'] } },
});
