# API

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
