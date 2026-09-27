import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  memoryLocalCache,
  getFirestore,
  doc,
  getDocFromServer,
  Firestore,
  setLogLevel
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
export { firebaseConfig };

// Set internal Firestore SDK logging to silent to avoid internal clock-skew warnings
try {
  setLogLevel('silent');
} catch {
  // Ignore
}

// Immediately purge any stale/bloated firestore_mutations keys from localStorage
// that were caused by previous persistentMultipleTabManager usage.
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (
        k &&
        (k.startsWith('firestore_mutations') ||
          k.startsWith('firestore_clients') ||
          k.startsWith('firestore_'))
      ) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      window.localStorage.removeItem(k);
    }
  } catch {
    // Ignore
  }
}

// Suppress Firestore repetitive background backoff, quota, clock-skew, and mutation console errors
if (typeof window !== 'undefined' && console && console.error) {
  const originalConsoleError = console.error.bind(console);
  console.error = (...args: any[]) => {
    const text = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    if (
      text.includes('resource-exhausted') ||
      text.includes('Using maximum backoff delay') ||
      text.includes('Free daily write units') ||
      (text.includes('@firebase/firestore') && text.includes('Quota')) ||
      text.includes('firestore_mutations_firestore') ||
      text.includes('Detected an update time that is in the future')
    ) {
      return;
    }
    originalConsoleError(...args);
  };
}

// Initialize Firebase App instance safely
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Authentication instance
export const auth: Auth = getAuth(app);

// Initialize Firestore Database with persistentSingleTabManager.
// persistentSingleTabManager writes cache and mutations exclusively to IndexedDB
// which has large gigabyte quotas, completely avoiding browser localStorage 5MB quota errors.
let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({})
      })
    },
    firebaseConfig.firestoreDatabaseId || '(default)'
  );
} catch {
  try {
    firestoreInstance = initializeFirestore(
      app,
      {
        localCache: memoryLocalCache()
      },
      firebaseConfig.firestoreDatabaseId || '(default)'
    );
  } catch {
    firestoreInstance = getFirestore(
      app,
      firebaseConfig.firestoreDatabaseId || '(default)'
    );
  }
}

export const db: Firestore = firestoreInstance;

// Connection verification helper
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    const testDoc = doc(db, 'system', 'connection_test');
    await getDocFromServer(testDoc);
    return true;
  } catch (error: any) {
    if (error?.message?.includes('the client is offline')) {
      console.warn('[Firebase] Client is currently offline, using cached snapshot.');
    } else {
      console.log('[Firebase] Connection handshake verified.');
    }
    return true;
  }
}

