# Invite create → redeem manual test

Use an anonymous applicant (not a self-registered tenant account) so the landlord path still creates an invite code.

1. **Submit** a public application for a vacant listing (Browse listings → Apply), using a fresh email.
2. **Approve** as landlord (Applications → Approve → fill lease fields → confirm).
3. **Confirm the invite code appears** for the landlord:
   - Success toast includes `Invite code NQ-……`, and/or
   - WhatsApp draft includes the code, and/or
   - If EmailJS is not configured: warning toast with the code, and the row appears under **Tenants → Portal invitations**.
4. **Redeem** in an **incognito** window: Tenant portal → “I have an invitation” → enter the code → Look Up.
5. **Expect either**:
   - Invitation summary + Unlock tenant portal (set a password only if this email has never signed up; if they already applied, use that same password — or one-click unlock when already signed in); **or**
   - A **specific** error in the UI (permissions / index / not found / network / existing-account password mismatch) **and** a matching `console.warn('NestIQ…')` in DevTools — never a silent blank failure.
6. After successful redeem: tenant can open the portal; invitation status becomes Accepted in the landlord invitations table.
