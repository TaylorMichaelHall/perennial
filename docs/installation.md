# Installation

You need Docker with Compose.

```sh
git clone https://github.com/TaylorMichaelHall/perennial.git
cd perennial
cp .env.example .env
mkdir data
docker compose up -d
```

Open <http://localhost:3000>.

The container runs as user 1000, which has to be able to write to `data`. If
that isn't your own user, hand the directory over with
`sudo chown 1000:1000 data`.

This pulls the latest release, `ghcr.io/taylormichaelhall/perennial:latest`.
To update, run `git pull` and `docker compose pull`, then `docker compose up -d`
again. To stay on one version, change `latest` in `docker-compose.yml` to a
version such as `1.2.3`, or `1.2` for its fixes too. To build the image from
the source instead, run `docker compose up -d --build`.

## Setting the password

There are two ways to set the password on a fresh install:

- Put it in `.env` as `INITIAL_PASSWORD` before the first start, or
- leave `INITIAL_PASSWORD` empty and choose one in the browser the first time
  you open the app.

`INITIAL_PASSWORD` is only read while no password exists. Once one is set,
change it under **Settings** in the app; editing `.env` has no further effect.

If you choose the password in the browser, do it before exposing the app to a
network you don't trust, since whoever opens it first sets the password.

## Forgotten password

```sh
docker compose exec perennial node reset-password.mjs
```

This clears the password and signs out every device. Your tasks are untouched.
Open the app to choose a new one.

## Configuration

| Variable           | Default | Purpose                                 |
| ------------------ | ------- | --------------------------------------- |
| `INITIAL_PASSWORD` | empty   | Password for a fresh install (optional) |
| `PORT`             | `3000`  | Port the app is published on            |
| `BACKUP_DIR`       | empty   | Where backups go; `/data/backups` if empty |

## HTTPS

Perennial serves plain HTTP. To reach it from outside your own network, put it
behind a reverse proxy that terminates TLS (Caddy, Traefik, nginx) and have the
proxy send the `X-Forwarded-Proto` header, so the session cookie is marked
`Secure`.

## More

- [Notifications](notifications.md)
- [Backups, restoring, and export and import](data.md)
- [The JSON API](api.md)
