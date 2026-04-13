FROM mirror.gcr.io/library/node:alpine AS assets-builder
WORKDIR /app
COPY script.js style.css ./
RUN npx esbuild script.js --minify --allow-overwrite --outfile=script.js && \
    npx esbuild style.css --minify --allow-overwrite --outfile=style.css

FROM mirror.gcr.io/library/rust:alpine AS builder
RUN apk add --no-cache musl-dev pkgconfig openssl-dev
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src
COPY src ./src
RUN touch src/main.rs && cargo build --release

FROM mirror.gcr.io/library/alpine:latest
RUN apk add --no-cache ca-certificates openssl
WORKDIR /app
COPY --from=builder /app/target/release/voxify /usr/local/bin/tts-service
COPY index.html ./
COPY --from=assets-builder /app/script.js /app/style.css ./
RUN mkdir -p data/news data/audio
EXPOSE 3000
ENTRYPOINT ["tts-service"]
CMD ["serve"]
