# Voxify

Voxify is a high-performance Text-to-Speech (TTS) solution designed to transform Markdown articles into high-quality audio files. Built with Rust and powered by the Edge TTS API, the project follows a modular Clean Architecture for maximum flexibility.

## 🏗 Project Architecture

The project is organized as a Cargo workspace divided into three main components:

### 1. `voxify-core` (Library)
The logical heart of the project. It is interface-agnostic and handles:
- Communication with the Edge TTS API.
- Markdown cleaning and parsing (including YAML front matter extraction).
- Intelligent text segmentation (chunking) for long articles.
- Generation of `.vtt` subtitle files.
- Audio duration calculation and content hashing.

### 2. `voxify` (CLI)
A powerful command-line tool for batch processing:
- Processing of local Markdown files.
- Multi-level progress bars and performance statistics.
- Concurrent processing support for ultra-fast execution.
- Flexible configuration (voice selection, output directory).

### 3. `web` (API & UI Service)
An interactive web server built with Axum:
- REST API for on-the-fly synthesis.
- Minimalist and efficient web user interface (HTML/JS/CSS included).
- CORS support for easy integration into other projects.

---

## 🚀 Installation

### Prerequisites
- [Rust](https://www.rust-lang.org/) (2021 edition)
- [Nix](https://nixos.org/) (optional, via the provided `shell.nix` for a reproducible environment)

### Compilation
To compile all components in release mode:
```bash
cargo build --release
```

The binaries will be available in `target/release/voxify` and `target/release/web`.

---

## 🛠 Usage

### CLI (`voxify`)
The CLI tool transforms one or more Markdown files into MP3 and VTT files.

```bash
# Basic usage
voxify my_article.md

# Specify an output directory, a specific voice, and parallel limit
voxify news/*.md --output ./audio_files --voice fr-FR-VivienneMultilingualNeural --parallel 10
```

**Arguments:**
- `inputs`: List of `.md` files to process.
- `--output` (`-o`): Directory where files will be saved (default: `.`).
- `--voice` (`-v`): Edge TTS voice name to use.
- `--parallel` (`-p`): Number of files to process concurrently (default: 5).

### Web Server (`web`)
Start the server to access the interactive interface or use the API.

```bash
# Launch on default port 3000
./target/release/web

# Or via environment variable
PORT=8080 ./target/release/web
```

**API Endpoint:**
- `POST /synthesize`
  - Body: `{ "markdown": "# Title\nContent..." }`
  - Response: `{ "audio_base64": "...", "vtt": "..." }`

## 🐳 Docker

### Running with Docker/Podman
This project includes a multi-stage Dockerfile that builds both the CLI and Web components.

#### Web Server
```bash
docker run -p 3000:3000 voxify:latest
```

#### CLI (Processing local files)
```bash
docker run --rm -v $(pwd):/app voxify:latest voxify input.md --output ./output
```

### Using Makefile (Recommended)
```bash
make build         # Build the image
make podman-run    # Start the web server
make podman-cli ARGS="input.md --output ./dist" # Run the CLI
```

## 🧪 Testing

The project includes a robust test suite for the core logic (Markdown cleaning, text chunking).
Run tests using:
```bash
cargo test --workspace
```

---

## ⚙️ Configuration

Voxify uses a flexible configuration system that loads settings from multiple sources (in order of priority):
1. **Environment Variables**: Prefixed with `VOXIFY_` (e.g., `VOXIFY_VOICE="..."`).
2. **Configuration File**: `voxify.toml` in the working directory.
3. **Defaults**: Hardcoded safe defaults in the core library.

### Available Settings
| Key | Default | Description |
|-----|---------|-------------|
| `voice` | `fr-FR-Vivienne...` | The Edge TTS voice to use. |
| `max_retries` | `4` | Number of attempts for failed TTS requests. |
| `concurrency_limit_tts` | `10` | Parallel tasks for network-bound TTS. |
| `concurrency_limit_local` | `30` | Parallel tasks for local processing. |

See `voxify.toml.example` for a starting point.

## 📄 License
This project is developed for internal use and is optimized for performance and reliability.
