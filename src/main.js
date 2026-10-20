// OnlineBandApp · frontend (V2: sonido).
// Conecta con el servidor, mantiene una copia local de la sala, la dibuja como gemas en el universo
// y la hace sonar con Tone.js (audio.js). Cada tripulante solo puede mover, editar y desacoplar
// sus propias piezas; tempo y escala son de todos.

import './estilo.css';
import * as THREE from 'three';
import { io } from 'socket.io-client';
import {
  camera, controls, renderer, scene, params, RADIO_PANEO, RADIO_UNIVERSO,
  pulsoRGB, dibujar, ajustarTamanoEscena,
} from './escena.js';
import {
  cargarPlantillas, crearGema, destruirGema, colorearGema, animarGema, golpearGema,
  aplicarVidrio, actualizarEscalaNubes, TALLAS,
} from './gemas.js';
import {
  MODULOS, ESCALAS, nombreEscala, coord, dosCifras, registrar, actualizarTelemetria,
  CURSOR_RETICULA, CURSOR_MODULO, CURSOR_AJENO,
} from './hud.js';
import { crearPanel } from './panel.js';
import { crearEditor } from './editor.js';
import * as audio from './audio.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// =====================================================================
// ESTADO LOCAL — copia de lo que dice el servidor
// =====================================================================
const sala = { tempo: 120, escala: { tonica: 'C', modo: 'menor' }, tripulantes: new Map() };
let yo = null; // { id, indicativo, color } asignado por el servidor
// id → { id, tipo, dueno, inst (datos completos del servidor), gema, etiqueta, destino, semilla,
//        actividad (notas recientes), ladeo (inclinación aleatoria), mezcla (último paneo/volumen) }
const piezas = new Map();

const colorDe = (id) => sala.tripulantes.get(id)?.color || '#dfe6ff';
const indicativoDe = (id) => sala.tripulantes.get(id)?.indicativo || 'Tripulante --';
const esMia = (p) => !!yo && p.dueno === yo.id;

const elHud = document.getElementById('hud');
const lienzo = renderer.domElement;

// =====================================================================
// PIEZAS: crear, actualizar y quitar gemas según el estado del servidor
// =====================================================================
function textoEtiqueta(p) {
  const b = document.createElement('b');
  b.textContent = MODULOS[p.tipo];
  p.etiqueta.replaceChildren(b, ' · ' + (esMia(p) ? 'Tú' : indicativoDe(p.dueno)));
  p.etiqueta.style.setProperty('--acento', colorDe(p.dueno));
}

function agregarPieza(inst) {
  const existente = piezas.get(inst.id);
  if (existente) { existente.destino.set(inst.x, 0, inst.z); actualizarDatos(existente, inst); return existente; }
  const gema = crearGema(inst.tipo, colorDe(inst.dueno));
  gema.grupo.position.set(inst.x, 0, inst.z);
  const etiqueta = document.createElement('div');
  etiqueta.className = 'etiqueta';
  elHud.appendChild(etiqueta);
  const p = {
    id: inst.id, tipo: inst.tipo, dueno: inst.dueno, inst, gema, etiqueta,
    destino: new THREE.Vector3(inst.x, 0, inst.z), semilla: Math.random(),
    actividad: 0, ladeo: new THREE.Vector2(), mezcla: null,
  };
  textoEtiqueta(p);
  piezas.set(p.id, p);
  audio.ponerInstrumento(inst);
  golpearGema(gema, 0.8); // al acoplarse, la pieza rebota
  return p;
}

// Datos nuevos del servidor (patrón, parámetros, pasos…) → audio y editor.
function actualizarDatos(p, inst) {
  p.inst = inst;
  audio.ponerInstrumento(inst);
  if (editor && seleccion === p) editor.refrescar();
  if (seleccion === p) textoRastreo = '';
}

