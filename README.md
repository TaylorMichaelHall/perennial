# Perennial

A self-hosted to-do list for the long term: the things that come around once a
year, or once a decade. Renew the passport. Drain the water heater. Clean out
the dryer duct.

An ordinary to-do list assumes a task can be done whenever. These can't. Each
has a **window**: a day it can first be started and a day it is due. Perennial
is built around that window.

- **Agenda** shows what can be done now, what is overdue, and what opens next.
- **Timeline** lays every window out across the coming months and years, so
  you can see a decade at a glance.
- Tasks **repeat** on a schedule ("every April") or from when they were last
  done ("three months after I change the filter").
  A task due on the 31st falls on the 28th in February and goes back to the
  31st in March.
- A deadline is either **hard** (the passport expires) or one that can slip.
- **Tags** group tasks (`#house`, `#car`), and **search** narrows the agenda
  and the timeline to a word or a tag.
- A task done last week but only ticked off today can be **marked done on the
  day it happened**, so its history and its next window are right.
- **Notifications** go to Discord, Slack, Telegram, or ntfy when a task opens,
  a week before it's due, on the day, and each week it stays overdue. Each
  links to the task, where you can mark it done or **snooze** it.

It is a single small container with a SQLite file, protected by one password.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/agenda-dark.png">
  <img src="docs/screenshots/agenda-light.png" alt="The agenda: overdue tasks, tasks that can be done now, and the ones opening next.">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/timeline-dark.png">
  <img src="docs/screenshots/timeline-light.png" alt="The timeline: every task's windows laid out across three years.">
</picture>

<details>
<summary>A task's page</summary>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/task-dark.png">
  <img src="docs/screenshots/task-light.png" alt="A task's page: its window, marking it done or skipping it, snoozing, and its history.">
</picture>

</details>

## Run it

You need Docker with Compose.

```sh
git clone https://github.com/TaylorMichaelHall/perennial.git
cd perennial
cp .env.example .env
mkdir data
docker compose up -d
```

Open <http://localhost:3000>.

This pulls the image published from `main`,
`ghcr.io/taylormichaelhall/perennial:latest`. To update, run `git pull` and
`docker compose pull`, then `docker compose up -d` again. To build the image
from the source instead, run `docker compose up -d --build`.

### Setting the password

There are two ways to set the password on a fresh install:

- Put it in `.env` as `INITIAL_PASSWORD` before the first start, or
- leave `INITIAL_PASSWORD` empty and choose one in the browser the first time
  you open the app.

`INITIAL_PASSWORD` is only read while no password exists. Once one is set,
change it under **Settings** in the app; editing `.env` has no further effect.

If you choose the password in the browser, do it before exposing the app to a
network you don't trust, since whoever opens it first sets the password.

### Forgotten password

```sh
docker compose exec perennial node reset-password.mjs
```

This clears the password and signs out every device. Your tasks are untouched.
Open the app to choose a new one.

### Configuration

| Variable           | Default | Purpose                                 |
| ------------------ | ------- | --------------------------------------- |
| `INITIAL_PASSWORD` | empty   | Password for a fresh install (optional) |
| `PORT`             | `3000`  | Port the app is published on            |
| `BACKUP_DIR`       | empty   | Where backups go; `/data/backups` if empty |

### Notifications

Add destinations under **Settings** in the app; each has a **Send a test**
button. Reminders go out once a day, at the hour you choose, as a single
message listing what needs attention. Nothing is sent on days with nothing to
say. Large digests are split into smaller messages. Each destination keeps its own
progress: a failed delivery retries after five minutes, with delays increasing
up to six hours. Progress survives restarts, and acknowledged message parts
aren't resent. Settings shows the last delivery, errors, and the next retry.
If a service accepts a message but its reply is lost, a retry can still produce
a duplicate. Removing or changing a destination stops delivery to the old one.

