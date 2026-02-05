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

1. Copy `.env.example` to `.env` and fill in values
2. Start the server:

   ```bash
   mise run dev
   ```

3. Open the interactive dashboard:

   ```
   http://localhost:8000/api/dashboard
   ```

## Deployment

### Local one-time setup

1. Log into GHCR. Create a classic token at: GitHub -> Settings -> Developer settings -> Personal access tokens. Needs: `write:packages`, `read:packages`.

```bash
docker login ghcr.io -u $YOUR_USERNAME
```

(interactively paste in GH token)

2. Fill in VPS values in your local `.env` file

### VPS one-time setup

1. Install Docker
2. `docker login ghcr.io -u $YOUR_USERNAME` (interactively paste in GH token)
3. `mkdir ~/bell-pull-data`
4. Manually create or `scp` up `~/bell-pull-data/.env` with config/auth and `DATABASE_PATH=/app/data/bell-pull.db`
5. Install Traefik, add this service to your docker-compose.yml:

<details>
<summary>docker-compose.yml</summary>

```yaml
# set env vars in /etc/environment

services:
  traefik:
    image: traefik:v3.6
    container_name: traefik
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    command:
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --entrypoints.web.address=:80
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.email=$YOUR_EMAIL
      - --certificatesresolvers.letsencrypt.acme.storage=/etc/traefik/acme.json
      - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./acme.json:/etc/traefik/acme.json

  bellpull:
    image: ghcr.io/rebolyte/bell-pull:latest
    container_name: bellpull
    restart: unless-stopped
    labels:
      - traefik.enable=true
      - traefik.http.routers.bellpull.rule=Host(`bellpull.${DOMAINNAME}`)
      - traefik.http.routers.bellpull.entrypoints=websecure
      - traefik.http.routers.bellpull.tls.certresolver=letsencrypt
      - traefik.http.services.bellpull.loadbalancer.server.port=8000
    env_file:
      - ~/bell-pull-data/.env
    volumes:
      - ~/bell-pull-data:/app/data
```

</details>

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
