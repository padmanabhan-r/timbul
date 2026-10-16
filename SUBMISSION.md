# Submission text

Ready to paste into the AI Builder Cup form. Fill the three links on the day.

**Project name:** Timbul
**Team:** HammerLimbo Tech (leader: Padmanabhan Rajendrakumar)
**Theme:** Sustainability & Social Impact
**Live URL:** https://timbul-aibc-2026.web.app
**Demo video:** https://youtu.be/vN8Nwi9wOWY
**Repository:** https://github.com/padmanabhan-r/timbul

## Brief description

Blind students cannot use the diagrams, graphs and maps in their textbooks. A tactile version has to be drawn by hand, taking 1 to 5 hours per figure, so most never reach them. Timbul makes one from a single photo.

A teacher photographs a textbook page.
- Gemini finds the figure and reads a close-up of it: every part, where it sits and what it connects to, in English and Bahasa Indonesia.
- Gemini then checks its own work. It lays the drawing over the original page and corrects anything missing or out of place.
- Timbul's own code draws the final sheet in raised dots with braille labels, and checks it against tactile-graphics rules.
- The teacher approves the sheet and prints it on swell paper or a braille embosser.

Every sheet carries its number in braille. The student says the number to open the same figure on any device, explores it part by part, and asks questions by voice. Gemini answers from the figure and speaks.

**Built on Google Cloud:**
- **Cloud Run** serves the app and its API.
- **Firestore** holds the class library of numbered sheets, shared across devices.
- **Secret Manager** keeps the keys.
- **Firebase Hosting** gives the short address.
- **Gemini** does the understanding:
  - Gemini 3.8 Flash reads figures and checks its own drawings;
  - Gemini 3.5 Flash-Lite finds figures and hears spoken questions;
  - Gemini TTS speaks.

  The prototype runs on Flash models to stay within free allowances. In real use, reading the figure and the self-check move to Gemini Pro for more accurate reading of dense figures.

Timbul's code places every dot, so what the student hears always matches what they feel.
