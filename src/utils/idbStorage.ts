/**
 * Permanent IndexedDB persistence layer for Monglish Academy App.
 * Survives browser restarts, computer reboots, hard refresh, and cache clearing.
 */

const DB_NAME = 'monglish_academy_db';
const DB_VERSION = 2;
const STORE_NAME = 'app_data';

/**
 * Requests browser permission for persistent storage so data is never evicted
 * even under low disk space or aggressive cache clearing.
 */
export async function initPersistentStorage(): Promise<boolean> {
  try {
    if (typeof window !== 'undefined' && navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        const granted = await navigator.storage.persist();
        console.log(`[Storage] Persistent storage granted: ${granted}`);
        return granted;
      }
      return true;
    }
  } catch (err) {
    console.warn('[Storage] Persistent storage request error:', err);
  }
  return false;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    let isSettled = false;
    // Timeout to prevent hanging promise if indexedDB is blocked or deadlocked
    const timer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        reject(new Error('IndexedDB open request timed out'));
      }
    }, 3000);

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        try {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        } catch (e) {
          console.warn('[IDB] onupgradeneeded error:', e);
        }
      };

      request.onsuccess = () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          resolve(request.result);
        }
      };

      request.onerror = () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          reject(request.error || new Error('Unknown IndexedDB error'));
        }
      };

      request.onblocked = () => {
        console.warn('[IDB] Open database blocked by another tab or connection.');
      };
    } catch (err) {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timer);
        reject(err);
      }
    }
  });
}

/**
 * Clears all items in the IndexedDB app_data store.
 */
export async function idbClearAll(): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/**
 * Completely deletes the IndexedDB database for deep reset/repair.
 */
export async function idbDeleteDatabase(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return resolve(false);
    }
    const req = window.indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
    req.onblocked = () => resolve(false);
  });
}

export async function idbSet<T>(key: string, value: T): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ key, value, updated: Date.now() });

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('IndexedDB set failed, fallback to localStorage only:', err);
    return false;
  }
}

export async function idbGet<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        if (req.result && req.result.value !== undefined) {
          resolve(req.result.value as T);
        } else {
          resolve(defaultValue);
        }
      };
      req.onerror = () => resolve(defaultValue);
    });
  } catch (err) {
    console.warn('IndexedDB get failed, using fallback:', err);
    return defaultValue;
  }
}

export async function idbSaveFullSnapshot(dataset: Record<string, any>): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ key: 'full_snapshot', value: dataset, updated: Date.now() });
      store.put({ key: 'monglish_has_user_changes', value: 'true', updated: Date.now() });
      store.put({ key: 'monglish_data_version', value: dataset.version || Date.now(), updated: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function idbGetFullSnapshot(): Promise<Record<string, any> | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('full_snapshot');
      req.onsuccess = () => {
        if (req.result && req.result.value) {
          resolve(req.result.value);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Loads all keys stored individually in IndexedDB into a single dictionary.
 */
export async function idbGetAllKeys(): Promise<Record<string, any>> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const result: Record<string, any> = {};
        if (Array.isArray(req.result)) {
          for (const item of req.result) {
            if (item && item.key) {
              result[item.key] = item.value;
            }
          }
        }
        resolve(result);
      };
      req.onerror = () => resolve({});
    });
  } catch {
    return {};
  }
}
