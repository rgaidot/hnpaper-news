.PHONY: install publish dev preview lint format check check-fix

APP := hnpaper-news
GIT_SHA := ${shell git rev-parse --short=7 HEAD}
IMAGE := ${APP}:${GIT_SHA}

install: install-modules

install-modules:
	@bun ci

dev:
	bun run dev

preview:
	bun run preview

lint:
	bun run lint

format:
	bun run format

check:
	bun run check

check-fix:
	bun run check:fix

generate-audio:
	bun run scripts/generate-audio.ts

update-code:
	git pull

build-code: update-code
	bun run build

build: generate-audio build-code
	podman build -t ${IMAGE} .

publish: build
	podman image tag ${IMAGE} 192.168.7.70:32768/${APP}:${GIT_SHA}
	podman image tag ${IMAGE} 192.168.7.70:32768/${APP}:latest

push: publish
	podman push 192.168.7.70:32768/${APP}:${GIT_SHA}
	podman push 192.168.7.70:32768/${APP}:latest
