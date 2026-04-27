interface AnalystRequest {
  headline: string;
  body: string;
  requestNags: boolean;
}

interface AnalystCheckpoint {
  createdAt: string;
  metrics: {
    wordCount: number;
    sentenceCount: number;
    paragraphCount: number;
    avgSentenceWords: number;
    sectionPhase: "opening" | "middle" | "closing";
    repeatedTrigramCount: number;
  };
  notes: string[];
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function countSentences(text: string): number {
  const parts = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Math.max(1, parts.length);
}

function countParagraphs(text: string): number {
  const parts = text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Math.max(1, parts.length);
}

function phaseByLength(wordCount: number): "opening" | "middle" | "closing" {
  if (wordCount < 180) return "opening";
  if (wordCount < 900) return "middle";
  return "closing";
}

function repeatedTrigrams(wordList: string[]): number {
  const counts = new Map<string, number>();
  for (let i = 0; i < wordList.length - 2; i += 1) {
    const gram = `${wordList[i]} ${wordList[i + 1]} ${wordList[i + 2]}`;
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  let repeated = 0;
  for (const value of counts.values()) if (value >= 3) repeated += 1;
  return repeated;
}

function notesFromMetrics(input: {
  avgSentenceWords: number;
  repeatedTrigramCount: number;
  paragraphCount: number;
  phase: "opening" | "middle" | "closing";
}): string[] {
  const notes: string[] = [];
  if (input.phase === "opening") {
    notes.push("Opening phase detected. Consider clarifying the main claim in one concise sentence.");
  }
  if (input.avgSentenceWords > 28) {
    notes.push("Sentence length is high. Splitting one long sentence can improve flow.");
  }
  if (input.repeatedTrigramCount > 0) {
    notes.push("Repeated phrases detected. Vary wording to keep momentum.");
  }
  if (input.paragraphCount < 2) {
    notes.push("Large single block detected. Adding a paragraph break may improve readability.");
  }
  return notes.slice(0, 3);
}

self.onmessage = (event: MessageEvent<AnalystRequest>) => {
  const body = (event.data.body ?? "").trim();
  const wordList = words(body);
  const wordCount = wordList.length;
  const sentenceCount = countSentences(body);
  const paragraphCount = countParagraphs(body);
  const avgSentenceWords = Number((wordCount / Math.max(1, sentenceCount)).toFixed(2));
  const phase = phaseByLength(wordCount);
  const repeatedTrigramCount = repeatedTrigrams(wordList);
  const checkpoint: AnalystCheckpoint = {
    createdAt: new Date().toISOString(),
    metrics: {
      wordCount,
      sentenceCount,
      paragraphCount,
      avgSentenceWords,
      sectionPhase: phase,
      repeatedTrigramCount,
    },
    notes: event.data.requestNags
      ? notesFromMetrics({
          avgSentenceWords,
          repeatedTrigramCount,
          paragraphCount,
          phase,
        })
      : [],
  };
  self.postMessage(checkpoint);
};
