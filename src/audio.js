// Audio con Tone.js. Cada navegador genera la mezcla completa a partir del estado compartido:
// no se sincroniza audio entre computadores, solo los datos (tempo, escala, patrones, posiciones).
//
// Cadena de cada instrumento: sintetizador → filtro → volumen (parámetro) → paneo → volumen
// espacial (distancia al centro) → bus maestro → limitador → salida.

import * as Tone from 'tone';

// --- Escalas: intervalos en semitonos desde la tónica ---
const TONICAS = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const MODOS = {
  mayor: [0, 2, 4, 5, 7, 9, 11], menor: [0, 2, 3, 5, 7, 8, 10], dorico: [0, 2, 3, 5, 7, 9, 10],
  frigio: [0, 1, 3, 5, 7, 8, 10], lidio: [0, 2, 4, 6, 7, 9, 11], mixolidio: [0, 2, 4, 5, 7, 9, 10],
  locrio: [0, 1, 3, 5, 6, 8, 10], pentatonica: [0, 3, 5, 7, 10], blues: [0, 3, 5, 6, 7, 10],
};

// Duración de un paso en ticks del Transport. Con 960 ticks por negra caben todas exactas.
const PPQ = 960;
const TICKS = { corchea: 480, semicorchea: 240, tresillo: 320, quintillo: 192 };

// Acordes como grados apilados sobre el grado de la cuadrícula.
const ACORDES = { triada: [0, 2, 4], septima: [0, 2, 4, 6], sus: [0, 3, 4] };

// Nivel base de cada sonido (dB) para que la mezcla quede equilibrada con volumen 1.
const NIVEL = { kick: -2, snare: -8, hat: -16, perc: -20, armonia: -14, melodia: -10 };

let escala = { tonica: 'C', modo: 'menor' };
let tempo = 120;
let iniciado = false;
let bus = null;
let alPaso = () => {}; // reacción visual: (id, paso, sono, tipo)

const instrumentos = new Map(); // id → datos del instrumento (siempre los últimos)
const mezclas = new Map();      // id → { paneo, volumen } según su posición
const voces = new Map();        // id → nodos de Tone.js (solo después de iniciar)

// Grado de la escala (puede pasar de 6: sube de octava) → nota MIDI.
// Así un patrón se reinterpreta solo cuando cambia la escala: guarda grados, no notas.
function gradoAMidi(grado, octava) {
  const intervalos = MODOS[escala.modo] || MODOS.menor;
  const n = intervalos.length;
  const vuelta = Math.floor(grado / n);
  return 12 * (octava + 1) + (TONICAS[escala.tonica] ?? 0) + intervalos[((grado % n) + n) % n] + 12 * vuelta;
}
const midiAHz = (m) => 440 * 2 ** ((m - 69) / 12);
const aDb = (v, nivel) => (v <= 0.001 ? -100 : nivel + 20 * Math.log10(v));

// =====================================================================
// Voces
// =====================================================================

// Percusión: cada sonido es un sintetizador distinto; el pitch mueve su frecuencia o su filtro.
function crearPercusion(voz, p) {
  voz.synth?.dispose();
  const factor = 2 ** (p.pitch / 12);
  const env = { attack: 0.001, decay: p.decay, sustain: 0, release: 0.05 };
  if (p.sonido === 'kick') {
    voz.synth = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 6, oscillator: { type: 'sine' }, envelope: env });
    voz.filtro.set({ type: 'lowpass', frequency: 18000, Q: 0.5 });
  } else if (p.sonido === 'snare') {
    voz.synth = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: env });
    voz.filtro.set({ type: 'bandpass', frequency: 1800 * factor, Q: 0.8 });
  } else if (p.sonido === 'hat') {
    voz.synth = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: env });
    voz.filtro.set({ type: 'highpass', frequency: 7000 * factor, Q: 0.7 });
  } else {
    voz.synth = new Tone.MetalSynth({ envelope: env, harmonicity: 5.1, modulationIndex: 16, resonance: 3000, octaves: 1.5 });
    voz.filtro.set({ type: 'lowpass', frequency: 18000, Q: 0.5 });
  }
  voz.sonido = p.sonido;
  voz.synth.connect(voz.filtro);
}

