# ClassTimr Deployment Guide

## Deploying to `timr.classhelpr.com` via GitHub + Railway

Repo: `learningtoretireca-maker/classtimr` · Live: **https://timr.classhelpr.com**

---

## Project File Structure

The app is a single static `index.html`. These are the files the Docker image serves:

```
classtimr/
├── index.html      ← The timer app (inline CSS + JS + canvas themes)
├── fonts/          ← Self-hosted web fonts (Inter, Share Tech Mono)
├── Dockerfile      ← Tells Railway how to build & serve
├── nginx.conf      ← Nginx server config (port 8080, caching, security headers)
└── .gitignore
```

The `Dockerfile` copies `index.html`, `nginx.conf`, and `fonts/` into the nginx image. **If you add a new static-asset folder (images, more fonts, etc.) you must add a matching `COPY` line to the `Dockerfile`, or it will 404 in production while working locally.**

The repo also contains dev/test files that are **not** part of the deployed image: `e2e/` (Playwright tests), `package.json`, `package-lock.json`, `playwright.config.ts`. These don't ship — only what the `Dockerfile` copies is served.

---

## Part 1: Everyday Workflow (repo already set up)

Railway is connected to the GitHub repo, so **any push to `main` auto-deploys**:

1. Edit `index.html` (or other files).
2. Run the tests: `npm run test:e2e`.
3. Commit and push to `main`.
4. Railway rebuilds and deploys within ~2 minutes.

To run locally first: `npm run dev` (serves on http://localhost:8080).

---

## Part 2: First-Time Setup (only if recreating the repo)

### Push to GitHub via terminal

```bash
git init
git add .
git commit -m "Initial commit: ClassTimr app"

# With GitHub CLI (brew install gh):
gh repo create classtimr --public --source=. --push

# Or manual:
git remote add origin https://github.com/YOUR_USERNAME/classtimr.git
git branch -M main
git push -u origin main
```

---

## Part 3: Deploy on Railway

### 3a. Connect GitHub Repo

1. Go to [railway.app](https://railway.app) and sign in with GitHub.
2. **New Project** → **Deploy from GitHub Repo**.
3. Select `classtimr`. If it's missing, click "Configure GitHub App" to grant access.
4. Railway auto-detects the `Dockerfile` and starts building.

### 3b. Configure the Port

1. Click the deployed service → **Settings** tab.
2. Under **Networking**, click **Generate Domain** for a temporary `.railway.app` test URL.
3. In the **Variables** tab add: `PORT` = `8080` (matches `nginx.conf`).

### 3c. Verify

1. Wait for the build (usually under 2 minutes).
2. Open the `.railway.app` URL — the timer should be running.

---

## Part 4: Custom Domain (`timr.classhelpr.com`)

### 4a. Add the Domain in Railway

1. Service → **Settings** → **Networking** → **Custom Domain**.
2. Enter `timr.classhelpr.com` → **Add**.
3. Railway shows a **CNAME target** like `your-service-production-xxxx.up.railway.app`. Copy it exactly.

### 4b. Configure DNS

At the DNS provider for `classhelpr.com`, add:

| Type  | Name   | Value / Target                                | TTL  |
|-------|--------|-----------------------------------------------|------|
| CNAME | `timr` | `your-service-production-xxxx.up.railway.app` | 300  |

- **Name** is just `timr` (the provider appends the root domain).
- **Value** is the CNAME target from step 4a.

### 4c. Propagation & SSL

- DNS: 2 minutes–48 hours (usually under 30). Check at [dnschecker.org](https://dnschecker.org).
- Railway auto-provisions free SSL once the CNAME resolves.

### 4d. Verify

Visit **https://timr.classhelpr.com** — the app should be live over HTTPS.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Railway build fails | Check build logs — usually a `Dockerfile` issue. Confirm `index.html`, `nginx.conf`, `Dockerfile`, and `fonts/` are committed. |
| Fonts/assets 404 in prod but work locally | The asset folder isn't copied into the image. Add a `COPY <dir>/ /usr/share/nginx/html/<dir>/` line to the `Dockerfile`. |
| Site shows "502 Bad Gateway" | Container still starting — wait 30s and refresh. Verify `PORT=8080` in Railway variables. |
| Custom domain not resolving | Re-check the CNAME at your DNS provider; verify at dnschecker.org. Propagation can take up to 48h. |
| SSL not working | Railway provisions SSL after DNS resolves. If the CNAME is correct, wait a few minutes. |
| Works on `.railway.app` but not custom domain | DNS not propagated yet, or the CNAME value is wrong. Compare exactly with Railway. |
