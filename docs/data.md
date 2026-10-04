# Your data

Everything lives in one SQLite database, `data/perennial.db`, in the `data`
directory next to `docker-compose.yml`.

## Backups

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

## Restoring

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

## Checking that a restore works

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

## Export and import

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