function quitarPieza(id) {
  const p = piezas.get(id);
  if (!p) return;
  if (seleccion === p) seleccionar(null);
  if (agarre?.pieza === p) { agarre = null; controls.enabled = true; }
  destruirGema(p.gema);
  p.etiqueta.remove();
  piezas.delete(id);
  audio.quitarInstrumento(id);
  edicionesPendientes.delete(id);
}

// Reemplaza todo lo local por el estado completo (al unirse y al reconectar).
function sincronizar(estado) {
  sala.tempo = estado.tempo;
  sala.escala = estado.escala;
  sala.tripulantes = new Map(estado.tripulantes.map((t) => [t.id, t]));
  const vivos = new Set(estado.instrumentos.map((i) => i.id));
  for (const id of [...piezas.keys()]) if (!vivos.has(id)) quitarPieza(id);
  for (const inst of estado.instrumentos) agregarPieza(inst);
  for (const p of piezas.values()) { textoEtiqueta(p); colorearGema(p.gema, colorDe(p.dueno)); }
  refrescarTelemetria();
}

// =====================================================================
// RED — Socket.IO
// =====================================================================
const socket = io(API_URL, { autoConnect: false });

// Envía un evento y espera la respuesta del servidor (con un límite de 5 s).
function pedir(evento, datos) {
  return new Promise((resolve) => {
    socket.timeout(5000).emit(evento, datos, (err, r) => resolve(err ? { ok: false, error: 'Sin respuesta del servidor' } : r));
  });
}
function avisarError(r) {
  if (!r.ok) registrar('Error · ' + r.error);
  return r.ok;
}

const elEnlace = document.getElementById('enlace');
function enlace(estado, texto) {
  elEnlace.className = estado;
  elEnlace.textContent = texto;
}

socket.on('connect', async () => {
  enlace('vivo', 'Enlace · en línea');
  const r = await pedir('unirse', {});
  if (!avisarError(r)) return;
  yo = r.tu;
  sincronizar(r.estado);
  document.documentElement.style.setProperty('--mio', yo.color);
  document.getElementById('mi-indicativo').textContent = yo.indicativo;
  botonesAcople.forEach((b) => (b.disabled = false));
  registrar(yo.indicativo + ' a bordo');
});

