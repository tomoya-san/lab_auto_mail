import { google } from "googleapis";
import { env } from "./env";

export function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    env.google.clientId(),
    env.google.clientSecret(),
  );
  client.setCredentials({ refresh_token: env.google.refreshToken() });
  return client;
}
