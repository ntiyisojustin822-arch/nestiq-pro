/* NestIQ legal copy — used by signup modal and legal.html */
(function(){
  'use strict';

  const UPDATED='10 September 2026';

  function nestiqLegalTermsHtml(){
    return `
      <p style="font-size:0.82rem;color:var(--muted);margin:0 0 14px">Last updated ${UPDATED}. These terms govern use of the NestIQ property-management service at nestiq-pro.web.app and related pages.</p>
      <h3>1. Who we are</h3>
      <p>NestIQ is a web application that helps South African landlords manage rental properties, tenants, applications, leases, maintenance, and related records. By creating an account you agree to these Terms of Service.</p>
      <h3>2. Accounts</h3>
      <p>You must provide accurate details and keep your login details confidential. Landlord accounts require a verified email address. You are responsible for activity on your account. Staff (caretakers and contractors) may only access properties you assign to them.</p>
      <h3>3. Plans and billing</h3>
      <p>A free Starter allowance and paid Pro/Enterprise plans may apply, as shown in the app. NestIQ subscription payments are processed by PayFast. Tenant rent is not collected by NestIQ — rent is arranged between landlord and tenant. Trials, upgrades, and cancellations follow what is shown in Billing. Fees already paid for a billing period are generally not refunded except where required by law.</p>
      <h3>4. Your data and content</h3>
      <p>You own the property, tenant, and financial records you enter. You grant NestIQ a licence to host and process that data solely to provide the service (including backups, support, and security). You must have a lawful basis to store tenant and applicant information. Do not upload unlawful content or another person’s data without a valid reason.</p>
      <h3>5. Public listings and reviews</h3>
      <p>If you publish a vacancy, selected details appear on Browse listings. Landlord testimonials you publish in Settings appear on the public NestIQ website. You can update or remove your NestIQ website review at any time. Tenant reviews of a property are written by verified tenants and shown on listings.</p>
      <h3>6. Acceptable use</h3>
      <p>Do not misuse the service, attempt to access other landlords’ data, interfere with security, or use NestIQ to send spam. We may suspend accounts that breach these terms or applicable law.</p>
      <h3>7. Availability</h3>
      <p>We aim to keep NestIQ available but do not guarantee uninterrupted service. Features that rely on third parties (Firebase, PayFast, EmailJS, WhatsApp, Google Gemini) may fail if those services fail.</p>
      <h3>8. Liability</h3>
      <p>NestIQ is a record-keeping and workflow tool. We are not a party to your lease, do not give legal or tax advice, and are not responsible for unpaid rent, tenant disputes, or decisions you make using AI suggestions. To the extent permitted by South African law, our liability is limited to fees you paid us in the three months before the claim.</p>
      <h3>9. Changes</h3>
      <p>We may update these terms. Continued use after a posted update means you accept the revised terms. If you do not agree, stop using NestIQ and close your account from Settings.</p>
      <h3>10. Contact</h3>
      <p>Questions: <a href="mailto:hello@nestiq.co.za">hello@nestiq.co.za</a> or the in-app Help Centre.</p>`;
  }

  function nestiqLegalPrivacyHtml(){
    return `
      <p style="font-size:0.82rem;color:var(--muted);margin:0 0 14px">Last updated ${UPDATED}. This notice explains how NestIQ processes personal information under the Protection of Personal Information Act 4 of 2013 (POPIA).</p>
      <h3>1. Responsible parties</h3>
      <p><strong>NestIQ</strong> is the responsible party for landlord, staff, and visitor account data (name, email, phone, company, billing status, support tickets, and optional NestIQ website reviews).</p>
      <p><strong>The landlord</strong> is the responsible party for tenant, applicant, and occupant information they capture in NestIQ. NestIQ is an operator processing that data on the landlord’s instructions.</p>
      <h3>2. What we process</h3>
      <p>Depending on your role this may include identity and contact details, property addresses, lease and rent records, payment notes, maintenance photos, application forms, bank details you store for rent instructions, and device/session data needed to keep you signed in.</p>
      <h3>3. Why we process it</h3>
      <p>To create and secure accounts, provide the product, send transactional email or WhatsApp messages you configure, process NestIQ subscriptions, show public listings you choose to publish, display reviews you publish, and improve reliability and support. We do not sell personal information.</p>
      <h3>4. Sharing</h3>
      <p>Hosting and database services are provided by Google Firebase (typically outside South Africa). PayFast processes NestIQ subscription payments. If you enable EmailJS or Gemini in Settings, those providers receive only what is needed for that feature. Staff you invite see only assigned properties.</p>
      <h3>5. Retention and security</h3>
      <p>We keep account data while the account is open and for a reasonable period afterwards for billing, disputes, and legal requirements. Access is limited by login, role, and Firestore security rules. You must use a strong password and not share it.</p>
      <h3>6. Your rights</h3>
      <p>You may request access to, correction of, or deletion of personal information we hold about you, subject to the law. Landlords can update profile data in Settings and may request account deletion. Tenants should first ask their landlord about records the landlord controls; they may also contact NestIQ for account-level requests.</p>
      <h3>7. Cookies and similar technology</h3>
      <p>We use essential storage (session, local preferences, and authentication) so the app works. We do not run third-party advertising cookies on the core app.</p>
      <h3>8. Children</h3>
      <p>NestIQ is intended for adult landlords, staff, and tenants. Do not create an account for a child.</p>
      <h3>9. Contact</h3>
      <p>Information officer contact: <a href="mailto:hello@nestiq.co.za">hello@nestiq.co.za</a>. You may also lodge a complaint with the Information Regulator (South Africa).</p>`;
  }

  function nestiqOpenLegalModal(kind){
    const terms=kind==='terms';
    const title=terms?'Terms of Service':'Privacy Policy';
    const body=terms?nestiqLegalTermsHtml():nestiqLegalPrivacyHtml();
    const mc=document.getElementById('modalContent');
    if(!mc){
      location.href='legal.html#'+(terms?'terms':'privacy');
      return;
    }
    mc.innerHTML=`<h2 class="modal-title">${title}</h2><div class="modal-sub nestiq-legal-copy" style="max-height:60vh;overflow:auto">${body}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px"><a class="btn-outline btn-sm" href="legal.html#${terms?'terms':'privacy'}" target="_blank" rel="noopener">Open full page</a><button type="button" class="btn-primary btn-sm" onclick="nestiqCloseModalAnimated()">Close</button></div>`;
    if(typeof nestiqOpenModalAnimated==='function') nestiqOpenModalAnimated();
  }

  window.nestiqLegalTermsHtml=nestiqLegalTermsHtml;
  window.nestiqLegalPrivacyHtml=nestiqLegalPrivacyHtml;
  window.nestiqOpenLegalModal=nestiqOpenLegalModal;
})();
