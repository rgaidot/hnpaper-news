.PHONY: install publish

APP := hnpaper-news
GIT_SHA := ${shell git rev-parse --short=7 HEAD}
IMAGE := ${APP}:${GIT_SHA}

install: install-modules

install-modules:
	@bun ci

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

