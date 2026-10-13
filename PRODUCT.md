# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: React with Vite and plain CSS, Firebase Hosting, Firestore, and Firebase AI Logic calling the Gemini Developer API. Chosen because the team is staying on Firebase's free plan, which rules out Cloud Run and server code, and because the hackathon requires Google models and Firebase or Cloud Run hosting.

## Users

- **Blind and low-vision school students** in Asia-Pacific whose textbooks contain figures (circuit diagrams, maps, graphs) that they cannot see and that are rarely available in tactile form. They explore a figure by voice, alone or beside a teacher.
- **Their teachers**, who upload a textbook page or a photo of one and get figures ready for the student.
- **Hackathon judges**, who are sighted, open the live URL and watch a three-minute video.

## Product Purpose

Turn a figure on a textbook page into something a blind student can use: a simplified, high-contrast tactile drawing with braille labels that is ready to print, and a spoken description the student explores by voice, overview first and details on request. Success is a student getting the content of a figure in minutes instead of waiting months for a tactile version, or never getting one.

## Positioning

It does not stop at describing an image. It produces a printable tactile figure that is checked against tactile-graphics rules, and it lets the student ask the figure questions by voice.

## Operating Context

- A teacher works from a textbook page, a scan or a phone photo.
- Tactile figures are printed on swell paper or a braille embosser; the product outputs a print-ready file and does not drive a printer.
- The student uses voice and hearing. The student's side must work without sight.
- The entry is for the Google Cloud AI Builder Cup 2026, theme Sustainability & Social Impact, submission due 18 October 2026. The demo video leads with the student exploring a figure.

## Capabilities and Constraints

- Finds each figure on an uploaded page, writes a layered description, and generates a simplified tactile SVG with braille labels.
- Checks the drawing against tactile-graphics rules (line spacing, label size, clutter) and shows the result.
- Voice exploration of a figure, with questions such as "what is left of the resistor?".
- Spoken descriptions in English and Bahasa Indonesia for the demo.
- AI must be Google's (Gemini). Free-tier quota is small, about 20 requests a day on Gemini 3.8 Flash for this project, so results are saved and never generated twice, and the live site opens on figures already processed.
- No server code: everything runs in the browser against Firebase.
- Undecided: the product name; whether braille labels are produced or checked with a standard braille translation library; which Gemini model handles each step.

## Evidence on Hand

- No blind student, teacher of blind students or tactile printer is available to the team. Nothing may claim user testing, a quote or a print that did not happen.
- Braille and tactile quality are to be shown by automatic checks against published rules, not by a reader's approval.
- AI-generated footage may be used to tell the story in the video and must be labelled as illustration. The product section of the video is a real screen recording.

## Product Principles

1. The student's side works without sight; nothing essential is visual only.
2. Show the check, not a promise: every figure displays what was verified.
3. Never generate the same thing twice; saved results come first.
4. Say only what is true about testing and users.

## Accessibility & Inclusion

Screen-reader and keyboard use are requirements on every screen, not extras. High contrast, large targets, no information carried by colour alone, and all motion respects reduced-motion settings. Spoken output in the student's language.
