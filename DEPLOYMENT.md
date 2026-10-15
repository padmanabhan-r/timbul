# Deploying Timbul

This guide is for Sharmila. It puts Timbul on Google Cloud, which is the deployment the hackathon judges. Plan on
about 45 minutes. Every command runs in a terminal from the repository root.

**What gets deployed**

| Part | Google service | What it does |
|---|---|---|
| The app and its API | **Cloud Run** | One container: the built web app and the `/api` server that calls Gemini. Scales to zero when nobody uses it. |
| The class library | **Firestore** | The numbered sheets a teacher makes, so a student opens "sheet two" on her own phone. |
| The two API keys | **Secret Manager** | The Gemini and OpenRouter keys. They never go in the code or the image. |
| The AI | **Gemini** (Gemini API) | Finds and reads the figure, checks its own drawing, answers questions, and speaks (Gemini TTS). |
| A short web address (optional) | **Firebase Hosting** | `timbul-aibc.web.app`, forwarding to Cloud Run. |

**Cost: designed to be zero.** Everything stays inside Google Cloud's free tiers at hackathon traffic. Four
safeguards keep it that way:
- Cloud Run is capped at one instance.
- The app refuses Gemini calls past a daily limit.
- A budget alert emails at $1.
- There is a one-line off switch (Step 9).

Do not skip Step 8.

---

## Before you start

1. **Install the Google Cloud CLI** (`gcloud`) from https://cloud.google.com/sdk/docs/install, then sign in with
   the Google account that owns the project:
   ```bash
   gcloud auth login
   gcloud config set project timbul-aibc
   ```
   The project `timbul-aibc` already exists and has billing linked. Cloud Run needs a billing account even when
   it costs nothing.
2. **Get the two keys from Padmanabhan.** Get them over a private message, never in the repo or a group chat:
   - `GEMINI_API_KEY`, from Google AI Studio;
   - `OPENROUTER_API_KEY`, the backup route to the same Gemini models.
3. **Accept the Firebase terms once,** only if you will do the optional Step 7. Open
   https://console.firebase.google.com, choose **Add project**, pick the existing `timbul-aibc` project and
   accept. Google Analytics is not needed.

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
history.

```bash
gcloud secrets create gemini-api-key --replication-policy=automatic --data-file=-
gcloud secrets create openrouter-api-key --replication-policy=automatic --data-file=-
```

## Step 4: Let Cloud Run read the keys and Firestore

Cloud Run runs as the project's default compute service account. Give it exactly the two permissions it needs:

```bash
PROJECT_NUMBER=$(gcloud projects describe timbul-aibc --format='value(projectNumber)')
SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding timbul-aibc --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
gcloud projects add-iam-policy-binding timbul-aibc --member="serviceAccount:$SA" --role=roles/datastore.user
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
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest,OPENROUTER_API_KEY=openrouter-api-key:latest \
  --set-env-vars TIMBUL_STORE=firestore,TIMBUL_PROVIDER=google,TIMBUL_CALLS_PER_DAY=1500,TIMBUL_CALLS_PER_HOUR=120
```

- If it asks to create an Artifact Registry repository, answer **yes**.
- It ends by printing the **Service URL**, something like `https://timbul-xxxxx-uc.a.run.app`.

What the settings do:
- `TIMBUL_PROVIDER=google` sends every Gemini call to Google's Gemini API first. OpenRouter only answers when
  Google's free allowance runs out or Google is busy. This keeps the judged deployment on Google's own platform.
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
2. **Add a page.** Choose **Add a page** and pick `video/timbul-demo/tools/textbook-cell.png` from the repo, or a
   photo of any textbook diagram.
   - In under a minute it finds the figure, reads it and checks its own drawing.
   - Then it shows **Approve for printing**.
3. **Approve it.** The sheet gets a number (2, if it is the first one).
4. **Check the library is shared.** Open the same URL on your phone. On the home page, say or type "2": the
   same sheet opens.
5. **Ask a question.** Ask one by voice, for example "what is next to the nucleus?", and get a spoken answer.

If step 4 fails, the library is not reaching Firestore. Check Step 4's permissions and `TIMBUL_STORE`.

## Step 7 (optional): A short address with Firebase Hosting

This gives `https://timbul-aibc.web.app` instead of the long Cloud Run URL.

```bash
npm install -g firebase-tools
firebase login
cat > firebase.json <<'EOF'
{ "hosting": { "public": "firebase-public", "rewrites": [{ "source": "**", "run": { "serviceId": "timbul", "region": "us-central1" } }] } }
EOF
mkdir -p firebase-public
firebase deploy --only hosting --project timbul-aibc
```

Everything is forwarded to Cloud Run, so there is nothing else to upload. Commit `firebase.json`; leave
`firebase-public/` empty.

## Step 8: The budget alert (do not skip)

1. In the Cloud Console, open **Billing → Budgets & alerts → Create budget**.
2. Name it `timbul`, and scope it to project `timbul-aibc`, all services.
3. Set the amount to **$1**.
4. Set alert thresholds at **1%, 50% and 100%**, emailed to billing admins. The 1% alert means any charge at all
   sends an email the same day.

## Step 9: The off switch

If a budget email ever arrives, or after judging ends, close the service to the public with one command:

```bash
gcloud run services update timbul --region us-central1 --ingress internal
```

Undo it with `--ingress all`. To remove it entirely: `gcloud run services delete timbul --region us-central1`.

## Updating after a code change

Run Step 5 again: same command, same settings. Firestore and the secrets stay as they are.

## For the submission form

- **Live URL:** the Firebase address from Step 7, or the Cloud Run Service URL.
- **Google services used:** Cloud Run, Firestore, Secret Manager, Cloud Build, Artifact Registry, Gemini API
  (Gemini 3.x Flash for reading and checking, Flash-Lite for questions, Gemini TTS for speech), and Firebase
  Hosting if Step 7 was done.

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
