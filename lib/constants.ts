export const CATEGORIES = [
  "Science & Discovery",
  "Community Heroes",
  "Arts & Culture",
  "Environment & Nature",
  "Health & Wellness",
  "Innovation & Tech",
  "Human Kindness",
  "Education",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_COLORS: Record<Category, string> = {
  "Science & Discovery": "#1a472a",
  "Community Heroes": "#7b2d00",
  "Arts & Culture": "#2c1654",
  "Environment & Nature": "#1a3a2a",
  "Health & Wellness": "#002b3d",
  "Innovation & Tech": "#1a1a3e",
  "Human Kindness": "#3d0000",
  Education: "#2d2400",
};

export const LAYOUT_COUNT = 3; // number of rotating grid layouts
