use axum::{
    extract::Json,
    routing::{get, post},
    Router,
    response::{Html, IntoResponse},
    http::header,
};
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use voxify_core::audio::{synthesize_audio, json_to_vtt};
use voxify_core::text::{chunk_text, clean_markdown};
use voxify_core::config::get_config;
use edge_tts_rust::{EdgeTtsClient, SpeakOptions, Boundary};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;

#[derive(Deserialize)]
pub struct SynthesizeRequest {
    pub markdown: String,
}

#[derive(Serialize)]
pub struct SynthesizeResponse {
    pub audio_base64: String,
    pub vtt: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    
    // Determine port, default to 3000
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string()).parse().unwrap_or(3000);
    start_server(port).await
}

pub async fn start_server(port: u16) -> anyhow::Result<()> {
    let app = Router::new()
        .route("/synthesize", post(handle_synthesize))
        .route("/", get(|| async { Html(include_str!("../assets/index.html")) }))
        .route("/index.html", get(|| async { Html(include_str!("../assets/index.html")) }))
        .route("/style.css", get(|| async { 
            ([(header::CONTENT_TYPE, "text/css")], include_str!("../assets/style.css"))
        }))
        .route("/script.js", get(|| async { 
            ([(header::CONTENT_TYPE, "application/javascript")], include_str!("../assets/script.js"))
        }))
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("🚀 Server starting on http://localhost:{}", port);
    println!("ℹ Binding to {}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn handle_synthesize(
    Json(payload): Json<SynthesizeRequest>,
) -> impl IntoResponse {
    match process_synthesize(payload.markdown).await {
        Ok(res) => (axum::http::StatusCode::OK, Json(res)).into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Error: {}", e),
        ).into_response(),
    }
}

async fn process_synthesize(markdown: String) -> anyhow::Result<SynthesizeResponse> {
    let cfg = get_config();
    let tts = EdgeTtsClient::new()?;
    let speech_config = SpeakOptions {
        voice: cfg.voice.clone().into(),
        boundary: Boundary::Word,
        ..SpeakOptions::default()
    };

    // Offload CPU-intensive tasks (parsing and cleaning) to spawn_blocking
    let text_to_read = tokio::task::spawn_blocking(move || {
        let matter = gray_matter::Matter::<gray_matter::engine::YAML>::new();
        let parsed = matter.parse(&markdown);
        
        let title = parsed
            .data
            .as_ref()
            .and_then(|data| data.deserialize::<voxify_core::types::ArticleFrontMatter>().ok())
            .and_then(|fm| fm.title)
            .unwrap_or_default();

        let cleaned_content = clean_markdown(&parsed.content);
        if !title.is_empty() {
            format!("{}. \n\n{}", title, cleaned_content)
        } else {
            cleaned_content
        }
    }).await?;

    let chunks = chunk_text(&text_to_read, 1200);
    
    let mut final_audio = Vec::new();
    let mut all_subtitles = Vec::new();
    let mut current_time_offset = 0;

    for chunk in chunks {
        let (audio_bytes, mut subtitles) = synthesize_audio(&tts, &speech_config, &chunk, current_time_offset).await?;
        
        let duration_ms = voxify_core::audio::get_audio_duration_from_bytes(&audio_bytes);
        final_audio.extend_from_slice(&audio_bytes);
        all_subtitles.append(&mut subtitles);
        current_time_offset += duration_ms;
    }

    let vtt = json_to_vtt(&all_subtitles);
    let audio_base64 = general_purpose::STANDARD.encode(final_audio);

    Ok(SynthesizeResponse { audio_base64, vtt })
}