| Destination | What you need                                                        |
| ----------- | -------------------------------------------------------------------- |
| Discord     | A webhook URL (channel settings, Integrations, Webhooks)             |
| Slack       | An incoming webhook URL                                              |
| Telegram    | A bot token from @BotFather and the ID of the chat to post in        |
| ntfy        | A topic URL such as `https://ntfy.sh/my-topic`, plus an access token if the topic is protected |

Each task in a reminder links to its page in the app, using the address you
were at when you last saved the notification settings. If you move Perennial to
a new address, save them again from there. From that page a task can be
snoozed: it is set aside, and its reminders stop, until the day you pick.

The Slack format also works with services that accept Slack-style webhooks,
such as Mattermost.

### API

Scripts and AI agents can read and manage tasks over a JSON API. Mint a key
under **Settings**, with or without an expiry date, and send it as a bearer
token:

```sh
curl -H "Authorization: Bearer $PERENNIAL_API_KEY" http://localhost:3000/api/tasks
```

`GET /api` needs no key and describes every endpoint, so an agent can be
pointed at it to learn what it can do. A key reaches the task endpoints only:
it can't change settings, the password, or other keys. Revoke a key from the
same place; it stops working at once.

To mark a task done, skip it, or undo a completion, first fetch the task and
include its `version` in the JSON request body. Every task change increases
that version. A stale version returns HTTP 409 without changing the task; a
missing version returns HTTP 400. Fetch the task again before deciding whether
to repeat the action. Existing API scripts must include this field.

`GET /api/tasks?q=boiler` searches titles, notes and tags; `?q=%23house` lists
the tasks tagged `house`. When closing a task, `on` is the day it was done,
which can be earlier than today.

### Your data

Everything lives in one SQLite database, `data/perennial.db`, in the `data`
directory next to `docker-compose.yml`.

#### Backups

Perennial copies the whole database to `data/backups` once a day, and checks
each copy can be read before keeping it. A copy is a complete database:
tasks, history, settings, API keys and the password hash. Older copies are
thinned out as they age:

- every day for the last 7 days,
- then the last copy of each of 5 weeks,
- then the last copy of each of 12 months,
- then the last copy of every year, for good.

A copy is also taken before an update changes the database's shape
(`…-before-schema-N.db`) and before a restore (`…-before-restore.db`). Those
are never removed automatically.

**Settings** shows when the last backup was taken, and says so if one failed.

These copies sit on the same disk as the database, which protects against a
bad update or a mistake, but not against losing the disk. For that, either
include `data/backups` in whatever already backs up the machine, or set
`BACKUP_DIR` to a directory on another disk that you have mounted into the
container. The files there are safe to copy at any time; `data/perennial.db`
itself is not, while the app is running.

```sh
docker compose exec perennial node backup.mjs           # list the backups
docker compose exec perennial node backup.mjs now       # take one now
docker compose exec perennial node backup.mjs verify    # check each one can be read
```

#### Restoring

Restoring replaces the database, so stop the app first:

```sh
docker compose stop
docker compose run --rm perennial node backup.mjs restore perennial-2026-10-04.db
docker compose start
```

The backup is checked before anything is touched, and the database it
replaces is saved to `data/backups` as `…-before-restore.db`, so a restore can
itself be undone. A backup from an older version of Perennial is brought up to
date when the app starts.

Without the script, the same thing by hand: stop the app, copy the backup over
`data/perennial.db`, delete `data/perennial.db-wal` and `data/perennial.db-shm`
if they exist, and start the app.

#### Checking that a restore works

A backup is only as good as the last time it was restored. Once in a while,
restore the latest one into a scratch copy that doesn't touch the real data:

```sh
docker compose run --rm -p 3001:3000 \
  -e DATA_DIR=/tmp/drill -e BACKUP_DIR=/tmp/drill/backups \
  perennial sh -c 'node backup.mjs restore /data/backups/perennial-2026-10-04.db && node build'
```

Open <http://localhost:3001>, sign in with your usual password, and look for
your tasks. Stop it with Ctrl-C; the scratch copy goes with the container.
`backup.mjs verify` is the quicker check: it opens every backup, runs SQLite's
integrity check, and counts the tasks in each.

