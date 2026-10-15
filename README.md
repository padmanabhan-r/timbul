# Timbul

Timbul turns the figures in a textbook into something a blind or low-vision student can use. A teacher photographs a page. Gemini finds the diagram, reads it and checks its own drawing against the page. Timbul's code then draws a simplified tactile sheet with braille labels, ready to print, and the student explores the same figure by touch and by voice.

*Timbul* is Bahasa Indonesia for "raised" or "embossed", and also "to emerge".

Our entry for the [Google Cloud AI Builder Cup 2026](https://aibuildercup.com) (Hack2skill × Google Cloud, JAPAC).

**Team:** HammerLimbo Tech: Padmanabhan Rajendrakumar, Sharmila
**Theme:** Sustainability & Social Impact
**Live demo:** _added after the Cloud Run deployment_ · **Video:** _TBD_ · **Deck:** [deck/work/Timbul - AI Builder Cup.pptx](deck/work/)

> Submission deadline: **18 Oct 2026**. Rules, themes and rubric are in [docs/HACKATHON_BRIEF.md](docs/HACKATHON_BRIEF.md). What the product is and who it is for is in [PRODUCT.md](PRODUCT.md). How to deploy it on Google Cloud is in [DEPLOYMENT.md](DEPLOYMENT.md).

## Run it

```bash
./start.sh
```

It installs dependencies on the first run, starts the app on http://localhost:5173 and opens it in your browser. It needs Node.js 20 or newer and, in `.env`, a Gemini API key (`GEMINI_API_KEY`) and optionally an OpenRouter key (`OPENROUTER_API_KEY`) as a backup route to the same Gemini models (see `.env.example`). The keys stay on the server and are never sent to the browser. Use Chrome for the voice features.

## How it works

1. **Add a page (teacher).** A photo of a textbook page.
   - Gemini 3.5 Flash-Lite finds the figure, and Timbul crops to it.
   - Gemini 3.8 Flash reads the close-up: every part, where it sits and what joins it, in English and Bahasa Indonesia.
2. **Gemini checks its own drawing.** Timbul draws the reading, lays it over a faded copy of the page and sends both to Gemini, which corrects any part that is missing, misplaced or misnamed.
   - It runs for up to two rounds, with a time limit.
   - In our test it caught a part we had moved on purpose and put it back.
3. **Timbul's code draws the sheet.**
   - Every line is drawn as raised dots at true size, with uncontracted braille labels and a key.
   - Where outlines cross or come within 3 mm, the one behind is broken.
   - Many identical items (the nodes of a neural network, say) become groups joined by one arrow.
   - Four tactile-graphics checks run on every sheet: lines at least 3 mm apart, braille clear of lines, at most 12 parts, every label in braille.
4. **The teacher approves it.** Nothing prints until the teacher has compared the sheet with the original (**Show original**).
   - **Print tactile sheet** downloads an A4 SVG in real millimetres for swell paper or an embosser, with the sheet number in braille and an orientation notch.
5. **The class library.** Approved sheets are numbered and shared by class code, so a sheet made on the teacher's laptop opens on a student's phone.
6. **Explore (student).**
   - On the home screen, the student says "sheet two", or types the number.
   - Click a part, use the arrow keys, or on a phone swipe through the parts list with VoiceOver or TalkBack. Each part is spoken.
   - **O** gives the overview. **M** or the microphone asks a question by voice; the answer is spoken.
   - **Point and ask (P).** The phone's camera looks down at the printed sheet. The student touches a raised shape and asks "what is this?". Gemini lines the photo up with Timbul's drawing of the sheet, finds the fingertip, and Timbul names the part. Test it with `node scripts/check-point.mjs <photo>`.
   - Everything works in English and Bahasa Indonesia.

## Stack

- **Gemini models** (Google's Gemini API, OpenRouter as backup):
  - `gemini-3.8-flash` reads figures, checks drawings and finds the fingertip for Point and ask;
  - `gemini-3.5-flash-lite` finds figures, hears questions and sheet numbers;
  - `gemini-3.8-flash-tts` (voice Sulafat) speaks, cached so each line is made once.
  - Each call tries further Gemini models when one is busy, with timeouts.
- **One API, three hosts.** `server/api.mjs` is the API. The Vite dev server, the Cloud Run server (`server/index.mjs`, `Dockerfile`) and a Vercel function used for testing (`api/[route].mjs`) all serve it.
  - A spending guard limits Gemini calls per visitor and per day.
- **Class library:** Firestore on Google Cloud, a JSON file elsewhere (`server/library.mjs`), with a copy in the browser (IndexedDB) for offline use.
- **Tactile engine:** `src/lib/tactile.ts` (dots, symbols, occlusion, labels, checks, SVG export) and `src/lib/braille.ts`.
- **App:** React with Vite and TypeScript.
- **Pipeline check:** `node scripts/check-reading.mjs <page.png>` runs find → read → draw → self-check on one image and writes overlays to `.cache/check/`.
  - `--break <part>` moves a part to test the self-check.

The `.githooks/commit-msg` hook removes AI co-author trailers from commit messages, so only the human authors are credited (`git config core.hooksPath .githooks`).
