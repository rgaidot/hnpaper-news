use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ArticleFrontMatter {
    pub title: Option<String>,
    pub date: Option<String>,
    pub author: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioIndexItem {
    pub size: u64,
    pub hash: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubtitleItem {
    pub part: String,
    pub start: u64,
    pub end: u64,
}

pub type AudioIndex = HashMap<String, AudioIndexItem>;
