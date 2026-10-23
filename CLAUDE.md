# Stremio webOS

Custom Stremio app for LG webOS TVs. Uses Stremio Theater v1.9.2 frontend (from [Vidaa project](https://github.com/NoobyGains/stremio-vidaa-tv)) with the official Stremio streaming server.

## Target device (this fork: "StremioR")

Personal fork, built for and tested on one TV only:

- **TV:** LG QNED73 (large screen, 1920x1080 app resolution) — favour dense, information-rich layouts
- **OS:** webOS 25 ("Magic webOS 25"); modern Chromium (`:has()`, `overflow-wrap: anywhere` etc. work — Chrome 68 caveats elsewhere in this file are upstream's)
- **Mode:** Developer Mode (not rooted, no Homebrew Channel): sideload only, jailed SSH shell (no `/etc/profile`, `ares-log`/`ares-shell` useless), limited app storage (~59 MB IPK; uninstall old builds if install says "no available space")
- **ares device:** `tv` = `prisoner@192.168.0.15:9922`, **profile `tv`**
- **Build host:** Windows 11 + Git Bash + Node 20

Fork-specific differences from upstream:

- App id `io.strem.tvr` / service `io.strem.tvr.server`, title "StremioR" (installs alongside stock Stremio)
- UI served on **:8081** (not 8080), because the stock app's service keeps :8080 after closing; if :11470 is already taken, `launch.js` reuses that streaming server instead of crashing
- Snappiness: HTTP ETag caching in `launch.js` (enables Chromium's JS/wasm code cache), UI served before `server.js` loads (early proxy GETs retry), all CSS animations forced to 1ms (not `none` — Solid transition groups unmount on `transitionend`), background blur removed
- Stream picker: sorted by seeders, 3-row grid scrolling horizontally (navigation is geometric spatial nav, so a CSS grid gets correct D-pad behaviour for free)
- Torrent stats (speed/peers/progress) on the player loading screen
- Stream cards parse Torrentio's description (`window.__streamCard`): seeds/size/source, quality tags, languages, file name
- Direct media: `index.html` hooks `HTMLMediaElement.prototype.src` to rewrite `http://127.0.0.1:8081/…` → `:11470/…` so video bytes skip the Node proxy (blob: and fetch/XHR untouched); on a media `error` it retries once via the proxy (capture listener runs before the player's)
- `launch.js` POSTs Stremio's "fast" torrent profile to `/settings` on every start (200 conns, 4 MB/s soft limit; server default is 55 / 2.5 MB/s)

## Important: Build artifacts

Several files are **downloaded/generated at build time** and will not exist in a fresh clone:

- `service/server.js` — downloaded from `dl.strem.io` (Stremio streaming server, webOS build)
- `service/www/` — built from Vidaa frontend tarball + patches

Run `make build` to generate these before inspecting or modifying them.

## Structure

```
app/                  # webOS app shell — starts service, redirects to http://127.0.0.1:8080
  appinfo.json        # webOS app manifest (id: io.strem.tv)
  index.html          # Starts server via Luna, polls :8080, redirects when ready
  services.json       # Links to server service
  icon.png

service/              # webOS service
  launch.js           # Entry point: serves www/ on :8080, proxies API to streaming server on :11470
  index.html          # Theater entry point for webOS (sets __STREMIO_SERVER_URL__ to :8080)
  package.json        # Service manifest (main: launch.js)
  services.json       # Luna service registration
  server.js           # [downloaded] Official Stremio streaming server
  www/                # [built] Vidaa frontend + patches applied

patches/              # Patches applied to Vidaa frontend files during build
  video.chunk.js.patch
```

## How it works

1. `make build` downloads the Vidaa frontend (pinned to a specific commit) and Stremio server, copies frontend files into `service/www/`, applies patches
2. `make deploy` packages the IPK via `ares-package` and installs via `ares-install`
3. On launch: `app/index.html` starts the server service via Luna, polls `:8080` with an `<img>` load, redirects when ready
4. `service/launch.js` serves the Theater frontend on `:8080` and proxies all non-static requests to the streaming server on `:11470`

The proxy exists because the app loads from `file://` which cannot XHR/fetch to `http://` origins (CORS restriction on webOS Chrome 68). Serving everything from `:8080` makes all requests same-origin.

## Patches

Patches in `patches/` are applied to Vidaa frontend files during `make build`. They are unified diffs against the pinned Vidaa commit.

### video.chunk.js.patch

Adds an `addtrack` event handler to the WebOsVideo player's `<video>` element. This:

1. **Builds the audio track list from the native `audioTracks` API** — the native API returns tracks in Luna's internal order, so `selectTrack` indices match correctly (the original code used `getTracksData` from the streaming server which returns tracks in ffprobe order — a different order)
2. **Enriches track labels** from the streaming server's `/tracks/` endpoint when available
3. **Auto-selects the preferred audio language** from the user's Stremio profile settings (`profile.settings.audioLanguage`)

### stream-sort-by-peers.patch / torrent-loading-stats.patch

One-line hooks into `details.chunk.js` / `player.chunk.js` that call `window.__sortStreams` and `window.__torrentStats`, defined in `service/index.html` (along with CSS overrides for the stream picker, which target the pinned build's CSS-module class names, so re-check them if `VIDAA_REF` changes).

## Deploy

Requires LG's **`@webos-tools/cli`** (`npm i -g @webos-tools/cli`, then `ares-config -p tv`). Do not use `@webosose/ares-cli`: it only has the OSE profile and installs fail on a TV with `rm: can't remove '/media/developer/temp'`. The TV is device `tv` (Makefile default). Works from Git Bash on Windows (build temp files go to `.build/`, not `/tmp`). `service/package.properties` marks `ffmpeg`/`ffprobe` as 755 — needed because Windows has no exec bit.

```sh
make deploy    # build + package + install + launch
make build     # download dependencies + build service/www/
make package   # build + create IPK
make restart   # close + relaunch on TV
make clean     # remove all build artifacts
```
