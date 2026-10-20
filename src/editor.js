// Editor de un instrumento propio: se monta dentro de la etiqueta de rastreo.
// Percusión: una fila de pasos encendido/apagado. Armonía y melodía: 7 filas (grados de la
// escala) por número de pasos, con una nota por paso. Debajo, los controles de sus parámetros.

const SUBDIVISIONES = [['corchea', 'Corchea'], ['semicorchea', 'Semicorchea'], ['tresillo', 'Tresillo']];
const PASOS_POR_PULSO = { corchea: 2, semicorchea: 4, tresillo: 3, quintillo: 5 };
const GRADOS = 7;

import { patronAleatorio } from './azar.js';

// Controles por tipo. Deslizadores: [clave, etiqueta, mínimo, máximo, paso, escala logarítmica].
const ADSR = [
  ['ataque', 'Ataque', 0.001, 2, 0.001], ['decaimiento', 'Decaim.', 0.01, 2, 0.01],
  ['sostenido', 'Sostenido', 0, 1, 0.01], ['relajacion', 'Relajac.', 0.01, 4, 0.01],
];
const ENVIOS = [['envioReverb', 'Env. reverb', 0, 1, 0.01], ['envioDelay', 'Env. delay', 0, 1, 0.01]];
const FILTRO = [['cutoff', 'Cutoff', 100, 12000, 1, true], ['resonancia', 'Resonancia', 0.1, 18, 0.1]];
const CONTROLES = {
  percusion: {
    opciones: [['sonido', 'Sonido', [['kick', 'Kick'], ['snare', 'Snare'], ['hat', 'Hat'], ['perc', 'Perc']]]],
    deslizadores: [['pitch', 'Pitch', -12, 12, 1], ['decay', 'Decay', 0.02, 1.5, 0.01], ['volumen', 'Volumen', 0, 1, 0.01], ...ENVIOS],
  },
  armonia: {
    opciones: [
      ['acorde', 'Acorde', [['triada', 'Tríada'], ['septima', 'Séptima'], ['sus', 'Sus']]],
      ['inversion', 'Inversión', [[0, '0'], [1, '1'], [2, '2']]],
    ],
    deslizadores: [...ADSR, ...FILTRO, ['volumen', 'Volumen', 0, 1, 0.01], ...ENVIOS],
  },
  melodia: {
    opciones: [],
    deslizadores: [...ADSR, ...FILTRO, ['glide', 'Glide', 0, 0.5, 0.005], ['volumen', 'Volumen', 0, 1, 0.01], ...ENVIOS],
  },
};
// Decay típico de cada sonido de percusión: se aplica al cambiar de sonido.
const DECAY_PERC = { kick: 0.4, snare: 0.18, hat: 0.05, perc: 0.25 };

const crear = (etiqueta, clase, texto) => {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
};
const formato = (v, paso) => (paso >= 1 ? String(Math.round(v)) : v < 0.1 && paso < 0.01 ? v.toFixed(3) : v.toFixed(2));

