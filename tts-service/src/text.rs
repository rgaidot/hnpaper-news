use md5::{Md5, Digest};
use regex::{Regex, RegexBuilder};
use std::sync::OnceLock;

pub fn compute_hash(content: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(content.as_bytes());
    let result = hasher.finalize();
    hex::encode(result)
}

struct MarkdownRegexes {
    quotes_double: Regex,
    quotes_single: Regex,
    comments: Regex,
    code_blocks: Regex,
    inline_code: Regex,
    images: Regex,
    links_with_bracket: Regex,
    links_standard: Regex,
    urls: Regex,
    html_tags: Regex,
    hn_source: Regex,
    headings: Regex,
    list_items: Regex,
    hr: Regex,
    bold: Regex,
    italic: Regex,
    underline: Regex,
    italic_underscore: Regex,
    multiple_newlines: Regex,
    unwanted_chars: Regex,
}

static REGEXES: OnceLock<MarkdownRegexes> = OnceLock::new();

fn get_regexes() -> &'static MarkdownRegexes {
    REGEXES.get_or_init(|| MarkdownRegexes {
        quotes_double: Regex::new(r#"[\u201C\u201D\u00AB\u00BB]"#).unwrap(),
        quotes_single: Regex::new(r#"[\u2018\u2019]"#).unwrap(),
        comments: RegexBuilder::new(r#"<!--.*?-->"#).dot_matches_new_line(true).build().unwrap(),
        code_blocks: RegexBuilder::new(r#"```.*?```"#).dot_matches_new_line(true).build().unwrap(),
        inline_code: Regex::new(r#"`([^`]+)`"#).unwrap(),
        images: Regex::new(r#"!\[([^\]]*)\]\([^)]+\)"#).unwrap(),
        links_with_bracket: Regex::new(r#"\{([^\}]+)\}\[[^\]]+\]\([^)]+\)"#).unwrap(),
        links_standard: Regex::new(r#"\[([^\]]+)\]\([^\)]+\)"#).unwrap(),
        urls: Regex::new(r#"(https?:\/\/[^\s]+)"#).unwrap(),
        html_tags: Regex::new(r#"<[^>]+>"#).unwrap(),
        hn_source: RegexBuilder::new(r#"^[ \t]*[-*+]\s*[\*_]*(Discussion HN|Article source)[\*_]*.*$"#).multi_line(true).build().unwrap(),
        headings: RegexBuilder::new(r#"^#+\s+"#).multi_line(true).build().unwrap(),
        list_items: RegexBuilder::new(r#"^[-*+]\s+"#).multi_line(true).build().unwrap(),
        hr: RegexBuilder::new(r#"^---$"#).multi_line(true).build().unwrap(),
        bold: Regex::new(r#"\*\*([^*]+)\*\*"#).unwrap(),
        italic: Regex::new(r#"\*([^*]+)\*"#).unwrap(),
        underline: Regex::new(r#"__([^_]+)__"#).unwrap(),
        italic_underscore: Regex::new(r#"_([^_]+)_"#).unwrap(),
        multiple_newlines: Regex::new(r#"\n{3,}"#).unwrap(),
        unwanted_chars: Regex::new(r#"[^\p{L}\p{N}\p{P}\p{Z}\p{Pd}\n]"#).unwrap(),
    })
}

pub fn clean_markdown(markdown: &str) -> String {
    let mut text = markdown.to_string();
    let r = get_regexes();

    text = r.quotes_double.replace_all(&text, "").to_string();
    text = r.quotes_single.replace_all(&text, "'").to_string();
    text = r.comments.replace_all(&text, "").to_string();
    text = r.code_blocks.replace_all(&text, "").to_string();
    text = r.inline_code.replace_all(&text, "$1").to_string();
    text = r.images.replace_all(&text, "").to_string();
    text = r.links_with_bracket.replace_all(&text, "$1").to_string();
    text = r.links_standard.replace_all(&text, "$1").to_string();
    text = r.urls.replace_all(&text, "").to_string();
    text = r.html_tags.replace_all(&text, "").to_string();
    text = r.hn_source.replace_all(&text, "").to_string();
    text = r.headings.replace_all(&text, "").to_string();
    text = r.list_items.replace_all(&text, "").to_string();
    text = r.hr.replace_all(&text, "").to_string();
    text = r.bold.replace_all(&text, "$1").to_string();
    text = r.italic.replace_all(&text, "$1").to_string();
    text = r.underline.replace_all(&text, "$1").to_string();
    text = r.italic_underscore.replace_all(&text, "$1").to_string();
    text = r.multiple_newlines.replace_all(&text, "\n\n").to_string();
    text = r.unwanted_chars.replace_all(&text, " ").to_string();

    text.trim().to_string()
}

pub fn chunk_text(text: &str, max_length: usize) -> Vec<String> {
    if text.len() <= max_length {
        return vec![text.to_string()];
    }

    let mut chunks = Vec::new();
    let mut current_chunk = String::new();
    let re = Regex::new(r#"[^.!?]+(?:[.!?]+(?:\s+|$))?"#).unwrap();

    for mat in re.find_iter(text) {
        let sentence = mat.as_str();
        if sentence.trim().is_empty() {
            continue;
        }

        if current_chunk.len() + sentence.len() > max_length {
            if !current_chunk.is_empty() {
                chunks.push(current_chunk.trim().to_string());
                current_chunk.clear();
            }

            if sentence.len() > max_length {
                let mut start = 0;
                while start < sentence.len() {
                    let end = std::cmp::min(start + max_length, sentence.len());
                    chunks.push(sentence[start..end].to_string());
                    start += max_length;
                }
            } else {
                current_chunk.push_str(sentence);
            }
        } else {
            current_chunk.push_str(sentence);
        }
    }

    if !current_chunk.is_empty() {
        chunks.push(current_chunk.trim().to_string());
    }

    chunks
}