use thiserror::Error;

#[derive(Error, Debug)]
pub enum VoxifyError {
    #[error("TTS Synthesis timed out after {0} seconds")]
    Timeout(u64),

    #[error("TTS Synthesis failed: {0}")]
    TtsFailed(String),

    #[error("Audio encoding/decoding error: {0}")]
    AudioError(String),

    #[error("Markdown parsing error: {0}")]
    ParsingError(String),

    #[error("Internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

pub type Result<T> = std::result::Result<T, VoxifyError>;
