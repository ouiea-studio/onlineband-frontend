// Lee los valores por defecto de la app (public/ajustes.json) antes de que arranque la escena.
// Está en public/ para que se pueda editar a mano y ver el cambio con solo recargar.

const respuesta = await fetch(import.meta.env.BASE_URL + 'ajustes.json', { cache: 'no-cache' });
if (!respuesta.ok) throw new Error('No se pudo leer ajustes.json (' + respuesta.status + ')');
export const ajustes = await respuesta.json();
