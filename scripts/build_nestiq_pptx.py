"""NestIQ Pro — professional widescreen PowerPoint (16:9)."""
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import nsmap
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt
from lxml import etree
import copy
import os

INK = RGBColor(0x0E, 0x11, 0x17)
INK2 = RGBColor(0x17, 0x1C, 0x28)
CREAM = RGBColor(0xF7, 0xF4, 0xEF)
PAPER = RGBColor(0xFF, 0xFC, 0xF8)
GOLD = RGBColor(0xC9, 0xA8, 0x4C)
GOLD_DEEP = RGBColor(0xB8, 0x94, 0x3E)
SAGE = RGBColor(0x5A, 0x7A, 0x60)
MUTED = RGBColor(0x6B, 0x66, 0x5E)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
LINE = RGBColor(0xE6, 0xDF, 0xD2)
RUST = RGBColor(0xC4, 0x6A, 0x3A)

W, H = Inches(13.333), Inches(7.5)
SLIDE_W, SLIDE_H = 13.333, 7.5


def rgb_hex(c):
    return f"{c[0]:02X}{c[1]:02X}{c[2]:02X}"


def set_run(run, size=18, bold=False, color=INK, font="Calibri", italic=False):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = color
    run.font.name = font
    rPr = run._r.get_or_add_rPr()
    for tag in ("latin", "ea", "cs"):
        el = rPr.find(qn(f"a:{tag}"))
        if el is None:
            el = etree.SubElement(rPr, qn(f"a:{tag}"))
        el.set("typeface", font)


def fill_shape(shape, color):
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()


def stroke_shape(shape, color, pt=1.0):
    shape.line.color.rgb = color
    shape.line.width = Pt(pt)


def add_rect(slide, l, t, w, h, fill, line=None, radius=None):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE,
                                   Inches(l), Inches(t), Inches(w), Inches(h))
    fill_shape(shape, fill)
    if line:
        stroke_shape(shape, line, 1)
    else:
        shape.line.fill.background()
    if radius is not None:
        shape.adjustments[0] = radius
    return shape


def add_oval(slide, l, t, w, h, fill):
    s = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(l), Inches(t), Inches(w), Inches(h))
    fill_shape(s, fill)
    return s