#### Export and import

To move tasks between installs, or keep a copy you can read, use **Export and
import** under **Settings**. Export saves every task and its history to a JSON
file. Import adds the tasks from such a file to the ones you already have; it
never replaces or removes anything, so importing the same file twice gives two
of everything. A file with a mistake in it is refused whole, naming the task at
fault. Notification settings, API keys and the password stay out of the file,
as they hold secrets.

Each file records the `version` of its format (currently 2, which added tags
and the day of the month each window aims for). Perennial reads files from every
earlier version, and refuses one from a newer version rather than guess at it.
When the format changes, the version goes up and an upgrade step is added in
`src/lib/server/transfer.ts`. The server accepts imports up to 512 KB by
default (SvelteKit's `BODY_SIZE_LIMIT`), which is well over a thousand tasks.

The container runs as user 1000, which has to be able to write to `data`. If
that isn't your own user, hand the directory over with
`sudo chown 1000:1000 data`.

### HTTPS

Perennial serves plain HTTP. To reach it from outside your own network, put it
behind a reverse proxy that terminates TLS (Caddy, Traefik, nginx) and have the
proxy send the `X-Forwarded-Proto` header, so the session cookie is marked
`Secure`.

## Develop

You need Node.js 24 or newer.

```sh
npm install
npm run dev       # start the dev server
npm test          # run the unit tests
npm run test:e2e  # build the app and run the browser tests
npm run lint      # lint with ESLint
npm run check     # type-check
```

The dev server keeps its database in `./data`.

The browser tests use [Playwright](https://playwright.dev); install its browser
once with `npx playwright install chromium`. They build the app, start it on
an empty database of its own, and drive it through first-run setup, signing
in, completing and undoing a repeating task, snoozing, search and tags, and
export and import. They never touch `./data`.

GitHub Actions (`.github/workflows/ci.yml`) runs the lint, type-check, unit
tests and browser tests, and builds the Docker image, on every pull request and
every push to `main`. On `main`, once those pass, it publishes the image to
`ghcr.io/taylormichaelhall/perennial` for amd64 and arm64, tagged `latest` and
with the commit it was built from.

The screenshots above are taken by `npm run screenshots`, which fills the built
app with sample tasks and writes them to `docs/screenshots`.

### How it is put together

Perennial is a [SvelteKit](https://svelte.dev/docs/kit) app that uses Node's
built-in SQLite, so it has no native dependencies and no separate database.

```
src/
  lib/
    dates.ts          calendar-date arithmetic and formatting
    tasks.ts          the task model and how a window moves through time
    notifications.ts  notification presets and what goes in a reminder
    limits.ts         limits the server enforces that forms also need
    api.ts            the client for the JSON API
    keys.ts           what the app knows about an API key
    ui.svelte.ts      shared interface state and task actions
    components/       the task dialog, search, window meter, toast
    server/           database, backups, authentication, API keys, task storage, export and import, sending reminders
  routes/
    (app)/            the agenda, timeline, task page, and settings
    api/              the JSON API, for the app and for API keys; `GET /api` describes it
    login/, setup/    sign-in and first-run setup
  hooks.server.ts     gates every request behind the password or an API key
e2e/                  browser tests, the server they run against, and the README's screenshots
scripts/              resetting the password; listing, checking and restoring backups
```

A repeating task remembers the days of the month its window aims for
(`opens_day` and `due_day`), separately from the dates it is on now. Months
are added to the current window but aimed at those days, so a window that a
short month pushed earlier goes back to where it belongs, and the timeline's
projection always agrees with where a task goes when it is completed.

Dates are plain calendar days (`YYYY-MM-DD`) with no time or timezone. The
browser decides what "today" is, so the app is right wherever you are without
any timezone setting on the server. Open pages update at local midnight and
when the app returns to the foreground, so statuses and snoozes stay current.

## License

[MIT](LICENSE)
