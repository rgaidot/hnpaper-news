mod progress;

use anyhow::Result;
use clap::Parser;
use voxify_core::config::*;
use edge_tts_rust::{Boundary, EdgeTtsClient, SpeakOptions};
use futures::stream::{self, StreamExt};
use gray_matter::engine::YAML;
use gray_matter::Matter;
use progress::ProgressManager;
use voxify_core::audio;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use voxify_core::text::{chunk_text, clean_markdown};
use voxify_core::types::ArticleFrontMatter;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// Input Markdown file(s)
    #[arg(required = true)]
    inputs: Vec<PathBuf>,

    /// Output directory for generated files
    #[arg(short, long, default_value = ".")]
    output: PathBuf,

    /// Voice to use (overrides config)
    #[arg(short, long)]
    voice: Option<String>,

    /// Parallel processing limit
    #[arg(short, long, default_value_t = 5)]
    parallel: usize,
}

async fn process_file(
    file_path: PathBuf,
    output_dir: &Path,
    voice: &str,
    progress: &ProgressManager,
) -> Result<()> {
    let cfg = get_config();
    let filename = file_path.file_stem().unwrap().to_string_lossy().to_string();
    let audio_path = output_dir.join(&filename).with_extension("mp3");
    let vtt_path = output_dir.join(&filename).with_extension("vtt");

    let content = tokio::fs::read_to_string(&file_path).await?;

    let (text_to_read, _content_hash) = tokio::task::spawn_blocking(move || {
        let matter = Matter::<YAML>::new();
        let parsed = matter.parse(&content);

        let title = parsed
            .data
            .as_ref()
            .and_then(|data| data.deserialize::<ArticleFrontMatter>().ok())
            .and_then(|fm| fm.title)
            .unwrap_or_default();

        let cleaned = clean_markdown(&parsed.content);
        let text = if !title.is_empty() {
            format!("{}. \n\n{}", title, cleaned)
        } else {
            cleaned
        };
        let hash = voxify_core::text::compute_hash(&text);
        (text, hash)
    })
    .await?;

    let start_time = std::time::Instant::now();

    let tts = EdgeTtsClient::new()?;
    let speech_config = SpeakOptions {
        voice: voice.to_string(),
        boundary: Boundary::Word,
        ..SpeakOptions::default()
    };

    let chunks = chunk_text(&text_to_read, 1200);
    let mut all_subtitles = Vec::new();
    let mut current_time_offset = 0;

    let steps = chunks.len() as u64;
    let article_bar = progress.create_article_bar(&filename, steps);

    let mut final_audio = Vec::new();

    for (i, chunk) in chunks.iter().enumerate() {
        article_bar.set_message(format!("TTS segment {}/{}", i + 1, chunks.len()));

        let mut attempts = 0;

        let (audio_bytes, mut subtitles) = loop {
            match audio::synthesize_audio(&tts, &speech_config, chunk, current_time_offset).await {
                Ok(res) => break res,
                Err(e) => {
                    attempts += 1;
                    if attempts >= cfg.max_retries {
                        anyhow::bail!("TTS failed after {} attempts: {}", cfg.max_retries, e);
                    }
                    tokio::time::sleep(tokio::time::Duration::from_millis(
                        1000 * 2_u64.pow(attempts),
                    ))
                    .await;
                }
            }
        };

        let duration_ms = audio::get_audio_duration_from_bytes(&audio_bytes);
        final_audio.extend_from_slice(&audio_bytes);
        all_subtitles.append(&mut subtitles);
        current_time_offset += duration_ms;
        article_bar.inc(1);
    }

    tokio::fs::write(&audio_path, &final_audio).await?;

    if !all_subtitles.is_empty() {
        let vtt_content = audio::json_to_vtt(&all_subtitles);
        tokio::fs::write(&vtt_path, vtt_content).await?;
    }

    progress.increment_success(start_time.elapsed().as_millis() as u64);
    progress.log_success(
        &filename,
        &format!(
            "Generated: {}",
            audio_path.display()
        ),
    );
    progress.remove_article_bar(&article_bar);

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();
    let _ = rustls::crypto::ring::default_provider().install_default();

    let cfg = get_config();
    let cli = Cli::parse();
    
    let inputs = cli.inputs;
    let output_dir = cli.output;
    let voice = cli.voice.unwrap_or_else(|| cfg.voice.clone());
    let concurrency_limit = cli.parallel;

    if !output_dir.exists() {
        tokio::fs::create_dir_all(&output_dir).await?;
    }

    println!(
        "\n━━━ Voxify CLI — {} file(s) ━━━\n",
        inputs.len()
    );

    let progress_manager = Arc::new(ProgressManager::new(inputs.len()));
    let failed_articles_arc = Arc::new(tokio::sync::Mutex::new(Vec::new()));

    stream::iter(inputs)
        .for_each_concurrent(concurrency_limit, |file_path| {
            let progress_clone = Arc::clone(&progress_manager);
            let failed_clone = Arc::clone(&failed_articles_arc);
            let output_ref = &output_dir;
            let voice_ref = &voice;
            let filename = file_path.file_stem().unwrap().to_string_lossy().to_string();

            async move {
                if let Err(e) = process_file(
                    file_path,
                    output_ref,
                    voice_ref,
                    &progress_clone,
                )
                .await
                {
                    progress_clone.increment_failed();
                    failed_clone.lock().await.push((filename, e.to_string()));
                }
            }
        })
        .await;

    progress_manager.stop();
    progress_manager.print_summary();

    let failed_articles = failed_articles_arc.lock().await;
    if !failed_articles.is_empty() {
        println!("\nFailed:");
        for (filename, err) in failed_articles.iter() {
            println!("  ✘ {}: {}", filename, err);
        }
    }

    Ok(())
}
