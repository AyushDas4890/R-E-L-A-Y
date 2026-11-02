# Email notifications for offline people

Relay emails a person when they are **offline** and someone **mentions them** (directly or through a user group) or **sends them a DM**.

## Rules
- Offline means not connected to any workspace.
- Messages are batched: the first one starts a 2-minute timer, and everything in that window goes out as one email. If the person comes back, reads the messages, or switches email off during the wait, nothing is sent.
- At most one email per person per 15 minutes.
- Never sent for: your own messages, system messages, channels the person muted, Do Not Disturb, people who switched it off in Profile & preferences, people without an email address, departed members.
- A mention never reaches someone who cannot see the channel.
- The email carries a 160-character excerpt of each message. Names are stripped to one line before they go into a subject.

## Configuration (environment variable names only)
| Name | Meaning |
|---|---|
| `RELAY_EMAIL_PROVIDER` | Which provider to use. Unset means email is off. `console` prints to the server log (addresses masked) for local testing. |
| `RESEND_API_KEY` | Resend API key (set on the server host only, never in the UI). Needed when the provider is `resend`. |
| `RELAY_EMAIL_FROM` | Sender, e.g. `Relay <relay@your-domain>`. The domain must be verified in Resend. Needed when the provider is `resend`. |
| `RELAY_APP_URL` | The UI's public address, used for the "Open Relay" link. Optional. |

To turn it on with Resend: verify a sending domain in Resend, then on the server host set `RELAY_EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `RELAY_EMAIL_FROM` and `RELAY_APP_URL`. Relay calls Resend's HTTP API directly, so there is no SDK or new dependency. A failed send is logged (status and Resend's reason, never the key or the address).

Another provider is one entry in `PROVIDERS` in `server/mailer.ts` that implements `EmailProvider { send({ to, subject, text }) }`. Its own keys would be read from env vars there.

## Known limits
- The batch queue and the 15-minute gap live in server memory, so a restart drops pending emails and forgets who was just emailed.
- Email addresses come from Google or GitHub sign-in. Dev sign-in has none, so nobody is emailed in dev mode.
- There is no one-click unsubscribe link yet; the switch is in Profile & preferences.
