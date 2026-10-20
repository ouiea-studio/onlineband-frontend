// HUD: formatos, cursores de retícula, registro de misión y telemetría.

export const MODULOS = { percusion: 'MOD-PERC', armonia: 'MOD-ARM', melodia: 'MOD-MEL' };

// Escalas que ofrece la consola. tonica y modo son los valores que entiende el servidor.
export const ESCALAS = [
  { tonica: 'C', modo: 'menor' },
  { tonica: 'D', modo: 'dorico' },
  { tonica: 'E', modo: 'frigio' },
  { tonica: 'F', modo: 'lidio' },
  { tonica: 'A', modo: 'pentatonica' },
];
const SOLFEO = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const MODOS = {
  mayor: 'mayor', menor: 'menor', dorico: 'dórico', frigio: 'frigio', lidio: 'lidio',
  mixolidio: 'mixolidio', locrio: 'locrio', pentatonica: 'pentatónica', blues: 'blues',
};
export function nombreEscala({ tonica, modo }) {
  return (SOLFEO[tonica[0]] || tonica) + tonica.slice(1) + ' ' + (MODOS[modo] || modo);
}

export const coord = (v) => (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(2).padStart(5, '0');
export const dosCifras = (n) => String(Math.floor(n)).padStart(2, '0');
export const relojMision = (s) => 'T+' + dosCifras(s / 3600) + ':' + dosCifras((s / 60) % 60) + ':' + dosCifras(s % 60);

// Cursor en forma de retícula (un SVG pequeño); cambia a "blanco fijado" sobre un módulo
function cursorSVG(color, fijado) {
  const marcas = fijado
    ? "<path d='M5 11V5h6M21 5h6v6M27 21v6h-6M11 27H5v-6'/><circle cx='16' cy='16' r='1.5'/>"
    : "<path d='M16 2v9M16 21v9M2 16h9M21 16h9'/><circle cx='16' cy='16' r='5'/>";
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' fill='none' stroke='" + color + "' stroke-width='1'>" + marcas + "</svg>";
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") 16 16, crosshair';
}
export const CURSOR_RETICULA = cursorSVG('#dfe6ff', false);
export const CURSOR_MODULO = cursorSVG('#ffc247', true);       // módulo propio: se puede mover
export const CURSOR_AJENO = cursorSVG('rgba(223,230,255,.6)', true); // módulo de otro: solo seleccionar

// Registro de misión: guarda los últimos 4 eventos con su marca de tiempo
const elRegistro = document.getElementById('registro-lista');
const eventos = [];
const inicio = performance.now();
export const segundosMision = () => (performance.now() - inicio) / 1000;
export function registrar(texto) {
  const li = document.createElement('li');
  const b = document.createElement('b');
  b.textContent = relojMision(segundosMision());
  li.append(b, texto); // textContent: los nombres vienen de la red
  eventos.push(li);
  while (eventos.length > 4) eventos.shift();
  elRegistro.replaceChildren(...eventos);
}

// Telemetría: reloj de misión y FPS (BPM, escala y tripulantes los escribe main.js)
const elReloj = document.getElementById('t-reloj');
const elFps = document.getElementById('t-fps');
let segundoMostrado = -1, cuadros = 0, marcaFps = performance.now();
export function actualizarTelemetria() {
  const s = Math.floor(segundosMision());
  if (s !== segundoMostrado) { segundoMostrado = s; elReloj.textContent = relojMision(s); }
  cuadros++;
  const ahora = performance.now();
  if (ahora - marcaFps >= 1000) {
    elFps.textContent = dosCifras(cuadros * 1000 / (ahora - marcaFps));
    cuadros = 0; marcaFps = ahora;
  }
}