// obtener(): datos actuales del instrumento · acciones.editar(cambios, final) · acciones.estructura(cambios)
export function crearEditor(contenedor, obtener, acciones) {
  const raiz = crear('div', 'editor');
  contenedor.replaceChildren(raiz);
  const inst0 = obtener();
  const def = CONTROLES[inst0.tipo];

  // --- Pasos y subdivisión: cambian la estructura, así que esperan la respuesta del servidor ---
  const filaPasos = crear('div', 'ed-fila');
  const menos = crear('button', 'boton ed-mini', '−');
  const mas = crear('button', 'boton ed-mini', '+');
  const numPasos = crear('span', 'ed-valor');
  menos.type = mas.type = 'button';
  menos.addEventListener('click', () => acciones.estructura({ pasos: Math.max(1, obtener().pasos - 1) }));
  mas.addEventListener('click', () => acciones.estructura({ pasos: Math.min(32, obtener().pasos + 1) }));
  // ALEATORIO: un patrón nuevo con criterio musical (azar.js), enviado como cualquier edición
  const aleatorio = crear('button', 'boton ed-op ed-aleatorio', 'Aleatorio');
  aleatorio.type = 'button';
  aleatorio.addEventListener('click', () => {
    acciones.editar({ patron: patronAleatorio(obtener()) }, true);
    pintarRejilla();
  });
  filaPasos.append(crear('b', '', 'Pasos'), menos, numPasos, mas, aleatorio);

  const filaSub = crear('div', 'ed-fila');
  filaSub.append(crear('b', '', 'Subdiv.'));
  const botonesSub = SUBDIVISIONES.map(([valor, texto]) => {
    const b = crear('button', 'boton ed-op', texto);
    b.type = 'button';
    b.addEventListener('click', () => acciones.estructura({ subdivision: valor }));
    filaSub.append(b);
    return [valor, b];
  });

  // --- Cuadrícula de pasos ---
  const rejilla = crear('div', 'ed-rejilla');
  let columnas = []; // paso → celdas de esa columna (para el cursor de reproducción)
  let pasoMarcado = -1;
  function construirRejilla() {
    const inst = obtener();
    const filas = inst.tipo === 'percusion' ? 1 : GRADOS;
    rejilla.style.setProperty('--pasos', inst.pasos);
    rejilla.style.setProperty('--celda', inst.pasos > 16 ? '9px' : '13px');
    rejilla.classList.toggle('ed-una-fila', filas === 1);
    const celdas = [];
    columnas = Array.from({ length: inst.pasos }, () => []);
    const porPulso = PASOS_POR_PULSO[inst.subdivision] || 4;
    for (let f = 0; f < filas; f++) {
      const grado = filas === 1 ? null : GRADOS - 1 - f; // el grado más agudo arriba
      for (let s = 0; s < inst.pasos; s++) {
        const c = crear('div', 'ed-celda' + (s % porPulso === 0 ? ' ed-pulso' : ''));
        c.dataset.paso = s;
        if (grado !== null) c.dataset.grado = grado;
        celdas.push(c);
        columnas[s].push(c);
      }
    }
    rejilla.replaceChildren(...celdas);
    pasoMarcado = -1;
    pintarRejilla();
  }
  function pintarRejilla() {
    const inst = obtener();
    for (const c of rejilla.children) {
      const v = inst.patron[+c.dataset.paso];
      c.classList.toggle('ed-on', c.dataset.grado === undefined ? !!v : v === +c.dataset.grado);
    }
  }
  rejilla.addEventListener('pointerdown', (ev) => {
    const c = ev.target.closest('.ed-celda');
    if (!c) return;
    const inst = obtener();
    const patron = [...inst.patron];
    const s = +c.dataset.paso;
    if (c.dataset.grado === undefined) patron[s] = !patron[s];
    else patron[s] = patron[s] === +c.dataset.grado ? null : +c.dataset.grado;
    acciones.editar({ patron }, true);
    pintarRejilla();
  });

  // --- Opciones (botones) y deslizadores de parámetros ---
  const controles = []; // { refrescar() }
  const bloqueParams = crear('div', 'ed-params');
  for (const [clave, etiqueta, opciones] of def.opciones) {
    const fila = crear('div', 'ed-fila');
    fila.append(crear('b', '', etiqueta));
    const botones = opciones.map(([valor, texto]) => {
      const b = crear('button', 'boton ed-op', texto);
      b.type = 'button';
      b.addEventListener('click', () => {
        const cambio = { [clave]: valor };
        if (clave === 'sonido') cambio.decay = DECAY_PERC[valor];
        acciones.editar({ parametros: cambio }, true);
        refrescar();
      });
      fila.append(b);
      return [valor, b];
    });
    controles.push({ refrescar: (p) => botones.forEach(([v, b]) => b.classList.toggle('activo', p[clave] === v)) });
    bloqueParams.append(fila);
  }
  for (const [clave, etiqueta, min, max, paso, log] of def.deslizadores) {
    const fila = crear('label', 'ed-fila ed-deslizador');
    const entrada = crear('input', 'deslizador');
    const valor = crear('span', 'ed-valor');
    entrada.type = 'range';
    // escala logarítmica para el cutoff: el oído percibe la frecuencia así
    const aEntrada = (v) => (log ? Math.round(1000 * Math.log(v / min) / Math.log(max / min)) : v);
    const deEntrada = (t) => (log ? Math.round(min * (max / min) ** (t / 1000)) : +t);
    Object.assign(entrada, log ? { min: 0, max: 1000, step: 1 } : { min, max, step: paso });
    const enviar = (final) => {
      const v = deEntrada(entrada.value);
      valor.textContent = formato(v, log ? 1 : paso);
      acciones.editar({ parametros: { [clave]: v } }, final);
    };
    entrada.addEventListener('input', () => enviar(false));
    entrada.addEventListener('change', () => enviar(true));
    fila.append(crear('b', '', etiqueta), entrada, valor);
    controles.push({
      refrescar: (p) => {
        if (document.activeElement === entrada) return; // no pisar lo que se está arrastrando
        if (p[clave] === undefined) { fila.hidden = true; return; } // instrumento creado antes de este control
        fila.hidden = false;
        entrada.value = aEntrada(p[clave]);
        valor.textContent = formato(p[clave], log ? 1 : paso);
      },
    });
    bloqueParams.append(fila);
  }

  raiz.append(filaPasos, filaSub, rejilla, bloqueParams);

  let estructura = '';
  function refrescar() {
    const inst = obtener();
    numPasos.textContent = String(inst.pasos).padStart(2, '0');
    botonesSub.forEach(([v, b]) => b.classList.toggle('activo', inst.subdivision === v));
    const nueva = inst.pasos + '/' + inst.subdivision;
    if (nueva !== estructura) { estructura = nueva; construirRejilla(); } else pintarRejilla();
    controles.forEach((c) => c.refrescar(inst.parametros));
  }
  refrescar();

  return {
    refrescar,
    // cursor de reproducción: resalta la columna del paso que está sonando
    marcarPaso(paso) {
      if (pasoMarcado === paso) return;
      columnas[pasoMarcado]?.forEach((c) => c.classList.remove('ed-actual'));
      columnas[paso]?.forEach((c) => c.classList.add('ed-actual'));
      pasoMarcado = paso;
    },
    destruir() { raiz.remove(); },
  };
}
