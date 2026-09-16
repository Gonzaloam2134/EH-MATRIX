/* Capa de acceso a localStorage. Única responsabilidad: leer/escribir el
 * estado completo de la app y migrar el esquema si cambia de versión. */

const STORAGE_KEY = 'eh-matrix:v1';
const SCHEMA_VERSION = 1;

function defaultState() {
  return {
    version: SCHEMA_VERSION,
    tasks: [],
    settings: {
      theme: 'system',
      notificationsEnabled: false,
      overloadThreshold: 8,
    },
  };
}

function migrateState(state) {
  // Punto de extensión: si SCHEMA_VERSION sube en el futuro, agregar pasos
  // de migración incrementales aquí. Por ahora solo rellena campos faltantes.
  if (!state.settings) state.settings = defaultState().settings;
  if (state.settings.overloadThreshold == null) state.settings.overloadThreshold = 8;
  if (!Array.isArray(state.tasks)) state.tasks = [];
  state.tasks.forEach((t) => {
    if (!Array.isArray(t.subtasks)) t.subtasks = [];
    if (t.notified == null) t.notified = false;
    if (t.quadrantEnteredAt == null) t.quadrantEnteredAt = t.createdAt || new Date().toISOString();
  });
  state.version = SCHEMA_VERSION;
  return state;
}

const Storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return migrateState(parsed);
    } catch (err) {
      console.error('No se pudo leer el estado guardado, se usa uno nuevo.', err);
      return defaultState();
    }
  },

  save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('No se pudo guardar el estado.', err);
    }
  },

  exportJSON(state) {
    return JSON.stringify(state, null, 2);
  },

  importJSON(jsonText) {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tasks)) {
      throw new Error('El archivo no tiene el formato esperado.');
    }
    return migrateState(parsed);
  },
};
