# Build Stage for Rust
FROM mirror.gcr.io/library/rust:alpine AS builder

RUN apk add --no-cache musl-dev pkgconfig openssl-dev

WORKDIR /app

# Copy workspace configuration
COPY Cargo.toml Cargo.lock ./

# Copy all crates manifests
COPY crates/voxify-core/Cargo.toml ./crates/voxify-core/Cargo.toml
COPY crates/cli/Cargo.toml ./crates/cli/Cargo.toml
COPY crates/web/Cargo.toml ./crates/web/Cargo.toml

# Dummy build to cache dependencies
# We create minimal files to allow cargo to fetch and compile dependencies
RUN mkdir -p crates/voxify-core/src crates/cli/src crates/web/src && \
    echo "fn main() {}" > crates/cli/src/main.rs && \
    echo "fn main() {}" > crates/web/src/main.rs && \
    echo "" > crates/voxify-core/src/lib.rs && \
    cargo build --release --workspace && \
    rm -rf crates/voxify-core/src crates/cli/src crates/web/src

# Copy actual source code
COPY crates ./crates

# Crucial step: we "touch" the entry points to force Cargo to recognize 
# that the source code has changed and it must re-scan modules.
RUN touch crates/voxify-core/src/lib.rs && \
    touch crates/cli/src/main.rs && \
    touch crates/web/src/main.rs

# Run tests (this will also compile the real library)
RUN cargo test --release --workspace

# Build final binaries
RUN cargo build --release --workspace

# Final Stage
FROM mirror.gcr.io/library/alpine:latest
RUN apk add --no-cache ca-certificates openssl
WORKDIR /app

# Copy binaries
COPY --from=builder /app/target/release/voxify /usr/local/bin/voxify
COPY --from=builder /app/target/release/web /usr/local/bin/web

EXPOSE 3000

# Default to starting the web server
ENTRYPOINT ["web"]
