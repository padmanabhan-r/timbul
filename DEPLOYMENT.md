# Deploying Timbul

This guide is for Sharmila. It puts Timbul on Google Cloud, which is the deployment the hackathon judges. Plan on
about 45 minutes. Every command runs in a terminal from the repository root.

**Live now** (deployed 16 Oct 2026)

| | |
|---|---|
| Address for the judges | https://timbul-aibc-2026.web.app (Firebase Hosting) |
| Cloud Run service | `timbul` in `us-central1`: https://timbul-126958609171.us-central1.run.app |
| Project | `timbul-aibc-2026`, billing linked, budget alert at ₹100 (about $1) |

**What gets deployed**

| Part | Google service | What it does |
|---|---|---|
| The app and its API | **Cloud Run** | One container: the built web app and the `/api` server that calls Gemini. Scales to zero when nobody uses it. |
| The class library | **Firestore** | The numbered sheets a teacher makes, so a student opens "sheet two" on her own phone. |
| The API keys | **Secret Manager** | The Gemini key, and an optional OpenRouter key. They never go in the code or the image. |
| The AI | **Gemini** (Gemini API) | Finds and reads the figure, checks its own drawing, answers questions, and speaks (Gemini TTS). |
| A short web address | **Firebase Hosting** | `timbul-aibc-2026.web.app`, forwarding to Cloud Run. |

**Cost: designed to be zero.** Everything stays inside Google Cloud's free tiers at hackathon traffic. Four
safeguards keep it that way:
- Cloud Run is capped at one instance.
- The app refuses Gemini calls past a daily limit.
- A budget alert emails at $1 (₹100 on the live billing account).
- There is a one-line off switch (Step 9).

Do not skip Step 8.

---

## Before you start

1. **Install the Google Cloud CLI** (`gcloud`) from https://cloud.google.com/sdk/docs/install, then sign in:
   ```bash
   gcloud auth login
   ```
2. **Create the project and link billing.** The live project `timbul-aibc-2026` already exists with billing linked,
   so skip this unless you are starting over. Cloud Run needs a billing account even when it costs nothing.
   ```bash
   gcloud projects create timbul-aibc-2026 --name="Timbul"
   gcloud config set project timbul-aibc-2026
   gcloud billing accounts list
   gcloud billing projects link timbul-aibc-2026 --billing-account=ACCOUNT_ID
   ```
   - Project IDs are global. `timbul-aibc` was already taken, which is why the live one is `timbul-aibc-2026`. A new
     project needs another ID, used in place of `timbul-aibc-2026` in every command below.
   - No billing account yet? Start the free trial at https://console.cloud.google.com/freetrial. It gives $300 of
     credit for 90 days and does not charge the card unless you upgrade to a paid account.
3. **Get the keys.** Get them over a private message, never in the repo or a group chat:
   - `GEMINI_API_KEY`, from Google AI Studio. Create it in a project **without** billing, such as the
     `gen-lang-client-…` project AI Studio makes for you. A key in `timbul-aibc-2026`, which has billing, may be
     charged; a key in a project without billing stays on the free tier.
   - `OPENROUTER_API_KEY` (optional), a backup route to the same Gemini models. The live deployment runs without it.
4. **Accept the Firebase terms once,** for Step 7. Open https://console.firebase.google.com, choose **Create a
   project**, then **Add Firebase to Google Cloud project**, and pick `timbul-aibc-2026`. More than one project can
   be called "Timbul", so check the project ID. Accept the terms; Google Analytics is not needed. Until this is done,
   the Firebase CLI refuses with "The caller does not have permission".

## Step 1: Turn on the services

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com secretmanager.googleapis.com
```

## Step 2: Create the Firestore database

```bash
gcloud firestore databases create --location=us-central1 --type=firestore-native
```

Use the `(default)` database: the free tier only covers that one. If it says a database already exists, carry on.

## Step 3: Store the keys in Secret Manager

Each command asks you to paste a key, then press Enter and Ctrl-D. Nothing is printed or saved in your shell
history. The newline from Enter does no harm: the server trims it.

```bash
gcloud secrets create gemini-api-key --replication-policy=automatic --data-file=-
gcloud secrets create openrouter-api-key --replication-policy=automatic --data-file=-   # optional
```

To replace a key later, add a version to the same secret with
`gcloud secrets versions add gemini-api-key --data-file=-`. Cloud Run reads the latest version when it starts.

## Step 4: Let Cloud Run read the keys and Firestore

Cloud Run runs as the project's default compute service account. Give it exactly the two permissions it needs:

```bash
PROJECT_NUMBER=$(gcloud projects describe timbul-aibc-2026 --format='value(projectNumber)')
SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding timbul-aibc-2026 --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
gcloud projects add-iam-policy-binding timbul-aibc-2026 --member="serviceAccount:$SA" --role=roles/datastore.user
```

## Step 5: Deploy to Cloud Run

This builds the container from the `Dockerfile` with Cloud Build and deploys it in one command:

```bash
gcloud run deploy timbul \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 1 --concurrency 40 \
  --cpu 1 --memory 512Mi --timeout 120 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --set-env-vars TIMBUL_STORE=firestore,TIMBUL_PROVIDER=google,TIMBUL_CALLS_PER_DAY=1500,TIMBUL_CALLS_PER_HOUR=120
