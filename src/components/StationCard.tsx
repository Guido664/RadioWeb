import React from 'react';
import { Play, Pause, Loader2, AlertCircle, Heart } from 'lucide-react';
import { PlayerStatus, Station } from '../types/station';
import { StationLogo } from './StationLogo';

interface StationCardProps {
  station: Station;
  isCurrent: boolean;
  playerStatus: PlayerStatus;
  selectedGenre: string;
  isFavorite: boolean;
  onPlaySelect: (station: Station) => void;
  onSelectGenre: (genre: string) => void;
  onToggleFavorite: (stationId: string, e: React.MouseEvent) => void;
}

export const StationCard: React.FC<StationCardProps> = React.memo(
  ({
    station,
    isCurrent,
    playerStatus,
    selectedGenre,
    isFavorite,
    onPlaySelect,
    onSelectGenre,
    onToggleFavorite,
  }) => {
    const isPlaying = isCurrent && playerStatus === 'playing';
    const isConnecting = isCurrent && playerStatus === 'connecting';
    const isError = isCurrent && playerStatus === 'error';

    const locationParts = [station.city, station.country].filter(Boolean);
    const locationLabel = locationParts.length > 0 ? locationParts.join(', ') : 'Internazionale';

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onPlaySelect(station)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPlaySelect(station);
          }
        }}
        aria-label={`${isPlaying ? 'Metti in pausa' : 'Riproduci'} ${station.name}`}
        className={`group relative flex flex-col justify-between p-4 rounded-xl border transition-colors duration-150 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
          isCurrent
            ? isError
              ? 'bg-red-950/20 border-red-700/70'
              : 'bg-slate-900 border-amber-500/80'
            : 'bg-slate-900/60 border-slate-800/90 hover:bg-slate-900 hover:border-slate-700'
        }`}
      >
        {/* Top Row: Logo + Title & Location + Play/Favorite Actions */}
        <div className="flex items-start gap-3.5">
          <div className="relative shrink-0">
            <StationLogo
              name={station.name}
              availableLogos={station.availableLogos}
              size="md"
            />
            {/* Play state overlay button */}
            <div
              className={`absolute inset-0 rounded-lg flex items-center justify-center transition-opacity duration-150 ${
                isCurrent
                  ? 'bg-slate-950/75 opacity-100'
                  : 'bg-slate-950/65 opacity-0 group-hover:opacity-100'
              }`}
            >
              {isConnecting ? (
                <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
              ) : isError ? (
                <AlertCircle className="w-5 h-5 text-red-400" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 text-amber-400 fill-amber-400" />
              ) : (
                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3
                className={`text-[15px] font-semibold leading-snug line-clamp-1 transition-colors ${
                  isCurrent ? 'text-amber-400' : 'text-slate-100 group-hover:text-white'
                }`}
                title={station.name}
              >
                {station.name}
              </h3>

              <button
                type="button"
                onClick={(e) => onToggleFavorite(station.id, e)}
                aria-label={
                  isFavorite
                    ? `Rimuovi ${station.name} dai preferiti`
                    : `Aggiungi ${station.name} ai preferiti`
                }
                className={`shrink-0 p-1.5 -mr-1 -mt-1 rounded-md transition-colors ${
                  isFavorite
                    ? 'text-amber-400 hover:text-amber-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Heart className={`w-4 h-4 ${isFavorite ? 'fill-amber-400' : ''}`} />
              </button>
            </div>

            {/* Clean unboxed metadata: Country / City · Stream Format */}
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400 truncate">
              <span className="truncate" title={locationLabel}>
                {locationLabel}
              </span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="font-mono text-[11px] text-slate-500 shrink-0">
                {station.isHls ? 'HLS' : station.format}
              </span>
            </div>

            {/* Status feedback on active station */}
            {isCurrent && (
              <div className="mt-1.5 text-xs font-medium flex items-center gap-1.5">
                {isConnecting && (
                  <span className="text-amber-400">Connessione allo stream…</span>
                )}
                {isPlaying && (
                  <span className="text-emerald-400">In riproduzione</span>
                )}
                {playerStatus === 'paused' && (
                  <span className="text-slate-400">In pausa</span>
                )}
                {isError && (
                  <span className="text-red-400">Stream non disponibile</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Row: Interactive Genre Filter Buttons */}
        <div className="mt-3.5 pt-2.5 border-t border-slate-800/70 flex items-center justify-between gap-2 min-h-[28px]">
          {station.genres.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {station.genres.slice(0, 4).map((genre) => {
                const isSelectedGenre = selectedGenre === genre;
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectGenre(isSelectedGenre ? '' : genre);
                    }}
                    title={`Filtra per genere: ${genre}`}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      isSelectedGenre
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {genre}
                  </button>
                );
              })}
              {station.genres.length > 4 && (
                <span
                  className="text-[11px] font-mono text-slate-500 pl-0.5 tabular-nums"
                  title={station.genres.slice(4).join(', ')}
                >
                  +{station.genres.length - 4}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-500 italic">Nessun genere specificato</span>
          )}
        </div>
      </div>
    );
  }
);
