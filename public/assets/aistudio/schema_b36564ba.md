# Schema dei dati — catalog_stations.csv

File: `catalog_stations.csv` (UTF-8, separato da virgole, quoting standard RFC 4180).
~55.797 stazioni uniche, ~58.212 righe (una stazione può avere più stream → più righe con lo stesso `id`).

## Colonne

| Colonna | Tipo | Descrizione |
|---|---|---|
| `name` | string | Nome della stazione radio (es. "Radio Swiss Jazz") |
| `id` | string | Identificativo univoco stazione (es. "swissjazz"). **Chiave per deduplicare**: una card per `id` |
| `city` | string | Città (può essere vuoto) |
| `country` | string | Paese (es. "USA", "Germany", "Italy") |
| `genres` | string | Generi separati da `;` (es. "Blues;Jazz;Chillout"). **Da splittare su `;` per il filtro** |
| `logo100` | string (URL) | Logo 100×100px HTTPS (può essere vuoto) |
| `logo175` | string (URL) | Logo 175×175px HTTPS — **risoluzione consigliata di default** |
| `logo300` | string (URL) | Logo 300×300px HTTPS (spesso vuoto) |
| `stream_url` | string (URL) | URL diretto dello stream (MP3/AAC/OGG/HLS). HTTPS, riproducibile nel browser |
| `format` | string | `MP3` \| `AAC` \| `OGG` \| `UNKNOWN` |
| `status` | string | `VALID` \| altri. **Usare solo righe con `status=VALID`** |

## Logiche da applicare

1. **Deduplicazione**: per la lista, una sola riga per `id`. Se più righe hanno lo stesso `id`, prendere il primo stream `status=VALID` (in ordine di apparizione).
2. **Filtro genere**: una stazione appartiene al genere G se `genres.split(';')` contiene G.
3. **Logo**: preferire `logo175`; se vuoto, fallback a `logo100`; se vuoto, fallback a `logo300`; se tutti vuoti, placeholder.
4. **Riproduzione**: passare `stream_url` al `src` di `<audio>`. Non serve trasformazione.

## Esempio di riga

```
name,id,city,country,genres,logo100,logo175,logo300,stream_url,format,status
Radio Swiss Jazz,swissjazz,Basel,Switzerland,Blues;Jazz;Chillout,https://station-images-prod.radio-assets.com/100/swissjazz.png?v=...,https://station-images-prod.radio-assets.com/175/swissjazz.png?v=...,,https://stream.srg-ssr.ch/m/rsj/mp3_128,MP3,VALID
```

## Note sui formati di stream
- **MP3** e **AAC**: riproducibili nativamente con `<audio>` in tutti i browser moderni.
- **HLS** (`.m3u8`): richiede `hls.js` o browser con supporto nativo (Safari sì, Chrome no). Trattarli con un fallback: se il formato è `.m3u8` e il browser non lo supporta nativamente, mostrare "Formato non supportato" o caricare hls.js.
- **UNKNOWN**: tentare comunque la riproduzione; se fallisce, gestire l'errore.

## Set di generi
Vedi `genres_unique.txt` (180 generi con conteggio). I più frequenti: Pop, Hits, Rock, 80s, Electro, Top 40 & Charts, Oldies, 90s, Latin, Christian Music, Talk, Country, 70s, Hip Hop, Alternative.