socket.on('disconnect', () => {
  // Al caer el enlace el servidor elimina nuestras piezas; al volver nos da un indicativo nuevo.
  yo = null;
  enlace('caido', 'Enlace · perdido, reintentando');
  botonesAcople.forEach((b) => (b.disabled = true));
  registrar('Enlace perdido');
});
socket.on('connect_error', () => enlace('caido', 'Enlace · sin señal de ' + API_URL.replace(/^https?:\/\//, '')));

socket.on('tripulante:unido', (t) => {
  sala.tripulantes.set(t.id, t);
  refrescarTelemetria();
  registrar(t.indicativo + ' a bordo');
});
socket.on('tripulante:salio', ({ id, instrumentosEliminados }) => {
  const nombre = indicativoDe(id);
  instrumentosEliminados.forEach(quitarPieza);
  sala.tripulantes.delete(id);
  refrescarTelemetria();
  registrar(nombre + ' fuera de la estación');
});

socket.on('instrumento:agregado', (inst) => {
  if (piezas.has(inst.id)) return;
  agregarPieza(inst);
  registrar(MODULOS[inst.tipo] + ' acoplado · ' + indicativoDe(inst.dueno));
});
socket.on('instrumento:movido', ({ id, x, z }) => piezas.get(id)?.destino.set(x, 0, z));
socket.on('instrumento:eliminado', ({ id }) => {
  const p = piezas.get(id);
  if (!p) return;
  registrar(MODULOS[p.tipo] + ' desacoplado · ' + indicativoDe(p.dueno));
  quitarPieza(id);
});
// Patrones, pasos y parámetros: llegan completos y el audio los usa desde el siguiente paso.
socket.on('instrumento:editado', (inst) => {
  const p = piezas.get(inst.id);
  if (p) actualizarDatos(p, inst);
});

let avisoTempo = null; // el registro espera a que el tempo deje de moverse
socket.on('tempo:cambiado', ({ tempo, por }) => {
  sala.tempo = tempo;
  refrescarTelemetria();
  clearTimeout(avisoTempo);
  avisoTempo = setTimeout(() => registrar('Tempo ' + tempo + ' BPM · ' + indicativoDe(por)), 600);
});
socket.on('escala:cambiada', ({ escala, por }) => {
  sala.escala = escala;
  refrescarTelemetria();
  registrar('Escala ' + nombreEscala(escala) + ' · ' + indicativoDe(por));
});

// =====================================================================
// HUD y CONSOLA — telemetría real, tempo, escala y acople de módulos
// =====================================================================
const elBpm = document.getElementById('t-bpm');
const elEscala = document.getElementById('t-escala');
const elTripulantes = document.getElementById('t-tripulantes');
const elTempo = document.getElementById('c-tempo');
let tocandoTempo = false;

const botonesEscala = ESCALAS.map((e) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'boton';
  b.textContent = nombreEscala(e);
  b.addEventListener('click', async () => avisarError(await pedir('escala:cambiar', e)));
  document.getElementById('c-escalas').appendChild(b);
  return { b, e };
});

function refrescarTelemetria() {
  audio.fijarTempo(sala.tempo);   // el Transport sigue al tempo del servidor en vivo
  audio.fijarEscala(sala.escala); // los patrones guardan grados: se reinterpretan en la escala nueva
  elBpm.textContent = Math.round(sala.tempo);
  elEscala.textContent = nombreEscala(sala.escala);
  elTripulantes.textContent = dosCifras(sala.tripulantes.size);
  if (!tocandoTempo) elTempo.value = sala.tempo;
  for (const { b, e } of botonesEscala) {
    b.classList.toggle('activo', e.tonica === sala.escala.tonica && e.modo === sala.escala.modo);
  }
}

// Tempo: mientras se arrastra se envía unas 8 veces por segundo; al soltar, el valor final.
let ultimoTempo = 0;
function enviarTempo() {
  ultimoTempo = performance.now();
  pedir('tempo:cambiar', { tempo: Number(elTempo.value) }).then(avisarError);
}
elTempo.addEventListener('pointerdown', () => (tocandoTempo = true));
window.addEventListener('pointerup', () => (tocandoTempo = false));
elTempo.addEventListener('input', () => {
  elBpm.textContent = elTempo.value;
  if (performance.now() - ultimoTempo > 120) enviarTempo();
});
elTempo.addEventListener('change', enviarTempo);

// Acoplar módulo: busca un lugar libre cerca del centro y pide al servidor crear el instrumento.
function lugarLibre() {
  const otras = [...piezas.values()].map((p) => p.destino);
  let mejor = null, mejorDist = -1;
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 4.5;
    const c = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    const d = Math.min(Infinity, ...otras.map((o) => o.distanceTo(c)));
    if (d > 1.8) return c;
    if (d > mejorDist) { mejor = c; mejorDist = d; }
  }
  return mejor;
}
const botonesAcople = [...document.querySelectorAll('#acople .boton')];
botonesAcople.forEach((b) => {
  b.disabled = true;
  b.addEventListener('click', async () => {
    const lugar = lugarLibre();
    const r = await pedir('instrumento:agregar', { tipo: b.dataset.tipo, x: +lugar.x.toFixed(2), z: +lugar.z.toFixed(2) });
    if (!avisarError(r)) return;
    seleccionar(agregarPieza(r.instrumento));
  });
});

// Desacoplar: solo las piezas propias.
async function desacoplar(p) {
  if (!p || !esMia(p)) return;
  avisarError(await pedir('instrumento:eliminar', { id: p.id }));
}
document.getElementById('rastreo-borrar').addEventListener('click', () => desacoplar(seleccion));
window.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
  if (ev.target.closest?.('input, textarea')) return;
  if (seleccion && esMia(seleccion)) { ev.preventDefault(); desacoplar(seleccion); }
});

