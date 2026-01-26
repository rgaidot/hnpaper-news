import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import * as url from 'node:url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const contentDirPath = path.resolve(__dirname, '../src/content/news');

async function migrateUrls() {
  const files = await fs.readdir(contentDirPath);

  for (const file of files) {
    if (path.extname(file) === '.md') {
      const filePath = path.join(contentDirPath, file);
      let content = await fs.readFile(filePath, 'utf8');

      const frontmatterRegex = /^(?:---\s*\n)(.*?)(?:\n---\s*\n)/s;
      const match = content.match(frontmatterRegex);

      let body = content;
      let data = {};

      if (match) {
        const frontmatterStr = match[1];
        body = content.substring(match[0].length);
        try {
          data = yaml.load(frontmatterStr);
        } catch (e) {
          console.error(`Error parsing YAML in ${file}:`, e);
          continue;
        }
      } else {
        console.warn(`No frontmatter found in ${file}. Attempting to parse body only.`);
      }
      
      let newBody = body;
      let modified = false;

      // Extract Discussion HN URL
      const discussionRegex = /- \*\*Discussion HN\*\* : \[(.*?)\]\((https?:\/\/[^\s\)]*?)\)/; // Updated regex to be less greedy
      let discussionMatch = newBody.match(discussionRegex);
      if (discussionMatch && discussionMatch[2] && discussionMatch[2] !== '' && !data.discussionUrl) {
        data.discussionUrl = discussionMatch[2];
        newBody = newBody.replace(discussionMatch[0], '').trim();
        modified = true;
      } else if (newBody.includes('- **Discussion HN** : [Lire la discussion]()') && !data.discussionUrl) {
        // Case where the URL is empty but the line exists
        newBody = newBody.replace('- **Discussion HN** : [Lire la discussion]()', '').trim();
        modified = true;
      }

      // Extract Article source URL
      const sourceRegex = /- \*\*Article source\*\* : \[(.*?)\]\((https?:\/\/[^\s\)]*?)\)/; // Updated regex to be less greedy
      let sourceMatch = newBody.match(sourceRegex);
      if (sourceMatch && sourceMatch[2] && sourceMatch[2] !== '' && !data.sourceUrl) {
        data.sourceUrl = sourceMatch[2];
        newBody = newBody.replace(sourceMatch[0], '').trim();
        modified = true;
      } else if (newBody.includes('- **Article source** : []()') && !data.sourceUrl) {
           // Case where the URL is empty but the line exists
          newBody = newBody.replace('- **Article source** : []()', '').trim();
          modified = true;
      } else if (newBody.includes('L\'article source n\'a pas pu être chargé.') && !data.sourceUrl) {
        // Specific text for unavailable source, remove it
        newBody = newBody.replace('L\'article source n\'a pas pu être chargé.', '').trim();
        modified = true;
      }
      
      // Clean up multiple hyphens that might appear after removing lines
      newBody = newBody.replace(/\n-{3,}\n/g, '\n').trim();

      if (modified) {
        console.log(`Migrating ${file}...`);
        const newFrontmatterStr = yaml.dump(data);
        const newContent = `---\n${newFrontmatterStr}---\n
${newBody}`;
        await fs.writeFile(filePath, newContent, 'utf8');
      }
    }
  }
  console.log('Migration complete!');
}

migrateUrls().catch(console.error);