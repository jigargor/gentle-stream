import { stripInlineHtmlToPlainText } from "@gentle-stream/feed-engine";

/** Shared RSS narrative normalization and merge rules (ingest + maintenance scripts). */

export const RSS_SOURCE_FETCH_MIN_CHARS = 320;

function stripInlineChromePhrases(line: string): string {
  return line
    .replace(/\b(hide|show|toggle)\s+caption\b/gi, " ")
    .replace(/\b(image\s+credit|photo\s+credit)\s*:\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isLikelyCreditLine(line: string): boolean {
  if (!line) return false;
  const lower = line.toLowerCase();
  if (
    /\b(for\s+(npr|ap|reuters|getty(\s+images)?|associated\s+press))\b/i.test(
      line
    )
  ) {
    const wordCount = line.split(/\s+/).filter(Boolean).length;
    if (wordCount <= 9) return true;
  }
  if (/^(photo|image)\s+by\s+/i.test(line)) return true;
  if (/^[a-z][a-z'`.-]+(?:\s+[a-z][a-z'`.-]+){1,3}\s+for\s+[a-z]/i.test(lower))
    return true;
  return false;
}

function splitRunOnParagraph(paragraph: string): string[] {
  const text = paragraph.trim();
  if (!text) return [];
  if (text.length < 280) return [text];

  const sentenceChunks = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“‘'])/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentenceChunks.length < 3) return [text];

  const grouped: string[] = [];
  let buffer = "";
  for (const sentence of sentenceChunks) {
    const next = buffer ? `${buffer} ${sentence}` : sentence;
    if (next.length < 260) {
      buffer = next;
      continue;
    }
    grouped.push(next.trim());
    buffer = "";
  }
  if (buffer) grouped.push(buffer.trim());
  return grouped.length > 0 ? grouped : [text];
}

export function normalizeRssNarrativeText(value: string): string {
  const blockedLine =
    /^(share|details|keep exploring|discover more topics|image credit:|editor|contact|related terms|hide caption|show caption|toggle caption|image article|read more|view more)$/i;
  const cleaned = stripInlineHtmlToPlainText(value)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\t+/g, " ")
    .replace(/\s+\|\s+/g, "\n")
    .split("\n")
    .map((line) => stripInlineChromePhrases(line))
    .filter((line) => line.length > 0)
    .filter((line) => !blockedLine.test(line))
    .filter((line) => !isLikelyCreditLine(line))
    .filter(
      (line) => !/^\d+\s+min\s+read\b/i.test(line)
    )
    .filter((line) => !/^https?:\/\/\S+$/i.test(line))
    .filter((line) => !/^[-•]{1,2}\s*$/.test(line))
    .flatMap((line) => splitRunOnParagraph(line))
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned;
}

export function chooseRssNarrativeContent(input: {
  summary: string;
  bodyFromFeed: string;
  bodyFromSource: string;
}): string {
  const rssContent = input.bodyFromFeed || input.summary;
  if (!input.bodyFromSource) return rssContent;
  if (input.bodyFromSource.length >= RSS_SOURCE_FETCH_MIN_CHARS) return input.bodyFromSource;
  if (!rssContent || input.bodyFromSource.length > rssContent.length) return input.bodyFromSource;
  return rssContent;
}