// =====================================================================
// AUDIO — botón ESCUCHAR / SILENCIAR (personal) y reacción visual a cada paso
// =====================================================================
const elAudio = document.getElementById('b-audio');
function pintarBotonAudio() {
  const sonando = audio.audioIniciado() && !audio.silenciado();
  elAudio.textContent = sonando ? 'Silenciar' : 'Escuchar';
  elAudio.classList.toggle('sonando', sonando);
}
elAudio.addEventListener('click', async () => {
  if (!audio.audioIniciado()) {
    await audio.iniciarAudio(); // el primer clic enciende el audio
    registrar('Audio en línea');
  } else {
    audio.silenciar(!audio.silenciado()); // después solo silencia lo que escucha esta persona
    registrar(audio.silenciado() ? 'Audio en silencio' : 'Audio en línea');
  }
  pintarBotonAudio();
});

// Fuerza del pulso RGB por sonido: el kick marca el pulso; hat y perc apenas lo rozan.
const PULSO_RGB = { kick: 0.8, snare: 0.5, hat: 0.12, perc: 0.2 };
// Cada paso de cada instrumento llega aquí, sincronizado con el audio.
audio.fijarReaccion((id, paso, sono, tipo) => {
  const p = piezas.get(id);
  if (!p) return;
  if (editor && seleccion === p) editor.marcarPaso(paso);
  if (!sono) return;
  if (tipo === 'percusion') {
    golpearGema(p.gema, 0.5);
    pulsoRGB(PULSO_RGB[p.inst.parametros.sonido] ?? 0.3); // cada golpe dispara el desplazamiento RGB
  } else {
    golpearGema(p.gema, 0.3);
  }
  // más notas y más rápido → más actividad → giro más rápido y en ángulos más aleatorios
  p.actividad = Math.min(p.actividad + 1, 14);
  const amplitud = 0.08 * Math.min(p.actividad, 8);
  p.ladeo.set((Math.random() - 0.5) * amplitud, (Math.random() - 0.5) * amplitud);
});

// =====================================================================
// EDICIÓN de instrumentos propios
// Los parámetros y el patrón se aplican al instante en local (se oyen sin esperar)
// y se envían al servidor como mucho 10 veces por segundo.
// =====================================================================
const edicionesPendientes = new Map(); // id → cambios por enviar
let ultimaEdicion = 0;
function enviarEdiciones() {
  ultimaEdicion = performance.now();
  for (const [id, cambios] of edicionesPendientes) {
    pedir('instrumento:editar', { id, ...cambios }).then(avisarError);
  }
  edicionesPendientes.clear();
}
function editarPropia(p, cambios, final) {
  if (cambios.patron) p.inst.patron = cambios.patron;
  if (cambios.parametros) p.inst.parametros = { ...p.inst.parametros, ...cambios.parametros };
  audio.ponerInstrumento(p.inst);
  const previos = edicionesPendientes.get(p.id) || {};
  edicionesPendientes.set(p.id, {
    ...previos, ...cambios,
    ...(cambios.parametros && { parametros: { ...previos.parametros, ...cambios.parametros } }),
  });
  if (final || performance.now() - ultimaEdicion > 100) enviarEdiciones();
}

let editor = null;
const elEditor = document.getElementById('rastreo-editor');
function montarEditor(p) {
  editor?.destruir();
  editor = null;
  if (!p || !esMia(p)) return; // las piezas de otros solo muestran su información
  editor = crearEditor(elEditor, () => p.inst, {
    editar: (cambios, final) => editarPropia(p, cambios, final),
    // pasos y subdivisión cambian la estructura: se espera la respuesta del servidor
    estructura: (cambios) => { enviarEdiciones(); pedir('instrumento:editar', { id: p.id, ...cambios }).then(avisarError); },
  });
}

