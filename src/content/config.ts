import { defineCollection, z } from 'astro:content';

const news = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    author: z.string(),
    tags: z.array(z.string()).optional(),
    layout: z.string().optional(),
    discussionUrl: z.string().url().optional(), // Nouveau champ
    sourceUrl: z.string().url().optional(),     // Nouveau champ
  }),
});

export const collections = { news };