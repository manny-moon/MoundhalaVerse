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
    github: 'https://github.com/manny-moon',
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
  // Keep an identity line first — this is what renders statically under
  // prefers-reduced-motion, where nothing ever types out.
  'The Moundhalaverse',

  // Identity
  'Software engineer in progress',
  'From Burkina Faso to Pennsylvania',
  'Built with light and stubbornness',
  'Ship it, then make it better',
  'Five planets, one résumé',
  'Fluent in French and JavaScript',
  'Still compiling',
  'Welcome, traveler',
  'Explore my universe',
  'The Moundhalaverse awaits',
  'The Moundhalaverse expands',

  // Light and time
  'Every star you see is in the past',
  'Light takes 8 minutes to reach Earth',
  'Gravity bends light like a lens',
  'Time runs faster at your head than your feet',
  'Sunlight took millennia to escape the Sun',
  'Nothing outruns light',
  'A light-year is a distance, not a duration',

  // Scale
  'A million Earths would fit inside the Sun',
  'The Sun is 99.8% of the solar system',
  'The observable universe: 93 billion light-years',
  'More stars than grains of sand on Earth',
  'Most of the universe is dark energy',
  'Andromeda reaches us in 4 billion years',
  'The universe is 13.8 billion years old',

  // Extremes
  'A teaspoon of neutron star weighs a billion tons',
  'Neutron stars spin up to 700 times a second',
  'The Sun sheds 4 million tons a second',
  'Space is colder than 450 below zero',
  'Sound has no medium to travel in space',
  'Black holes slowly evaporate',

  // The neighbourhood
  'A day on Venus outlasts its year',
  'Venus spins backwards',
  'Mars has blue sunsets',
  'Olympus Mons dwarfs Everest',
  'Saturn is less dense than water',
  "Jupiter's Great Red Spot is shrinking",
  'It likely rains diamonds on Neptune',
  'Neptune has winds over 1,000 mph',
  'Mercury keeps ice in its shadowed craters',
  'A year on Neptune is 165 of ours',
  'Pluto has not finished one orbit since 1930',
  'The Moon drifts 3.8 cm away each year',

  // Closer to home
  'Your atoms were once stardust',
  'Atoms never actually touch',
  'Tardigrades have survived open space',
  'Astronauts get taller in orbit',
  'The ISS laps the Earth every 90 minutes',
  'Voyager 1 has left the solar system',
  'Astronauts say space smells like seared steak',
] as const;
