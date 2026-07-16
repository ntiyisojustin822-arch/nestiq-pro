import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

const outPath = path.resolve(process.cwd(), 'Project300_NestIQ_Presenter_Script.pdf');

const doc = new PDFDocument({
  autoFirstPage: false,
  size: 'A4',
  layout: 'portrait',
  margins: { top: 54, bottom: 54, left: 56, right: 56 },
  info: {
    Title: 'NestIQ — Project300 Presenter Script',
    Author: 'BICT300 Group',
  },
});

doc.pipe(fs.createWriteStream(outPath));

const THEME = {
  ink: '#0e1117',
  muted: '#6b7280',
  gold: '#c9a84c',
  paper: '#f7f4ef',
  border: '#e9e1cf',
};

let pageNo = 0;

function addPage(title, subtitle) {
  doc.addPage();
  pageNo += 1;

  // background
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(THEME.paper);
  doc.restore();

  // header
  doc
    .fillColor(THEME.ink)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(title);

  if (subtitle) {
    doc
      .moveDown(0.25)
      .fillColor(THEME.muted)
      .font('Helvetica')
      .fontSize(11)
      .text(subtitle);
  }

  doc
    .moveDown(0.6)
    .strokeColor(THEME.gold)
    .lineWidth(2)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();

  doc.moveDown(0.8);

  // footer
  const footerY = doc.page.height - doc.page.margins.bottom + 18;
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(THEME.muted)
    .text('NestIQ Pro - Project300 (BICT300)', doc.page.margins.left, footerY, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: 'left',
      lineBreak: false,
    });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(THEME.muted)
    .text(`Page ${pageNo}`, doc.page.margins.left, footerY, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: 'right',
      lineBreak: false,
    });
}

function sectionHeading(text) {
  doc
    .fillColor(THEME.ink)
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(text);
  doc.moveDown(0.35);
}

function sayBlock(text) {
  const x = doc.x;
  const y = doc.y;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // boxed "Say"
  const padding = 12;
  const titleH = 14;
  const bodyFont = 11;

  doc.font('Helvetica').fontSize(bodyFont);
  const bodyH = doc.heightOfString(text, { width: w - padding * 2 });
  const boxH = padding + titleH + 6 + bodyH + padding;

  doc.save();
  doc.fillColor('#ffffff').strokeColor(THEME.border).lineWidth(1);
  doc.roundedRect(x, y, w, boxH, 12).fillAndStroke();
  doc.restore();

  doc
    .fillColor(THEME.gold)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('SAY', x + padding, y + padding, { width: w - padding * 2 });

  doc
    .fillColor(THEME.ink)
    .font('Helvetica')
    .fontSize(bodyFont)
    .text(text, x + padding, y + padding + titleH + 6, {
      width: w - padding * 2,
      lineGap: 3,
    });

  doc.y = y + boxH + 10;
}

function doLine(text) {
  doc
    .fillColor(THEME.muted)
    .font('Helvetica-Oblique')
    .fontSize(10)
    .text(`Do: ${text}`);
  doc.moveDown(0.5);
}

addPage('Project300 Presenter Script', 'Step-by-step speaking notes aligned to the rubric');

sectionHeading('Timing');
doc
  .fillColor(THEME.ink)
  .font('Helvetica')
  .fontSize(11)
  .text('Use this as a 10–12 minute script. If your slot is shorter, cut the screenshot walkthrough and keep the rubric sections.');
doc.moveDown(0.8);

sectionHeading('1) Opening (30–45 seconds)');
sayBlock(
  'Good morning/afternoon. We are Group BICT300, presenting NestIQ Pro — a web-based rental management system for landlords and tenants. Today we will explain the problem we are solving, why it matters, what we built, how feasible it is, and how we will deliver it as a team.'
);
doLine('Show the title slide. Introduce each speaker by name (if presenting as a team).');

sectionHeading('2) Relevance of topic (1 minute)');
sayBlock(
  'Rental management is a real information-systems problem: landlords juggle properties, tenants, payments, maintenance, and compliance across fragmented tools like spreadsheets and chat apps. NestIQ fits our course because it combines UI/UX design, data modelling, cloud persistence, roles (landlord vs tenant), and reporting/analytics.'
);
doLine('Point to the “Real-world problem” and “Course alignment” points.');