def tb(slide, l, t, w, h, text, size=18, bold=False, color=INK, font="Calibri",
       align=PP_ALIGN.LEFT, italic=False, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(Inches(l), Inches(t), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    try:
        tf._txBody.bodyPr.set("anchor", {MSO_ANCHOR.TOP: "t", MSO_ANCHOR.MIDDLE: "ctr", MSO_ANCHOR.BOTTOM: "b"}[anchor])
    except Exception:
        pass
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    set_run(run, size=size, bold=bold, color=color, font=font, italic=italic)
    return box


def multiline(slide, l, t, w, h, lines, size=15, color=MUTED, font="Calibri", spacing=8):
    box = slide.shapes.add_textbox(Inches(l), Inches(t), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = PP_ALIGN.LEFT
        p.space_after = Pt(spacing)
        run = p.add_run()
        run.text = line
        set_run(run, size=size, color=color, font=font)
    return box


def footer(slide, n, total, dark=False):
    c = RGBColor(0xA8, 0xA0, 0x92) if not dark else RGBColor(0x8A, 0x84, 0x78)
    if not dark:
        add_rect(slide, 0, 7.22, SLIDE_W, 0.03, LINE)
    tb(slide, 0.7, 7.22, 6, 0.28, "NESTIQ  ·  SMART PROPERTY MANAGEMENT",
       size=9, color=c, font="Calibri", bold=True)
    tb(slide, 10.6, 7.22, 2.0, 0.28, f"{n:02d}  /  {total:02d}",
       size=9, color=c, font="Calibri", align=PP_ALIGN.RIGHT, bold=True)


def kicker(slide, text, y=0.38):
    tb(slide, 0.7, y, 12, 0.28, text.upper(), size=11, bold=True, color=GOLD_DEEP, font="Calibri")


def title(slide, text, y=0.62, w=12.0, size=28):
    tb(slide, 0.7, y, w, 0.9, text, size=size, bold=False, color=INK, font="Georgia")


def gold_rule(slide, l=0.7, t=1.48, w=0.72):
    add_rect(slide, l, t, w, 0.045, GOLD)


def card(slide, l, t, w, h):
    return add_rect(slide, l, t, w, h, WHITE, line=LINE, radius=0.08)


def new_slide(prs, bg=PAPER):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_rect(s, 0, 0, SLIDE_W, SLIDE_H, bg)
    return s


def cover(prs, total):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_rect(s, 0, 0, SLIDE_W, SLIDE_H, INK)
    add_rect(s, 9.6, -1.2, 5.2, 5.2, INK2)
    add_oval(s, 10.4, -0.6, 4.2, 4.2, RGBColor(0x1E, 0x24, 0x34))
    add_oval(s, 11.35, 0.35, 0.22, 0.22, GOLD)
    add_rect(s, 0, 0, 0.12, SLIDE_H, GOLD)
    tb(s, 0.85, 0.7, 8, 0.3, "●   NESTIQ PRO", size=13, bold=True, color=GOLD, font="Calibri")
    tb(s, 0.85, 1.85, 10.5, 2.1, "Rental management,\nin one place.", size=40, color=WHITE, font="Georgia")
    tb(s, 0.85, 4.15, 9.2, 0.9,
       "A South African web system for landlords, tenants, caretakers and contractors —\nrent, repairs, payouts and receipts in a single record.",
       size=16, color=RGBColor(0xC8, 0xC2, 0xB6), font="Calibri")
    add_rect(s, 0.85, 5.2, 0.7, 0.045, GOLD)
    metas = [
        ("PRESENTED BY", "Ntiyiso Justin"),
        ("MODULE", "BICT300  ·  Project300"),
        ("DATE", "27 September 2026"),
    ]
    x = 0.85
    for k, v in metas:
        tb(s, x, 5.55, 3.5, 0.22, k, size=10, bold=True, color=GOLD, font="Calibri")
        tb(s, x, 5.82, 3.5, 0.4, v, size=16, color=WHITE, font="Calibri")
        x += 3.7
    tb(s, 0.85, 6.85, 8, 0.28, "nestiq-pro.web.app", size=12, color=RGBColor(0xA8, 0xA0, 0x92), font="Calibri")
    return s


def outline_slide(prs, n, total):
    s = new_slide(prs)
    kicker(s, "01  —  Presentation outline")
    title(s, "What we will walk through")
    gold_rule(s)
    items = [
        ("01", "Introduction", "The South African rental problem NestIQ is built to solve."),
        ("02", "Description of the system", "Four roles, one product, money and work in Rand."),
        ("03", "System architecture", "Vanilla JS client, Firebase Auth, Firestore, Storage, Hosting."),
        ("04", "Data flow diagrams", "How rent, invitations, and maintenance move through the system."),
        ("05", "Entity-relationship model", "The core records: people, property, money, and jobs."),
        ("06", "Demonstration", "A live loop: chat, repair, complete, pay, receipt."),
    ]
    for i, (num, h, sub) in enumerate(items):
        col, row = i % 2, i // 2
        l, t = 0.7 + col * 6.25, 1.85 + row * 1.55
        card(s, l, t, 5.95, 1.38)
        tb(s, l + 0.28, t + 0.28, 0.7, 0.5, num, size=20, color=GOLD_DEEP, font="Georgia")
        tb(s, l + 1.1, t + 0.28, 4.5, 0.4, h, size=16, bold=True, color=INK, font="Calibri")
        tb(s, l + 1.1, t + 0.7, 4.5, 0.5, sub, size=13, color=MUTED, font="Calibri")
    footer(s, n, total)
    return s


def intro_problem(prs, n, total):
    s = new_slide(prs)
    kicker(s, "02  —  Introduction")
    title(s, "Small landlords run rentals in fragments.")
    gold_rule(s)
    points = [
        "Rent due dates live in a spreadsheet — if they live anywhere.",
        "Repairs are a WhatsApp thread with no status, photos, or cost.",
        "Tenants cannot see whether they are paid, overdue, or waiting.",
        "Contractors get paid offline, with no receipt in the same system.",
    ]
    for i, p in enumerate(points):
        y = 1.85 + i * 0.78
        add_rect(s, 0.7, y, 7.5, 0.68, WHITE, line=LINE, radius=0.06)
        add_rect(s, 0.7, y, 0.08, 0.68, GOLD)
        tb(s, 1.05, y + 0.16, 6.9, 0.42, p, size=15, color=INK, font="Calibri")
    add_rect(s, 8.5, 1.85, 4.1, 3.85, INK, radius=0.08)
    tb(s, 8.8, 2.15, 3.5, 0.3, "THE COST", size=11, bold=True, color=GOLD, font="Calibri")
    tb(s, 8.8, 2.6, 3.5, 2.6,
       "Not a missing feature.\nA missing record —\nwho paid, who fixed it,\nand what it cost.",
       size=18, color=WHITE, font="Georgia")
    footer(s, n, total)
    return s


def intro_context(prs, n, total):
    s = new_slide(prs)
    kicker(s, "03  —  Introduction")
    title(s, "Built for this market, not translated later.")
    gold_rule(s)
    tiles = [
        ("Rand, always", "Rent, expenses, late fees and contractor payouts display in ZAR."),
        ("Local lease habits", "Notice periods and rent-increase copy follow Rental Housing Act practice."),
        ("Languages", "English, Afrikaans, isiZulu, isiXhosa and Sesotho on key screens."),
        ("Banks they know", "FNB, Standard Bank, Absa, Nedbank and Capitec in the EFT step."),
        ("WhatsApp, honestly", "Reminders open WhatsApp with a filled message. The landlord still taps send."),
        ("Hosted live", "Firebase project nestiq-pro. Demo at nestiq-pro.web.app."),
    ]
    for i, (h, p) in enumerate(tiles):
        col, row = i % 3, i // 3
        l, t = 0.7 + col * 4.1, 1.85 + row * 2.35
        card(s, l, t, 3.9, 2.15)
        add_rect(s, l, t, 0.1, 2.15, GOLD)
        tb(s, l + 0.32, t + 0.28, 3.35, 0.45, h, size=16, bold=True, color=INK, font="Calibri")
        tb(s, l + 0.32, t + 0.85, 3.35, 1.05, p, size=13, color=MUTED, font="Calibri")
    footer(s, n, total)
    return s


def system_roles(prs, n, total):
    s = new_slide(prs)
    kicker(s, "04  —  Description of the system")
    title(s, "One system for the people who run a building.")
    gold_rule(s)
    tb(s, 0.7, 1.58, 12, 0.4, "The landlord owns the portfolio. Everyone else is invited in — they only see their work.",
       size=15, color=MUTED, font="Calibri")
    roles = [
        ("LANDLORD", "Command centre", "Properties, tenants, leases, rent roll, expenses, maintenance and contractor payouts."),
        ("TENANT", "Self-service portal", "Pay rent, report a fault, chat, and download a receipt — without another WhatsApp group."),
        ("CARETAKER", "On-site operations", "Log issues, review urgency, and assign a contractor within the landlord’s spend limit."),
        ("CONTRACTOR", "Job portal", "Accept, start, complete with parts and photos. They cannot mark themselves paid."),
    ]
    for i, (who, h, p) in enumerate(roles):
        l = 0.7 + i * 3.1
        card(s, l, 2.2, 2.95, 4.35)
        add_rect(s, l, 2.2, 2.95, 0.1, GOLD)
        tb(s, l + 0.22, 2.5, 2.5, 0.3, who, size=11, bold=True, color=GOLD_DEEP, font="Calibri")
        tb(s, l + 0.22, 2.9, 2.5, 0.9, h, size=18, color=INK, font="Georgia")
        tb(s, l + 0.22, 3.9, 2.5, 2.2, p, size=13, color=MUTED, font="Calibri")
    footer(s, n, total)
    return s


def system_modules(prs, n, total):
    s = new_slide(prs)
    kicker(s, "05  —  Description of the system")
    title(s, "The landlord dashboard is the portfolio.")
    gold_rule(s)
    tiles = [
        ("Portfolio", "Properties, units, listings, applications, deposits, and a map of the book."),
        ("Money", "Rent roll, late fees, expenses, reconcile, tax pack, ROI — amounts in Rand."),
        ("Work", "Maintenance board, inspections, calendar, renewals, and vendor bank details."),
        ("People", "Tenants, staff, caretakers and contractors — each invited with a role."),
        ("Messages", "In-app chat with unread badges so a tenant is not lost in WhatsApp."),
        ("Proof", "Pay rent or a contractor in-app. Download a NestIQ receipt for the file."),
    ]
    for i, (h, p) in enumerate(tiles):
        col, row = i % 3, i // 3
        l, t = 0.7 + col * 4.1, 1.85 + row * 2.35
        card(s, l, t, 3.9, 2.15)
        tb(s, l + 0.28, t + 0.28, 3.35, 0.4, h, size=16, bold=True, color=INK, font="Calibri")
        tb(s, l + 0.28, t + 0.8, 3.35, 1.1, p, size=13, color=MUTED, font="Calibri")
    footer(s, n, total)
    return s


def architecture(prs, n, total):
    s = new_slide(prs)
    kicker(s, "06  —  System architecture")
    title(s, "Firebase is the infrastructure. The product logic is ours.")
    gold_rule(s)
    layers = [
        (0.7, "Presentation", "HTML, CSS, vanilla JavaScript. Hash routing. Role-specific dashboards."),
        (3.7, "Application", "Auth flows, invitations, leases, rent status, maintenance workflow, receipts."),
        (6.7, "Platform", "Firebase Auth, Cloud Firestore, Cloud Storage, Hosting, Cloud Functions."),
        (9.7, "Security", "Firestore rules constrain writes. Passwords never sit in our database."),
    ]
    for x, h, p in layers:
        add_rect(s, x, 1.9, 2.8, 3.55, WHITE, line=LINE, radius=0.08)
        add_rect(s, x, 1.9, 2.8, 0.12, GOLD)
        tb(s, x + 0.2, 2.25, 2.4, 0.7, h, size=16, bold=True, color=INK, font="Georgia")
        tb(s, x + 0.2, 3.05, 2.4, 2.0, p, size=13, color=MUTED, font="Calibri")
    pills = ["Firebase Auth", "Cloud Firestore", "Storage", "Hosting", "Cloud Functions", "PWA / service worker"]
    for i, lab in enumerate(pills):
        x = 0.7 + i * 2.05
        add_rect(s, x, 5.7, 1.95, 0.42, WHITE, line=LINE, radius=0.2)
        tb(s, x, 5.76, 1.95, 0.32, lab, size=11, bold=True, color=INK, font="Calibri", align=PP_ALIGN.CENTER)
    footer(s, n, total)
    return s


def architecture_detail(prs, n, total):
    s = new_slide(prs)
    kicker(s, "07  —  System architecture")
    title(s, "Landlord-scoped data. Realtime where it matters.")
    gold_rule(s)
    # simple architecture diagram
    boxes = [
        (0.7, 1.95, 3.6, 1.15, "Landlord / Tenant / Staff\nbrowsers", CREAM),
        (5.0, 1.95, 3.3, 1.15, "NestIQ client\n(vanilla JS SPA)", WHITE),
        (9.0, 1.95, 3.5, 1.15, "Firebase Hosting\n+ Auth", WHITE),
        (1.6, 4.0, 3.3, 1.2, "Cloud Firestore\nlandlords/{id}/…", WHITE),
        (5.2, 4.0, 3.0, 1.2, "Cloud Storage\nphotos & docs", WHITE),
        (8.6, 4.0, 3.6, 1.2, "Cloud Functions\nemail · webhooks", WHITE),
    ]
    for l, t, w, h, txt, fill in boxes:
        add_rect(s, l, t, w, h, fill, line=LINE, radius=0.08)
        tb(s, l + 0.12, t + 0.22, w - 0.24, h - 0.3, txt, size=14, color=INK, font="Calibri", align=PP_ALIGN.CENTER)
    tb(s, 0.7, 3.3, 12, 0.4, "HTTPS  ·  ID tokens  ·  snapshot listeners", size=13, color=GOLD_DEEP, font="Calibri", align=PP_ALIGN.CENTER)
    tb(s, 0.7, 5.5, 12, 1.2,
       "Each landlord’s properties, tenants, payments and jobs live under landlords/{landlordId}. "
       "Tenants, caretakers and contractors may only write the fields their role allows. "
       "A contractor completing a job appears on the landlord board without a page reload.",
       size=14, color=MUTED, font="Calibri")
    footer(s, n, total)
    return s


def dfd_context(prs, n, total):
    s = new_slide(prs)
    kicker(s, "08  —  Data flow diagrams")
    title(s, "Context diagram — NestIQ as one process.")
    gold_rule(s)
    actors = [
        (0.55, 2.15, "Landlord"),
        (0.55, 4.55, "Tenant"),
        (10.85, 2.15, "Caretaker"),
        (10.85, 4.55, "Contractor"),
    ]
    for l, t, name in actors:
        add_oval(s, l, t, 1.9, 1.15, CREAM)
        stroke_shape(s.shapes[-1], GOLD, 1.25)
        tb(s, l, t + 0.38, 1.9, 0.45, name, size=14, bold=True, color=INK, font="Calibri", align=PP_ALIGN.CENTER)
    add_rect(s, 4.15, 2.7, 5.05, 2.35, INK, radius=0.08)
    tb(s, 4.3, 3.15, 4.75, 0.5, "0  NestIQ Pro", size=20, color=WHITE, font="Georgia", align=PP_ALIGN.CENTER)
    tb(s, 4.3, 3.75, 4.75, 0.85, "Invite  ·  Occupy  ·  Collect rent\nAssign work  ·  Pay  ·  Receipt",
       size=13, color=GOLD, font="Calibri", align=PP_ALIGN.CENTER)
    tb(s, 0.7, 6.05, 12, 0.7,
       "External entities interact with NestIQ. Persistence is Firebase (Auth, Firestore, Storage) — shown on the next slides as data stores.",
       size=14, color=MUTED, font="Calibri")
    footer(s, n, total)
    return s


def dfd_rent(prs, n, total):
    s = new_slide(prs)
    kicker(s, "09  —  Data flow diagrams")
    title(s, "Rent collection — from due to receipt.")
    gold_rule(s)
    steps = [
        ("1", "Lease &\nunit rent", "Obligation uses monthly unit rent, not a prorated guess."),
        ("2", "Tenant\npays in-app", "Card or EFT wizard. Amount = rent + late fee if any."),
        ("3", "Payment\nrecord", "Written to landlords/{id}/payments with tenantUid."),
        ("4", "Both sides\nupdate", "Portal shows Paid. Landlord Home, Tenants and Rent Roll show collected."),
    ]
    for i, (num, h, p) in enumerate(steps):
        l = 0.55 + i * 3.2
        card(s, l, 1.95, 2.95, 3.55)
        tb(s, l + 0.2, 2.15, 2.55, 0.5, num, size=22, color=GOLD_DEEP, font="Georgia")
        tb(s, l + 0.2, 2.7, 2.55, 0.9, h, size=16, bold=True, color=INK, font="Calibri")
        tb(s, l + 0.2, 3.7, 2.55, 1.5, p, size=13, color=MUTED, font="Calibri")
        if i < 3:
            tb(s, l + 2.7, 3.4, 0.5, 0.4, "→", size=20, color=GOLD, font="Calibri")
    tb(s, 0.7, 5.7, 12, 0.9,
       "School honesty: the wizard records the payment in NestIQ. It does not debit FNB or Capitec. PayFast is the intended live gateway.",
       size=14, color=MUTED, font="Calibri")
    footer(s, n, total)
    return s


def dfd_maint(prs, n, total):
    s = new_slide(prs)
    kicker(s, "10  —  Data flow diagrams")
    title(s, "Maintenance — a job has a life, not an emoji.")
    gold_rule(s)
    steps = [
        ("Report", "Tenant logs a fault with photos and a suggested urgency."),
        ("Triage", "Landlord or caretaker sets official priority and assigns a contractor."),
        ("Work", "Contractor Accept → Start → Complete with parts, labour and photos."),
        ("Pay", "Landlord pays in-app. Contractor sees Paid. They cannot self-mark paid."),
    ]
    for i, (h, p) in enumerate(steps):
        l = 0.55 + i * 3.2
        add_rect(s, l, 2.05, 2.95, 3.4, WHITE, line=LINE, radius=0.08)
        add_oval(s, l + 1.1, 2.28, 0.72, 0.72, GOLD)
        tb(s, l + 1.1, 2.42, 0.72, 0.5, str(i + 1), size=18, bold=True, color=INK, font="Georgia", align=PP_ALIGN.CENTER)
        tb(s, l + 0.18, 3.2, 2.6, 0.5, h, size=16, bold=True, color=INK, font="Calibri", align=PP_ALIGN.CENTER)
        tb(s, l + 0.18, 3.75, 2.6, 1.4, p, size=13, color=MUTED, font="Calibri", align=PP_ALIGN.CENTER)
    footer(s, n, total)
    return s


def erd(prs, n, total):
    s = new_slide(prs)
    kicker(s, "11  —  Entity-relationship model")
    title(s, "Core records under each landlord.")
    gold_rule(s)

    def entity(l, t, w, h, name, fields):
        add_rect(s, l, t, w, h, WHITE, line=LINE, radius=0.06)
        add_rect(s, l, t, w, 0.38, INK)
        tb(s, l, t + 0.05, w, 0.3, name, size=12, bold=True, color=WHITE, font="Calibri", align=PP_ALIGN.CENTER)
        tb(s, l + 0.12, t + 0.46, w - 0.2, h - 0.52, fields, size=10, color=MUTED, font="Calibri")

    entity(0.5, 1.78, 2.45, 2.05, "USER / AUTH", "uid\nemail\nrole\nlandlordId")
    entity(3.15, 1.78, 2.45, 2.05, "PROPERTY", "name  ·  address\nunits[]\nstatus")
    entity(5.8, 1.78, 2.45, 2.05, "UNIT", "label  ·  rent\nstatus\ntenantId")
    entity(8.45, 1.78, 2.45, 2.05, "TENANT", "name  ·  email\nunitId  ·  lease\nprofilePhoto")
    entity(10.95, 1.78, 1.9, 2.05, "LEASE", "start / end\nrent  ·  status\nsignatures")

    entity(1.3, 4.2, 2.55, 1.95, "PAYMENT", "tenantId  ·  uid\namount  ·  date\nreceiptNo")
    entity(4.2, 4.2, 2.7, 1.95, "MAINTENANCE", "propertyId\ncontractorId\nstatus  ·  cost")
    entity(7.2, 4.2, 2.55, 1.95, "MESSAGE", "tenantId\nfromRole\nread / unread")
    entity(10.05, 4.2, 2.55, 1.95, "INVITATION", "code  ·  role\ntenant / staff\nexpires")

    tb(s, 0.7, 6.3, 12, 0.5,
       "1 landlord  →  many properties  →  many units. A unit has at most one active tenant. Payments and jobs always carry tenantId and landlord scope.",
       size=13, color=MUTED, font="Calibri")
    footer(s, n, total)
    return s


def demo(prs, n, total):
    s = new_slide(prs)
    kicker(s, "12  —  Demonstration")
    title(s, "Two browsers. One loop. That is the demo.")
    gold_rule(s)
    steps = [
        "Landlord: open a tenant, send a chat. Tenant window: unread badge, reply.",
        "Tenant: report a leak and suggest urgency. Landlord: confirm official priority.",
        "Contractor: Accept → Start → Complete with parts and a total.",
        "Landlord: Pay contractor. Download the payout receipt.",
        "Tenant: pay this month’s rent. Portal and Rent Roll both show Paid.",
    ]
    for i, line in enumerate(steps):
        y = 1.85 + i * 0.78
        add_rect(s, 0.7, y, 8.1, 0.68, WHITE, line=LINE, radius=0.06)
        tb(s, 0.9, y + 0.14, 0.6, 0.42, f"{i+1:02d}", size=16, color=GOLD_DEEP, font="Georgia")
        tb(s, 1.55, y + 0.16, 7.0, 0.42, line, size=14, color=INK, font="Calibri")
    add_rect(s, 9.05, 1.85, 3.55, 4.55, INK, radius=0.08)
    tb(s, 9.3, 2.15, 3.1, 0.3, "HOW TO RUN IT", size=11, bold=True, color=GOLD, font="Calibri")
    tb(s, 9.3, 2.6, 3.1, 3.4,
       "Keep the live site as landlord in one window.\n\nOpen a second window for tenant or contractor.\n\nThe loop is the product — do not click every menu.",
       size=14, color=WHITE, font="Calibri")
    footer(s, n, total)
    return s


def honesty(prs, n, total):
    s = new_slide(prs)
    kicker(s, "13  —  Scope")
    title(s, "What is live, and what is a school simulation.")
    gold_rule(s)
    add_rect(s, 0.7, 1.9, 5.85, 4.55, RGBColor(0xEE, 0xF3, 0xEE), line=RGBColor(0xC5, 0xD4, 0xC6), radius=0.08)
    tb(s, 1.0, 2.15, 5.3, 0.4, "Working in the product", size=18, color=SAGE, font="Georgia")
    live = [
        "Accounts, invitations, and role split",
        "Properties, units, tenants, leases",
        "Chat with unread badges",
        "Full contractor job workflow",
        "In-app receipts after rent and payouts",
        "Firestore security rules on the server",
    ]
    multiline(s, 1.0, 2.7, 5.3, 3.4, ["•  " + x for x in live], size=14, color=INK, spacing=6)

    add_rect(s, 6.8, 1.9, 5.85, 4.55, RGBColor(0xF8, 0xF1, 0xDC), line=RGBColor(0xE6, 0xD4, 0xA0), radius=0.08)
    tb(s, 7.1, 2.15, 5.3, 0.4, "Designed, not charging a bank", size=18, color=GOLD_DEEP, font="Georgia")
    sim = [
        "Card / EFT wizard does not debit a real bank",
        "PayFast is the intended gateway — not live charging",
        "WhatsApp is pre-filled, not automated",
        "AI suggests; it does not replace a credit check",
        "Receipts are NestIQ proof, not SARS tax invoices",
    ]
    multiline(s, 7.1, 2.7, 5.3, 3.4, ["•  " + x for x in sim], size=14, color=INK, spacing=6)
    footer(s, n, total)
    return s


def close_slide(prs, n, total):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_rect(s, 0, 0, SLIDE_W, SLIDE_H, INK)
    add_rect(s, 0, 0, 0.12, SLIDE_H, GOLD)
    tb(s, 0.85, 0.7, 8, 0.3, "THANK YOU", size=12, bold=True, color=GOLD, font="Calibri")
    tb(s, 0.85, 1.7, 11, 1.2, "Questions.", size=48, color=WHITE, font="Georgia")
    tb(s, 0.85, 3.15, 10, 1.2,
       "If we only remember one sentence: NestIQ turns WhatsApp and Excel into a record — who paid, who fixed it, and what it cost.",
       size=18, color=RGBColor(0xC8, 0xC2, 0xB6), font="Calibri")
    add_rect(s, 0.85, 4.55, 0.7, 0.045, GOLD)
    metas = [
        ("LIVE DEMO", "nestiq-pro.web.app"),
        ("PRESENTED BY", "Ntiyiso Justin"),
        ("MODULE", "BICT300  ·  Project300"),
    ]
    x = 0.85
    for k, v in metas:
        tb(s, x, 5.0, 3.7, 0.25, k, size=10, bold=True, color=GOLD, font="Calibri")
        tb(s, x, 5.32, 3.7, 0.4, v, size=16, color=WHITE, font="Calibri")
        x += 3.8
    tb(s, 0.85, 6.85, 8, 0.28, "Honesty scores higher than overselling.", size=12, italic=True, color=RGBColor(0xA8, 0xA0, 0x92), font="Georgia")
    return s


def build():
    prs = Presentation()
    prs.slide_width = W
    prs.slide_height = H
    slides = []
    # total known after list
    builders = [
        lambda: None,  # placeholder for cover after count
    ]
    # We'll add in order then set footers with known total
    cover(prs, 15)
    outline_slide(prs, 2, 15)
    intro_problem(prs, 3, 15)
    intro_context(prs, 4, 15)
    system_roles(prs, 5, 15)
    system_modules(prs, 6, 15)
    architecture(prs, 7, 15)
    architecture_detail(prs, 8, 15)
    dfd_context(prs, 9, 15)
    dfd_rent(prs, 10, 15)
    dfd_maint(prs, 11, 15)
    erd(prs, 12, 15)
    demo(prs, 13, 15)
    honesty(prs, 14, 15)
    close_slide(prs, 15, 15)

    desktop = os.path.join(os.path.expanduser("~"), "OneDrive", "Desktop", "NestIQ-Pro-Presentation.pptx")
    project = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "NestIQ-Pro-Presentation.pptx")
    for path in (desktop, project):
        prs.save(path)
        print("Wrote", path)


if __name__ == "__main__":
    build()
