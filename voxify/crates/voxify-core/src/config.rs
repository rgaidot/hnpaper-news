use serde::Deserialize;
use std::sync::OnceLock;

#[derive(Debug, Deserialize, Clone)]
pub struct VoxifyConfig {
    pub voice: String,
    pub concurrency_limit_local: usize,
    pub concurrency_limit_tts: usize,
    pub max_retries: u32,
}

impl Default for VoxifyConfig {
    fn default() -> Self {
        Self {
            voice: "fr-FR-VivienneMultilingualNeural".to_string(),
            concurrency_limit_local: 30,
            concurrency_limit_tts: 10,
            max_retries: 4,
        }
    }
}

static CONFIG: OnceLock<VoxifyConfig> = OnceLock::new();

pub fn get_config() -> &'static VoxifyConfig {
    CONFIG.get_or_init(|| {
        let settings = config::Config::builder()
            // Optional: load from a file
            .add_source(config::File::with_name("voxify").required(false))
            // Override with environment variables (e.g., VOXIFY_VOICE)
            .add_source(config::Environment::with_prefix("VOXIFY"))
            .build()
            .unwrap_or_else(|_| config::Config::builder().build().unwrap());

        settings.try_deserialize::<VoxifyConfig>().unwrap_or_default()
    })
}
