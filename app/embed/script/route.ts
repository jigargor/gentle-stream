import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function script(origin: string): string {
  return `(function () {
  if (window.__gentleStreamEmbedLoaded) return;
  window.__gentleStreamEmbedLoaded = true;

  function enhance(node) {
    if (!node || node.getAttribute("data-gs-ready") === "1") return;
    var articleId = node.getAttribute("data-article-id");
    if (!articleId) return;

    var iframe = document.createElement("iframe");
    iframe.src = "${origin}/embed/article/" + encodeURIComponent(articleId);
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer-when-downgrade";
    iframe.style.width = "100%";
    iframe.style.border = "0";
    iframe.style.display = "block";
    iframe.style.minHeight = "520px";
    iframe.title = "Gentle Stream Article Embed";

    node.innerHTML = "";
    node.appendChild(iframe);
    node.setAttribute("data-gs-ready", "1");
  }

  function scan() {
    var nodes = document.querySelectorAll("blockquote.gentle-stream-embed[data-article-id]");
    for (var i = 0; i < nodes.length; i++) enhance(nodes[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }
})();`;
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  return new Response(script(origin), {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

