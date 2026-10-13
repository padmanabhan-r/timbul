# Timbul

Timbul turns the figures in a textbook into something a blind or low-vision student can use. A teacher uploads a page; Timbul finds each diagram, draws a simplified tactile version with braille labels that is ready to print, and lets the student explore the figure by voice.

*Timbul* is Bahasa Indonesia for "raised" or "embossed", and also "to emerge".

Our entry for the [Google Cloud AI Builder Cup 2026](https://aibuildercup.com) (Hack2skill × Google Cloud, JAPAC).

**Team:** Padmanabhan, Shamila
**Theme:** Sustainability & Social Impact
**Live demo:** _TBD_ · **Video:** _TBD_ · **Deck:** _TBD_

> Submission deadline: **18 Oct 2026**. Rules, themes and rubric are in [docs/HACKATHON_BRIEF.md](docs/HACKATHON_BRIEF.md). What the product is and who it is for is in [PRODUCT.md](PRODUCT.md).

## Stack

- React with Vite, hosted on Firebase Hosting
- Gemini through Firebase AI Logic (Gemini Developer API)
- Firestore for saved figures

## Setup

```bash
cp .env.example .env
git config core.hooksPath .githooks
```

The `.githooks/commit-msg` hook removes AI co-author trailers from commit messages, so only the human author is credited.
