// One-time helper to obtain a Google OAuth refresh token for the Calendar API.
//
// Usage (requires Node >= 20.6 for --env-file support):
//
//   node --env-file=.env.local scripts/get-refresh-token.mjs
//
// or via the npm script:
//
//   npm run get-refresh-token
//
// Prereqs:
//   - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env.local.
//   - The OAuth client should be of type "Desktop app" (the redirect URI below
//     works without pre-registration). If it's a "Web application" client, add
//     http://localhost:53682/oauth2callback to its authorized redirect URIs.
//   - Add yourself as a "Test user" on the OAuth consent screen if the app is
//     in "Testing" status, otherwise sign-in is blocked.

import http from "node:http";
import { URL } from "node:url";
import { google } from "googleapis";

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET. Did you run with --env-file=.env.local?",
  );
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

console.log("\n1. Open this URL in your browser:\n");
console.log(authUrl);
console.log(
  "\n2. Sign in as the Google account that has access to the calendar.",
);
console.log("3. Click Allow. You'll be redirected to localhost.\n");
console.log("(Waiting for the redirect…)\n");

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.url.startsWith("/oauth2callback")) {
    res.writeHead(404);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end(`OAuth error: ${error}`);
    console.error(`\nOAuth error: ${error}`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Missing code in redirect");
    return;
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      "<h1>Done.</h1><p>Check your terminal for the refresh token. You can close this tab.</p>",
    );

    if (!tokens.refresh_token) {
      console.error(
        "\nNo refresh_token returned. Google only issues one on first consent.",
      );
      console.error(
        "Revoke this app at https://myaccount.google.com/permissions and re-run.",
      );
      server.close();
      process.exit(1);
    }

    console.log("\nGot refresh token. Add this to .env.local and Vercel env:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Token exchange failed");
    console.error("\nToken exchange failed:", err);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Listening on ${REDIRECT_URI}\n`);
});