// =====================================================================
// MEZCLA ESPACIAL + SELECCIÓN Y ARRASTRE DE PIEZAS
// =====================================================================
let seleccion = null;

// Posición → sonido: paneo según izquierda/derecha (eje X) y volumen según cercanía al centro.
function calcularMezcla(pos) {
  const paneo = THREE.MathUtils.clamp(pos.x / RADIO_PANEO, -1, 1);
  const volumen = 1 - THREE.MathUtils.clamp(Math.hypot(pos.x, pos.z) / RADIO_UNIVERSO, 0, 1);
  return { paneo: +paneo.toFixed(2), volumen: +volumen.toFixed(2) };
}

// Anillo sutil que marca la pieza seleccionada
const anillo = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 96 }, (_, i) => new THREE.Vector3(Math.cos(i / 96 * Math.PI * 2) * 0.95, 0, Math.sin(i / 96 * Math.PI * 2) * 0.95))),
  new THREE.LineBasicMaterial({ color: 0x8890b0, transparent: false, blending: THREE.AdditiveBlending, depthWrite: false })
);
anillo.visible = false;
scene.add(anillo);

function seleccionar(pieza) {
  if (pieza && pieza !== seleccion) registrar(MODULOS[pieza.tipo] + ' en rastreo');
  const cambio = pieza !== seleccion;
  seleccion = pieza;
  anillo.visible = !!pieza;
  textoRastreo = '';
  if (cambio) montarEditor(pieza);
}

const raycaster = new THREE.Raycaster();
const puntero = new THREE.Vector2();
const planoArrastre = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // plano horizontal invisible
const puntoPlano = new THREE.Vector3();
let agarre = null; // { pieza, propia, x0, y0, desfase, movida }
let clicVacio = null; // para deseleccionar con un clic en el espacio vacío

function piezaBajoPuntero(ev) {
  puntero.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(puntero, camera);
  const lista = [...piezas.values()];
  const golpe = raycaster.intersectObjects(lista.map((p) => p.gema.malla), false)[0];
  return golpe ? lista.find((p) => p.gema.malla === golpe.object) : null;
}

// Envío de la posición mientras se arrastra: como mucho 20 veces por segundo.
let ultimoEnvio = 0, envioPendiente = null;
function enviarPosicion(p, forzar = false) {
  if (!forzar && performance.now() - ultimoEnvio < 50) { envioPendiente = p; return; }
  ultimoEnvio = performance.now();
  envioPendiente = null;
  const pos = p.gema.grupo.position;
  socket.emit('instrumento:mover', { id: p.id, x: +pos.x.toFixed(3), z: +pos.z.toFixed(3) }, (r) => {
    if (r && !r.ok) registrar('Error · ' + r.error);
  });
}

// En fase de captura para adelantarse a OrbitControls: si se toca una pieza, la cámara no orbita.
lienzo.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  const pieza = piezaBajoPuntero(ev);
  if (!pieza) { clicVacio = { x: ev.clientX, y: ev.clientY }; return; } // espacio vacío → orbitar
  clicVacio = null;
  planoArrastre.constant = -pieza.gema.grupo.position.y;
  const desfase = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(planoArrastre, puntoPlano)) desfase.copy(pieza.gema.grupo.position).sub(puntoPlano);
  agarre = { pieza, propia: esMia(pieza), x0: ev.clientX, y0: ev.clientY, desfase, movida: false };
  controls.enabled = false;
  lienzo.setPointerCapture(ev.pointerId);
}, { capture: true });

