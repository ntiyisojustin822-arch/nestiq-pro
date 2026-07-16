/**
 * Presentation PDF for Project300 / BICT300.
 *
 * Website screenshots: place PNG files in `nestiq-pro/presentation-assets/`
 * using either the short names OR the original long Cursor export names, then run:
 *   node scripts/generate-project300-presentation.mjs
 */
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

const outPath = path.resolve(process.cwd(), 'Project300_NestIQ_Presentation.pdf');
const ASSET_DIR = path.resolve(process.cwd(), 'presentation-assets');
const CURSOR_ASSET_DIR = path.join(
  process.env.USERPROFILE || '',
  '.cursor',
  'projects',
  'c-Users-Ntiyiso-Justin-Desktop-NestIQ',
  'assets',
);

const LONG = (tail) =>
  `c__Users_Ntiyiso_Justin_AppData_Roaming_Cursor_User_workspaceStorage_0a122a95de8dbd1b490bd3a9b5597138_images_${tail}`;

/** @type {{title:string,subtitle:string,files:string[]}[]} */
const SCREENSHOT_SPECS = [
  {
    title: 'Live UI - Features section',
    subtitle: 'Built for Modern Property Managers (product capabilities)',
    files: [
      '02-features.png',
      '01-features.png',
      LONG('Screenshot_2026-04-22_004756-99ef2854-e11c-4ae7-88fe-15287f454d46.png'),
    ],
  },
  {
    title: 'Live UI - Home (hero)',
    subtitle: 'Landing hero + NestIQ dashboard preview',
    files: [
      '01-home.png',
      '03-home.png',
      LONG('Screenshot_2026-04-22_004736-8fa1220a-8c6a-46d5-9c07-667c14f09566.png'),
    ],
  },
  {
    title: 'Live UI - Marketing CTA',
    subtitle: 'Conversion section + footer (brand + next steps)',
    files: [
      '03-marketing.png',
      '04-marketing.png',
      LONG('Screenshot_2026-04-22_004822-f93bd2fb-3b8b-4786-9237-b4373c968ad6.png'),
    ],
  },
  {
    title: 'Live UI - Properties directory',
    subtitle: 'Search, filters, and property cards',
    files: [
      '04-properties.png',
      '05-properties.png',
      LONG('Screenshot_2026-04-22_004905-d221c342-0f79-454c-a026-20c1b35d8a6f.png'),
    ],
  },
  {
    title: 'Live UI - Tenant portal',
    subtitle: 'Tenant dashboard, profile, and documents',
    files: [
      '05-tenant-portal.png',
      '06-tenant.png',
      LONG('Screenshot_2026-04-22_004842-fb3b55e1-9985-4f64-82d1-527f419f3545.png'),
    ],
  },
];

const doc = new PDFDocument({
  autoFirstPage: false,
  size: 'A4',
  layout: 'landscape',
  margins: { top: 38, bottom: 38, left: 46, right: 46 },
  info: {
    Title: 'NestIQ — Project300 Presentation',
    Author: 'BICT300 Group',
  },
});

doc.pipe(fs.createWriteStream(outPath));

try {
  fs.mkdirSync(ASSET_DIR, { recursive: true });
} catch {
  // ignore
}

function seedAssetsFromCursorExport() {
  if (!CURSOR_ASSET_DIR || !fs.existsSync(CURSOR_ASSET_DIR)) return;
  for (const spec of SCREENSHOT_SPECS) {
    for (const f of spec.files) {
      const from = path.join(CURSOR_ASSET_DIR, f);
      if (!fs.existsSync(from)) continue;
      const base = path.basename(f);
      const to = path.join(ASSET_DIR, base);
      if (fs.existsSync(to)) continue;
      try {
        fs.copyFileSync(from, to);
      } catch {
        // ignore
      }
    }
  }
}
seedAssetsFromCursorExport();

const THEME = {
  ink: '#0e1117',
  paper: '#f7f4ef',
  muted: '#6b7280',
  gold: '#c9a84c',
  card: '#ffffff',
};

let slideNo = 0;

function drawFooter() {
  const footerX = doc.page.margins.left;
  const footerY = doc.page.height - doc.page.margins.bottom - 12;
  const footerW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.save();
  doc.font('Helvetica').fontSize(10).fillColor(THEME.muted);
  doc.text('NestIQ Pro - Project300 (BICT300)', footerX, footerY, {
    width: footerW,
    align: 'left',
    lineBreak: false,
  });
  doc.text(`Slide ${slideNo}`, footerX, footerY, {
    width: footerW,
    align: 'right',
    lineBreak: false,
  });
  doc.restore();
}

function addBackground() {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(THEME.paper);

  // subtle header bar
  doc.fillColor(THEME.ink).opacity(0.05);
  doc.rect(0, 0, doc.page.width, 72).fill();
  doc.opacity(1);
  doc.restore();
}

