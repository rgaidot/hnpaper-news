.PHONY: install build publish push dev test format lint clean podman-run podman-generate

APP := voxify
REGISTRY := 192.168.7.70:32768
GIT_SHA := $(shell git rev-parse --short=7 HEAD)
IMAGE := $(APP):$(GIT_SHA)

install:
	cargo fetch

dev:
	cargo run -- serve -p 3000

test:
	cargo test

format:
	cargo fmt

lint:
	cargo clippy -- -D warnings

clean:
	cargo clean

build: 
	podman build -t ${IMAGE} .

publish: build
	podman image tag ${IMAGE} ${REGISTRY}/${APP}:${GIT_SHA}
	podman image tag ${IMAGE} ${REGISTRY}/${APP}:latest

push:
	podman push ${REGISTRY}/${APP}:${GIT_SHA}
	podman push ${REGISTRY}/${APP}:latest

podman-run:
	@echo "Lancement du conteneur ${IMAGE} sur le port 3000..."
	podman run --rm -it -p 3000:3000 \
		-v $(PWD)/data:/app/data \
		${IMAGE}

podman-generate:
	podman run --rm -it -v $(PWD)/data:/app/data ${IMAGE} ${ARGS}
