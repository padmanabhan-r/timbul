# Fills the AI Builder Cup submission template for Timbul. Keeps the template's own slides, header strip
# and title prompts; adds content below each title in Timbul's yellow and black.
import copy
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn

FONT = "Google Sans Flex"
INK = RGBColor(0, 0, 0)
YEL = RGBColor(0xFF, 0xCC, 0x00)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GREY = RGBColor(0x55, 0x55, 0x55)
SHOTS = "shots/"

prs = Presentation("template.pptx")
S = list(prs.slides)


def text(slide, x, y, w, h, paras, size=12, color=INK, bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, name=None, spacing=4):
    """paras: list of str or list of (str, {opts}) runs per paragraph."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    if name:
        tb.name = name
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = Inches(0.04)
    tf.margin_top = tf.margin_bottom = Inches(0.02)
    tf.vertical_anchor = anchor
    for i, para in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(spacing)
        runs = para if isinstance(para, list) else [(para, {})]
        for t, o in runs:
            r = p.add_run()
            r.text = t
            f = r.font
            f.name = FONT
            f.size = Pt(o.get("size", size))
            f.bold = o.get("bold", bold)
            f.italic = o.get("italic", False)
            f.color.rgb = o.get("color", color)
    return tb


def box(slide, x, y, w, h, fill=YEL, line=None, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.12, name=None):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if name:
        s.name = name
    s.fill.solid()
    s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(1.5)
    s.shadow.inherit = False
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = radius
    s.text_frame.text = ""
    return s


def arrow(slide, x1, y1, x2, y2, color=INK):
    c = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.line.color.rgb = color
    c.line.width = Pt(2)
    ln = c.line._get_or_add_ln()
    tail = ln.makeelement(qn("a:tailEnd"), {"type": "triangle", "w": "med", "len": "med"})
    ln.append(tail)
    return c


def picture(slide, path, x, y, w=None, h=None, border=True):
    pic = slide.shapes.add_picture(path, Inches(x), Inches(y), Inches(w) if w else None, Inches(h) if h else None)
    if border:
        pic.line.color.rgb = INK
        pic.line.width = Pt(1)
    return pic


def set_title(slide, new):
    for sh in slide.shapes:
        if sh.has_text_frame and sh.text_frame.text.strip():
            p = sh.text_frame.paragraphs[0]
            p.runs[0].text = new
            for r in p.runs[1:]:
                r.text = ""
            for extra in list(sh.text_frame.paragraphs[1:]):
                extra._p.getparent().remove(extra._p)
            sh.height = Inches(0.5)
            return sh


def num_dot(slide, x, y, n, d=0.36):
    c = box(slide, x, y, d, d, fill=INK, shape=MSO_SHAPE.OVAL)
    tf = c.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = str(n)
    r.font.name = FONT
    r.font.size = Pt(13)
    r.font.bold = True
    r.font.color.rgb = YEL
    return c


# ---------------------------------------------------------------- slide 1: team details
tb = S[0].shapes[0].text_frame
fill = {"Team name": "HammerLimbo Tech", "Team leader name": "Padmanabhan Rajendrakumar",
        "Problem Statement": "Sustainability & Social Impact. Blind students cannot use the diagrams, graphs and maps in their textbooks; tactile versions are drawn by hand, one figure at a time, so most never reach them."}
for p in tb.paragraphs:
    for key, val in fill.items():
        if p.runs and p.text.strip().startswith(key):
            # insert after the label's run, not at the paragraph's end: a run after <a:endParaRPr>
            # is invalid, and PowerPoint silently drops it (LibreOffice still shows it)
            base = p.runs[-1]
            r = copy.deepcopy(base._r)
            base._r.addnext(r)
            new = p.runs[-1]
            new.text = " " + val
            new.font.bold = False
            new.font.size = Pt(13 if key == "Problem Statement" else 15)

# ---------------------------------------------------------------- slide 3: brief about the idea
s = S[2]
text(s, 0.35, 1.25, 5.6, 0.9, [[("Timbul", {"bold": True, "size": 22}), ("  (Bahasa Indonesia: raised; to emerge)", {"size": 12, "color": GREY})],
                               "Turns any textbook figure into a raised-dot sheet a blind student can feel, and a voice they can ask about it."], size=14)
steps = [
    ("Teacher", "Photographs one textbook page on a laptop or phone."),
    ("Gemini + Timbul", "Gemini finds the figure, reads it, then checks its own drawing against the page and corrects it. Timbul's code draws it in raised dots with braille labels and checks tactile rules. The teacher approves, and prints an A4 sheet numbered in braille."),
    ("Student", "Feels the printed sheet, says its number to open it in Timbul, and asks questions by voice, in English or Bahasa Indonesia."),
]
for i, ((who, what), y) in enumerate(zip(steps, [2.35, 2.95, 4.05]), 1):
    num_dot(s, 0.4, y + 0.02, i)
    text(s, 0.9, y - 0.03, 5.0, 1.0, [[(who + ": ", {"bold": True}), (what, {})]], size=12)
picture(s, SHOTS + "print-sheet-crop.png", 6.2, 1.3, w=3.45)
text(s, 6.2, 4.75, 3.45, 0.5, ["A printed Timbul sheet: raised lines, braille labels and key, sheet number bottom left, orientation notch top right."], size=9, color=GREY)

# ---------------------------------------------------------------- slide 4: opportunities
s = S[3]
set_title(s, "Opportunities")
qs = [
    ("How is it different from existing ideas?", "Image-description tools only say what a picture is, in words. Tactile drawings need a trained transcriber and hours per figure. Timbul does both halves together: an exact, rule-checked raised drawing and a voice that answers questions about that same figure."),
    ("How will it solve the problem?", "One photo becomes a checked, print-ready tactile sheet in about a minute, against 1 to 5 hours by hand. The student explores it alone, by touch and by voice. Audio plus touch works: in one study blind students recalled 55% of a map's layout with an interactive audio model, against 29% with a raised-line map and braille legend (Giraud et al., Frontiers in Psychology, 2017)."),
    ("USP", "The model reads; our code draws. Gemini understands the figure, then Timbul's code places every dot and checks it, so what the student hears always matches what they feel. Built for Southeast Asia, in English and Bahasa Indonesia."),
]
y = 1.3
for q, a in qs:
    text(s, 0.35, y, 5.7, 1.25, [[(q, {"bold": True, "size": 12.5})], a], size=11.5, spacing=2)
    y += 1.33
stats = [("43.3M", "people are blind worldwide", "The Lancet Global Health, 2021 (VLEG, GBD 2020)"),
         ("12.0M", "children and young people (0 to 19) in Southeast Asia live with vision loss", "IAPB Vision Atlas, Southeast Asia (VLEG, GBD 2020)"),
         ("1 to 5 h", "to draw one tactile figure by hand; a science textbook can hold 500 figures", "Ladner et al., ASSETS 2005 (University of Washington)")]
y = 1.3
for big, lab, src in stats:
    b = box(s, 6.3, y, 3.35, 1.22, fill=YEL)
    text(s, 6.42, y + 0.05, 3.1, 0.5, [[(big, {"bold": True, "size": 24})]], size=24)
    text(s, 6.42, y + 0.52, 3.1, 0.7, [lab, [(src, {"size": 8, "color": GREY})]], size=10, spacing=1)
    y += 1.33

# ---------------------------------------------------------------- slide 5: features
s = S[4]
feats = [
    ("Find, zoom, read", "Gemini finds the figure on the page, Timbul crops to it, and Gemini reads the close-up: parts, positions, links."),
    ("Gemini checks itself", "Gemini lays its drawing over the page and corrects what is out of place. Tested: it caught a part we moved and put it back."),
    ("Raised-dot drawing", "Every line as dots at true size, braille labels and key; many repeated items drawn as groups, not a tangle."),
    ("Four rule checks", "Lines 3 mm apart, braille clear of lines, at most 12 parts, every label in braille; crossings and near-misses fixed."),
    ("Teacher approves", "Nothing prints until a teacher compares it with the original. Print-ready A4 SVG, numbered in braille."),
    ("Class library", "Approved sheets are numbered and shared by class code (Firestore). The student says “sheet two” to open one on any device."),
    ("Point and ask", "The phone camera above the printed sheet: she touches a shape and asks “what is this?”; Gemini finds the fingertip and Timbul names the part."),
    ("Explore and ask", "An overview, part by part with keys, and any question by voice, in English or Bahasa Indonesia; answers spoken."),
]
for i, (h, d) in enumerate(feats):
    col, row = i % 4, i // 4
    x, y = 0.35 + col * 2.36, 1.35 + row * 2.0
    box(s, x, y, 2.2, 1.85, fill=YEL if row == 0 else WHITE, line=None if row == 0 else INK)
    num_dot(s, x + 0.12, y + 0.12, i + 1, d=0.32)
    text(s, x + 0.12, y + 0.5, 1.96, 0.4, [[(h, {"bold": True})]], size=12)
    text(s, x + 0.12, y + 0.86, 1.96, 0.95, [d], size=9.5)

# ---------------------------------------------------------------- slide 6: process flow
s = S[5]
text(s, 0.35, 1.25, 1.2, 0.3, [[("TEACHER", {"bold": True, "size": 10})]])
text(s, 0.35, 3.3, 1.2, 0.3, [[("STUDENT", {"bold": True, "size": 10})]])
lane1 = [("Photograph the page", WHITE), ("Gemini finds and reads it", YEL), ("Gemini checks its drawing", YEL), ("Code draws, rules pass", WHITE), ("Teacher approves, prints", WHITE)]
lane2 = [("Feels the sheet", WHITE), ("Says the sheet number", WHITE), ("Explores part by part", WHITE), ("Points: “what is this?”", YEL), ("Asks; Gemini answers, spoken", YEL)]
for lane, y in ((lane1, 1.6), (lane2, 3.65)):
    for i, (t, f) in enumerate(lane):
        x = 0.35 + i * 1.9
        b = box(s, x, y, 1.6, 1.0, fill=f, line=INK)
        text(s, x + 0.05, y + 0.08, 1.5, 0.85, [[(t, {"bold": True})]], size=11, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        if i < len(lane) - 1:
            arrow(s, x + 1.62, y + 0.5, x + 1.88, y + 0.5)
arrow(s, 0.35 + 4 * 1.9 + 0.8, 2.62, 1.15, 3.63)
text(s, 3.2, 2.75, 3.6, 0.35, ["the printed sheet goes to the student"], size=9, color=GREY, align=PP_ALIGN.CENTER)
text(s, 0.35, 4.85, 9.3, 0.5, ["Gemini does the understanding: finding and reading the figure, checking its own drawing against the page, hearing the question. Timbul's own code does the drawing, the braille and the rule checks, so the voice and the paper never disagree."], size=10, color=GREY)

# ---------------------------------------------------------------- slide 7: wireframes / screens
s = S[6]
set_title(s, "Wireframes/Mock diagrams of the proposed solution (optional): the working screens")
for i, (f, cap) in enumerate([("library.png", "Class library: open a sheet by voice, or add a page"), ("add-done.png", "Add a page: Gemini's self-check, four checks, approve"), ("explore.png", "Explore: the sheet, part by part, and the voice panel")]):
    x = 0.35 + i * 3.13
    picture(s, SHOTS + f, x, 1.45, w=2.95)
    text(s, x, 3.42, 2.95, 0.5, [cap], size=10)

# ---------------------------------------------------------------- slide 8: architecture
s = S[7]
def node(x, y, w, h, title, sub, f=WHITE):
    box(s, x, y, w, h, fill=f, line=INK)
    text(s, x + 0.08, y + 0.06, w - 0.16, h - 0.1, [[(title, {"bold": True, "size": 11.5})], sub], size=9, spacing=1)
node(0.35, 1.45, 2.0, 1.2, "Browser", "Teacher's laptop or phone; student's phone or laptop with a screen reader. React web app.")
node(2.85, 1.45, 2.0, 1.2, "Firebase Hosting", "Serves the web app over HTTPS.", YEL)
node(5.35, 1.45, 2.1, 1.2, "Cloud Run service", "One container: the app and the API (/locate, /read, /verify, /ask, /speak, /sheet, /library). Spending guard.", YEL)
node(7.85, 1.15, 1.8, 0.95, "Gemini 3.8 Flash", "Reads the figure, checks its own drawing, finds the fingertip on the sheet.")
node(7.85, 2.2, 1.8, 0.95, "Gemini 3.5 Flash-Lite", "Finds the figure; hears questions and sheet numbers; answers.")
node(7.85, 3.25, 1.8, 0.95, "Gemini 3.8 Flash TTS", "Speaks every answer and part name.")
node(2.85, 3.3, 2.0, 1.05, "Firestore", "The class library: approved sheets, their numbers, shared across devices.", YEL)
node(5.35, 3.3, 2.1, 1.05, "Secret Manager", "The Gemini keys, read by Cloud Run; never in code or the browser.", YEL)
node(0.35, 3.3, 2.0, 1.05, "Timbul's code (in the app)", "Dot layout, braille, rule checks, A4 SVG export.")
for (x1, y1, x2, y2) in [(2.35, 2.05, 2.83, 2.05), (4.85, 2.05, 5.33, 2.05), (7.45, 1.8, 7.83, 1.62), (7.45, 2.05, 7.83, 2.67), (7.45, 2.3, 7.83, 3.7), (6.4, 2.65, 6.4, 3.28), (5.6, 2.65, 4.0, 3.28), (1.35, 2.65, 1.35, 3.28)]:
    arrow(s, x1, y1, x2, y2)
text(s, 0.35, 4.55, 9.3, 0.8, ["Gemini is called through Google's Gemini API, trying several Gemini models when one is busy; OpenRouter (the same Gemini models) is the backup. Cloud Run is capped at one instance and the API refuses calls past a daily limit, so the demo stays inside the free tier."], size=9.5, color=GREY)

# ---------------------------------------------------------------- slide 9: technologies
s = S[8]
cols = [
    ("Google AI", ["Gemini 3.8 Flash: reads figures into structured JSON, checks its own drawing, and finds a fingertip on the printed sheet (vision, two images)", "Gemini 3.5 Flash-Lite: finds the figure; spoken questions and sheet numbers (audio in)", "Gemini 3.8 Flash TTS: Timbul's voice", "Fallbacks: Gemini 3.7, 3.6 and 3.5 Flash"]),
    ("Google Cloud", ["Cloud Run: the app and its API", "Firestore: the class library", "Secret Manager: the keys", "Cloud Build and Artifact Registry", "Firebase Hosting: the short address"]),
    ("Our own code", ["Tactile layout engine: dots, occlusion, label placement", "Uncontracted braille in standard 6 mm cells", "Four rule checks with automatic fixes", "A4 SVG export at real millimetres"]),
    ("App", ["React, TypeScript, Vite", "Web Audio microphone capture", "IndexedDB copy for offline use", "Screen-reader labels, keyboard use"]),
]
for i, (h, items) in enumerate(cols):
    x = 0.35 + i * 2.36
    box(s, x, 1.35, 2.2, 0.45, fill=INK)
    text(s, x + 0.1, 1.38, 2.0, 0.4, [[(h, {"bold": True, "color": YEL})]], size=12, anchor=MSO_ANCHOR.MIDDLE)
    text(s, x + 0.05, 1.95, 2.12, 3.3, items, size=10, spacing=7)

# ---------------------------------------------------------------- slide 10: cost
s = S[9]
rows = [("One figure", "Three to five Gemini calls: find the figure, read it, check the drawing (twice at most). Drawing, braille and rule checks run in Timbul's own code."),
        ("One question", "One small Gemini call, plus one speech call; spoken lines are cached and replayed free."),
        ("Hosting", "Cloud Run scales to zero and is capped at one instance; Firestore and Firebase Hosting within free allowances."),
        ("Printing", "Swell paper is about US$1.30 an A4 sheet; fusers cost US$650 to 1,800; embossers from about US$4,700 (HumanWare, RNIB). About 48 Indonesian special schools own the same imported embosser and most no longer work (ITS Sewagati, 2023). So the voice guide works with no printer, and a teacher can build the sheet by hand from Timbul's layout (Perkins collage method)."),
        ("Who pays", "Indonesia's 2,396 special schools (4,229 blind students, Kemendikdasmen 2025), braille production centres such as BLBI Abiyoso, and publishers: PP 13/2020 requires government budgets for students' reasonable accommodation, and Indonesia ratified the Marrakesh Treaty in 2020.")]
y = 1.3
for h, d in rows:
    tall = len(d) > 220
    hh = 0.95 if tall else 0.6
    box(s, 0.35, y, 1.7, hh, fill=YEL)
    text(s, 0.45, y + 0.04, 1.55, hh - 0.08, [[(h, {"bold": True})]], size=12, anchor=MSO_ANCHOR.MIDDLE)
    text(s, 2.2, y + 0.02, 7.45, hh - 0.04, [d], size=9.5, anchor=MSO_ANCHOR.MIDDLE, spacing=1)
    y += hh + 0.1

# ---------------------------------------------------------------- slide 11: snapshots
s = S[10]
picture(s, SHOTS + "self-check.png", 0.35, 1.4, w=4.55)
picture(s, SHOTS + "explore-id.png", 5.1, 1.4, w=4.55)
text(s, 0.35, 4.05, 4.55, 0.5, ["Gemini lays its own drawing over the page to check it, before the sheet is drawn and approved."], size=10)
text(s, 5.1, 4.05, 4.55, 0.5, ["The same figure in Bahasa Indonesia: a spoken question, a spoken answer."], size=10)

# ---------------------------------------------------------------- slide 12: performance
s = S[11]
perf = [("4 of 4", "Point and ask photos answered correctly: two parts, the same photo upside down, and no finger (7 to 21 s each; test photos were generated, not a real printed sheet)"),
        ("about 30 s", "from a photo of a textbook page to a checked sheet: find the figure 1 to 2 s, read 10 to 26 s, self-check 10 to 35 s (Gemini 3.8 Flash)"),
        ("1 round", "for the self-check to catch a part we moved on purpose (the nucleus) and put it back; the second round confirmed the fix"),
        ("4 of 4", "checks passed by the plant cell page (closest lines 3.1 mm against a 3 mm rule) and by a neural-network diagram after grouping"),
        ]
for i, (big, lab) in enumerate(perf):
    x = 0.35 + (i % 2) * 4.7
    y = 1.35 + (i // 2) * 1.35
    box(s, x, y, 4.5, 1.2, fill=YEL)
    text(s, x + 0.15, y + 0.08, 4.2, 0.5, [[(big, {"bold": True, "size": 22})]])
    text(s, x + 0.15, y + 0.6, 4.2, 0.6, [lab], size=10)
text(s, 0.35, 4.15, 9.3, 1.2, [[("How we measured: ", {"bold": True}), ("our own runs on 14 and 15 October 2026: a textbook page with an openly licensed plant cell figure, a series circuit, a neural-network diagram and the USGS water cycle, using scripts/check-reading.mjs and scripts/check-point.mjs in the repository.", {})],
                                [("Honest limits: ", {"bold": True}), ("busy scenes are the weak spot: the water cycle now passes all four checks, but its landscape comes out as large boxy regions. Some key letters sit outside their part when no clear spot is inside. No blind student or teacher has tested Timbul yet, and no sheet has been printed on swell paper yet.", {})]], size=10.5)

# ---------------------------------------------------------------- slide 13: future
s = S[12]
fut = [("Point and ask on real sheets", "It works on photos today; next, a phone stand and tests with printed swell-paper sheets and real fingers, then live video instead of a photo."),
       ("A phone screen built for screen readers", "VoiceOver and TalkBack can already swipe through every part; next, a one-button screen for asking and pointing, usable with the screen off."),
       ("Test with real users", "Sessions with blind students and their teachers at special schools in Indonesia and India, then fix what they find."),
       ("More languages and contracted braille", "Tamil, Thai and Vietnamese next; contracted braille through a standard braille library."),
       ("Shared across schools", "Class libraries already share sheets within a class; next, a national library so each textbook figure is made once for every school, with lead lines for labels.")]
y = 1.3
for i, (h, d) in enumerate(fut, 1):
    num_dot(s, 0.35, y + 0.02, i, d=0.32)
    text(s, 0.8, y - 0.02, 8.8, 0.72, [[(h + ": ", {"bold": True}), (d, {})]], size=11)
    y += 0.8

# ---------------------------------------------------------------- slide 14: links
s = S[13]
tb = [sh for sh in s.shapes if sh.has_text_frame and sh.text_frame.text.strip()][0]
links = {"GitHub Public Repository": "github.com/padmanabhan-r/timbul", "Demo Video Link (3 Minutes)": "youtu.be/vN8Nwi9wOWY", "Final Product Link": "to be added after deployment"}
for p in tb.text_frame.paragraphs:
    for key, val in links.items():
        if p.text.strip().startswith(key):
            r = copy.deepcopy(p.runs[-1]._r)
            p.runs[-1]._r.addnext(r)
            p.runs[-1].text = ": " + val
            p.runs[-1].font.bold = True

# ---------------------------------------------------------------- remove the instructions slide and the blank slide
def drop(index):
    sldIdLst = prs.slides._sldIdLst
    sld = list(sldIdLst)[index]
    prs.part.drop_rel(sld.rId)
    sldIdLst.remove(sld)
drop(14)  # blank slide 15
drop(1)   # the "download this template" note

prs.save("Timbul - AI Builder Cup.pptx")
print("saved")
