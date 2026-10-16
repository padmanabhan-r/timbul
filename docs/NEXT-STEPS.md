# Next steps to submission

For Sharmila, taking over on 15 Oct 2026. Deadline **18 Oct 2026** (no time zone published, so submit by **17 Oct**). The rules are in [HACKATHON_BRIEF.md](HACKATHON_BRIEF.md).

## Where things stand

| Artifact the rules require | Status |
|---|---|
| 1. Live URL on Cloud Run / Firebase | **Done (16 Oct):** https://timbul-aibc-2026.web.app, Firebase Hosting in front of Cloud Run, project `timbul-aibc-2026`. |
| 2. Demo video **under 3 minutes**, public link | **Too long: 3:26.** Uploaded to YouTube as **unlisted**: https://youtu.be/vN8Nwi9wOWY |
| 3. Public GitHub repository | **Still private:** https://github.com/padmanabhan-r/timbul |
| 4. Deck as PDF | The deck is done (`deck/work/Timbul - AI Builder Cup.pptx`, 14 slides); the PDF isn't exported yet |
| 5. Theme declaration | Sustainability & Social Impact (written in `SUBMISSION.md`) |

## In order

### 1. Deploy to Cloud Run (done, 16 Oct)
Follow [DEPLOYMENT.md](../DEPLOYMENT.md), steps 1 to 6. Don't skip **step 8, the $1 budget alert**.
- Get `GEMINI_API_KEY` and `OPENROUTER_API_KEY` from Padmanabhan by private message. Never put them in the repo or a group chat.
- Step 6 is the check: add a page, open it as a student, ask a question.
- Optional: step 7 gives the short address `timbul-aibc-2026.web.app`.

### 2. Put the live URL everywhere (done, 16 Oct)
Use the Firebase address if you did step 7, otherwise the Cloud Run URL.
- `SUBMISSION.md`: the **Live URL** line.
- `README.md`: the **Live demo** line.
- Deck, slide 13: in `deck/work/fill.py`, find `"Final Product Link": "to be added after deployment"` and replace it with the URL. Then rebuild the deck from inside `deck/work`:
  ```bash
  uv run --no-project --with python-pptx --with pillow python fill.py
  ```

### 3. Cut the video to under 3 minutes
The film is 3:26, so at least 27 s has to go (aim for 2:55). This decision is Padmanabhan's or yours, not something to do by chance. Where the time is, by section:

| Section | Starts | Length | Idea |
|---|---|---|---|
| The problem (classroom) | 0:00 | 26 s | Trim the slower lines |
| Why it matters (figures) | 0:26 | 15 s | Keep; it's the impact proof |
| How it works (Gemini / code) | 2:55 | 20 s | Shorten; the deck covers the architecture |
| In Bahasa Indonesia | 2:38 | 18 s | Trim the wait before the answer |
| Opening the sheet by voice | 1:39 | 14 s | Trim the navigation |

The project is at `video/timbul-demo/`, with one timeline per section in `timelines/`. Narration lines are in `narration.json`, so cutting a sentence also means re-generating the voice for that section. Export with:
```bash
node ~/.claude/skills/video-edit/scripts/film.mjs --stems
```
The output is `video/timbul-demo/final/timbul-demo-paddy.mp4`. The music bed is set in `video.json`, so don't pass `--music`.

### 4. Replace the YouTube video
YouTube can't swap the file under an existing link, so upload the new cut as a new video. Then copy the old one's details from `video/timbul-demo/final/youtube.md`:
- Title, and description with chapters. **Re-time the chapters to the new cut.**
- Thumbnail: `video/timbul-demo/design/youtube/thumbnail.jpg`.
- Captions: `final/timbul-demo-paddy.srt` from the new export. Upload it under Subtitles → ⋮ → Upload file → With timing.
- AI use **Yes** (the classroom scenes are generated), category Science & Technology, language English.

Then:
- Set visibility to **Public**. The rules say "public link".
- Complete YouTube's one-time channel verification, so the GitHub link in the description is clickable. The prompt is under the description box.
- Put the new link in `SUBMISSION.md`, `README.md` and `deck/work/fill.py` (`"Demo Video Link (3 Minutes)"`), then rebuild the deck.
- Delete or unlist the old 3:26 upload.

### 5. Export the deck to PDF
Open `deck/work/Timbul - AI Builder Cup.pptx` in PowerPoint or Keynote and export it as a PDF. Check that slide 13 shows the live URL and the new video link. Then flip through it once: links, logos, nothing cut off.

### 6. Make the repository public
Before that, check that nothing secret is committed:
```bash
git log -p | grep -iE "AIza|sk-or-|api_key\s*=" | head
```
This should print nothing. `.env` is gitignored. Then make it public:
```bash
gh repo edit padmanabhan-r/timbul --visibility public --accept-visibility-change-consequences
```

### 7. Submit (by 17 Oct)
Paste from `SUBMISSION.md` into the AI Builder Cup form:
- live URL;
- public video link;
- public repo link;
- the deck PDF;
- theme: **Sustainability & Social Impact**.

Afterwards, open every link in a private browser window to check that each one works without a login.

## Small loose ends
- `.gitignore` has an uncommitted change that adds `.vercel` and `HACKATHONS.md`. Commit it if it's wanted.
- `Submission Template _ AI Builder Cup.pptx` at the repo root is an untracked, identical copy of `deck/work/template.pptx`. Delete it, or leave it out of the commit.
- The Vercel test copy (timbul.vercel.app) isn't part of the submission. Leave it unmentioned, or take it down, so the judges only see the Google Cloud deployment.
- Commits are authored by a team member, with no AI attribution lines (see `CLAUDE.md`).
