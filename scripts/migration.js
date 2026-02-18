const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../_legacy/src/content/news');
const destDir = path.join(__dirname, '../content/news');

if (!fs.existsSync(srcDir)) {
    console.error(`Source directory not found: ${srcDir}`);
    process.exit(1);
}

if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

fs.readdirSync(srcDir).forEach(file => {
    if (path.extname(file) === '.md') {
        const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
        const newContent = convertFrontmatter(content);
        fs.writeFileSync(path.join(destDir, file), newContent);
        console.log(`Migrated: ${file}`);
    }
});

// Create _index.md
const indexContent = `+++\ntitle = "News"\nsort_by = "date"\ntemplate = "news/section.html"\npage_template = "news/page.html"\npaginate_by = 10\n+++`;
fs.writeFileSync(path.join(destDir, '_index.md'), indexContent);
console.log('Created _index.md');

function convertFrontmatter(content) {
    const parts = content.split('---');
    if (parts.length < 3) return content;

    const frontmatter = parts[1];
    const body = parts.slice(2).join('---');

    let newFrontmatter = '+++\n';
    let title = '';
    let date = '';
    let author = '';
    let tags = '';

    frontmatter.split('\n').forEach(line => {
        line = line.trim();
        if (line.startsWith('title:')) {
            title = line.replace('title:', '').trim();
            newFrontmatter += `title = ${title}\n`;
        } else if (line.startsWith('date:')) {
            date = line.replace('date:', '').trim();
            // Quote date if not quoted
            if (!date.startsWith("'") && !date.startsWith('"')) {
                date = `"${date}"`;
            }
            newFrontmatter += `date = ${date}\n`;
        } else if (line.startsWith('author:')) {
            author = line.replace('author:', '').trim();
        } else if (line.startsWith('tags:')) {
            tags = line.replace('tags:', '').trim();
        }
    });

    if (tags) {
        newFrontmatter += '[taxonomies]\n';
        newFrontmatter += `tags = ${tags}\n`;
    }

    if (author) {
        newFrontmatter += '[extra]\n';
        newFrontmatter += `author = "${author}"\n`;
    }

    newFrontmatter += '+++\n';
    newFrontmatter += body;

    return newFrontmatter;
}
