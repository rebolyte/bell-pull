# Bell Pull

## Installation

1. Clone the repository
2. Install [mise](https://mise.jdx.dev/):

```shell
brew install mise
```

If you haven't set up Mise before:

```shell
# set up shell
echo 'eval "$(mise activate bash)"' >> ~/.bashrc

# trust config file in this project
mise trust

mise activate
```

Mise will set up the Deno environment, and Deno will handle its dependencies automatically.

## Quick Start

1. Start the server:

   ```bash
   mise run dev
   ```

2. Open the interactive dashboard:

   ```
   http://localhost:8000/api/dashboard
   ```

## Deployment

### Local one-time setup

1. Log into GHCR. Create a classic token at: GitHub -> Settings -> Developer settings -> Personal access tokens. Needs: `write:packages`, `read:packages`.

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u $YOUR_USERNAME --password-stdin
```

2. Fill in VPS values in your local `.env` file

### VPS one-time setup

1. Install Docker
2. `echo $GITHUB_TOKEN | docker login ghcr.io -u $YOUR_USERNAME --password-stdin`
3. `mkdir ~/bell-pull-data`
4. Manually create or `scp` up `~/bell-pull-data/.env` with config/auth and `DATABASE_PATH=/app/data/bell-pull.db`
5. Install Caddy, copy Caddyfile to `/etc/caddy/Caddyfile`, `systemctl reload caddy`

### Telegram setup

Once you have your domain set up, set your Telegram bot's webhook callback with a GET request to `https://api.telegram.org/bot<token>/setWebhook?url=<url>` where `url` is `$YOUR_FQDN/webhook/telegram`. Example:

```bash
curl -X GET 'https://api.telegram.org/bot1234:xxx/setWebhook?url=https%3A%2F%2Frando.trycloudflare.com%2Fwebhook%2Ftelegram'
```

See docs [here](https://grammy.dev/guide/deployment-types#how-to-use-webhooks) and [here](https://core.telegram.org/bots/api#setwebhook).

### Subsequent deploys:

```
mise run deploy
```

## Inspiration

https://www.geoffreylitt.com/2025/04/12/how-i-made-a-useful-ai-assistant-with-one-sqlite-table-and-a-handful-of-cron-jobs

https://www.val.town/x/geoffreylitt/stevensDemo

## License

MIT
