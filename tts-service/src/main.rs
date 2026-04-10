mod audio;
mod config;
mod progress;
mod s3;
mod text;
mod types;

use anyhow::Result;
use config::*;
use edge_tts_rust::{Boundary, EdgeTtsClient, SpeakOptions};
use futures::stream::{self, StreamExt};
use gray_matter::engine::YAML;
use gray_matter::Matter;
use progress::{ProgressManager, format_duration};
use s3::{get_s3_client, list_r2_objects, upload_to_r2};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use text::{chunk_text, clean_markdown, compute_hash};
use types::{ArticleFrontMatter, AudioIndex};

async fn process_file(
    file_path: PathBuf,
    force: bool,
    s3_client: Option<&aws_sdk_s3::Client>,
    r2_objects: &HashMap<String, u64>,
    index_data_arc: Arc<tokio::sync::Mutex<AudioIndex>>,
    progress: &ProgressManager,
    r2_bucket: &str,
) -> Result<()> {
    let filename = file_path.file_stem().unwrap().to_string_lossy().to_string();
    let audio_dir = Path::new(AUDIO_DIR);
    let audio_path = audio_dir.join(&filename).with_extension("mp3");
    let vtt_path = audio_dir.join(&filename).with_extension("vtt");
    let mp3_key = format!("{}.mp3", filename);
    let vtt_key = format!("{}.vtt", filename);

    let content = tokio::fs::read_to_string(&file_path).await?;
    
    // CPU-bound task: parsing and cleaning markdown
    let (text_to_read, content_hash) = tokio::task::spawn_blocking(move || {
        let matter = Matter::<YAML>::new();
        let parsed = matter.parse(&content);
        
        let title = parsed
            .data
            .as_ref()
            .and_then(|data| data.deserialize::<ArticleFrontMatter>().ok())
            .and_then(|fm| fm.title)
            .unwrap_or_default();

        let text = format!("{}. \n\n{}", title, clean_markdown(&parsed.content));
        let hash = compute_hash(&text);
        (text, hash)
    }).await?;

    let exists_on_r2 = r2_objects.contains_key(&mp3_key) && r2_objects.contains_key(&vtt_key);
    let exists_locally = audio_path.exists() && vtt_path.exists();

    // Check hash with a quick lock
    {
        let index_data = index_data_arc.lock().await;
        let previous_hash = index_data.get(&filename).map(|i| i.hash.clone());
        let has_changed = previous_hash.as_deref() != Some(&content_hash);

        if !force && !has_changed && (exists_on_r2 || (s3_client.is_none() && exists_locally)) {
            progress.increment_skipped();
            progress.log_skipped(&filename);
            return Ok(());
        }
    }

    let start_time = std::time::Instant::now();

    let tts = EdgeTtsClient::new()?;
    let speech_config = SpeakOptions {
        voice: VOICE.into(),
        boundary: Boundary::Word,
        ..SpeakOptions::default()
    };

    let chunks = chunk_text(&text_to_read, 2000);
    let mut all_subtitles = Vec::new();
    let mut current_time_offset = 0;

    let steps = chunks.len() as u64 + if s3_client.is_some() { 2 } else { 0 };
    let article_bar = progress.create_article_bar(&filename, steps);

    if chunks.len() == 1 {
        article_bar.set_message("generating TTS");
        
        let mut attempts = 0;
        let (audio_bytes, subtitles) = loop {
            match audio::synthesize_audio(&tts, &speech_config, &chunks[0], 0).await {
                Ok(res) => break res,
                Err(e) => {
                    attempts += 1;
                    if attempts >= MAX_RETRIES {
                        anyhow::bail!("TTS failed after {} attempts: {}", MAX_RETRIES, e);
                    }
                    tokio::time::sleep(tokio::time::Duration::from_millis(1000 * 2_u64.pow(attempts))).await;
                }
            }
        };

        all_subtitles = subtitles;
        tokio::fs::write(&audio_path, &audio_bytes).await?;
        article_bar.inc(1);
    } else {
        let mut final_audio = Vec::new();

        for (i, chunk) in chunks.iter().enumerate() {
            article_bar.set_message(format!("TTS segment {}/{}", i + 1, chunks.len()));

            let temp_path = audio_dir.join(format!("{}_part{}.mp3", filename, i));
            let mut attempts = 0;

            let (audio_bytes, mut subtitles) = loop {
                match audio::synthesize_audio(&tts, &speech_config, chunk, current_time_offset).await {
                    Ok(res) => break res,
                    Err(e) => {
                        attempts += 1;
                        if attempts >= MAX_RETRIES {
                            anyhow::bail!("TTS failed after {} attempts: {}", MAX_RETRIES, e);
                        }
                        tokio::time::sleep(tokio::time::Duration::from_millis(1000 * 2_u64.pow(attempts))).await;
                    }
                }
            };

            // Calculate duration using ffprobe (External process)
            // We write the temporary file just to let ffprobe read it. 
            // Improvement: could we get duration from the audio bytes directly?
            tokio::fs::write(&temp_path, &audio_bytes).await?;
            let duration_ms = (audio::get_audio_duration(temp_path.to_str().unwrap()).await * 1000.0) as u64;
            
            final_audio.extend_from_slice(&audio_bytes);
            all_subtitles.append(&mut subtitles);

            let _ = tokio::fs::remove_file(&temp_path).await;
            current_time_offset += duration_ms;
            article_bar.inc(1);
            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
        }

        tokio::fs::write(&audio_path, &final_audio).await?;
    }

    if !all_subtitles.is_empty() {
        let vtt_content = audio::json_to_vtt(&all_subtitles);
        tokio::fs::write(&vtt_path, vtt_content).await?;
    }

    if let Some(client) = s3_client {
        article_bar.set_message("uploading mp3");
        upload_to_r2(client, r2_bucket, audio_path.to_str().unwrap(), &mp3_key, "audio/mpeg").await?;
        article_bar.inc(1);

        article_bar.set_message("uploading vtt");
        upload_to_r2(client, r2_bucket, vtt_path.to_str().unwrap(), &vtt_key, "text/vtt").await?;
        article_bar.inc(1);
    }

    let final_size = tokio::fs::metadata(&audio_path).await.map(|m| m.len()).unwrap_or(0);
    
    // Final lock to update index
    {
        let mut index_data = index_data_arc.lock().await;
        index_data.insert(
            filename.clone(),
            types::AudioIndexItem {
                size: final_size,
                hash: content_hash,
            },
        );
    }

    if s3_client.is_some() {
        let _ = tokio::fs::remove_file(&audio_path).await;
        let _ = tokio::fs::remove_file(&vtt_path).await;
    }

    progress.increment_success(start_time.elapsed().as_millis() as u64);
    progress.log_success(&filename, &format!("Done in {}", format_duration(start_time.elapsed().as_millis() as u64)));
    progress.remove_article_bar(&article_bar);

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();
    let _ = rustls::crypto::ring::default_provider().install_default();

    let args: Vec<String> = std::env::args().collect();
    let force_regeneration = args.contains(&"--force".to_string()) || args.contains(&"-f".to_string());

    tokio::fs::create_dir_all(AUDIO_DIR).await?;

    if force_regeneration {
        let mut entries = tokio::fs::read_dir(AUDIO_DIR).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_file() {
                let _ = tokio::fs::remove_file(path).await;
            }
        }
    }

    let mut files = Vec::new();
    for entry in glob::glob(&format!("{}/*.md", NEWS_DIR))? {
        if let Ok(path) = entry {
            files.push(path);
        }
    }

    let index_path = Path::new("data/audio-index.json");
    let mut index_data: AudioIndex = HashMap::new();
    if index_path.exists() {
        if let Ok(content) = tokio::fs::read_to_string(index_path).await {
            if let Ok(parsed) = serde_json::from_str(&content) {
                index_data = parsed;
            }
        }
    }

    let index_data_arc = Arc::new(tokio::sync::Mutex::new(index_data));

    let s3_client = get_s3_client().await;
    let mut r2_objects = HashMap::new();
    let r2_bucket = std::env::var("R2_BUCKET_NAME").unwrap_or_else(|_| "hnpaper-audio".to_string());

    println!("\n━━━ Audio Generation — {} article(s){} ━━━\n", files.len(), if force_regeneration { " · forced mode" } else { "" });

    if let Some(ref client) = s3_client {
        println!("ℹ Connecting to Cloudflare R2...");
        if let Ok(objects) = list_r2_objects(client, &r2_bucket).await {
            r2_objects = objects;
            println!("ℹ Found {} objects in bucket.\n", r2_objects.len());
        } else {
            println!("⚠ Failed to list objects in bucket '{}'.\n", r2_bucket);
        }
    } else {
        println!("⚠ Missing R2 credentials. Falling back to local audio generation.\n");
    }

    let progress_manager = Arc::new(ProgressManager::new(files.len()));
    let concurrency_limit = if s3_client.is_some() { CONCURRENCY_LIMIT_TTS } else { CONCURRENCY_LIMIT_LOCAL };

    let r2_objects_arc = Arc::new(r2_objects);
    let failed_articles_arc = Arc::new(tokio::sync::Mutex::new(Vec::new()));

    stream::iter(files)
        .for_each_concurrent(concurrency_limit, |file_path| {
            let s3_client_ref = s3_client.as_ref();
            let r2_objects_ref = Arc::clone(&r2_objects_arc);
            let index_data_clone = Arc::clone(&index_data_arc);
            let progress_clone = Arc::clone(&progress_manager);
            let failed_clone = Arc::clone(&failed_articles_arc);
            let r2_bucket_ref = r2_bucket.clone();
            let filename = file_path.file_stem().unwrap().to_string_lossy().to_string();

            async move {
                if let Err(e) = process_file(
                    file_path, // Transfer ownership here, avoiding a clone inside the closure
                    force_regeneration,
                    s3_client_ref,
                    &r2_objects_ref,
                    index_data_clone,
                    &progress_clone,
                    &r2_bucket_ref,
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

    let final_index_data = index_data_arc.lock().await;
    let json = serde_json::to_string_pretty(&*final_index_data)?;
    tokio::fs::write(index_path, json).await?;

    progress_manager.print_summary();

    let failed_articles = failed_articles_arc.lock().await;
    if !failed_articles.is_empty() {
        println!("\nFailed Articles:");
        for (filename, err) in failed_articles.iter() {
            println!("  ✘ {}: {}", filename, err);
        }
    }

    Ok(())
}
