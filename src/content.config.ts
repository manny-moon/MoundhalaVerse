import { defineCollection } from 'astro:content';
import { z } from 'zod';
import { file } from 'astro/loaders';

/**
 * Every piece of resume content on this site is validated here.
 * If a field is missing or malformed, `astro check` fails the build rather
 * than shipping a half-rendered section.
 */

const monthString = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Expected a YYYY-MM date, e.g. "2026-05"');

const experience = defineCollection({
  loader: file('src/content/experience.json'),
  schema: z.object({
    company: z.string(),
    role: z.string(),
    location: z.string(),
    start: monthString,
    end: monthString.or(z.literal('present')),
    icon: z.string(),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    highlights: z.array(z.string()).min(1),
    stack: z.array(z.string()).default([]),
  }),
});

const projects = defineCollection({
  loader: file('src/content/projects.json'),
  schema: z.object({
    title: z.string(),
    year: z.number().int(),
    tagline: z.string(),
    description: z.string(),
    image: z.string(),
    tags: z.array(z.string()).default([]),
    links: z
      .array(
        z.object({
          label: z.string(),
          href: z.string(),
          kind: z.enum(['demo', 'code', 'writeup']),
        })
      )
      .default([]),
  }),
});

const skills = defineCollection({
  loader: file('src/content/skills.json'),
  schema: z.object({
    title: z.string(),
    icon: z.string(),
    items: z
      .array(
        z.object({
          name: z.string(),
          icon: z.string().optional(),
          note: z.string().optional(),
        })
      )
      .min(1),
  }),
});

export const collections = { experience, projects, skills };
