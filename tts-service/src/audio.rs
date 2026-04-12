use crate::types::SubtitleItem;
use edge_tts_rust::{EdgeTtsClient, SpeakOptions};

pub fn get_audio_duration_from_bytes(bytes: &[u8]) -> u64 {
    // We use mp3_duration for exact duration to avoid drift in subtitles (VTT).
    match mp3_duration::from_read(&mut std::io::Cursor::new(bytes)) {
        Ok(duration) => duration.as_millis() as u64,
        Err(_) => {
            // Fallback just in case
            (bytes.len() as f64 / 6000.0 * 1000.0) as u64
        }
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
    let mut previous_max_offset = 0;
    let mut cumulative_offset = current_time_offset;

    for boundary in res.boundaries {
        let current_offset = boundary.offset_ticks / 10000;
        let duration = boundary.duration_ticks / 10000;

        // If the offset goes backwards, it means the TTS engine started a new internal segment.
        if current_offset < previous_max_offset && previous_max_offset > 500 {
            cumulative_offset += previous_max_offset;
            previous_max_offset = 0;
        }

        let start_ms = current_offset + cumulative_offset;
        let end_ms = start_ms + duration;

        subtitles.push(SubtitleItem {
            part: boundary.text.clone(),
            start: start_ms,
            end: end_ms,
        });

        if current_offset + duration > previous_max_offset {
            previous_max_offset = current_offset + duration;
        }
    }

    Ok((res.audio, subtitles))
}
