import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { shouldUseMultiColumnArticleBody } from "@/lib/articles/multiColumnBody";

interface ArticleBodyMarkdownProps {
  markdown: string;
  variant?: "feed" | "reader" | "admin";
  fontPreset?: "classic" | "literary";
  className?: string;
  /** When set, overrides auto heuristic (e.g. force single column in tight layouts). */
  multiColumn?: boolean;
  /** Used with body length to decide multi-column layout for long-form articles. */
  readingTimeSecs?: number | null;
}

function joinClassNames(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function ArticleBodyMarkdown({
  markdown,
  variant = "feed",
  fontPreset = "classic",
  className,
  multiColumn,
  readingTimeSecs,
}: ArticleBodyMarkdownProps) {
  const useMultiColumn =
    variant !== "admin" &&
    multiColumn !== false &&
    (multiColumn === true ||
      shouldUseMultiColumnArticleBody({
        markdownLength: markdown.length,
        readingTimeSecs,
      }));

  return (
    <div
      className={joinClassNames(
        "article-markdown",
        `article-markdown--${variant}`,
        `article-font--${fontPreset}`,
        useMultiColumn ? "article-markdown--multicolumn" : undefined,
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ ...props }) => (
            <a {...props} rel="noopener noreferrer nofollow" target="_blank" />
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
