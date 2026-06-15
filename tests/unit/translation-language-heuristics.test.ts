import { describe, expect, it } from "vitest";
import { detectLikelyNonEnglishText } from "@/lib/translation/languageHeuristics";

describe("detectLikelyNonEnglishText", () => {
  it("flags Spanish text and reports ES source language", () => {
    const sample =
      "Los astronautas de Artemis II tienen previsto completar su sobrevuelo lunar y regresar a la Tierra durante esta semana con apoyo internacional.";
    const result = detectLikelyNonEnglishText(sample);
    expect(result.likelyNonEnglish).toBe(true);
    expect(result.guessedSourceLanguage).toBe("ES");
  });

  it("flags non-English text beyond Spanish heuristics", () => {
    const sample =
      "Les bénévoles ont organisé une collecte alimentaire dans le quartier et plusieurs familles ont reçu de l'aide immédiate ce week-end.";
    const result = detectLikelyNonEnglishText(sample);
    expect(result.likelyNonEnglish).toBe(true);
    expect(result.guessedSourceLanguage).not.toBeNull();
  });

  it("does not flag clear English text", () => {
    const sample =
      "Local volunteers organized a food drive and delivered supplies to dozens of families in the neighborhood.";
    const result = detectLikelyNonEnglishText(sample);
    expect(result.likelyNonEnglish).toBe(false);
    expect(result.guessedSourceLanguage).toBeNull();
  });
});