lienzo.addEventListener('pointermove', (ev) => {
  if (!agarre) {
    const p = piezaBajoPuntero(ev);
    lienzo.style.cursor = !p ? CURSOR_RETICULA : esMia(p) ? CURSOR_MODULO : CURSOR_AJENO;
    return;
  }
  if (!agarre.propia) return; // las piezas de otros solo se pueden seleccionar
  if (!agarre.movida && Math.hypot(ev.clientX - agarre.x0, ev.clientY - agarre.y0) < 5) return;
  agarre.movida = true;
  lienzo.style.cursor = CURSOR_MODULO;
  piezaBajoPuntero(ev); // actualiza el rayo
  if (!raycaster.ray.intersectPlane(planoArrastre, puntoPlano)) return;
  puntoPlano.add(agarre.desfase);
  const d = Math.hypot(puntoPlano.x, puntoPlano.z);
  if (d > RADIO_UNIVERSO) puntoPlano.multiplyScalar(RADIO_UNIVERSO / d); // no salir del universo
  const p = agarre.pieza;
  p.gema.grupo.position.x = puntoPlano.x;
  p.gema.grupo.position.z = puntoPlano.z;
  p.destino.copy(p.gema.grupo.position);
  enviarPosicion(p);
});

function soltar(ev) {
  if (!agarre) {
    // clic sin arrastrar en el vacío → quitar la selección
    if (clicVacio && ev && Math.hypot(ev.clientX - clicVacio.x, ev.clientY - clicVacio.y) < 5) seleccionar(null);
    clicVacio = null;
    return;
  }
  seleccionar(agarre.pieza); // clic sin mover → solo selecciona
  if (agarre.movida) {
    golpearGema(agarre.pieza.gema); // al soltar tras arrastrar → rebote de gelatina
    enviarPosicion(agarre.pieza, true);
    const pos = agarre.pieza.gema.grupo.position;
    registrar(MODULOS[agarre.pieza.tipo] + ' reubicado · X ' + coord(pos.x) + ' Z ' + coord(pos.z));
  }
  agarre = null;
  controls.enabled = true;
  lienzo.style.cursor = CURSOR_RETICULA;
}
lienzo.addEventListener('pointerup', soltar);
lienzo.addEventListener('pointercancel', soltar);
lienzo.style.cursor = CURSOR_RETICULA;

