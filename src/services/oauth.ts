import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { generateCodeVerifier, generateState } from "arctic";
import { DateTime } from "luxon";
import { errAsync, ResultAsync } from "neverthrow";
import type { Container, HonoEnv, OAuthSetup, ServerApps } from "../types/index.ts";
import { type AppError, appError } from "../errors.ts";

const dateToISO = (date: Date | null | undefined): string | null =>
  date ? DateTime.fromJSDate(date).toISO() : null;

const getBaseUrl = (req: Request): string => {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
};

const mountOAuthRoutes = (
  app: Hono<HonoEnv>,
  pluginName: string,
  oauth: OAuthSetup,
  container: Container,
): void => {
  const { createClient, scopes, createAuthorizationURL } = oauth;
  const basePath = `/oauth/${pluginName}`;

  // User clicks Connect → /oauth/{name}/authorize
  // -> reads clientId/clientSecret from stored config
  // -> redirects to provider
  app.get(`${basePath}/authorize`, async (c) => {
    const config = await container.plugins.getConfig<{ clientId: string; clientSecret: string }>(
      pluginName,
    );

    if (config.isErr()) {
      return c.text("Plugin config error", 400);
    }

    if (!config.value) {
      return c.text("Configure clientId and clientSecret first", 400);
    }

    const { clientId, clientSecret } = config.value.config;
    if (!clientId || !clientSecret) {
      return c.text("Missing clientId or clientSecret", 400);
    }

    const redirectUri = `${container.config.PUBLIC_URL ?? getBaseUrl(c.req.raw)}${basePath}/callback`;
    const oauthClient = createClient(clientId, clientSecret, redirectUri);

    const state = generateState();
    const codeVerifier = generateCodeVerifier();

    setCookie(c, "oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: 600,
      path: "/",
    });
    setCookie(c, "oauth_verifier", codeVerifier, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: 600,
      path: "/",
    });

    const url = createAuthorizationURL
      ? createAuthorizationURL(oauthClient, state, codeVerifier, scopes)
      : oauthClient.createAuthorizationURL(state, codeVerifier, scopes);
    return c.redirect(url.toString());
  });

  // OAuth client callback → /oauth/{name}/callback
  // -> exchanges code for tokens
  // -> merges tokens into existing config, saves
  app.get(`${basePath}/callback`, async (c) => {
    const code = c.req.query("code");
    const stateParam = c.req.query("state");
    const storedState = getCookie(c, "oauth_state");
    const codeVerifier = getCookie(c, "oauth_verifier");

    deleteCookie(c, "oauth_state", { path: "/" });
    deleteCookie(c, "oauth_verifier", { path: "/" });

    if (!code || !stateParam || !storedState || !codeVerifier) {
      return c.text("Missing OAuth parameters", 400);
    }

    if (stateParam !== storedState) {
      return c.text("Invalid state parameter", 400);
    }

    const configResult = await container.plugins.getConfig<{
      clientId: string;
      clientSecret: string;
    }>(pluginName);

    if (configResult.isErr() || !configResult.value) {
      return c.text("Plugin config not found", 400);
    }

    const existingConfig = configResult.value.config;
    const { clientId, clientSecret } = existingConfig;

    const redirectUri = `${container.config.PUBLIC_URL ?? getBaseUrl(c.req.raw)}${basePath}/callback`;
    const oauthClient = createClient(clientId, clientSecret, redirectUri);

    try {
      const tokens = await oauthClient.validateAuthorizationCode(code, codeVerifier);

      let refreshToken: string | null = null;
      try {
        refreshToken = tokens.refreshToken();
      } catch {
        container.log.warn`No refresh token returned by provider`;
      }

      const updatedConfig = {
        ...existingConfig,
        accessToken: tokens.accessToken(),
        refreshToken,
        tokenExpiresAt: dateToISO(tokens.accessTokenExpiresAt()),
      };

      const saveResult = await container.plugins.setConfig(pluginName, updatedConfig);
      if (saveResult.isErr()) {
        container.log.error`Failed to save OAuth tokens: ${saveResult.error}`;
        return c.text("Failed to save tokens", 500);
      }

      container.log.info`OAuth connected for plugin ${pluginName}`;
      const adminBase = container.config.ADMIN_URL ?? '';
      return c.redirect(`${adminBase}/dashboard/plugins/${pluginName}?flash=connected`);
    } catch (e) {
      container.log.error`OAuth token exchange failed: ${e}`;
      return c.text("OAuth authorization failed", 400);
    }
  });
};

export const registerOAuthRoutes = (
  apps: ServerApps,
  pluginName: string,
  oauth: OAuthSetup,
  container: Container,
): void => {
  mountOAuthRoutes(apps.public, pluginName, oauth, container);
  mountOAuthRoutes(apps.admin, pluginName, oauth, container);
};

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
};

export const refreshPluginToken = (
  pluginName: string,
  oauth: OAuthSetup,
  container: Container,
): ResultAsync<OAuthTokens, AppError> => {
  const { createClient } = oauth;

  return container.plugins
    .getConfig<{
      clientId: string;
      clientSecret: string;
      refreshToken?: string;
    }>(pluginName)
    .andThen((configRow) => {
      if (!configRow) {
        return errAsync(appError("plugin", "[oauth] Plugin not configured"));
      }

      const config = configRow.config;
      if (!config.refreshToken) {
        return errAsync(appError("plugin", "[oauth] No refresh token available"));
      }

      const oauthClient = createClient(config.clientId, config.clientSecret, "");

      return ResultAsync.fromPromise(
        oauthClient.refreshAccessToken(config.refreshToken),
        (e) => appError("plugin", `[oauth] Token refresh failed: ${e}`),
      ).andThen((tokens) => {
        let refreshToken = config.refreshToken;
        try {
          refreshToken = tokens.refreshToken();
        } catch {
          // TODO
          // No new refresh token, keep existing one
        }

        const newTokens: OAuthTokens = {
          accessToken: tokens.accessToken(),
          refreshToken: refreshToken ?? null,
          tokenExpiresAt: dateToISO(tokens.accessTokenExpiresAt()),
        };

        return container.plugins
          .setConfig(pluginName, { ...config, ...newTokens })
          .map(() => newTokens);
      });
    });
};
