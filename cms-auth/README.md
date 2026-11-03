# Website editor sign-in — one-time setup

The editor at `/admin/` needs a small sign-in helper so people can log in with GitHub. It is free and takes about 15 minutes. Do these steps signed in as the **silverpeakdesignbuild** GitHub account.

Keep the **Client secret** private. Don't paste it into chat, email or any file in this repo. It only goes into Cloudflare (step 3).

## 1. Create the Worker (Cloudflare, free)

1. Sign up or log in at <https://dash.cloudflare.com> (the Free plan is enough).
2. Go to **Workers & Pages → Create → Create Worker**.
3. Name it `silverpeak-cms-auth`, then click **Deploy**.
4. Click **Edit code**, delete what's there, paste in all of [`worker.js`](worker.js), then click **Deploy**.
5. Copy the Worker's address. It looks like `https://silverpeak-cms-auth.<your-name>.workers.dev`.

## 2. Create the GitHub OAuth App

1. Go to <https://github.com/settings/developers> and open **OAuth Apps → New OAuth App**.
2. Fill in:
   - **Application name:** `Silver Peak Website Editor`
   - **Homepage URL:** `https://silverpeakdesignbuild.github.io/silverpeak-website/`
   - **Authorization callback URL:** the Worker address + `/callback`, e.g. `https://silverpeak-cms-auth.<your-name>.workers.dev/callback`
3. Click **Register application**.
4. Copy the **Client ID**. Then click **Generate a new client secret** and copy the secret.

## 3. Give the Worker its settings

In Cloudflare open the Worker, then go to **Settings → Variables and Secrets → Add**:

| Name | Type | Value |
|---|---|---|
| `GITHUB_CLIENT_ID` | Text | the Client ID |
| `GITHUB_CLIENT_SECRET` | **Secret** | the client secret |
| `ALLOWED_ORIGINS` | Text | `https://silverpeakdesignbuild.github.io,https://silverpeakdesignbuild.com` |

Click **Deploy** to save.

## 4. Point the editor at the Worker

Put the Worker address into `src/admin/config.yml` as `backend.base_url` (replace the `REPLACE-ME` line), then commit and push.

## 5. Invite each editor

1. Open <https://github.com/silverpeakdesignbuild/silverpeak-website/settings/access>.
2. Click **Add people** and enter the editor's GitHub username.
3. The editor accepts the email invitation, then follows the editor guide.

To remove someone later, use the same page.
