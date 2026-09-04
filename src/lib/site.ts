/**
 * Site-wide facts that aren't big enough to warrant a content collection.
 * This and `src/content/*.json` are the only places content lives.
 */

export const profile = {
  name: 'Emmanuel Moundhala',
  shortName: 'Manny',
  title: 'Software Engineering Student',
  tagline: 'GCP, APIs, and interfaces people actually enjoy using.',
  blurb:
    'Computer Software Engineering student at Messiah University. Two summers at Katapult Engineering building cloud infrastructure and client-facing tools for utility companies.',
  location: 'Mechanicsburg, PA',
  email: 'emmanuelmoundhala@gmail.com',
  phone: '717-962-0172',
  resume: '/files/Manny_Resume.pdf',
  avatar: '/images/manny.jpg',
  sunTexture: '/images/manny.png',
  links: {
    github: 'https://github.com/Arcullius',
    linkedin: 'https://www.linkedin.com/in/emmanuel-moundhala/',
  },
} as const;

export const education = {
  school: 'Messiah University',
  degree: 'B.S. Computer Software Engineering',
  location: 'Mechanicsburg, PA',
  start: '2024-08',
  end: '2027-05',
} as const;

export const about = {
  bio: [
    "Originally from Burkina Faso, I moved to the United States when I was six. That move is most of the reason I care about technology that reaches people who usually get built around rather than built for.",
    'These days that looks like backend and infrastructure work — provisioning cloud environments, wiring up APIs, and reviewing enough pull requests to have opinions about them. I like the parts of engineering where reliability and interface design meet.',
  ],
  interests: [
    'Soccer',
    'Music Production',
    'Fitness',
    'Fluent in French',
    'Web Development',
    'Family & Friends',
  ],
  goals: [
    'Go deeper on systems and distributed infrastructure',
    'Build immersive, genuinely accessible web experiences',
    'Sharpen problem solving and technical communication',
    'Contribute to open-source projects',
  ],
} as const;

/** The five planets. Order here is orbit order, innermost first. */
export const sections = [
  {
    id: 'about',
    label: 'About',
    planetLabel: 'About Me',
    color: '#FF6B6B',
    orbitRadius: 9,
    /** Relative orbital period. Larger = slower. */
    period: 34,
    size: 1.15,
    tilt: 0.14,
    type: 'rocky',
    hasRing: false,
  },
  {
    id: 'projects',
    label: 'Projects',
    planetLabel: 'Projects',
    color: '#45B7D1',
    orbitRadius: 13,
    period: 52,
    size: 1.45,
    tilt: -0.08,
    type: 'ocean',
    hasRing: false,
  },
  {
    id: 'experience',
    label: 'Experience',
    planetLabel: 'Experience',
    color: '#4ECDC4',
    orbitRadius: 17.5,
    period: 74,
    size: 1.9,
    tilt: 0.2,
    type: 'gas',
    hasRing: true,
  },
  {
    id: 'skills',
    label: 'Skills',
    planetLabel: 'Skills',
    color: '#96CEB4',
    orbitRadius: 22,
    period: 96,
    size: 1.35,
    tilt: -0.16,
    type: 'rocky',
    hasRing: false,
  },
  {
    id: 'contact',
    label: 'Contact',
    planetLabel: 'Contact',
    color: '#FFD98E',
    orbitRadius: 26.5,
    period: 122,
    size: 1.1,
    tilt: 0.1,
    type: 'icy',
    hasRing: false,
  },
] as const;

export type SectionId = (typeof sections)[number]['id'];

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "2026-05" -> "May 2026". Passes "present" through untouched. */
export function formatMonth(value: string): string {
  if (value === 'present') return 'Present';
  const [year, month] = value.split('-');
  const index = Number(month) - 1;
  return `${MONTHS[index] ?? month} ${year}`;
}

export function formatRange(start: string, end: string): string {
  return `${formatMonth(start)} — ${formatMonth(end)}`;
}

/** Prefixes a public-asset path with Astro's configured base path. */
export function asset(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Headline phrases. Trimmed from the original 120-entry list to a set that
 * actually earns its place — identity lines interleaved with facts.
 */
export const phrases = [
  'The Moundhalaverse',
  'Software engineer in progress',
  'Welcome, traveler',
  'Every star you see is in the past',
  'Built with light and stubbornness',
  'Light takes 8 minutes to reach Earth',
  'The Moundhalaverse awaits',
  'Your atoms were once stardust',
  'Ship it, then make it better',
  'Space has a temperature: -455°F',
  'Explore my universe',
  'Neutron stars spin 600 times a second',
  'From Burkina Faso to Pennsylvania',
  'Atoms never actually touch',
  'The Moundhalaverse expands',
  'Gravity bends light like a lens',
  'Five planets, one résumé',
  'A spoonful of neutron star weighs a billion tons',
  'Still compiling',
  'Most of the universe is dark energy',
] as const;
