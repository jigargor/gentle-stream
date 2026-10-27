"use client";

import GameSlot from "@/components/games/GameSlot";
import WeatherCard from "@/components/feed/WeatherCard";
import SpotifyMoodTile from "@/components/feed/SpotifyMoodTile";
import TodoCard from "@/components/feed/TodoCard";
import GeneratedArtModuleCard from "@/components/feed/GeneratedArtModuleCard";
import NasaApodCard from "@/components/feed/NasaApodCard";
import IconFractalCard from "@/components/feed/IconFractalCard";
import NewsSection from "@/components/NewsSection";
import type {
  FeedSection,
  GeneratedImageModuleData,
  IconFractalModuleData,
  NasaModuleData,
  SpotifyMoodTileData,
  TodoModuleData,
  WeatherModuleData,
} from "@/lib/types";
import type { Category } from "@/lib/constants";

interface FeedSectionsListProps {
  sections: FeedSection[];
  activeCategory: Category | null;
  weatherUnitSystem: "metric" | "imperial";
}

export function FeedSectionsList({
  sections,
  activeCategory,
  weatherUnitSystem,
}: FeedSectionsListProps) {
  return (
    <>
      {sections.map((section) => {
        if (section.sectionType === "game") {
          return (
            <GameSlot
              key={`game-${section.index}`}
              gameType={section.gameType}
              difficulty={section.difficulty}
            />
          );
        }
        if (section.sectionType === "module" || section.sectionType === "filler") {
          if (section.moduleType === "spotify") {
            return (
              <SpotifyMoodTile
                key={`module-${section.index}-spotify`}
                data={section.data as SpotifyMoodTileData}
                reason={section.reason}
                feedCategory={activeCategory ?? undefined}
              />
            );
          }
          if (section.moduleType === "todo") {
            return (
              <TodoCard
                key={`module-${section.index}-todo`}
                data={section.data as TodoModuleData}
                reason={section.reason}
              />
            );
          }
          if (section.moduleType === "generated_art") {
            return (
              <GeneratedArtModuleCard
                key={`module-${section.index}-art`}
                data={section.data as GeneratedImageModuleData}
                reason={section.reason}
              />
            );
          }
          if (section.moduleType === "icon_fractal") {
            return (
              <IconFractalCard
                key={`module-${section.index}-icon-fractal`}
                data={section.data as IconFractalModuleData}
              />
            );
          }
          if (section.moduleType === "nasa") {
            return (
              <NasaApodCard
                key={`module-${section.index}-nasa`}
                data={section.data as NasaModuleData}
                reason={section.reason}
              />
            );
          }
          return (
            <WeatherCard
              key={`module-${section.index}-weather`}
              data={section.data as WeatherModuleData}
              reason={section.reason}
              weatherUnitSystem={weatherUnitSystem}
            />
          );
        }
        if (section.sectionType === "articles") {
          return (
            <NewsSection
              key={`news-${section.index}`}
              articles={section.articles}
              sectionIndex={section.index}
              layoutPlan={section.newspaperLayout}
            />
          );
        }
        return null;
      })}
    </>
  );
}
