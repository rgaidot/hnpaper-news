import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

export const GET = async (context) => {
  const news = await getCollection('news');
  const sortedNews = news.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  const items = await Promise.all(sortedNews.map(async (post) => {
    const audioFilename = `${post.slug}.mp3`;
    const audioPath = path.join(process.cwd(), 'public', 'audio', audioFilename);
    const audioUrl = `${context.site}audio/${audioFilename}`;

    if (!fs.existsSync(audioPath)) {
      return null;
    }

    const stats = fs.statSync(audioPath);
    const contentHtml = await marked.parse(post.body);

    return {
      title: post.data.title,
      pubDate: post.data.date,
      description: `Actualités du ${post.data.date.toLocaleDateString('fr-FR')}`,
      link: `/news/${post.slug}/`,
      enclosure: {
        url: audioUrl,
        length: stats.size,
        type: 'audio/mpeg',
      },
      content: contentHtml,
    };
  }));

  const validItems = items.filter((item) => item !== null);

  return rss({
    title: 'HNPaper News',
    description: 'Daily news digest from HNPaper',
    site: context.site,
    items: validItems,
    customData: `
      <language>fr-fr</language>
      <itunes:author>HNPaper Bot</itunes:author>
      <itunes:summary>Le résumé quotidien des meilleures actualités tech de Hacker News, traduit et synthétisé en français par HNPaper.</itunes:summary>
      <itunes:owner>
        <itunes:name>HNPaper Team</itunes:name>
        <itunes:email>hnpaper@gaidot.net</itunes:email>
      </itunes:owner>
      <itunes:image href="${context.site}pwa-512x512.png" />
      <itunes:category text="Technology">
        <itunes:category text="Tech News" />
      </itunes:category>
      <itunes:explicit>no</itunes:explicit>
    `,
    xmlns: {
      itunes: 'http://www.itunes.com/dtds/podcast-1.0.dtd',
      content: 'http://purl.org/rss/1.0/modules/content/',
    },
  });
}