function header(title, subtitle) {
  const x = doc.page.margins.left;
  const y = doc.page.margins.top - 6;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc
    .fillColor(THEME.ink)
    .fontSize(28)
    .font('Helvetica-Bold')
    .text(title, x, y, { width: w });

  if (subtitle) {
    doc
      .moveDown(0.25)
      .fillColor(THEME.muted)
      .fontSize(13)
      .font('Helvetica')
      .text(subtitle, { width: w });
  }

  // accent line
  doc
    .moveDown(0.6)
    .strokeColor(THEME.gold)
    .lineWidth(3)
    .moveTo(x, doc.y)
    .lineTo(x + Math.min(240, w), doc.y)
    .stroke();

  doc.moveDown(0.9);
}

function bulletList(items, opts = {}) {
  const {
    fontSize = 15,
    gap = 8,
    indent = 18,
    maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right,
  } = opts;

  const x = doc.page.margins.left;
  doc.fillColor(THEME.ink).font('Helvetica').fontSize(fontSize);

  items.forEach((t) => {
    const y = doc.y;
    doc
      .fillColor(THEME.gold)
      .font('Helvetica-Bold')
      .text('•', x, y, { width: 12 });
    doc
      .fillColor(THEME.ink)
      .font('Helvetica')
      .text(t, x + indent, y, { width: maxWidth - indent });
    doc.moveDown(gap / 16);
  });
}

function twoColumns(left, right, opts = {}) {
  const gutter = opts.gutter ?? 26;
  const x = doc.page.margins.left;
  const y = doc.y;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colW = (w - gutter) / 2;

  doc.save();
  doc.x = x;
  doc.y = y;
  left(colW);

  const leftBottom = doc.y;
  doc.x = x + colW + gutter;
  doc.y = y;
  right(colW);
  const rightBottom = doc.y;

  doc.restore();
  doc.x = x;
  doc.y = Math.max(leftBottom, rightBottom);
}

function card(titleText, bodyLines, colW) {
  const x = doc.x;
  const y = doc.y;
  const padding = 14;
  const titleH = 18;
  const cardW = colW;

  // estimate height
  const bodyFontSize = 13;
  const lineH = bodyFontSize * 1.25;
  const h = padding + titleH + 10 + bodyLines.length * lineH + padding;

  doc
    .save()
    .fillColor(THEME.card)
    .strokeColor('#e9e1cf')
    .lineWidth(1)
    .roundedRect(x, y, cardW, h, 14)
    .fillAndStroke()
    .restore();

  doc
    .fillColor(THEME.ink)
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(titleText, x + padding, y + padding, { width: cardW - padding * 2 });

  doc
    .fillColor(THEME.muted)
    .font('Helvetica')
    .fontSize(bodyFontSize)
    .text(bodyLines.join('\n'), x + padding, y + padding + 26, {
      width: cardW - padding * 2,
      lineGap: 2,
    });

  doc.y = y + h + 14;
}

function addSlide(titleText, subtitle, render) {
  doc.addPage();
  slideNo += 1;
  addBackground();
  header(titleText, subtitle);
  render?.();
  drawFooter();
}

