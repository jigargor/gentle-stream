import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

interface ArticleBodyMarkdownProps {
  markdown: string;
  variant?: "feed" | "reader" | "admin";
  fontPreset?: "classic" | "literary";
  className?: string;
}

function joinClassNames(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function ArticleBodyMarkdown({
  markdown,
  variant = "feed",
  fontPreset = "classic",
  className,
}: ArticleBodyMarkdownProps) {
  return (
    <div
      className={joinClassNames(
        "article-markdown",
        `article-markdown--${variant}`,
        `article-font--${fontPreset}`,
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
