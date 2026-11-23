UNIC Netlify deployment

PACKAGE CONTENTS
- index.html: existing Self-Check page, preserved with only the Apps Script backend URL updated to the current deployment.
- book/index.html: new mobile-friendly Founder Session booking page.
- netlify/functions/booking.mjs: server-side bridge between the booking page and Google Apps Script.
- netlify.toml: Netlify Functions directory and /book route configuration.

IMPORTANT: this package includes a Netlify Function. A plain static drag-and-drop upload may publish the HTML but will not reliably build/deploy the Function. Deploy the folder using Netlify CLI (manual deployment, no GitHub required).

STEP 1 — UPDATE APPS SCRIPT
1. Open your existing Apps Script project.
2. Replace its complete code with UNIC_Apps_Script_NETLIFY_BOOKING_READY.gs.
3. Save.
4. Deploy > Manage deployments > Edit > New version > Deploy.
5. Keep Execute as: Me and Who has access: Anyone.
6. The Apps Script Web App URL remains the same.

STEP 2 — DEPLOY THE NETLIFY FOLDER
1. Download and unzip UNIC_Netlify_Deployment.zip.
2. Install Netlify CLI if it is not already installed:
   npm install -g netlify-cli
3. Open Terminal inside the unzipped UNIC_Netlify_Deployment folder.
4. Link this folder to the EXISTING Netlify site (one-time):
   netlify link
   Select the existing site that serves check.unicbiz.com.
5. Deploy to a draft preview first:
   netlify deploy --dir=. --functions=netlify/functions
6. Open the draft URL and test the Self-Check page and booking page.
7. If both work, publish:
   netlify deploy --prod --dir=. --functions=netlify/functions

STEP 3 — TEST
1. Confirm https://check.unicbiz.com/ still loads the existing Self-Check page.
2. Open https://check.unicbiz.com/book/?booking=YOUR_32_CHARACTER_TOKEN
3. Test by tapping the actual booking link from Gmail on iPhone.
4. Confirm one Calendar event is created and the Founder Sessions sheet is updated.

IMPORTANT DETAILS
- Apps Script continues to own token validation, slot validation, Calendar creation, and Sheet updates.
- The Netlify Function is a same-origin server-side bridge. The browser does not call Apps Script directly.
- The Apps Script FOUNDER_WEB_APP_URL setting now points email links to https://check.unicbiz.com/book/.
- The Netlify Function forwards requests to the current Apps Script Web App endpoint.
- The Self-Check HTML's backend endpoint was updated to the current Apps Script deployment URL.
- The booking token is a bearer link. Anyone with the unique link can view its available slots and attempt to book one. Do not publish booking tokens.
- No live deployment or real Gmail/iPhone test has been performed from this environment.


FOUNDER SESSION PAYMENT-RESERVATION UPDATE
- Clicking Confirm my session creates the calendar invitation and sets booking_status to Reserved (not Booked).
- The confirmation screen displays payment instructions and a pre-filled mailto draft to colab@unicbiz.com. The user attaches the payment proof and sends it.
- After manual payment verification, the client changes booking_status to Booked in the Founder Sessions sheet.
- Before production, replace FOUNDER_PAYMENT test placeholders, set FOUNDER_TEST_MODE=false, and add the actual Google Drive QR image file ID in qrImageFileId.
- Redeploy the Apps Script as a new version and deploy the updated Netlify ZIP.
