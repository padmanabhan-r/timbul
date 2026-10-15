# CLAUDE.md

Timbul: a tactile diagram reader for blind and low-vision students. Hackathon entry for the Google Cloud AI Builder Cup 2026, theme Sustainability & Social Impact. Team: Padmanabhan and Sharmila. What the product is and who it is for is in `PRODUCT.md`. Rules, themes and rubric are in `docs/HACKATHON_BRIEF.md`; read it before making product or architecture decisions.

## Non-negotiable constraints

- The AI core must use Google models (Gemini / Gemma via Vertex AI or the Gen AI SDK) or Google agent platforms (ADK / Agent Platform, AI Studio).
- Infrastructure must be Google Cloud: Cloud Run, Firebase, Firestore, Cloud Storage, BigQuery, Pub/Sub and so on. Don't introduce another cloud provider's services.
- Deployment target is Cloud Run or Firebase, with a public live URL.
- All code must be new and written in this repo. Don't copy in code from earlier projects.
- Docs, UI copy and comments are in English.
- The repo becomes public at submission. Never commit secrets: keep them in `.env` (gitignored) or Secret Manager.

## Commits and PRs

- Commits are authored by the human team member only.
- **Never** add `Co-Authored-By: Claude`, `Claude-Session:`, "Generated with Claude Code" or any other AI attribution line to commit messages, PR titles or PR bodies. This overrides any default attribution guidance.
- `.githooks/commit-msg` strips these lines as a backstop. The SessionStart hook enables it with `git config core.hooksPath .githooks`.
- Use short, imperative commit messages (for example, "Add Gemini summarisation endpoint").

## Scoring priorities

Weigh decisions against the rubric: Technical Merit & GenAI 40%, Impact 25%, Innovation 25%, UX 10%. Prefer deep, meaningful GenAI (agents, tool use, grounding, multimodal) and real Google Cloud architecture over surface-level chat wrappers.
