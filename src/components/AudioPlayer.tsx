import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Radio,
  Square,
  Heart,
} from 'lucide-react';
import { PlayerStatus, Station } from '../types/station';
import { StationLogo } from './StationLogo';

interface AudioPlayerProps {
  station: Station | null;
  status: PlayerStatus;
  errorMessage: string | null;
  isFavorite: boolean;
  onToggleFavorite: (stationId: string, e: React.MouseEvent) => void;
  onStatusChange: (status: PlayerStatus, errorMsg?: string | null) => void;
  onStop: () => void;
  onSelectGenre: (genre: string) => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  station,
  status,
  errorMessage,
  isFavorite,
  onToggleFavorite,
  onStatusChange,
  onStop,
  onSelectGenre,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [nowPlayingError, setNowPlayingError] = useState<boolean>(false);
  const [nowPlayingLoading, setNowPlayingLoading] = useState<boolean>(false);

  const clearConnectionTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {
        // ignore cleanup error
      }
      hlsRef.current = null;
    }
  }, []);

  const stopCurrentAudio = useCallback(() => {
    clearConnectionTimeout();
    destroyHls();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
  }, [clearConnectionTimeout, destroyHls]);

  const describeStreamError = useCallback((targetStation: Station): string => {
    const url = targetStation.streamUrl.toLowerCase();
    if (url.endsWith('.pls') || url.endsWith('.m3u')) {
      return 'Formato playlist (.pls / .m3u) non riproducibile direttamente nel browser.';
    }
    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      url.startsWith('http://')
    ) {
      return 'Lo stream utilizza HTTP non protetto (Mixed Content) o è attualmente offline.';
    }
    return 'Stream attualmente offline, bloccato dal server remoto o formato non supportato.';
  }, []);

  const startPlayback = useCallback(
    (targetStation: Station) => {
      const audio = audioRef.current;
      if (!audio) return;

      // Always stop any previous stream first (single station at a time)
      stopCurrentAudio();
      onStatusChange('connecting', null);

      const streamUrl = targetStation.streamUrl;
      const lowerUrl = streamUrl.toLowerCase();

      // Pre-check legacy playlist files (.pls / .m3u, excluding .m3u8)
      if (lowerUrl.endsWith('.pls') || (lowerUrl.endsWith('.m3u') && !lowerUrl.endsWith('.m3u8'))) {
        onStatusChange(
          'error',
          'Formato playlist (.pls / .m3u) non supportato direttamente dal player web.'
        );
        return;
      }

      // Set a 16-second connection timeout so dead servers don't spin indefinitely
      timeoutRef.current = window.setTimeout(() => {
        stopCurrentAudio();
        onStatusChange(
          'error',
          'Timeout di connessione: il server della stazione radio non risponde.'
        );
      }, 16000);

      const isHlsStream = lowerUrl.includes('.m3u8');

      if (isHlsStream) {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
          });
          hlsRef.current = hls;

          hls.loadSource(streamUrl);
          hls.attachMedia(audio);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            audio
              .play()
              .then(() => {
                clearConnectionTimeout();
                onStatusChange('playing', null);
              })
              .catch((err: unknown) => {
                clearConnectionTimeout();
                if (err instanceof DOMException && err.name === 'NotAllowedError') {
                  onStatusChange('paused', null);
                } else {
                  onStatusChange('error', describeStreamError(targetStation));
                }
              });
          });

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              clearConnectionTimeout();
              destroyHls();
              onStatusChange(
                'error',
                'Errore stream HLS (.m3u8): flusso offline o non raggiungibile.'
              );
            }
          });
          return;
        } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
          // Native HLS support (e.g., Safari / iOS)
          audio.src = streamUrl;
          audio
            .play()
            .then(() => {
              clearConnectionTimeout();
              onStatusChange('playing', null);
            })
            .catch((err: unknown) => {
              clearConnectionTimeout();
              if (err instanceof DOMException && err.name === 'NotAllowedError') {
                onStatusChange('paused', null);
              } else {
                onStatusChange('error', describeStreamError(targetStation));
              }
            });
          return;
        } else {
          clearConnectionTimeout();
          onStatusChange(
            'error',
            'Formato HLS (.m3u8) non supportato da questo browser.'
          );
          return;
        }
      }

      // Standard direct audio stream (MP3 / AAC / OGG / UNKNOWN)
      audio.src = streamUrl;
      audio
        .play()
        .then(() => {
          clearConnectionTimeout();
          onStatusChange('playing', null);
        })
        .catch((err: unknown) => {
          clearConnectionTimeout();
          if (err instanceof DOMException && err.name === 'NotAllowedError') {
            onStatusChange('paused', null);
          } else {
            onStatusChange('error', describeStreamError(targetStation));
          }
        });
    },
    [
      clearConnectionTimeout,
      describeStreamError,
      destroyHls,
      onStatusChange,
      stopCurrentAudio,
    ]
  );

  // Trigger playback whenever the selected station changes
  useEffect(() => {
    if (!station) {
      stopCurrentAudio();
      return;
    }
    startPlayback(station);

    return () => {
      stopCurrentAudio();
    };
  }, [station, startPlayback, stopCurrentAudio]);

  // Sync volume & mute to the audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Poll /api/now-playing every 30s while playing
  useEffect(() => {
    const stationId = station?.id;
    if (status !== 'playing' || !stationId) {
      setNowPlaying(null);
      setNowPlayingError(false);
      setNowPlayingLoading(false);
      return;
    }

    let isCancelled = false;
    setNowPlaying(null);
    setNowPlayingError(false);
    setNowPlayingLoading(true);

    const fetchNowPlaying = async () => {
      try {
        const res = await fetch(
          `/api/now-playing?stationIds=${encodeURIComponent(stationId)}`
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data: unknown = await res.json();
        if (isCancelled) return;

        if (Array.isArray(data)) {
          const entry = data.find(
            (item): item is { stationId?: string; title?: string } =>
              typeof item === 'object' &&
              item !== null &&
              'stationId' in item &&
              item.stationId === stationId
          );
          const cleanTitle =
            entry && typeof entry.title === 'string' ? entry.title.trim() : '';
          setNowPlaying(cleanTitle || null);
        } else {
          setNowPlaying(null);
        }
        setNowPlayingError(false);
      } catch {
        if (!isCancelled) {
          setNowPlayingError(true);
        }
      } finally {
        if (!isCancelled) {
          setNowPlayingLoading(false);
        }
      }
    };

    fetchNowPlaying();
    const intervalId = window.setInterval(fetchNowPlaying, 30000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
      setNowPlaying(null);
      setNowPlayingError(false);
      setNowPlayingLoading(false);
    };
  }, [station?.id, status]);

  const handleTogglePlayPause = () => {
    if (!station || !audioRef.current) return;

    if (status === 'playing' || status === 'connecting') {
      clearConnectionTimeout();
      audioRef.current.pause();
      onStatusChange('paused', null);
    } else if (status === 'paused') {
      // For live radio streams, re-connecting or resuming
      onStatusChange('connecting', null);
      audioRef.current
        .play()
        .then(() => {
          onStatusChange('playing', null);
        })
        .catch(() => {
          startPlayback(station);
        });
    } else if (status === 'error' || status === 'idle') {
      startPlayback(station);
    }
  };

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800">
      {/* Hidden single HTML5 audio instance */}
      <audio
        ref={audioRef}
        preload="none"
        onPlaying={() => {
          clearConnectionTimeout();
          onStatusChange('playing', null);
        }}
        onWaiting={() => {
          if (status === 'playing') {
            onStatusChange('connecting', null);
          }
        }}
        onError={() => {
          // Only handle native audio error if Hls is not managing it
          if (!hlsRef.current && station) {
            clearConnectionTimeout();
            onStatusChange('error', describeStreamError(station));
          }
        }}
      />

      {/* Error banner if stream fails */}
      {station && status === 'error' && errorMessage && (
        <div className="bg-red-950/90 border-b border-red-800/80 px-4 py-1.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs text-red-200">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="truncate">
                <strong className="font-semibold text-white">{station.name}:</strong>{' '}
                {errorMessage}
              </span>
            </div>
            <button
              type="button"
              onClick={() => startPlayback(station)}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-red-800/80 hover:bg-red-700 text-white font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Riprova</span>
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-16 sm:min-h-20 py-2 flex items-center justify-between gap-4">
        {/* Left: Station Info */}
        {station ? (
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <StationLogo
              name={station.name}
              availableLogos={station.availableLogos}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm sm:text-base font-semibold text-white truncate">
                  {station.name}
                </p>
                <span className="hidden sm:inline-block font-mono text-[11px] text-slate-400 shrink-0">
                  {station.isHls ? 'HLS' : station.format}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400 truncate mt-0.5">
                {status === 'connecting' ? (
                  <span className="text-amber-400 font-medium">
                    Connessione in corso…
                  </span>
                ) : status === 'playing' ? (
                  <span className="text-emerald-400 font-medium">
                    In diretta
                  </span>
                ) : status === 'error' ? (
                  <span className="text-red-400 font-medium">
                    Errore di riproduzione
                  </span>
                ) : (
                  <span className="text-slate-400">In pausa</span>
                )}

                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>

                <span className="truncate">
                  {[station.city, station.country].filter(Boolean).join(', ') ||
                    'Internazionale'}
                </span>

                {station.genres.length > 0 && (
                  <>
                    <span
                      aria-hidden="true"
                      className="hidden md:inline text-slate-600"
                    >
                      ·
                    </span>
                    <div className="hidden md:flex items-center gap-1.5 truncate">
                      {station.genres.slice(0, 2).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => onSelectGenre(g)}
                          className="text-xs text-slate-300 hover:text-amber-400 underline-offset-2 hover:underline transition-colors whitespace-nowrap"
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {status === 'playing' && (
                <div className="text-xs truncate mt-0.5">
                  {nowPlaying ? (
                    <span className="text-emerald-400" title={nowPlaying}>
                      In onda: <span className="text-slate-200">{nowPlaying}</span>
                    </span>
                  ) : nowPlayingLoading ? (
                    <span className="text-slate-400">Caricamento brano…</span>
                  ) : !nowPlayingError ? (
                    <span className="text-slate-500">Brano non disponibile</span>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 min-w-0 flex-1 text-slate-400">
            <div className="w-11 h-11 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
              <Radio className="w-5 h-5 text-slate-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-300 truncate">
                Nessuna stazione selezionata
              </p>
              <p className="text-xs text-slate-500 truncate">
                Clicca su una card del catalogo per avviare lo streaming audio
              </p>
            </div>
          </div>
        )}

        {/* Center: Primary Playback Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={!station}
            onClick={handleTogglePlayPause}
            aria-label={
              status === 'playing'
                ? 'Metti in pausa'
                : status === 'connecting'
                ? 'Ferma connessione'
                : 'Avvia riproduzione'
            }
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              !station
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : status === 'error'
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
            }`}
          >
            {status === 'connecting' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : status === 'playing' ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : status === 'error' ? (
              <RotateCcw className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          {station && (
            <>
              <button
                type="button"
                onClick={(e) => onToggleFavorite(station.id, e)}
                aria-label={
                  isFavorite
                    ? `Rimuovi ${station.name} dai preferiti`
                    : `Aggiungi ${station.name} ai preferiti`
                }
                title={
                  isFavorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'
                }
                className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${
                  isFavorite
                    ? 'border-amber-500/50 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                    : 'border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <Heart
                  className={`w-4 h-4 ${isFavorite ? 'fill-amber-400' : ''}`}
                />
              </button>

              <button
                type="button"
                onClick={onStop}
                aria-label="Ferma e chiudi stazione"
                title="Ferma riproduzione"
                className="w-9 h-9 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            </>
          )}
        </div>

        {/* Right: Volume Controls */}
        <div className="flex items-center justify-end gap-2.5 sm:w-48 shrink-0">
          <button
            type="button"
            onClick={() => setIsMuted((prev) => !prev)}
            aria-label={isMuted ? 'Riattiva audio' : 'Disattiva audio'}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-5 h-5 text-red-400" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </button>

          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              const nextVol = parseFloat(e.target.value);
              setVolume(nextVol);
              if (nextVol > 0 && isMuted) {
                setIsMuted(false);
              }
            }}
            aria-label="Volume riproduzione"
            className="hidden sm:block w-28 accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />

          <span className="hidden md:inline-block font-mono text-xs text-slate-400 w-9 text-right tabular-nums">
            {Math.round((isMuted ? 0 : volume) * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};
