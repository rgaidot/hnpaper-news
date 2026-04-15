.PHONY: install build publish push dev test format lint clean podman-run podman-cli package

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
	podman run --rm -it -p 3000:3000 ${IMAGE}

podman-cli:
	podman run --rm -it -v $(PWD):/app ${IMAGE} voxify $(ARGS)

package: clean
	cargo build --release --workspace
	mkdir -p dist/voxify-linux-amd64
	cp target/release/voxify dist/voxify-linux-amd64/
	cp target/release/web dist/voxify-linux-amd64/
	cp voxify.toml.example dist/voxify-linux-amd64/
	cp README.md dist/voxify-linux-amd64/
	cd dist && tar -czvf voxify-linux-amd64.tar.gz voxify-linux-amd64/
