export interface RawStationRow {
  name?: string;
  id?: string;
  city?: string;
  country?: string;
  genres?: string;
  logo100?: string;
  logo175?: string;
  logo300?: string;
  stream_url?: string;
  format?: string;
  status?: string;
}

export interface Station {
  id: string;
  name: string;
  city: string;
  country: string;
  genres: string[];
  logo175: string;
  logo100: string;
  logo300: string;
  preferredLogo: string;
  availableLogos: string[];
  streamUrl: string;
  format: string;
  isHls: boolean;
  searchKey: string;
}

export interface CatalogData {
  stations: Station[];
  genres: string[];
  genreCounts: Record<string, number>;
  totalRowsRead: number;
  duplicatesSkipped: number;
  invalidSkipped: number;
  sourceName: string;
}

export type PlayerStatus = 'idle' | 'connecting' | 'playing' | 'paused' | 'error';
