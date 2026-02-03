import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { generateCodeVerifier, generateState } from "arctic";
import { errAsync, ResultAsync } from "neverthrow";
import type { Container, HonoEnv, Plugin } from "../types/index.ts";
import { type AppError, appError } from "../errors.ts";

const getBaseUrl = (req: Request): string => {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
};

export const registerOAuthRoutes = <T>(
  app: Hono<HonoEnv>,
  plugin: Plugin<T>,
  container: Container,
): void => {
  if (!plugin.oauth) return;

  const { createProvider, scopes, createAuthorizationURL } = plugin.oauth;
  const basePath = `/oauth/${plugin.name}`;

  app.get(`${basePath}/authorize`, async (c) => {
    const config = await container.plugins.getConfig<{ clientId: string; clientSecret: string }>(
      plugin.name,
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

    const redirectUri = `${getBaseUrl(c.req.raw)}${basePath}/callback`;
    const provider = createProvider(clientId, clientSecret, redirectUri);

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
      ? createAuthorizationURL(provider, state, codeVerifier, scopes)
      : provider.createAuthorizationURL(state, codeVerifier, scopes);
    return c.redirect(url.toString());
  });

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
    }>(plugin.name);

    if (configResult.isErr() || !configResult.value) {
      return c.text("Plugin config not found", 400);
    }

    const existingConfig = configResult.value.config;
    const { clientId, clientSecret } = existingConfig;

    const redirectUri = `${getBaseUrl(c.req.raw)}${basePath}/callback`;
    const provider = createProvider(clientId, clientSecret, redirectUri);

    try {
      const tokens = await provider.validateAuthorizationCode(code, codeVerifier);

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
        tokenExpiresAt: tokens.accessTokenExpiresAt()?.toISOString(),
      };

      const saveResult = await container.plugins.setConfig(plugin.name, updatedConfig);
      if (saveResult.isErr()) {
        container.log.error`Failed to save OAuth tokens: ${saveResult.error}`;
        return c.text("Failed to save tokens", 500);
      }

      container.log.info`OAuth connected for plugin ${plugin.name}`;
      return c.redirect(`/dashboard/plugins/${plugin.name}?flash=connected`);
    } catch (e) {
      container.log.error`OAuth token exchange failed: ${e}`;
      return c.text("OAuth authorization failed", 400);
    }
  });
};

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
};

export const refreshPluginToken = <T>(
  plugin: Plugin<T>,
  container: Container,
): ResultAsync<OAuthTokens, AppError> => {
  if (!plugin.oauth) {
    return errAsync(appError("plugin", "[oauth] Plugin has no OAuth config"));
  }

  const { createProvider } = plugin.oauth;

  return container.plugins
    .getConfig<{
      clientId: string;
      clientSecret: string;
      refreshToken?: string;
    }>(plugin.name)
    .andThen((configRow) => {
      if (!configRow) {
        return errAsync(appError("plugin", "[oauth] Plugin not configured"));
      }

      const config = configRow.config;
      if (!config.refreshToken) {
        return errAsync(appError("plugin", "[oauth] No refresh token available"));
      }

      const provider = createProvider(config.clientId, config.clientSecret, "");

      return ResultAsync.fromPromise(
        provider.refreshAccessToken(config.refreshToken),
        (e) => appError("plugin", `[oauth] Token refresh failed: ${e}`),
      ).andThen((tokens) => {
        const newTokens: OAuthTokens = {
          accessToken: tokens.accessToken(),
          refreshToken: tokens.refreshToken() ?? config.refreshToken ?? null,
          tokenExpiresAt: tokens.accessTokenExpiresAt()?.toISOString() ?? null,
        };

        return container.plugins
          .setConfig(plugin.name, { ...config, ...newTokens })
          .map(() => newTokens);
      });
    });
};