```

- If you stored the OpenRouter key in Step 3, use
  `--set-secrets GEMINI_API_KEY=gemini-api-key:latest,OPENROUTER_API_KEY=openrouter-api-key:latest` instead.
- If it asks to create an Artifact Registry repository, answer **yes**.
- It ends by printing the **Service URL**. The live one is `https://timbul-126958609171.us-central1.run.app`.

What the settings do:
- `TIMBUL_PROVIDER=google` sends every Gemini call to Google's Gemini API first, trying the next Gemini model when
  one is busy. OpenRouter only answers when Google's free allowance runs out or Google is busy, and only if its key
  is set. This keeps the judged deployment on Google's own platform.
- `TIMBUL_STORE=firestore` keeps the class library in Firestore. Without it, sheets would vanish when the
  container restarts.
- `TIMBUL_CALLS_PER_DAY` and `TIMBUL_CALLS_PER_HOUR` set the spending guard: past them the app politely refuses
  instead of calling Gemini. Speech is not counted, because it runs on the free Gemini TTS allowance and is cached.
- `--max-instances 1` means Cloud Run can never scale up into a bill.

## Step 6: Check it works

Use the Service URL from Step 5 in place of `URL`:

```bash
curl -s URL/api/status
```

You should see `"key":true` and `"store":"firestore"`. Then open the URL in a browser and check the whole flow:

1. **Open the sample.** Open the series circuit. Press the right arrow key: Timbul names a part out loud.
2. **Add a page.** Choose **Add a page** and pick `public/samples/series-circuit-page.jpg` from the repo, or a
   photo of any textbook diagram.
   - In under a minute it finds the figure, reads it and checks its own drawing.
   - Then it shows **Approve for printing**.
3. **Approve it.** The sheet gets a number (2, if it is the first one).
4. **Check the library is shared.** Open the same URL on your phone. On the home page, say or type "2": the
   same sheet opens.
5. **Ask a question.** Ask one by voice, for example "what is next to the nucleus?", and get a spoken answer.

If step 4 fails, the library is not reaching Firestore. Check Step 4's permissions and `TIMBUL_STORE`.

## Step 7: A short address with Firebase Hosting

This gives `https://timbul-aibc-2026.web.app` instead of the long Cloud Run URL. `firebase.json` is in the repo: it
forwards every request to the Cloud Run service `timbul` in `us-central1`.

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only hosting --project timbul-aibc-2026
```

Everything is forwarded to Cloud Run, so there is nothing else to upload: `firebase-public/` stays empty apart from
a `.gitkeep`, which is not uploaded.

Firebase Hosting gives a forwarded request 60 seconds. The server stops a chain of Gemini models at 55 seconds
(`server/gemini.mjs`) and passes over a busy model at once, so a slow request ends with "Gemini is busy" instead of
a timeout.

## Step 8: The budget alert (do not skip)

1. In the Cloud Console, open **Billing → Budgets & alerts → Create budget**.
2. Name it `timbul`, and scope it to project `timbul-aibc-2026`, all services.
3. Set the amount to **$1**, in the billing account's currency. The live account is in rupees, so it is **₹100**.
4. Set alert thresholds at **1%, 50% and 100%**, emailed to billing admins. The 1% alert means any charge at all
   sends an email the same day.

The same from the command line (a budget in another currency than the account's is refused with
`INVALID_ARGUMENT`):

```bash
gcloud services enable billingbudgets.googleapis.com
gcloud billing budgets create --billing-account=ACCOUNT_ID --display-name=timbul --budget-amount=100INR \
  --filter-projects=projects/timbul-aibc-2026 \
  --threshold-rule=percent=0.01 --threshold-rule=percent=0.5 --threshold-rule=percent=1.0
```

## Step 9: The off switch

If a budget email ever arrives, or after judging ends, close the service to the public with one command:

```bash
gcloud run services update timbul --region us-central1 --ingress internal
```

Undo it with `--ingress all`. To remove it entirely: `gcloud run services delete timbul --region us-central1`.

## Updating after a code change

Run Step 5 again: same command, same settings. Firestore and the secrets stay as they are. Firebase Hosting only
needs Step 7 again if `firebase.json` changes.

## For the submission form

- **Live URL:** https://timbul-aibc-2026.web.app
- **Google services used:** Cloud Run, Firestore, Secret Manager, Cloud Build, Artifact Registry, Firebase Hosting
  and the Gemini API (Gemini 3.x Flash for reading and checking, Flash-Lite for questions, Gemini TTS for speech).

---

## Testing copy on Vercel (not for judging)

Padmanabhan keeps a testing copy at https://timbul.vercel.app. It runs the same code, with the API as one Vercel
function (`api/[route].mjs`). The hackathon requires Google Cloud, so the URL submitted is always the Cloud Run or
Firebase one.

On Vercel the class library has no Firestore. Sheets are kept per server instance and in each browser, so opening
a sheet by number from a second device can miss. To update it:

```bash
vercel deploy --prod --archive=tgz
```

The keys are set once:

```bash
vercel env add GEMINI_API_KEY production
vercel env add OPENROUTER_API_KEY production
```

## Running it on a laptop

```bash
cp .env.example .env    # then paste the two keys into .env
./start.sh
```

It opens http://localhost:5173. The class library is kept in `.cache/library/`.
