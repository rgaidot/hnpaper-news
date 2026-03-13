import csv
import glob
import re
import os

def normalize(text):
    return re.sub(r"\s+", " ", text).strip()

def fix_links():
    csv_path = "hnpaper-news-articles.csv"
    if not os.path.exists(csv_path):
        print(f"Erreur : Le fichier {csv_path} est introuvable.")
        return

    csv_data = []
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            csv_data.append(row)

    modified_count = 0

    for md_file in glob.glob("src/content/news/*.md"):
        with open(md_file, "r", encoding="utf-8") as f:
            original_content = f.read()
        
        match_fm = re.match(r"^---
.*?
---
", original_content, re.DOTALL)
        if not match_fm:
            continue
        
        frontmatter = match_fm.group(0)
        body = original_content[len(frontmatter):]
        
        chunks = re.split(r"
\s*---\s*
", body)
        new_chunks = []
        changed_any = False
        
        for chunk in chunks:
            chunk_norm = normalize(chunk)
            matched_row = None
            
            for row in csv_data:
                csv_norm = normalize(row["text"])
                if len(csv_norm) > 40 and len(chunk_norm) > 40:
                    if csv_norm[:40] in chunk_norm or chunk_norm[:40] in csv_norm:
                        matched_row = row
                        break
            
            if matched_row:
                url_hn = matched_row["url_hn"]
                url_source = matched_row["url_source"]
                
                new_chunk = re.sub(
                    r"- (?:\*\*)?Discussion HN(?:\*\*)?\s*:\s*\[([^\]]*)\]\([^\)]*\)", 
                    f"- **Discussion HN** : [\1]({url_hn})", 
                    chunk,
                    count=1
                )
                new_chunk = re.sub(
                    r"- (?:\*\*)?Article source(?:\*\*)?\s*:\s*\[([^\]]*)\]\([^\)]*\)", 
                    f"- **Article source** : [\1]({url_source})", 
                    new_chunk,
                    count=1
                )
                
                if new_chunk != chunk:
                    chunk = new_chunk
                    changed_any = True
            
            new_chunks.append(chunk)
            
        if changed_any:
            new_body = "

---

".join(new_chunks)
            if original_content.endswith("
") and not new_body.endswith("
"):
                new_body += "
"
            new_content = frontmatter + new_body
            with open(md_file, "w", encoding="utf-8") as f:
                f.write(new_content)
            modified_count += 1

    print(f"Terminé. {modified_count} fichiers mis à jour.")

if __name__ == "__main__":
    fix_links()