sectionHeading('3) Problem statement (1–1.5 minutes)');
sayBlock(
  'Our problem statement is: small-to-mid landlords lose visibility and time tracking operations across multiple properties. Our objectives are: (1) one dashboard for property and tenant data, (2) operational workflows like maintenance, inspections, and calendar with clear status, (3) stronger financial visibility (expenses, rent roll, reconcile, tax outputs), and (4) tenant self-service through a portal for communication and requests.'
);

sectionHeading('4) Feasibility (1 minute)');
sayBlock(
  'This project is feasible because we scoped it to a lightweight web app with Firebase Auth, Firestore, and Storage for persistence, plus proven libraries for charts and maps. Constraints are normal: map reverse-geocoding depends on OpenStreetMap data, offline is limited, and browser geolocation needs permission. Our milestones are prototype UI, integration, then testing and demo preparation.'
);

sectionHeading('5) Originality and innovation (45–60 seconds)');
sayBlock(
  'What is not just “another CRUD app” is that we unify landlord operations and the tenant experience, add map-based property pinning, and combine operations and finance in one workflow. We also support fast navigation to reduce friction for frequent tasks.'
);

sectionHeading('6) Potential impact (45–60 seconds)');
sayBlock(
  'Impact is practical: landlords get faster admin and fewer missed tasks, tenants get clearer communication and transparency, and long term this becomes a foundation for automation like reminders, renewals, and late-fee workflows.'
);

sectionHeading('7) UI design / mock-up (1 minute)');
sayBlock(
  'For UI, we designed around a busy landlord: clear navigation, modals for key actions, and status-driven screens. The mockups show our interaction model: landlord dashboard, add/edit property with map pin and current location, and tenant portal flows.'
);
doLine('Point at each mock-up screen briefly; explain purpose rather than reading text.');

addPage('Screenshots + Plan', 'Use the screenshots as evidence of the real UI');

sectionHeading('8) Live UI screenshots (2–3 minutes total)');
sayBlock(
  'Next, we will show how the product looks in the browser. We will briefly explain each screen and what the user can do there.'
);
doc.moveDown(0.2);
doc.fillColor(THEME.ink).font('Helvetica').fontSize(11).text(
  [
    'Features: summarizes the main capabilities.',
    'Home (hero): the landing experience and dashboard preview.',
    'Marketing CTA: guides users to start and builds trust.',
    'Properties directory: search, filters, and property cards.',
    'Tenant portal: documents, payments context, and self-service.',
  ].map((x) => `- ${x}`).join('\n'),
  { lineGap: 3 }
);
doc.moveDown(0.8);
doLine('Do not read everything on the screenshots; describe the purpose of each screen.');

sectionHeading('9) Project plan, WBS, and tools (1.5–2 minutes)');
sayBlock(
  'Our work breakdown follows a standard software project: requirements, UI mockups, data model, implementation, Firebase integration, then testing and documentation. Tools include HTML, CSS, vanilla JavaScript, Leaflet maps, Nominatim reverse geocoding, Firebase backend services, and Chart.js reporting.'
);

sectionHeading('10) Presentation and teamwork (30–45 seconds)');
sayBlock(
  'We split responsibilities by feature areas, reviewed each other’s work, rehearsed transitions, and prepared a live demo with screenshot backups in case the network fails.'
);

sectionHeading('11) Demo (optional, 1–2 minutes if allowed)');
sayBlock(
  'If we demo live, we will add a property, pin the location using current location, show it on the map, and then open the tenant portal view.'
);

sectionHeading('12) Close + Q&A (30 seconds)');
sayBlock(
  'In summary: NestIQ targets a real landlord workflow gap, it is feasible with modern web technology and Firebase services, and the screenshots show a cohesive product direction. Thank you — any questions?'
);

doc.end();
// eslint-disable-next-line no-console
console.log(`✅ Generated: ${outPath}`);

