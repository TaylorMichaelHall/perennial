# Notifications

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
