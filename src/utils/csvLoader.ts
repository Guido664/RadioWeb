import Papa from 'papaparse';
import { CatalogData, RawStationRow, Station } from '../types/station';

const CATALOG_PATHS = [
  '/catalog_stations.csv',
  '/assets/aistudio/sample_stations_d97e1c15.csv',
];

const GENRES_PATHS = [
  '/genres_unique.txt',
  '/assets/aistudio/genres_unique_2cb52cbd.txt',
];

const IDB_NAME = 'radioweb_catalog_db';
const IDB_STORE = 'csv_store';
const IDB_KEY = 'custom_catalog_csv';

interface StoredCsvPayload {
  csvText: string;
  sourceName: string;
  savedAt: number;
}

function openCatalogDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB non disponibile'));
      return;
    }
    const request = window.indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCustomCsvToBrowser(csvText: string, sourceName: string): Promise<void> {
  try {
    const db = await openCatalogDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const payload: StoredCsvPayload = {
        csvText,
        sourceName,
        savedAt: Date.now(),
      };
      store.put(payload, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore IndexedDB quota/privacy errors
  }
}

export async function getSavedCsvFromBrowser(): Promise<StoredCsvPayload | null> {
  try {
    const db = await openCatalogDb();
    const result = await new Promise<StoredCsvPayload | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as StoredCsvPayload) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function clearSavedCsvFromBrowser(): Promise<void> {
  try {
    const db = await openCatalogDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.delete(IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore errors
  }
}

/**
 * Loads the canonical 180 unique genres from genres_unique.txt if available.
 */
async function fetchCanonicalGenres(): Promise<string[]> {
  for (const path of GENRES_PATHS) {
    try {
      const res = await fetch(path);
      if (!res.ok) continue;
      const text = await res.text();
      if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<html')) {
        continue;
      }
      const parsed: string[] = [];
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const tabIdx = trimmed.indexOf('\t');
        const genreName = tabIdx !== -1 ? trimmed.slice(tabIdx + 1).trim() : trimmed;
        if (genreName) {
          parsed.push(genreName);
        }
      }
      if (parsed.length > 0) {
        return parsed;
      }
    } catch {
      // ignore and try next path
    }
  }
  return [];
}

/**
 * Parses CSV text according to RFC 4180 using PapaParse, deduplicates by `id`
 * keeping the first row with `status=VALID`, extracts genres separated by `;`,
 * resolves logo fallback (logo175 -> logo100 -> logo300), and sorts by name.
 */
export function parseStationsCsvText(
  csvText: string,
  sourceName: string,
  canonicalGenres: string[] = [],
  isCustomSaved = false
): CatalogData & { isCustomSaved?: boolean } {
  const seenIds = new Set<string>();
  const stations: Station[] = [];
  const genreCounts: Record<string, number> = {};
  const genreSet = new Set<string>(canonicalGenres);

  let totalRowsRead = 0;
  let duplicatesSkipped = 0;
  let invalidSkipped = 0;

  const result = Papa.parse<RawStationRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  for (const row of result.data) {
    totalRowsRead++;

    const status = (row.status ?? '').trim().toUpperCase();
    if (status !== 'VALID') {
      invalidSkipped++;
      continue;
    }

    const id = (row.id ?? '').trim();
    if (!id) {
      invalidSkipped++;
      continue;
    }

    // Deduplication rule: keep only the first stream with status=VALID for each id
    if (seenIds.has(id)) {
      duplicatesSkipped++;
      continue;
    }

    const streamUrl = (row.stream_url ?? '').trim();
    if (!streamUrl) {
      invalidSkipped++;
      continue;
    }

    seenIds.add(id);

    const name = (row.name ?? '').trim() || id;
    const city = (row.city ?? '').trim();
    const country = (row.country ?? '').trim();
    const rawGenres = (row.genres ?? '').trim();

    // Split genres on ';' and deduplicate per station
    const stationGenres = rawGenres
      ? Array.from(
          new Set(
            rawGenres
              .split(';')
              .map((g) => g.trim())
              .filter(Boolean)
          )
        )
      : [];

    for (const g of stationGenres) {
      genreSet.add(g);
      genreCounts[g] = (genreCounts[g] || 0) + 1;
    }

    const logo175 = (row.logo175 ?? '').trim();
    const logo100 = (row.logo100 ?? '').trim();
    const logo300 = (row.logo300 ?? '').trim();

    // Resolution fallback order: logo175 -> logo100 -> logo300
    const availableLogos = [logo175, logo100, logo300].filter(Boolean);
    const preferredLogo = availableLogos[0] || '';

    const rawFormat = (row.format ?? 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
    const lowerUrl = streamUrl.toLowerCase();
    const isHls = lowerUrl.includes('.m3u8');

    stations.push({
      id,
      name,
      city,
      country,
      genres: stationGenres,
      logo175,
      logo100,
      logo300,
      preferredLogo,
      availableLogos,
      streamUrl,
      format: rawFormat,
      isHls,
      searchKey: `${name} ${city} ${country} ${stationGenres.join(' ')}`.toLowerCase(),
    });
  }

  // Sort alphabetically by station name by default
  stations.sort((a, b) =>
    a.name.localeCompare(b.name, 'it', { sensitivity: 'base', numeric: true })
  );

  // Sort all unique genres alphabetically
  const genres = Array.from(genreSet).sort((a, b) =>
    a.localeCompare(b, 'it', { sensitivity: 'base', numeric: true })
  );

  return {
    stations,
    genres,
    genreCounts,
    totalRowsRead,
    duplicatesSkipped,
    invalidSkipped,
    sourceName,
    isCustomSaved,
  };
}

/**
 * Loads `catalog_stations.csv` at runtime:
 * 1. First checks if the user previously uploaded and saved a CSV in IndexedDB.
 * 2. Otherwise fetches `/catalog_stations.csv` from the static bundle.
 */
export async function loadInitialCatalog(forceBundle = false): Promise<CatalogData & { isCustomSaved?: boolean }> {
  const canonicalGenres = await fetchCanonicalGenres();

  if (!forceBundle) {
    const saved = await getSavedCsvFromBrowser();
    if (saved && saved.csvText) {
      return parseStationsCsvText(
        saved.csvText,
        `${saved.sourceName} (salvato nel browser)`,
        canonicalGenres,
        true
      );
    }
  }

  for (const path of CATALOG_PATHS) {
    try {
      const response = await fetch(path);
      if (!response.ok) continue;

      const text = await response.text();
      if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<html')) {
        continue;
      }

      const fileName = path.split('/').pop() || 'catalog_stations.csv';
      return parseStationsCsvText(text, fileName, canonicalGenres, false);
    } catch {
      // Try next path
    }
  }

  throw new Error(
    'Impossibile caricare il file catalog_stations.csv. Assicurati che sia presente nella cartella public/ oppure caricalo manualmente.'
  );
}

/**
 * Parses a user-selected File and persists it in IndexedDB so it survives page reloads.
 */
export async function loadCustomCsvFile(
  file: File,
  existingCanonicalGenres: string[] = []
): Promise<CatalogData & { isCustomSaved?: boolean }> {
  const text = await file.text();
  await saveCustomCsvToBrowser(text, file.name);
  return parseStationsCsvText(
    text,
    `${file.name} (salvato nel browser)`,
    existingCanonicalGenres,
    true
  );
}