function crearVoz(inst) {
  const voz = {
    filtro: new Tone.Filter(18000, 'lowpass'),
    volumen: new Tone.Volume(-100),
    panner: new Tone.Panner(0),
    espacio: new Tone.Gain(0),
    synth: null, sonido: null, subdivision: null, loop: null,
  };
  voz.filtro.chain(voz.volumen, voz.panner, voz.espacio, bus);
  if (inst.tipo === 'armonia') {
    voz.synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' } });
    voz.synth.connect(voz.filtro);
  } else if (inst.tipo === 'melodia') {
    voz.synth = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { type: 'lowpass', Q: 2, rolloff: -24 },
      filterEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.4, octaves: 2 },
    });
    voz.synth.connect(voz.filtro);
  }
  voz.loop = new Tone.Loop((time) => tocar(inst.id, time), TICKS.semicorchea + 'i').start(0);
  voces.set(inst.id, voz);
  aplicarVoz(inst.id);
  const m = mezclas.get(inst.id);
  if (m) mezclar(inst.id, m.paneo, m.volumen);
}

// Lleva los parámetros del instrumento a sus nodos de Tone.js.
function aplicarVoz(id) {
  const inst = instrumentos.get(id), voz = voces.get(id);
  if (!inst || !voz) return;
  const p = inst.parametros;
  if (voz.subdivision !== inst.subdivision) {
    voz.loop.interval = (TICKS[inst.subdivision] || TICKS.semicorchea) + 'i';
    voz.subdivision = inst.subdivision;
  }
  if (inst.tipo === 'percusion') {
    if (voz.sonido !== p.sonido) crearPercusion(voz, p);
    voz.synth.envelope.decay = p.decay;
    const factor = 2 ** (p.pitch / 12);
    if (p.sonido === 'snare') voz.filtro.frequency.rampTo(1800 * factor, 0.05);
    if (p.sonido === 'hat') voz.filtro.frequency.rampTo(7000 * factor, 0.05);
    voz.volumen.volume.rampTo(aDb(p.volumen, NIVEL[p.sonido]), 0.05);
  } else {
    const envolvente = { attack: p.ataque, decay: p.decaimiento, sustain: p.sostenido, release: p.relajacion };
    if (inst.tipo === 'armonia') {
      voz.synth.set({ envelope: envolvente });
      voz.filtro.frequency.rampTo(p.cutoff, 0.05);
    } else {
      voz.synth.set({ envelope: envolvente, portamento: p.glide, filterEnvelope: { baseFrequency: p.cutoff } });
    }
    voz.volumen.volume.rampTo(aDb(p.volumen, NIVEL[inst.tipo]), 0.05);
  }
}

// Cuántos segundos dura una nota: hasta el siguiente paso con nota (legato), como mucho una vuelta.
function duracionLegato(inst, paso, segPaso) {
  let n = 1;
  while (n < inst.pasos && inst.patron[(paso + n) % inst.pasos] === null) n++;
  return n * segPaso * 0.92;
}

