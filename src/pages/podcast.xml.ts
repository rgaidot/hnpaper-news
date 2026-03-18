import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { marked } from 'marked';
import { formatFrenchDateShort } from '../utils/formatDate';
import { getAudioUrl, hasAudio, getAudioSize } from '../utils/audio';
import { sortNewsByDateDesc } from '../utils/news';

export const GET = async (context) => {
  const news = await getCollection('news');
  const sortedNews = sortNewsByDateDesc(news);

  const items = await Promise.all(sortedNews.map(async (post) => {
    if (!hasAudio(post.slug)) {
      return null;
    }

    const audioUrl = getAudioUrl(context.site, post.slug);
    const audioSize = getAudioSize(post.slug);
    const contentHtml = await marked.parse(post.body);

    return {
      title: post.data.title,
      pubDate: post.data.date,
      description: `Actualités du ${formatFrenchDateShort(post.data.date)}`,
      link: `/news/${post.slug}/`,
      enclosure: {
        url: audioUrl,
        length: audioSize,
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
