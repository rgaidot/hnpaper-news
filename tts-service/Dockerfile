# Étape de construction
FROM docker.io/library/rust:alpine AS builder

# Installer les dépendances de compilation pour Alpine (musl libc)
RUN apk add --no-cache musl-dev pkgconfig openssl-dev

WORKDIR /app

# Copier les fichiers de définition du projet
COPY Cargo.toml Cargo.lock ./

# Mettre en cache les dépendances en créant un faux projet
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

# Copier le vrai code source
COPY src ./src

# Forcer la recompilation du binaire principal
RUN touch src/main.rs && cargo build --release

# Étape d'exécution
FROM docker.io/library/alpine:latest

# Installer les certificats racine (pour HTTPS) et la librairie openssl (runtime)
RUN apk add --no-cache ca-certificates openssl

WORKDIR /app

# Copier le binaire depuis l'étape de construction
COPY --from=builder /app/target/release/voxify /usr/local/bin/tts-service

# Copier l'index html nécessaire pour la commande "serve"
COPY index.html ./

# Créer les dossiers attendus par l'application (config.rs)
RUN mkdir -p data/news data/audio

# Exposer le port par défaut du serveur web
EXPOSE 3000

# Définir l'entrypoint
ENTRYPOINT ["tts-service"]

# Commande par défaut : lancer le serveur interactif
CMD ["serve"]
