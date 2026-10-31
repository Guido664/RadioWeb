import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  Search,
  Upload,
  X,
  Loader2,
  AlertCircle,
  Filter,
  RotateCcw,
  FileSpreadsheet,
  ArrowUpDown,
} from 'lucide-react';
import { CatalogData, PlayerStatus, Station } from './types/station';
import {
  clearSavedCsvFromBrowser,
  loadCustomCsvFile,
  loadInitialCatalog,
} from './utils/csvLoader';
import { StationCard } from './components/StationCard';
import { AudioPlayer } from './components/AudioPlayer';
import { PWAInstallButton } from './components/PWAInstallButton';

const PAGE_SIZE = 100;
const FAVORITES_STORAGE_KEY = 'radioweb_favorites_v1';

const DEFAULT_RADIO_LAC: Station = {
  id: 'radiolacch',
  name: 'RADIO LAC',
  city: 'Geneva',
  country: 'Switzerland',
  genres: ['Pop'],
  logo100:
    'https://station-images-prod.radio-assets.com/100/radiolacch.png?version=602e4847f1056a8d837fd17f3ebe8bf49a1ef673',
  logo175:
    'https://station-images-prod.radio-assets.com/175/radiolacch.png?version=602e4847f1056a8d837fd17f3ebe8bf49a1ef673',
  logo300:
    'https://station-images-prod.radio-assets.com/300/radiolacch.png?version=602e4847f1056a8d837fd17f3ebe8bf49a1ef673',
  preferredLogo:
    'https://station-images-prod.radio-assets.com/175/radiolacch.png?version=602e4847f1056a8d837fd17f3ebe8bf49a1ef673',
  availableLogos: [
    'https://station-images-prod.radio-assets.com/175/radiolacch.png?version=602e4847f1056a8d837fd17f3ebe8bf49a1ef673',
    'https://station-images-prod.radio-assets.com/100/radiolacch.png?version=602e4847f1056a8d837fd17f3ebe8bf49a1ef673',
    'https://station-images-prod.radio-assets.com/300/radiolacch.png?version=602e4847f1056a8d837fd17f3ebe8bf49a1ef673',
  ],
  streamUrl: 'https://radiolac.ice.infomaniak.ch/radiolac-high.mp3',
  format: 'MP3',
  isHls: false,
  searchKey: 'radio lac geneva switzerland pop',
};

type ActiveSection = 'catalog' | 'genres' | 'favorites' | 'dataset';
type SortOption = 'name-asc' | 'name-desc' | 'country-asc';

