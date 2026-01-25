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

One time:

1. Log into GHCR

```bash
# Create a token at: GitHub → Settings → Developer settings → Personal access tokens
# Needs: write:packages, read:packages
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin
```

### VPS setup

1. Log into GHCR
2. Copy .env file
3. Set up Caddy


### Subsequent deploys:

```
mise run deploy
```


## Inspiration

https://www.geoffreylitt.com/2025/04/12/how-i-made-a-useful-ai-assistant-with-one-sqlite-table-and-a-handful-of-cron-jobs

https://www.val.town/x/geoffreylitt/stevensDemo

## License

MIT
