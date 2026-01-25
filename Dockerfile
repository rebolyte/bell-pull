FROM denoland/deno:alpine-2.6.6

WORKDIR /app

# Cache dependencies (optional but speeds up rebuilds)
COPY deno.json deno.lock* ./
RUN deno install

# Copy source
COPY . .

# Cache the main module
RUN deno cache src/main.ts

EXPOSE 8000

CMD ["sh", "-c", "deno run --allow-net --allow-env --allow-read --allow-write --allow-import migrate.ts && deno run --allow-net --allow-env --allow-read --allow-write --allow-import src/main.ts"]