function resolveFirstExisting(filenames) {
  for (const f of filenames) {
    const p = path.join(ASSET_DIR, f);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function headerCompact(titleText, subtitle) {
  const x = doc.page.margins.left;
  const y = doc.page.margins.top - 6;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.fillColor(THEME.ink).fontSize(22).font('Helvetica-Bold').text(titleText, x, y, { width: w });

  if (subtitle) {
    doc
      .moveDown(0.2)
      .fillColor(THEME.muted)
      .fontSize(11)
      .font('Helvetica')
      .text(subtitle, { width: w });
  }

  doc
    .moveDown(0.45)
    .strokeColor(THEME.gold)
    .lineWidth(2)
    .moveTo(x, doc.y)
    .lineTo(x + Math.min(200, w), doc.y)
    .stroke();

  doc.moveDown(0.55);
}

function addImageSlide(titleText, subtitle, imagePath) {
  doc.addPage();
  slideNo += 1;
  addBackground();
  headerCompact(titleText, subtitle);

  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const topY = doc.y;
  const bottomSafe = doc.page.height - doc.page.margins.bottom - 18;
  const maxH = Math.max(140, bottomSafe - topY);

  doc.image(imagePath, x, topY, { fit: [w, maxH], align: 'center' });

  drawFooter();
}

function drawMiniScreen({ x, y, w, h, title, chips = [], lines = [], accent = THEME.gold }) {
  doc.save();
  doc
    .fillColor('#ffffff')
    .strokeColor('#e9e1cf')
    .lineWidth(1)
    .roundedRect(x, y, w, h, 16)
    .fillAndStroke();

  // top bar
  doc.fillColor('#0e1117').opacity(0.06);
  doc.roundedRect(x, y, w, 46, 16).fill();
  doc.opacity(1);

  doc
    .fillColor('#0e1117')
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(title, x + 14, y + 14, { width: w - 28 });

  // accent dot
  doc.fillColor(accent);
  doc.circle(x + w - 18, y + 23, 5).fill();

  // chips row
  let cx = x + 14;
  const cy = y + 56;
  chips.slice(0, 4).forEach((c) => {
    const tw = Math.min(140, doc.widthOfString(c, { font: 'Helvetica', size: 10 }) + 18);
    doc
      .fillColor(accent)
      .opacity(0.14)
      .roundedRect(cx, cy, tw, 22, 11)
      .fill();
    doc.opacity(1);
    doc
      .fillColor('#0e1117')
      .font('Helvetica')
      .fontSize(10)
      .text(c, cx + 10, cy + 6, { width: tw - 12 });
    cx += tw + 8;
  });

  // content lines
  doc.fillColor('#111827').font('Helvetica').fontSize(10);
  let ly = cy + 34;
  lines.slice(0, 9).forEach((t) => {
    doc.fillColor('#6b7280').text('•', x + 16, ly, { width: 10 });
    doc.fillColor('#111827').text(t, x + 28, ly, { width: w - 42 });
    ly += 15;
  });

  doc.restore();
}

// ─────────────────────────────────────────────────────────────
// Presentation content aligned to the rubric criteria
// ─────────────────────────────────────────────────────────────

addSlide('NestIQ Pro', 'Smart rental management platform (Landlord + Tenant portal)', () => {
  bulletList([
    'Project: NestIQ Pro (web app) for landlords to manage properties, tenants, and payments',
    'Core value: reduce admin effort, improve visibility, and keep tenants informed',
    'Demo scope: property onboarding, tenant management, maintenance tracking, analytics, and tenant portal',
  ]);
});

addSlide('Relevance of Topic', 'Why this topic fits the course & research objectives', () => {
  twoColumns(
    (colW) => {
      card('Real-world problem', [
        'Rental admin is error-prone and time-consuming',
        'Small landlords often use spreadsheets/WhatsApp',
        'Visibility across properties is limited',
      ], colW);
      card('Course alignment', [
        'Information systems + UI/UX design',
        'Database-backed CRUD + reporting',
        'Security & user roles (landlord vs tenant)',
      ], colW);
    },
    (colW) => {
      card('Users', [
        'Landlord/manager: operations + finance overview',
        'Tenant: communication + payments + requests',
        'Prospective tenant: applications workflow',
      ], colW);
      card('Research angle', [
        'How digitising workflows improves timeliness',
        'Reducing missed tasks via reminders & dashboards',
        'Map + analytics to support decisions',
      ], colW);
    }
  );
});

addSlide('Problem Statement', 'Clear problem + objectives', () => {
  bulletList([
    'Problem: Landlords struggle to track rental operations (tenants, maintenance, expenses, reconciliations) consistently across multiple properties.',
    'Objective 1: Provide a single dashboard to manage property and tenant data.',
    'Objective 2: Support operational tasks (maintenance, inspections, calendar) with clear status tracking.',
    'Objective 3: Improve financial visibility (rent roll, expenses, reconcile, tax outputs).',
    'Objective 4: Enable tenant self-service via a portal (requests, payments, communication).',
  ]);
});

addSlide('Feasibility', 'Scope, constraints, and what we can deliver', () => {
  twoColumns(
    (colW) => {
      card('What is feasible now', [
        'Core CRUD flows for properties/tenants',
        'Photo upload + map pin for properties',
        'Dashboards + analytics + reports',
        'Tenant portal pages',
      ], colW);
      card('Data & security', [
        'Cloud Firestore for multi-tenant data',
        'Firebase Auth for login/roles',
        'Storage for property photos',
      ], colW);
    },
    (colW) => {
      card('Constraints', [
        'Accuracy depends on map data for reverse-geocode',
        'Offline limited to cached UI where applicable',
        'Browser geolocation permissions required',
      ], colW);
      card('Milestones', [
        'Prototype UI + data model',
        'Integration (auth + database + storage)',
        'Testing + demo preparation',
      ], colW);
    }
  );
});

addSlide('Originality & Innovation', 'What makes NestIQ different', () => {
  bulletList([
    'Integrated landlord + tenant views in one lightweight web app.',
    'Map-based pinning of properties for portfolio visibility.',
    'Operational workflows alongside finance (maintenance, inspections, calendar, follow-ups).',
    'Command palette + fast navigation to reduce friction for frequent tasks.',
  ]);
});

addSlide('Potential Impact', 'Who benefits and how', () => {
  bulletList([
    'Landlords: faster admin, fewer missed tasks, clearer financial picture.',
    'Tenants: simpler communication, better transparency and response times.',
    'Long-term: scalable foundation for automation (late fees, reminders, renewals).',
  ]);
});

addSlide('UI Design (Mock-up)', 'Key screens and interaction flow', () => {
  bulletList([
    'Navigation: primary pages + "More" menu to reduce clutter.',
    'Add/Edit Property: photo upload + map pin + "use current location".',
    'Portfolio Map: visualize properties; click pins for quick details.',
    'Tenant Portal: tenant dashboard with requests and payment visibility.',
  ]);

  // Visual mock-ups (wireframe style) to satisfy rubric mock-up requirement
  doc.moveDown(0.6);
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const gap = 18;
  const cardW = (w - gap * 2) / 3;
  const y = doc.y;
  const h = 230;

  drawMiniScreen({
    x,
    y,
    w: cardW,
    h,
    title: 'Landlord Dashboard',
    chips: ['Properties', 'Tenants', 'Analytics', 'More'],
    lines: [
      'Portfolio summary cards',
      'Quick actions: Add Property / Add Tenant',
      'Upcoming renewals and inspections',
      'Maintenance tracker overview',
    ],
    accent: THEME.gold,
  });

  drawMiniScreen({
    x: x + cardW + gap,
    y,
    w: cardW,
    h,
    title: 'Add/Edit Property (Modal)',
    chips: ['Upload photo', 'Pin on map', 'Use current location'],
    lines: [
      'Photo picker + preview',
      'Map pin sets latitude/longitude',
      'Reverse-geocode fills address + city',
      'Drag pin to adjust location',
    ],
    accent: '#5a7a60',
  });

  drawMiniScreen({
    x: x + (cardW + gap) * 2,
    y,
    w: cardW,
    h,
    title: 'Tenant Portal',
    chips: ['Dashboard', 'Payments', 'Requests'],
    lines: [
      'Rent status and due dates',
      'Maintenance request form + history',
      'Notifications / follow-ups',
      'Contact / communication log',
    ],
    accent: '#3a6b8a',
  });

  doc.y = y + h + 10;
});

let embeddedScreens = 0;
for (const spec of SCREENSHOT_SPECS) {
  const p = resolveFirstExisting(spec.files);
  if (p) {
    addImageSlide(spec.title, spec.subtitle, p);
    embeddedScreens += 1;
  }
}
if (embeddedScreens === 0) {
  addSlide(
    'Website screenshots (to embed)',
    'Copy your PNG captures into presentation-assets, then regenerate this PDF',
    () => {
      bulletList([
        `Folder: ${ASSET_DIR}`,
        'Recommended short names: 01-home.png, 02-features.png, 03-marketing.png, 04-properties.png, 05-tenant-portal.png',
        'Or paste the original long filenames exported from Cursor into the same folder (see SCREENSHOT_SPECS in scripts/generate-project300-presentation.mjs).',
        'Then run: node scripts/generate-project300-presentation.mjs',
      ]);
    },
  );
}

addSlide('Project Plan, WBS & Tools', 'Breakdown of tasks + technologies', () => {
  twoColumns(
    (colW) => {
      card('Work Breakdown Structure (WBS)', [
        '1. Requirements + rubric mapping',
        '2. UI/UX mockups + navigation design',
        '3. Data model (properties, tenants, expenses, maintenance)',
        '4. Implementation (pages + modals + routing)',
        '5. Integrations (Firebase Auth/Firestore/Storage)',
        '6. Testing + demo + documentation',
      ], colW);
    },
    (colW) => {
      card('Tools / Technologies', [
        'Frontend: HTML, CSS, Vanilla JS',
        'Maps: Leaflet + OpenStreetMap tiles',
        'Reverse geocode: Nominatim (OSM)',
        'Backend services: Firebase (Auth, Firestore, Storage)',
        'Charts/Reports: Chart.js + jsPDF (where needed)',
      ], colW);
      card('Collaboration', [
        'Task allocation by feature areas',
        'Shared coding standards & review',
        'Incremental testing and integration',
      ], colW);
    }
  );
});

addSlide('Presentation & Teamwork', 'How the team will present', () => {
  bulletList([
    'Each member presents a section: problem -> design -> implementation -> demo -> plan.',
    'Live demo walkthrough with backup screenshots in case of connectivity issues.',
    'Shared Q&A: members support each other during questions.',
  ]);
});

addSlide('Thank you', 'Questions & feedback', () => {
  bulletList([
    'Demo: Add property -> pin location -> view on map -> tenant portal preview',
    'We welcome feedback on UX, scope, and next features to prioritise.',
  ]);
});

doc.end();

// eslint-disable-next-line no-console
console.log(`✅ Generated: ${outPath}`);
// eslint-disable-next-line no-console
console.log(`📷 UI screenshots embedded: ${embeddedScreens}`);

