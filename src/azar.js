// Patrones aleatorios con criterio musical para el botón ALEATORIO del editor.
// Siempre respetan el número de pasos y la subdivisión del instrumento.
//  · Percusión: más probabilidad de golpe en los tiempos fuertes, según el sonido.
//  · Melodía: camina por grados cercanos entre sí (saltos pequeños), con algunos silencios.
//  · Armonía: pocos acordes, en tiempos fuertes, que dejan respirar.

const PASOS_POR_PULSO = { corchea: 2, semicorchea: 4, tresillo: 3, quintillo: 5 };
const GRADOS = 7;

// Peso de cada paso según dónde cae: 3 = inicio de compás, 2 = tiempo, 1 = medio tiempo, 0 = el resto.
function fuerza(paso, porPulso) {
  if (paso % (porPulso * 4) === 0) return 3;
  if (paso % porPulso === 0) return 2;
  if (porPulso % 2 === 0 && paso % (porPulso / 2) === 0) return 1;
  return 0;
}
const elegir = (lista) => lista[Math.floor(Math.random() * lista.length)];
// Elige un elemento según pesos: [[valor, peso], ...]
function elegirConPeso(opciones) {
  let r = Math.random() * opciones.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of opciones) if ((r -= w) <= 0) return v;
  return opciones[opciones.length - 1][0];
}

// Probabilidad de golpe por sonido y por fuerza del paso [resto, medio tiempo, tiempo, compás].
const PROB_PERC = {
  kick: [0.06, 0.18, 0.65, 0.95],
  snare: [0.05, 0.1, 0.35, 0.1], // los tiempos 2 y 4 se refuerzan aparte
  hat: [0.3, 0.75, 0.45, 0.4],
  perc: [0.25, 0.35, 0.15, 0.1],
};

function percusion(inst) {
  const porPulso = PASOS_POR_PULSO[inst.subdivision] || 4;
  const tabla = PROB_PERC[inst.parametros.sonido] || PROB_PERC.perc;
  const patron = Array.from({ length: inst.pasos }, (_, s) => {
    let p = tabla[fuerza(s, porPulso)];
    // la caja vive en los tiempos 2 y 4 del compás
    if (inst.parametros.sonido === 'snare' && s % porPulso === 0 && (s / porPulso) % 2 === 1) p = 0.85;
    return Math.random() < p;
  });
  if (!patron.some(Boolean)) patron[0] = true; // nunca vacío
  return patron;
}

function melodia(inst) {
  const porPulso = PASOS_POR_PULSO[inst.subdivision] || 4;
  let grado = elegir([0, 2, 4]); // empieza en una nota del acorde de tónica
  const patron = [];
  for (let s = 0; s < inst.pasos; s++) {
    const prob = [0.4, 0.6, 0.85, 0.95][fuerza(s, porPulso)];
    if (Math.random() >= prob) { patron.push(null); continue; }
    // pasos cortos: repetir o moverse un grado es lo más probable; dos grados, menos
    grado += elegirConPeso([[0, 0.15], [1, 0.3], [-1, 0.3], [2, 0.12], [-2, 0.13]]);
    if (grado < 0) grado = -grado;                           // rebota en el borde de abajo
    if (grado > GRADOS - 1) grado = 2 * (GRADOS - 1) - grado; // y en el de arriba
    patron.push(grado);
  }
  if (patron.every((g) => g === null)) patron[0] = 0;
  return patron;
}

function armonia(inst) {
  const porPulso = PASOS_POR_PULSO[inst.subdivision] || 2;
  // posiciones candidatas: cada dos tiempos (medio compás de 4/4)
  const cada = porPulso * 2;
  const patron = Array(inst.pasos).fill(null);
  let anterior = null;
  for (let s = 0; s < inst.pasos; s += cada) {
    const primero = s === 0;
    if (!primero && Math.random() > 0.55) continue; // dejar respirar: no todos los huecos llevan acorde
    // i, iv, v y VI (y a veces III); el primero suele ser la tónica
    const grado = primero && Math.random() < 0.7 ? 0
      : elegirConPeso([[0, 2], [3, 2], [4, 2], [5, 2], [2, 1]].filter(([g]) => g !== anterior));
    patron[s] = grado;
    anterior = grado;
  }
  return patron;
}

export function patronAleatorio(inst) {
  if (inst.tipo === 'percusion') return percusion(inst);
  if (inst.tipo === 'armonia') return armonia(inst);
  return melodia(inst);
}
