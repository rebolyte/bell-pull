import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { generateState, generateCodeVerifier } from "arctic";
import type { Plugin, HonoEnv, Container } from "../types/index.ts";

type OAuthState = {
  pluginName: string;
  nonce: string;
};

const encodeState = (state: OAuthState): string =>
  btoa(JSON.stringify(state));

const decodeState = (encoded: string): OAuthState | null => {
  try {
    return JSON.parse(atob(encoded));
  } catch {
    return null;
  }
};

const getBaseUrl = (req: Request): string => {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
};

export const registerOAuthRoutes = (
  app: Hono<HonoEnv>,
  plugin: Plugin,
  container: Container,
): void => {
  if (!plugin.oauth) return;

  const { createProvider, scopes } = plugin.oauth;
  const basePath = `/oauth/${plugin.name}`;

  app.get(`${basePath}/authorize`, async (c) => {
    const config = await container.plugins.getConfig<{ clientId: string; clientSecret: string }>(
      plugin.name,
    );

    if (config.isErr()) {
      return c.text("Plugin config not found", 400);
    }

    if (!config.value) {
      return c.text("Plugin not configured - add clientId and clientSecret first", 400);
    }

    const { clientId, clientSecret } = config.value.config;
    if (!clientId || !clientSecret) {
      return c.text("Missing clientId or clientSecret in plugin config", 400);
    }

    const redirectUri = `${getBaseUrl(c.req.raw)}${basePath}/callback`;
    const provider = createProvider(clientId, clientSecret, redirectUri);

    const nonce = generateState();
    const state = encodeState({ pluginName: plugin.name, nonce });
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

    const url = provider.createAuthorizationURL(state, codeVerifier, scopes);
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

    const state = decodeState(stateParam);
    if (!state || state.pluginName !== plugin.name) {
      return c.text("Invalid state", 400);
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

      const updatedConfig = {
        ...existingConfig,
        accessToken: tokens.accessToken(),
        refreshToken: tokens.refreshToken(),
        tokenExpiresAt: tokens.accessTokenExpiresAt()?.toISOString(),
      };

      const saveResult = await container.plugins.setConfig(plugin.name, updatedConfig);
      if (saveResult.isErr()) {
        container.log.error`Failed to save OAuth tokens: ${saveResult.error}`;
        return c.text("Failed to save tokens", 500);
      }

      container.log.info`OAuth connected for plugin ${plugin.name}`;
      return c.redirect(`/api/dashboard?plugin=${plugin.name}&connected=true`);
    } catch (e) {
      container.log.error`OAuth token exchange failed: ${e}`;
      return c.text("OAuth authorization failed", 400);
    }
  });
};

export const refreshPluginToken = async (
  plugin: Plugin,
  container: Container,
): Promise<boolean> => {
  if (!plugin.oauth) return false;

  const configResult = await container.plugins.getConfig<{
    clientId: string;
    clientSecret: string;
    refreshToken?: string;
  }>(plugin.name);

  if (configResult.isErr() || !configResult.value) return false;

  const config = configResult.value.config;
  if (!config.refreshToken) return false;

  const redirectUri = ""; // not needed for refresh
  const provider = plugin.oauth.createProvider(
    config.clientId,
    config.clientSecret,
    redirectUri,
  );

  try {
    const tokens = await provider.refreshAccessToken(config.refreshToken);

    const updatedConfig = {
      ...config,
      accessToken: tokens.accessToken(),
      refreshToken: tokens.refreshToken() ?? config.refreshToken,
      tokenExpiresAt: tokens.accessTokenExpiresAt()?.toISOString(),
    };

    const saveResult = await container.plugins.setConfig(plugin.name, updatedConfig);
    return saveResult.isOk();
  } catch {
    return false;
  }
};
