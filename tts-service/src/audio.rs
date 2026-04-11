use crate::types::SubtitleItem;
use edge_tts_rust::{EdgeTtsClient, SpeakOptions};
use tokio::process::Command;

pub async fn get_audio_duration(file_path: &str) -> f64 {
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            file_path,
        ])
        .output()
        .await;

    match output {
        Ok(out) if out.status.success() => {
            let s = String::from_utf8_lossy(&out.stdout);
            s.trim().parse().unwrap_or(0.0)
        }
        _ => 0.0,
    }
}

pub fn format_time(ms: u64) -> String {
    let hours = ms / 3_600_000;
    let mins = (ms % 3_600_000) / 60_000;
    let secs = (ms % 60_000) / 1000;
    let millis = ms % 1000;
    format!("{:02}:{:02}:{:02}.{:03}", hours, mins, secs, millis)
}

pub fn json_to_vtt(subtitles: &[SubtitleItem]) -> String {
    let mut vtt = String::from("WEBVTT\n\n");
    for (index, sub) in subtitles.iter().enumerate() {
        vtt.push_str(&format!("{}\n", index + 1));
        vtt.push_str(&format!(
            "{} --> {}\n",
            format_time(sub.start),
            format_time(sub.end)
        ));
        vtt.push_str(&format!("{}\n\n", sub.part));
    }
    vtt
}

pub async fn synthesize_audio(
    tts: &EdgeTtsClient,
    options: &SpeakOptions,
    text: &str,
    current_time_offset: u64,
) -> anyhow::Result<(Vec<u8>, Vec<SubtitleItem>)> {
    let timeout_duration = std::time::Duration::from_secs(30);
    let res = tokio::time::timeout(timeout_duration, tts.synthesize(text, options.clone()))
        .await
        .map_err(|_| anyhow::anyhow!("TTS synthesis timed out after 30s"))??;

    let mut subtitles = Vec::new();
    for boundary in res.boundaries {
        let start_ms = boundary.offset_ticks / 10000 + current_time_offset;
        let end_ms = start_ms + (boundary.duration_ticks / 10000);

        subtitles.push(SubtitleItem {
            part: boundary.text.clone(),
            start: start_ms,
            end: end_ms,
        });
    }

    Ok((res.audio, subtitles))
}
