// IndexedDB storage for client-side file persistence
// This allows files to persist across page refreshes

const DB_NAME = 'stock-metadata-files';
const DB_VERSION = 1;
const STORE_NAME = 'files';

interface FileMetadata {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  data: ArrayBuffer;
}

/**
 * Open IndexedDB database
 */
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' });
      }
    };
  });
}

/**
 * Save files to IndexedDB
 */
export async function saveFiles(files: File[]): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Clear existing files first
    await new Promise<void>((resolve, reject) => {
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => resolve();
      clearRequest.onerror = () => reject(clearRequest.error);
    });

    // Save each file
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const metadata: FileMetadata = {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        data: arrayBuffer
      };

      await new Promise<void>((resolve, reject) => {
        const putRequest = store.put(metadata);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      });
    }

    // Transaction will complete automatically when all operations finish
  } catch (error) {
    console.error('Failed to save files to IndexedDB:', error);
    throw error;
  }
}

/**
 * Load files from IndexedDB
 */
export async function loadFiles(): Promise<File[]> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      
      request.onsuccess = () => {
        const metadataArray = request.result as FileMetadata[];
        const files = metadataArray.map(metadata => {
          return new File(
            [metadata.data],
            metadata.name,
            {
              type: metadata.type,
              lastModified: metadata.lastModified
            }
          );
        });
        resolve(files);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to load files from IndexedDB:', error);
    return [];
  }
}

/**
 * Clear all files from IndexedDB
 */
export async function clearFiles(): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => resolve();
      clearRequest.onerror = () => reject(clearRequest.error);
    });
  } catch (error) {
    console.error('Failed to clear files from IndexedDB:', error);
    throw error;
  }
}

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