// Se llama en cada paso de cada instrumento, con el tiempo exacto de audio.
function tocar(id, time) {
  const inst = instrumentos.get(id), voz = voces.get(id);
  if (!inst || !voz) return;
  const ticks = TICKS[inst.subdivision] || TICKS.semicorchea;
  // El paso sale de la posición del Transport: todos los instrumentos quedan alineados
  // al mismo pulso aunque tengan distinto número de pasos (polimetría).
  const paso = Math.round(Tone.getTransport().getTicksAtTime(time) / ticks) % inst.pasos;
  const valor = inst.patron[paso];
  const p = inst.parametros;
  let sono = false;
  if (inst.tipo === 'percusion') {
    if (valor) {
      sono = true;
      if (p.sonido === 'kick') voz.synth.triggerAttackRelease(45 * 2 ** (p.pitch / 12), p.decay, time);
      else if (p.sonido === 'perc') voz.synth.triggerAttackRelease(300 * 2 ** (p.pitch / 12), p.decay, time);
      else voz.synth.triggerAttackRelease(p.decay, time);
    }
  } else if (valor !== null && valor !== undefined) {
    sono = true;
    const segPaso = Tone.Ticks(ticks).toSeconds();
    const dur = Math.min(duracionLegato(inst, paso, segPaso), 4);
    if (inst.tipo === 'armonia') {
      const midis = ACORDES[p.acorde].map((d) => gradoAMidi(valor + d, 3)).sort((a, b) => a - b);
      for (let i = 0; i < p.inversion && i < midis.length; i++) midis[i] += 12; // inversión
      voz.synth.triggerAttackRelease(midis.map(midiAHz), dur, time, 0.6);
    } else {
      voz.synth.triggerAttackRelease(midiAHz(gradoAMidi(valor, 4)), dur, time, 0.8);
    }
  }
  Tone.getDraw().schedule(() => alPaso(id, paso, sono, inst.tipo), time);
}

function quitarVozNodos(id) {
  const voz = voces.get(id);
  if (!voz) return;
  voz.loop.dispose();
  // se da tiempo a que terminen las colas de las notas antes de desconectar
  voz.espacio.gain.rampTo(0, 0.05);
  setTimeout(() => {
    for (const nodo of [voz.synth, voz.filtro, voz.volumen, voz.panner, voz.espacio]) nodo?.dispose();
  }, 300);
  voces.delete(id);
}

// =====================================================================
// API para main.js
// =====================================================================

export const audioIniciado = () => iniciado;

// Primer clic del usuario: los navegadores exigen un gesto para encender el audio.
export async function iniciarAudio() {
  if (iniciado) return;
  await Tone.start();
  const transport = Tone.getTransport();
  transport.PPQ = PPQ;
  transport.bpm.value = tempo;
  bus = new Tone.Gain(0.8);
  bus.chain(new Tone.Limiter(-1), Tone.getDestination()); // el limitador evita saturar con muchos instrumentos
  iniciado = true;
  for (const id of instrumentos.keys()) crearVoz(instrumentos.get(id));
  transport.start('+0.1');
}

// Silencio personal: solo afecta lo que escucha esta persona.
export function silenciar(si) { Tone.getDestination().mute = si; }
export const silenciado = () => Tone.getDestination().mute;

export function fijarReaccion(fn) { alPaso = fn; }

export function fijarTempo(bpm) {
  tempo = bpm;
  if (iniciado) Tone.getTransport().bpm.rampTo(bpm, 0.15);
}

export function fijarEscala(nueva) { escala = { ...nueva }; }

// Agrega o actualiza un instrumento (siempre con sus datos completos).
export function ponerInstrumento(inst) {
  const nuevo = !instrumentos.has(inst.id);
  instrumentos.set(inst.id, inst);
  if (!iniciado) return;
  if (nuevo) crearVoz(inst);
  else aplicarVoz(inst.id);
}

export function quitarInstrumento(id) {
  instrumentos.delete(id);
  mezclas.delete(id);
  quitarVozNodos(id);
}

// Posición → mezcla: paneo de -1 a 1 y volumen espacial de 0 a 1.
export function mezclar(id, paneo, volumen) {
  mezclas.set(id, { paneo, volumen });
  const voz = voces.get(id);
  if (!voz) return;
  voz.panner.pan.rampTo(paneo, 0.05);
  voz.espacio.gain.rampTo(volumen, 0.05);
}
