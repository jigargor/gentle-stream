import type { Difficulty, RabbitHolePuzzle } from "@/lib/games/types";

interface RabbitHoleTemplate {
  topic: string;
  mission: string;
  starterArticle: string;
  links: Array<{
    title: string;
    href: string;
    blurb: string;
    lure: string;
  }>;
}

const RABBIT_HOLE_TEMPLATES: RabbitHoleTemplate[] = [
  {
    topic: "Lost Languages Quest",
    mission: "Follow obscure writing systems until you uncover three vanished scripts.",
    starterArticle: "https://en.wikipedia.org/wiki/Writing_system",
    links: [
      {
        title: "Linear A",
        href: "https://en.wikipedia.org/wiki/Linear_A",
        blurb: "Undeciphered symbols from Minoan Crete with open mysteries.",
        lure: "Unsolved code",
      },
      {
        title: "Rongorongo",
        href: "https://en.wikipedia.org/wiki/Rongorongo",
        blurb: "Easter Island glyph boards that may encode a lost text tradition.",
        lure: "Forbidden script",
      },
      {
        title: "Voynich Manuscript",
        href: "https://en.wikipedia.org/wiki/Voynich_manuscript",
        blurb: "Illustrated book with unknown language and persistent cryptographic obsession.",
        lure: "Cipher fever",
      },
      {
        title: "Proto-Sinaitic script",
        href: "https://en.wikipedia.org/wiki/Proto-Sinaitic_script",
        blurb: "One of the earliest alphabetic systems and ancestor debates galore.",
        lure: "Alphabet origin",
      },
    ],
  },
  {
    topic: "Deep Sea Creatures Dive",
    mission: "Descend through abyss creatures and find the strangest survival adaptations.",
    starterArticle: "https://en.wikipedia.org/wiki/Deep_sea_creature",
    links: [
      {
        title: "Anglerfish",
        href: "https://en.wikipedia.org/wiki/Anglerfish",
        blurb: "Bioluminescent predator with one of nature's wildest mating stories.",
        lure: "Glowing trap",
      },
      {
        title: "Vampire squid",
        href: "https://en.wikipedia.org/wiki/Vampire_squid",
        blurb: "A misnamed deep-sea oddity that feeds on marine snow.",
        lure: "Name mismatch",
      },
      {
        title: "Hydrothermal vent",
        href: "https://en.wikipedia.org/wiki/Hydrothermal_vent",
        blurb: "Chemosynthesis ecosystems thriving with no sunlight.",
        lure: "Alien ecosystem",
      },
      {
        title: "Giant isopod",
        href: "https://en.wikipedia.org/wiki/Giant_isopod",
        blurb: "Crustacean giantism from pressure, darkness, and slow metabolisms.",
        lure: "Abyss giant",
      },
    ],
  },
  {
    topic: "Secret History of Maps",
    mission: "Track cartographic myths and discover places that existed mostly on paper.",
    starterArticle: "https://en.wikipedia.org/wiki/History_of_cartography",
    links: [
      {
        title: "Phantom island",
        href: "https://en.wikipedia.org/wiki/Phantom_island",
        blurb: "Islands drawn for centuries despite never being found.",
        lure: "Map hallucination",
      },
      {
        title: "Piri Reis map",
        href: "https://en.wikipedia.org/wiki/Piri_Reis_map",
        blurb: "Ottoman chart with intense speculation and historical puzzle pieces.",
        lure: "Conspiracy bait",
      },
      {
        title: "Mercator projection",
        href: "https://en.wikipedia.org/wiki/Mercator_projection",
        blurb: "A practical sailing projection that distorted worldview scales.",
        lure: "Distortion shock",
      },
      {
        title: "Tabula Rogeriana",
        href: "https://en.wikipedia.org/wiki/Tabula_Rogeriana",
        blurb: "A medieval geographic masterpiece that challenged Eurocentric map norms.",
        lure: "Reversed world",
      },
    ],
  },
  {
    topic: "Odd Inventors Circuit",
    mission: "Jump from one forgotten invention to another and rank the weirdest patent.",
    starterArticle: "https://en.wikipedia.org/wiki/List_of_inventors",
    links: [
      {
        title: "Nikola Tesla",
        href: "https://en.wikipedia.org/wiki/Nikola_Tesla",
        blurb: "Legendary inventor with unfinished ideas and dramatic demonstrations.",
        lure: "Mad genius",
      },
      {
        title: "Automaton",
        href: "https://en.wikipedia.org/wiki/Automaton",
        blurb: "Mechanical illusions that predate modern robotics by centuries.",
        lure: "Proto robot",
      },
      {
        title: "Antikythera mechanism",
        href: "https://en.wikipedia.org/wiki/Antikythera_mechanism",
        blurb: "Ancient analog computing that still feels impossible for its era.",
        lure: "Ancient tech",
      },
      {
        title: "History of perpetual motion machines",
        href: "https://en.wikipedia.org/wiki/Perpetual_motion",
        blurb: "A catalog of impossible devices that keeps attracting true believers.",
        lure: "Impossible machine",
      },
    ],
  },
];

function hashStringToUint32(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickTemplate(difficulty: Difficulty, seed: string): RabbitHoleTemplate {
  const hashed = hashStringToUint32(`${difficulty}:${seed}`);
  return RABBIT_HOLE_TEMPLATES[hashed % RABBIT_HOLE_TEMPLATES.length]!;
}

export function generateRabbitHole(difficulty: Difficulty, seed: string): RabbitHolePuzzle {
  const template = pickTemplate(difficulty, seed);
  const depthOffset = difficulty === "easy" ? 1 : difficulty === "hard" ? 3 : 2;
  const links = template.links.map((link, index) => ({
    ...link,
    depth: depthOffset + index,
  }));

  return {
    topic: template.topic,
    mission: template.mission,
    starterArticle: template.starterArticle,
    links,
    difficulty,
    uniquenessSignature: `rabbit-hole:${difficulty}:${template.topic.toLowerCase().replace(/\s+/g, "-")}`,
  };
}