// =====================================================================
// HUD en la escena — etiqueta de rastreo y etiquetas bajo cada gema
// =====================================================================
const escapar = (s) => String(s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
const elRastreo = document.getElementById('rastreo');
const elRastreoDatos = document.getElementById('rastreo-datos');
const elRastreoBorrar = document.getElementById('rastreo-borrar');
const elLinea = document.getElementById('r-linea');
const elPunto = document.getElementById('r-punto');
const elCapaLinea = document.getElementById('rastreo-linea');
const enPantalla = new THREE.Vector3();
let textoRastreo = '';
// Información de solo lectura de un instrumento ajeno.
const NOMBRE_ACORDE = { triada: 'tríada', septima: 'séptima', sus: 'sus' };
function resumenInstrumento(inst) {
  const p = inst.parametros;
  const sonido = inst.tipo === 'percusion' ? p.sonido
    : inst.tipo === 'armonia' ? NOMBRE_ACORDE[p.acorde] + ' · inv ' + p.inversion : 'mono · glide ' + p.glide.toFixed(2);
  const notas = inst.patron.filter((v) => v !== null && v !== false).length;
  return '<div class="ed-info"><b>Sonido</b><span>' + escapar(sonido) + '</span></div>'
    + '<div class="ed-info"><b>Patrón</b><span>' + inst.pasos + ' pasos · ' + escapar(inst.subdivision) + '</span></div>'
    + '<div class="ed-info"><b>Notas</b><span>' + notas + '</span></div>';
}
function actualizarRastreo() {
  const visible = !!seleccion;
  elRastreo.hidden = !visible;
  elCapaLinea.style.display = visible ? '' : 'none';
  if (!visible) return;
  const pos = seleccion.gema.grupo.position;
  enPantalla.copy(pos).project(camera);
  if (enPantalla.z > 1) { elRastreo.hidden = true; elCapaLinea.style.display = 'none'; return; } // detrás de la cámara
  const W = window.innerWidth, H = window.innerHeight;
  const sx = (enPantalla.x * 0.5 + 0.5) * W, sy = (-enPantalla.y * 0.5 + 0.5) * H;
  const m = calcularMezcla(pos);
  const texto = '<h2>' + MODULOS[seleccion.tipo] + '</h2>'
    + '<div><b>Tripulante</b><span>' + escapar(indicativoDe(seleccion.dueno)) + (esMia(seleccion) ? ' · tú' : '') + '</span></div>'
    + '<div><b>Coord</b><span>X ' + coord(pos.x) + ' · Z ' + coord(pos.z) + '</span></div>'
    + '<div><b>Paneo</b><span>' + (m.paneo >= 0 ? '+' : '-') + Math.abs(m.paneo).toFixed(2) + '</span></div>'
    + '<div><b>Volumen</b><span>' + m.volumen.toFixed(2) + '</span></div>'
    + (esMia(seleccion) ? '' : resumenInstrumento(seleccion.inst)); // lo propio se ve en el editor
  if (texto !== textoRastreo) {
    elRastreoDatos.innerHTML = texto;
    textoRastreo = texto;
    elRastreoBorrar.hidden = !esMia(seleccion);
  }
  const acento = colorDe(seleccion.dueno);
  elRastreo.style.setProperty('--acento', acento);
  elCapaLinea.style.setProperty('--acento', acento);
  // la etiqueta va arriba a la derecha de la pieza, sin salirse de la pantalla
  const panel = gui.domElement.getBoundingClientRect(); // no quedar debajo del panel de ajustes
  const lx = THREE.MathUtils.clamp(sx + 110, 12, W - panel.width - 16 - elRastreo.offsetWidth - 12);
  const ly = THREE.MathUtils.clamp(sy - 130, 12, H - elRastreo.offsetHeight - 12);
  elRastreo.style.transform = 'translate(' + Math.round(lx) + 'px,' + Math.round(ly) + 'px)';
  const ay = ly + elRastreo.offsetHeight; // esquina inferior izquierda de la etiqueta
  elLinea.setAttribute('points', (sx + 5).toFixed(1) + ',' + (sy - 5).toFixed(1) + ' ' + (lx - 26).toFixed(1) + ',' + ay.toFixed(1) + ' ' + lx.toFixed(1) + ',' + ay.toFixed(1));
  elPunto.setAttribute('cx', sx.toFixed(1));
  elPunto.setAttribute('cy', sy.toFixed(1));
}
// el botón de desacoplar es lo único clicable dentro de la etiqueta de rastreo
elRastreo.style.pointerEvents = 'none';

// Etiquetas fijas debajo de cada gema
const bajoPieza = new THREE.Vector3();
function actualizarEtiquetas() {
  const W = window.innerWidth, H = window.innerHeight;
  for (const p of piezas.values()) {
    bajoPieza.copy(p.gema.grupo.position); bajoPieza.y -= 1.0;
    bajoPieza.project(camera);
    p.etiqueta.style.display = bajoPieza.z > 1 ? 'none' : '';
    p.etiqueta.style.transform = 'translate(' + Math.round((bajoPieza.x * 0.5 + 0.5) * W) + 'px,' + Math.round((-bajoPieza.y * 0.5 + 0.5) * H) + 'px) translateX(-50%)';
  }
}

// =====================================================================
// PANEL DE AJUSTES (tecla H)
// =====================================================================
function ajustarTamano() {
  ajustarTamanoEscena();
  actualizarEscalaNubes();
}
window.addEventListener('resize', ajustarTamano);

const { gui, info, refrescar: refrescarPanel } = crearPanel({
  ajustarTamano,
  imprimirPiezas() {
    const posiciones = {};
    for (const p of piezas.values()) {
      const pos = p.gema.grupo.position;
      posiciones[p.id] = { tipo: p.tipo, dueno: indicativoDe(p.dueno), x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), ...calcularMezcla(pos) };
    }
    return posiciones;
  },
  golpe() {
    for (const p of seleccion ? [seleccion] : piezas.values()) golpearGema(p.gema);
    pulsoRGB();
    registrar('Golpe · ' + (seleccion ? MODULOS[seleccion.tipo] : 'todos los módulos'));
  },
});

