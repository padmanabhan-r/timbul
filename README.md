# Timbul

Timbul turns the figures in a textbook into something a blind or low-vision student can use. A teacher uploads a page; Timbul finds each diagram, draws a simplified tactile version with braille labels that is ready to print, and lets the student explore the figure by voice.

*Timbul* is Bahasa Indonesia for "raised" or "embossed", and also "to emerge".

Our entry for the [Google Cloud AI Builder Cup 2026](https://aibuildercup.com) (Hack2skill × Google Cloud, JAPAC).

**Team:** Padmanabhan, Shamila
**Theme:** Sustainability & Social Impact
**Live demo:** _TBD_ · **Video:** _TBD_ · **Deck:** _TBD_

> Submission deadline: **18 Oct 2026**. Rules, themes and rubric are in [docs/HACKATHON_BRIEF.md](docs/HACKATHON_BRIEF.md). What the product is and who it is for is in [PRODUCT.md](PRODUCT.md).

## Run it

```bash
./start.sh
```

It installs dependencies on the first run, starts the app on http://localhost:5173 and opens it in your browser. It needs Node.js 18 or newer and, in `.env`, an OpenRouter key (`OPENROUTER_API_KEY`) and a Gemini API key (`GEMINI_API_KEY`) (see `.env.example`). The key stays on the local server and is never sent to the browser. Use Chrome for the voice features.

## How to use it

1. **Library.** Opens on two sample figures (a series circuit and a plant cell) that work without using any Gemini allowance.
2. **Add a page.** Choose or take a photo of a textbook page with a diagram. Gemini reads it (one to three minutes on the free tier), then the tactile figure feeds out line by line and is checked. It is saved in your browser.
3. **Explore.** Click a part, or use the arrow keys to move between parts as a finger would; each part is spoken. Press **O** for the overview. Press **M** or the microphone button to ask a question by voice, and press it again to send; or type a question. Switch the spoken language between English and Bahasa Indonesia at the top right.
4. **Checks.** The strip at the bottom shows whether the sheet passes four tactile-graphics rules. **Show original** lays the page under the tactile drawing to compare them. **Print tactile sheet** downloads an A4 SVG in real millimetres for swell paper or an embosser.

## Stack

- React with Vite. Locally, Vite's dev server also serves `/api`, which holds the Gemini key.
- Gemini reads the figure (`gemini-3.8-flash`) and answers questions (`gemini-3.5-flash-lite`). Calls go to Gemini through OpenRouter first (`OPENROUTER_API_KEY` in `.env`) and fall back to Google's Gemini API (`GEMINI_API_KEY`), trying several Gemini models in turn when one is busy or out of quota. Set `TIMBUL_PROVIDER=google` to call Google first.
- Timbul's voice is Gemini text-to-speech (`gemini-3.8-flash-tts`, voice Sulafat) through Google's API, cached on disk so each line is generated once; the browser's own voice is the fallback.
- Timbul's own code draws every line as raised dots, places the braille labels and runs the checks (`src/lib/tactile.ts`, `src/lib/braille.ts`).
- Figures you add are kept in the browser (IndexedDB). Firebase Hosting, Firestore and Firebase AI Logic are the deployment target and are not wired up yet.

The `.githooks/commit-msg` hook removes AI co-author trailers from commit messages, so only the human author is credited (`git config core.hooksPath .githooks`).
