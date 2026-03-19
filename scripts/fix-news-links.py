import csv
import glob
import re
import os

def fix_links():
    csv_path = "hnpaper-news-articles.csv"
    if not os.path.exists(csv_path):
        print(f"Erreur : Le fichier {csv_path} est introuvable.")
        return

    csv_data_by_id = {}
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            row_id_match = re.search(r"item\?id=(\d+)", row.get("url_hn", ""))
            if row_id_match:
                csv_data_by_id[row_id_match.group(1)] = row

    modified_count = 0

    for md_file in glob.glob("data/news/*.md"):
        with open(md_file, "r", encoding="utf-8") as f:
            original_content = f.read()
        
        match_fm = re.match(r"^---\n.*?\n---\n", original_content, re.DOTALL)
        if not match_fm:
            continue
        
        frontmatter = match_fm.group(0)
        body = original_content[len(frontmatter):]
        
        chunks = re.split(r"\n\s*---\s*\n", body)
        new_chunks = []
        changed_any = False
        
        for chunk in chunks:
            matched_row = None
            
            # Extract ID from the chunk
            id_match = re.search(r"item\?id=(\d+)", chunk)
            if id_match:
                chunk_id = id_match.group(1)
                matched_row = csv_data_by_id.get(chunk_id)
            
            if matched_row:
                url_hn = matched_row["url_hn"]
                url_source = matched_row["url_source"]
                
                if url_source.startswith("item?id="):
                    url_source = "https://news.ycombinator.com/" + url_source
                
                new_chunk = re.sub(
                    r"- (?:\*\*)?Discussion HN(?:\*\*)?\s*:\s*\[([^\]]*)\]\([^\)]*\)", 
                    f"- **Discussion HN** : [\\1]({url_hn})", 
                    chunk,
                    count=1
                )
                new_chunk = re.sub(
                    r"- (?:\*\*)?Article source(?:\*\*)?\s*:\s*\[([^\]]*)\]\([^\)]*\)", 
                    f"- **Article source** : [\\1]({url_source})", 
                    new_chunk,
                    count=1
                )
                
                if new_chunk != chunk:
                    chunk = new_chunk
                    changed_any = True
            
            new_chunks.append(chunk)
            
        if changed_any:
            new_body = "\n\n---\n\n".join(new_chunks)
            if original_content.endswith("\n") and not new_body.endswith("\n"):
                new_body += "\n"
            new_content = frontmatter + new_body
            with open(md_file, "w", encoding="utf-8") as f:
                f.write(new_content)
            modified_count += 1

    print(f"Terminé. {modified_count} fichiers mis à jour.")

if __name__ == "__main__":
    fix_links()
