import http from "node:http";
import { URL } from "node:url";

const port = Number(process.env.E2E_PORT ?? "3100");

function htmlPage(title, body) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="font-family: Georgia, serif; margin: 2rem; background: #ede9e1; color: #1a1a1a;">
    ${body}
  </body>
</html>`;
}

function loginPage() {
  return htmlPage(
    "Login | Gentle Stream",
    `
      <h1>Gentle Stream</h1>
      <p>Sign in to read your personalised feed.</p>
      <button type="button">Continue with Google</button>
      <button type="button">Continue with Facebook</button>
      <p>
        <a href="/privacy">Privacy</a>
        ·
        <a href="/terms">Terms</a>
        ·
        <a href="/data-deletion">Data deletion</a>
      </p>
      <label for="login-email">Email</label>
      <input id="login-email" type="email" placeholder="you@example.com" />
    `
  );
}

function termsPage() {
  return htmlPage(
    "Terms | Gentle Stream",
    `
      <h1>Terms of service</h1>
      <h2>1. Introduction</h2>
      <p>These Terms govern your access to and use of Gentle Stream.</p>
      <p>
        <a href="/privacy">Privacy</a>
        ·
        <a href="/terms">Terms</a>
        ·
        <a href="/data-deletion">Data deletion</a>
      </p>
    `
  );
}

function privacyPage() {
  return htmlPage(
    "Privacy | Gentle Stream",
    `
      <h1>Privacy policy</h1>
      <h2>Data we collect</h2>
      <p>How Gentle Stream collects and uses account and usage data.</p>
    `
  );
}

function dataDeletionPage() {
  return htmlPage(
    "Data deletion | Gentle Stream",
    `
      <h1>User data deletion</h1>
      <h2>How to request deletion</h2>
      <p>Send a data deletion request from your account email.</p>
    `
  );
}

function homePage() {
  return htmlPage(
    "Home | Gentle Stream",
    `
      <h1>Gentle Stream</h1>
      <p>Mock homepage for Playwright smoke checks.</p>
    `
  );
}

const server = http.createServer((request, response) => {
  if (!request.url) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Missing URL");
    return;
  }

  const { pathname } = new URL(request.url, `http://127.0.0.1:${port}`);

  if (pathname === "/login") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(loginPage());
    return;
  }

  if (pathname === "/terms") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(termsPage());
    return;
  }

  if (pathname === "/privacy") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(privacyPage());
    return;
  }

  if (pathname === "/data-deletion") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(dataDeletionPage());
    return;
  }

  if (pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(homePage());
    return;
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`E2E mock server listening on http://127.0.0.1:${port}\n`);
});