// =====================================================================
// Animación
// =====================================================================
const reloj = new THREE.Clock();
let tiempo = 0;
function animar() {
  const dt = Math.min(reloj.getDelta(), 0.1);
  tiempo += dt;
  const rot = params.general.rotacion;
  const suavizado = 1 - Math.exp(-dt * 12); // las piezas de otros se deslizan hacia su posición nueva
  const calma = Math.exp(-dt / 1.2);        // la actividad se apaga en un par de segundos sin notas
  const ladeoSuave = 1 - Math.exp(-dt * 4);
  for (const p of piezas.values()) {
    const g = p.gema;
    // Sin notas giran solo sobre el eje vertical (con un balanceo leve) para que se lea la silueta;
    // con actividad giran más rápido y se ladean hacia ángulos aleatorios.
    p.actividad *= calma;
    g.giro.rotation.y += dt * rot * (0.25 + p.semilla * 0.1) * (1 + 0.35 * p.actividad);
    p.ladeo.multiplyScalar(calma);
    g.giro.rotation.x += (p.ladeo.x - g.giro.rotation.x) * ladeoSuave;
    g.giro.rotation.z += (Math.sin(tiempo * 0.3 + p.semilla * 6.28) * 0.07 + p.ladeo.y - g.giro.rotation.z) * ladeoSuave;
    if (agarre?.pieza !== p) g.grupo.position.lerp(p.destino, suavizado);
    animarGema(g, p.tipo, dt);
    // posición → mezcla: paneo y volumen se actualizan en vivo (también al arrastrar)
    const m = calcularMezcla(g.grupo.position);
    if (!p.mezcla || m.paneo !== p.mezcla.paneo || m.volumen !== p.mezcla.volumen) {
      p.mezcla = m;
      audio.mezclar(p.id, m.paneo, m.volumen);
    }
  }
  if (edicionesPendientes.size && performance.now() - ultimaEdicion > 100) enviarEdiciones();
  if (envioPendiente) enviarPosicion(envioPendiente);
  if (seleccion) {
    const pos = seleccion.gema.grupo.position;
    anillo.position.copy(pos);
    const m = calcularMezcla(pos);
    info.pieza = MODULOS[seleccion.tipo] + ' · ' + TALLAS[seleccion.tipo];
    info.tripulante = indicativoDe(seleccion.dueno);
    info.x = pos.x; info.z = pos.z; info.paneo = m.paneo; info.volumen = m.volumen;
  }
  actualizarEtiquetas();
  actualizarRastreo();
  actualizarTelemetria();
  dibujar(dt, tiempo);
}

// =====================================================================
// Arranque: primero las gemas, después la conexión con el servidor
// =====================================================================
registrar('Estación 01 en línea');
aplicarVidrio();
cargarPlantillas()
  .then(() => {
    aplicarVidrio(); // con los valores guardados en materiales.json, si los hay
    refrescarPanel();
    renderer.setAnimationLoop(animar);
    enlace('', 'Enlace · conectando con ' + API_URL.replace(/^https?:\/\//, ''));
    socket.connect();
  })
  .catch((e) => {
    const el = document.getElementById('error');
    el.style.display = 'grid';
    el.textContent = 'No se pudieron cargar los modelos. (' + e.message + ')';
    console.error(e);
  });
