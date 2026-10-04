# Development

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
every push to `main`, unless only the documentation changed.

A new image is published only for a release, which is a version tag:

```sh
npm version patch   # or minor, or major: bumps package.json, commits, tags v1.2.3
git push --follow-tags
```

Once the checks pass on the tag, the image goes to
`ghcr.io/taylormichaelhall/perennial` for amd64 and arm64, tagged `1.2.3`,
`1.2` and `latest`.

The screenshots in the README are taken by `npm run screenshots`, which fills the built
app with sample tasks and writes them to `docs/screenshots`.

## How it is put together

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