export default function App() {
  const [catalog, setCatalog] = useState<(CatalogData & { isCustomSaved?: boolean }) | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters & Navigation
  const [activeSection, setActiveSection] = useState<ActiveSection>('catalog');
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('name-asc');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  // Favorites
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (saved) {
        return new Set(JSON.parse(saved));
      }
    } catch {
      // ignore storage errors
    }
    return new Set();
  });

  // Audio Player State (Single station at a time, preloaded with RADIO LAC at t=0ms)
  const [currentStation, setCurrentStation] = useState<Station | null>(DEFAULT_RADIO_LAC);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>('connecting');
  const [playerError, setPlayerError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

  const selectDefaultStation = useCallback((stations: Station[]) => {
    const radioLac =
      stations.find((s) => s.name.trim().toUpperCase() === 'RADIO LAC') ||
      stations.find((s) => s.id.toLowerCase() === 'radiolacch') ||
      stations.find((s) => s.name.toUpperCase().includes('RADIO LAC'));

    if (radioLac) {
      setCurrentStation((prev) => (prev?.id === radioLac.id ? prev : radioLac));
    }
  }, []);

  // Initial load from /catalog_stations.csv
  const fetchDefaultCatalog = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await loadInitialCatalog();
      setCatalog(data);
      selectDefaultStation(data.stations);
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Errore durante la lettura di catalog_stations.csv.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [selectDefaultStation]);

  useEffect(() => {
    fetchDefaultCatalog();
  }, [fetchDefaultCatalog]);

  // Reset pagination whenever filters or sorting change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedGenre, searchQuery, sortBy, activeSection]);

  // Handle custom CSV upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setLoadError(null);
    try {
      const existingGenres = catalog?.genres ?? [];
      const data = await loadCustomCsvFile(file, existingGenres);
      setCatalog(data);
      selectDefaultStation(data.stations);
      setSelectedGenre('');
      setSearchQuery('');
      setActiveSection('catalog');
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Impossibile leggere il file CSV selezionato.'
      );
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Toggle favorite station
  const handleToggleFavorite = useCallback((stationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(stationId)) {
        next.delete(stationId);
      } else {
        next.add(stationId);
      }
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  // Fast in-memory filtering & sorting for ~55,000 stations
  const filteredStations = useMemo(() => {
    if (!catalog) return [];

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const onlyFavorites = activeSection === 'favorites';

    const matched = catalog.stations.filter((station) => {
      if (onlyFavorites && !favoriteIds.has(station.id)) {
        return false;
      }
      if (selectedGenre && !station.genres.includes(selectedGenre)) {
        return false;
      }
      if (normalizedQuery) {
        const matchesName = station.name.toLowerCase().includes(normalizedQuery);
        const matchesCity = station.city.toLowerCase().includes(normalizedQuery);
        const matchesCountry = station.country.toLowerCase().includes(normalizedQuery);
        if (!matchesName && !matchesCity && !matchesCountry) {
          return false;
        }
      }
      return true;
    });

    if (sortBy === 'name-asc') {
      // Already sorted by name-asc during CSV load
      return matched;
    }

    const sorted = [...matched];
    if (sortBy === 'name-desc') {
      sorted.sort((a, b) =>
        b.name.localeCompare(a.name, 'it', { sensitivity: 'base', numeric: true })
      );
    } else if (sortBy === 'country-asc') {
      sorted.sort((a, b) => {
        const cCompare = (a.country || 'ZZZ').localeCompare(b.country || 'ZZZ', 'it', {
          sensitivity: 'base',
        });
        if (cCompare !== 0) return cCompare;
        return a.name.localeCompare(b.name, 'it', { sensitivity: 'base', numeric: true });
      });
    }

    return sorted;
  }, [catalog, selectedGenre, searchQuery, sortBy, activeSection, favoriteIds]);

  const visibleStations = useMemo(
    () => filteredStations.slice(0, visibleCount),
    [filteredStations, visibleCount]
  );

  const hasMore = visibleCount < filteredStations.length;

  // Infinite scroll IntersectionObserver
  useEffect(() => {
    const target = loadMoreTriggerRef.current;
    if (!target || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredStations.length));
        }
      },
      { rootMargin: '320px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, filteredStations.length]);

  // Top populated genres in the active catalog for quick filtering
  const topActiveGenres = useMemo(() => {
    if (!catalog) return [];
    return Object.entries(catalog.genreCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([genre]) => genre);
  }, [catalog]);

  // Handle clicking a station card
  const handlePlaySelect = useCallback(
    (station: Station) => {
      if (currentStation?.id === station.id) {
        // Toggle play/pause via status if already active
        if (playerStatus === 'playing' || playerStatus === 'connecting') {
          setPlayerStatus('paused');
        } else {
          // Force re-trigger by setting a fresh reference
          setCurrentStation({ ...station });
        }
      } else {
        setCurrentStation(station);
      }
    },
    [currentStation, playerStatus]
  );

  const handlePlayerStatusChange = useCallback(
    (nextStatus: PlayerStatus, errMsg: string | null = null) => {
      setPlayerStatus(nextStatus);
      setPlayerError(errMsg);
    },
    []
  );

  const handleStopPlayer = useCallback(() => {
    setCurrentStation(null);
    setPlayerStatus('idle');
    setPlayerError(null);
  }, []);

  const handleSelectGenreAndShowCatalog = useCallback((genre: string) => {
    setSelectedGenre(genre);
    setActiveSection('catalog');
  }, []);

  const resetFilters = () => {
    setSelectedGenre('');
    setSearchQuery('');
    setSortBy('name-asc');
  };

  const hasActiveFilters = Boolean(selectedGenre || searchQuery.trim() || sortBy !== 'name-asc');

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 pb-28">
      {/* Hidden CSV file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.gz,text/csv,application/gzip"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/90">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-4 sm:px-6 h-14">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#catalog"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('catalog');
            }}
            className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            RadioWeb
          </a>

          {/* Primary action */}
          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Carica CSV</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6">
        <nav className="flex items-center justify-start gap-5 sm:gap-7 text-sm font-medium text-slate-400 overflow-x-auto no-scrollbar border-b border-slate-800/80 mb-6">
          <button
            type="button"
            onClick={() => setActiveSection('catalog')}
            className={`py-2 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'catalog'
                ? 'text-white border-amber-500'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Catalogo
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('genres')}
            className={`py-2 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'genres'
                ? 'text-white border-amber-500'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Generi
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('favorites')}
            className={`py-2 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'favorites'
                ? 'text-white border-amber-500'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Preferiti ({favoriteIds.size})
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('dataset')}
            className={`py-2 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'dataset'
                ? 'text-white border-amber-500'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Dati CSV
          </button>
        </nav>

        {/* Loading State */}
        {isLoading && (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-4" />
            <h2 className="text-lg font-semibold text-white">
              Caricamento catalogo stazioni in corso…
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-md">
              Lettura di <code className="font-mono text-slate-300">catalog_stations.csv</code>,
              deduplicazione per ID e indicizzazione dei generi musicali.
            </p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && loadError && (
          <div className="my-12 p-6 rounded-xl bg-red-950/30 border border-red-800/80 max-w-2xl mx-auto">
            <div className="flex items-start gap-3.5">
              <AlertCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-semibold text-white">
                  Errore di caricamento del catalogo
                </h2>
                <p className="text-sm text-red-200/90 mt-1">{loadError}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={fetchDefaultCatalog}
                    className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
                  >
                    Riprova caricamento
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors"
                  >
                    Seleziona catalog_stations.csv locale
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loaded Views */}
        {!isLoading && !loadError && catalog && (
          <>
            {/* SECTION: GENRE DIRECTORY */}
            {activeSection === 'genres' && (
              <section className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-800 pb-5">
                  <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">
                      Esplora per Genere Musicale
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">
                      Tutti i <span className="font-mono text-slate-200 tabular-nums">{catalog.genres.length}</span> generi
                      ordinati alfabeticamente. Clicca su un genere per filtrare le stazioni.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectGenreAndShowCatalog('')}
                    className="px-3.5 py-2 text-xs font-medium bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 rounded-lg transition-colors self-start sm:self-auto whitespace-nowrap"
                  >
                    Mostra tutti i generi ({catalog.stations.length})
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                  {catalog.genres.map((genre) => {
                    const count = catalog.genreCounts[genre] || 0;
                    const isSelected = selectedGenre === genre;
                    return (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => handleSelectGenreAndShowCatalog(genre)}
                        className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border text-left transition-colors ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                            : count > 0
                            ? 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900 text-slate-200'
                            : 'bg-slate-900/30 border-slate-900 text-slate-500 hover:border-slate-800 hover:text-slate-300'
                        }`}
                      >
                        <span className="text-xs truncate" title={genre}>
                          {genre}
                        </span>
                        <span
                          className={`font-mono text-[11px] tabular-nums shrink-0 ${
                            isSelected
                              ? 'text-slate-950 font-semibold'
                              : count > 0
                              ? 'text-amber-400'
                              : 'text-slate-600'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* SECTION: DATASET & CSV INFO */}
            {activeSection === 'dataset' && (
              <section className="space-y-6 max-w-4xl">
                <div className="border-b border-slate-800 pb-5">
                  <h1 className="text-2xl font-bold text-white tracking-tight">
                    Sorgente Dati — catalog_stations.csv
                  </h1>
                  <p className="text-sm text-slate-400 mt-1">
                    Statistiche sul catalogo caricato a runtime e istruzioni per sostituire il file CSV completo (~55.797 stazioni).
                  </p>
                </div>

                {/* Live Dataset Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
                    <p className="text-xs text-slate-400">Stazioni uniche (VALID)</p>
                    <p className="text-2xl font-bold font-mono text-white mt-1 tabular-nums">
                      {catalog.stations.length.toLocaleString('it-IT')}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
                    <p className="text-xs text-slate-400">Righe CSV lette</p>
                    <p className="text-2xl font-bold font-mono text-slate-200 mt-1 tabular-nums">
                      {catalog.totalRowsRead.toLocaleString('it-IT')}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
                    <p className="text-xs text-slate-400">Duplicati ID filtrati</p>
                    <p className="text-2xl font-bold font-mono text-slate-300 mt-1 tabular-nums">
                      {catalog.duplicatesSkipped.toLocaleString('it-IT')}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
                    <p className="text-xs text-slate-400">Generi musicali</p>
                    <p className="text-2xl font-bold font-mono text-amber-400 mt-1 tabular-nums">
                      {catalog.genres.length}
                    </p>
                  </div>
                </div>

                {/* Upload or Replace Instructions */}
                <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <h2 className="text-base font-semibold text-white flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                        <span>File attivo: {catalog.sourceName}</span>
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Seleziona catalog_stations.csv dal computer</span>
                      </button>

                      {catalog.isCustomSaved && (
                        <button
                          type="button"
                          onClick={async () => {
                            setIsLoading(true);
                            await clearSavedCsvFromBrowser();
                            const data = await loadInitialCatalog(true);
                            setCatalog(data);
                            setIsLoading(false);
                          }}
                          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Ripristina CSV del bundle</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* SECTION: CATALOG OR FAVORITES */}
            {(activeSection === 'catalog' || activeSection === 'favorites') && (
              <section className="space-y-5">
                {catalog.totalRowsRead <= 65 && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs sm:text-sm text-amber-200/90">
                      <strong className="font-semibold text-amber-300">
                        Catalogo di esempio attivo ({catalog.stations.length} stazioni):
                      </strong>{' '}
                      l&apos;editor di file di AI Studio blocca il salvataggio di file di testo da ~25 MB nella barra laterale. Per caricare subito il tuo <code className="font-mono text-white">catalog_stations.csv</code> completo, usa il pulsante qui a fianco.
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Carica catalog_stations.csv (55k)</span>
                    </button>
                  </div>
                )}

                {/* Page Header & Summary */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight text- balance">
                      {activeSection === 'favorites'
                        ? 'Le tue Stazioni Preferite'
                        : 'Stazioni Radio in Streaming'}
                    </h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-400">
                      <span>
                        Totale catalogo:{' '}
                        <strong className="font-mono text-white tabular-nums">
                          {catalog.stations.length.toLocaleString('it-IT')}
                        </strong>{' '}
                        stazioni uniche
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Filtrate:{' '}
                        <strong className="font-mono text-amber-400 tabular-nums">
                          {filteredStations.length.toLocaleString('it-IT')}
                        </strong>{' '}
                        (mostrate {visibleStations.length.toLocaleString('it-IT')})
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        File: <code className="font-mono text-slate-300">{catalog.sourceName}</code>
                      </span>
                    </div>
                  </div>

                  {/* Sort Selector */}
                  <div className="flex items-center gap-2 self-start md:self-auto">
                    <ArrowUpDown className="w-4 h-4 text-slate-400 shrink-0" />
                    <label htmlFor="sort-select" className="text-xs text-slate-400 whitespace-nowrap">
                      Ordina per:
                    </label>
                    <select
                      id="sort-select"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="name-asc">Nome (A → Z)</option>
                      <option value="name-desc">Nome (Z → A)</option>
                      <option value="country-asc">Paese (A → Z)</option>
                    </select>
                  </div>
                </div>

                {/* Filter & Search Controls Bar */}
                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/90 space-y-3.5">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    {/* Search Input (Name, City, Country) */}
                    <div className="md:col-span-7 relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cerca stazione per nome, città o paese (es. New York, Italy, BBC)…"
                        aria-label="Cerca per nome, città o paese"
                        className="w-full pl-10 pr-9 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          aria-label="Cancella ricerca"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Genre Dropdown (All 180 genres alphabetically with "Tutti i generi" on top) */}
                    <div className="md:col-span-5 flex items-center gap-2">
                      <div className="relative flex-1">
                        <Filter className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <select
                          value={selectedGenre}
                          onChange={(e) => setSelectedGenre(e.target.value)}
                          aria-label="Filtra per genere musicale"
                          className="w-full pl-10 pr-8 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent cursor-pointer"
                        >
                          <option value="">
                            Tutti i generi ({catalog.genres.length})
                          </option>
                          {catalog.genres.map((genre) => {
                            const count = catalog.genreCounts[genre] || 0;
                            return (
                              <option key={genre} value={genre}>
                                {genre} {count > 0 ? `(${count})` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={resetFilters}
                          title="Reimposta tutti i filtri"
                          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Reset</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick Interactive Genre Filter Bar */}
                  {topActiveGenres.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                      <span className="text-xs text-slate-500 mr-1 whitespace-nowrap shrink-0">
                        Generi frequenti:
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedGenre('')}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          selectedGenre === ''
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        Tutti i generi
                      </button>
                      {topActiveGenres.map((genre) => {
                        const isSelected = selectedGenre === genre;
                        const count = catalog.genreCounts[genre] || 0;
                        return (
                          <button
                            key={genre}
                            type="button"
                            onClick={() =>
                              setSelectedGenre(isSelected ? '' : genre)
                            }
                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                              isSelected
                                ? 'bg-amber-500 text-slate-950 font-semibold'
                                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800 hover:text-white'
                            }`}
                          >
                            {genre}{' '}
                            <span
                              className={`font-mono text-[11px] tabular-nums ${
                                isSelected ? 'text-slate-950' : 'text-slate-400'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Station Cards Grid */}
                {visibleStations.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                      {visibleStations.map((station) => (
                        <StationCard
                          key={station.id}
                          station={station}
                          isCurrent={currentStation?.id === station.id}
                          playerStatus={playerStatus}
                          selectedGenre={selectedGenre}
                          isFavorite={favoriteIds.has(station.id)}
                          onPlaySelect={handlePlaySelect}
                          onSelectGenre={setSelectedGenre}
                          onToggleFavorite={handleToggleFavorite}
                        />
                      ))}
                    </div>

                    {/* Infinite Scroll Sentinel & Load More Button */}
                    {hasMore && (
                      <div
                        ref={loadMoreTriggerRef}
                        className="py-8 flex flex-col items-center justify-center gap-3"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setVisibleCount((prev) =>
                              Math.min(prev + PAGE_SIZE, filteredStations.length)
                            )
                          }
                          className="px-5 py-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                        >
                          Mostra altre stazioni (visualizzate{' '}
                          <span className="font-mono tabular-nums">{visibleStations.length}</span> di{' '}
                          <span className="font-mono tabular-nums">{filteredStations.length}</span>)
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  /* Empty Filter State */
                  <div className="py-16 px-4 rounded-xl bg-slate-900/40 border border-slate-800/80 text-center max-w-lg mx-auto my-6">
                    <p className="text-base font-semibold text-white">
                      {activeSection === 'favorites'
                        ? 'Nessuna stazione nei preferiti'
                        : 'Nessuna stazione trovata'}
                    </p>
                    <p className="text-sm text-slate-400 mt-1">
                      {activeSection === 'favorites'
                        ? 'Clicca sull’icona del cuore su qualsiasi stazione per salvarla nei tuoi preferiti.'
                        : selectedGenre && (catalog.genreCounts[selectedGenre] || 0) === 0
                        ? `Il genere "${selectedGenre}" non ha stazioni nel file CSV di esempio attualmente caricato (${catalog.stations.length} stazioni). Carica il file catalog_stations.csv completo o scegli un altro genere.`
                        : 'Nessuna stazione corrisponde ai filtri selezionati.'}
                    </p>
                    <div className="mt-5 flex items-center justify-center gap-3">
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={resetFilters}
                          className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors"
                        >
                          Mostra tutte le stazioni
                        </button>
                      )}
                      {activeSection === 'favorites' && (
                        <button
                          type="button"
                          onClick={() => setActiveSection('catalog')}
                          className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
                        >
                          Esplora il catalogo
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* Persistent Audio Player */}
      <AudioPlayer
        station={currentStation}
        status={playerStatus}
        errorMessage={playerError}
        isFavorite={currentStation ? favoriteIds.has(currentStation.id) : false}
        onToggleFavorite={handleToggleFavorite}
        onStatusChange={handlePlayerStatusChange}
        onStop={handleStopPlayer}
        onSelectGenre={handleSelectGenreAndShowCatalog}
      />
    </div>
  );
}
