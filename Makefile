DEVICE ?= tv
APP_ID = io.strem.tvr
SERVER_VERSION = 4.20.17
VIDAA_REF = 208d437e5138adff0865443a2a88c4fcee84ece6
VIDAA_REPO = https://github.com/NoobyGains/stremio-vidaa-tv/archive/$(VIDAA_REF).tar.gz
FFMPEG_VERSION = 7.0.2
FFMPEG_URL = https://johnvansickle.com/ffmpeg/releases/ffmpeg-$(FFMPEG_VERSION)-arm64-static.tar.xz
FFMPEG_SHA256 = f4149bb2b0784e30e99bdda85471c9b5930d3402014e934a5098b41d0f7201b1
VERSION = $(shell python3 -c "import json; print(json.load(open('app/appinfo.json'))['version'])")
IPK = $(APP_ID)_$(VERSION)_all.ipk

.PHONY: build package deploy launch restart clean

service/server.js:
	@echo "==> Downloading Stremio server v$(SERVER_VERSION)..."
	@curl -so $@ "https://dl.strem.io/server/v$(SERVER_VERSION)/webos/server.js"

service/bin/ffmpeg service/bin/ffprobe:
	@echo "==> Downloading static ffmpeg+ffprobe v$(FFMPEG_VERSION) (aarch64)..."
	@rm -rf .build/ffmpeg && mkdir -p .build/ffmpeg service/bin
	@curl -sLo .build/ffmpeg/ffmpeg.tar.xz $(FFMPEG_URL)
	@echo "$(FFMPEG_SHA256)  .build/ffmpeg/ffmpeg.tar.xz" | shasum -a 256 -c -
	@tar xJ --strip-components=1 -f .build/ffmpeg/ffmpeg.tar.xz -C .build/ffmpeg
	@cp .build/ffmpeg/ffmpeg .build/ffmpeg/ffprobe service/bin/
	@chmod +x service/bin/ffmpeg service/bin/ffprobe
	@rm -rf .build/ffmpeg

build: service/server.js service/bin/ffmpeg service/bin/ffprobe
	@echo "==> Downloading Vidaa frontend..."
	@rm -rf .build/vidaa && mkdir -p .build/vidaa
	@curl -sL $(VIDAA_REPO) | tar xz --strip-components=1 -C .build/vidaa
	@echo "==> Building service/www/..."
	@rm -rf service/www && mkdir -p service/www
	@cp .build/vidaa/*.js .build/vidaa/*.wasm .build/vidaa/*.ttf .build/vidaa/*.png .build/vidaa/*.svg service/www/
	@cp service/index.html service/www/index.html
	@rm -rf .build/vidaa
	@for p in patches/*.patch; do \
		echo "    Applying $$(basename $$p)..."; \
		patch -p0 -d service/www < "$$p"; \
	done
	@echo "==> Build complete"

package: build
	@rm -f $(IPK)
	@ares-package --no-minify app service -o .

deploy: package
	@for i in 1 2 3 4 5; do \
		ares-install --device $(DEVICE) $(IPK) && break || sleep 3; \
	done
	@ares-launch --device $(DEVICE) $(APP_ID)

launch:
	@ares-launch --device $(DEVICE) $(APP_ID)

restart:
	@-ares-launch --device $(DEVICE) --close $(APP_ID)
	@sleep 1
	@ares-launch --device $(DEVICE) $(APP_ID)

clean:
	rm -rf service/www service/server.js service/bin .build *.ipk
