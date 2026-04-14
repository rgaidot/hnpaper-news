use crate::text::{clean_markdown, chunk_text};

#[test]
fn test_clean_markdown_removes_html() {
    let input = "<p>Hello <b>World</b>!</p>";
    assert_eq!(clean_markdown(input), "Hello World!");
}

#[test]
fn test_clean_markdown_replaces_entities() {
    let input = "Fish &amp; Chips &quot;Special&quot;";
    // Note: our implementation replaces & with " et " and removes double quotes
    assert_eq!(clean_markdown(input), "Fish et Chips Special");
}

#[test]
fn test_clean_markdown_handles_hn_source() {
    let input = "Some content\n- Discussion HN: link\nMore content";
    let cleaned = clean_markdown(input);
    assert!(!cleaned.contains("Discussion HN"));
}

#[test]
fn test_chunk_text_basic() {
    let input = "Sentence one. Sentence two. Sentence three.";
    let chunks = chunk_text(input, 15);
    assert!(chunks.len() > 1);
    for chunk in &chunks {
        assert!(chunk.len() <= 15);
    }
}

#[test]
fn test_chunk_text_utf8() {
    let input = "L'été est là. 🦀 est cool.";
    let chunks = chunk_text(input, 10);
    assert!(!chunks.is_empty());
}
