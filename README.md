# StremioR — Stremio for LG webOS

A faster, more informative Stremio for LG webOS TVs. Fork of [kieranbrown/stremio-webos](https://github.com/kieranbrown/stremio-webos) (Stremio Theater frontend + the official Stremio streaming server, with working default audio language selection).

Built and tested on an **LG QNED73 running webOS 25** in Developer Mode. Other recent webOS TVs will probably work, but are untested.

## What's different

- **Torrent stats while loading** — download/upload speed, peers, swarm size and file progress on the loading/buffering screen, so you know whether a torrent is actually moving.
- **Source picker as a horizontal grid** — 3 rows of cards scrolling sideways instead of one long list, **sorted by seeders**. Each card shows (parsed from Torrentio):
  `👤 seeders · 💾 size · ⚙ source`, quality tags (4K / DV / HDR / HEVC / Atmos / REMUX…), audio languages, and the file name.
- **Faster torrents** — applies Stremio's "fast" torrent profile (200 connections, 4 MB/s soft limit instead of 55 / 2.5 MB/s).
- **Snappier UI** — no animations, no background blur, HTTP caching so the TV reuses compiled JS/wasm between launches, UI starts while the streaming server is still loading.
- **Direct video** — the video player reads straight from the streaming server instead of through an extra proxy (falls back to the proxy automatically if needed).
- Installs **alongside** the stock app (app id `io.strem.tvr`, title "StremioR", UI on port 8081).

## Install (prebuilt IPK)

1. Download `io.strem.tvr_*.ipk` from the [latest release](https://github.com/jrubimf/StremioR/releases/latest).
2. Enable [Developer Mode](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app) on your TV (or use [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) on a rooted TV).
3. Install it with either:
   - **[webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop)** (GUI): add your TV with the Dev Mode passphrase → Apps → Install → pick the `.ipk`.
   - **CLI**: `npm i -g @webos-tools/cli`, `ares-config -p tv`, `ares-setup-device` (add your TV), then `ares-install -d <device> io.strem.tvr_*.ipk`.

> Developer Mode expires after 1000 hours and sideloaded apps get removed; re-enable and reinstall. Rooted TVs with Homebrew Channel don't have this limit.
>
> On Homebrew Channel you can add this repository: `https://raw.githubusercontent.com/jrubimf/StremioR/main/webosbrew/apps.json`

After installing, sign in to Stremio again (it's a separate app from the stock one).

## Build from source

Requires Node 20, `make`, `curl`, `tar`, `patch`, `python3` and `@webos-tools/cli` (Git Bash works on Windows).

```sh
make deploy DEVICE=<your-ares-device>   # build + package + install + launch
make build     # download dependencies + build service/www/
make package   # build + create IPK
make restart   # close + relaunch on TV
make clean     # remove build artifacts
```

## Credits

- [Stremio](https://www.stremio.com/)
- [kieranbrown/stremio-webos](https://github.com/kieranbrown/stremio-webos) — the webOS app this is based on
- [NoobyGains/stremio-vidaa-tv](https://github.com/NoobyGains/stremio-vidaa-tv) — Theater frontend
- [webOS Homebrew Project](https://www.webosbrew.org/)

Unofficial; not affiliated with Stremio or LG.
