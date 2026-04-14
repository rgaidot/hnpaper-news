.PHONY: install build publish push dev test format lint clean podman-run podman-cli

APP := voxify
REGISTRY := 192.168.7.70:32768
GIT_SHA := $(shell git rev-parse --short=7 HEAD)
IMAGE := $(APP):$(GIT_SHA)

install:
	cargo fetch

dev:
	cargo run --bin web

dev-cli:
	cargo run --bin voxify -- $(ARGS)

test:
	cargo test --workspace

format:
	cargo fmt --all

lint:
	cargo clippy --workspace -- -D warnings

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
	@echo "Starting web server container ${IMAGE} on port 3000..."
	podman run --rm -it -p 3000:3000 ${IMAGE}

podman-cli:
	@echo "Running CLI from container..."
	podman run --rm -it -v $(PWD):/app ${IMAGE} voxify $(ARGS)
