const { expect } = require('@playwright/test');

const FORMSUBMIT_ENDPOINT = 'https://formsubmit.co/ajax/info@myconciergesa.com';
const WA_NUMBER = '27745376626';
const WA_HREF = `https://wa.me/${WA_NUMBER}`;
const PHONE_DISPLAY = '+27 74 537 6626';

/** Block external assets so the specs run hermetically and fast. */
async function stubExternalAssets(page) {
  await page.route(/images\.unsplash\.com/, (route) => route.abort());
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
}

/**
 * Intercept the enquiry POST. `handler` receives the Playwright Route and the
 * captured request; return nothing and it is fulfilled with a 200 by default.
 * Returns an array that collects every intercepted request.
 */
async function interceptEnquiry(page, handler) {
  const requests = [];
  await page.route(FORMSUBMIT_ENDPOINT, async (route) => {
    const request = route.request();
    requests.push({ method: request.method(), postData: request.postData() });
    if (handler) {
      await handler(route, request);
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: 'true' }) });
    }
  });
  return requests;
}

const VALID_ENQUIRY = {
  fname: 'Thandi',
  lname: 'Nkosi',
  email: 'thandi@example.com',
  service: 'Cape Town Experiences',
  message: 'Looking for a private winelands day for four guests in March.',
};

/** Fill the enquiry form. Pass `{ field: null }` to deliberately leave a field blank. */
async function fillEnquiry(page, overrides = {}) {
  const data = { ...VALID_ENQUIRY, ...overrides };
  if (data.fname != null) await page.fill('#fname', data.fname);
  if (data.lname != null) await page.fill('#lname', data.lname);
  if (data.email != null) await page.fill('#email', data.email);
  if (data.service != null) await page.selectOption('#service', { label: data.service });
  if (data.message != null) await page.fill('#message', data.message);
  return data;
}

const submitButton = (page) => page.locator('form.contact-form button[type="submit"]');
const formStatus = (page) => page.locator('form.contact-form .form-status');

module.exports = {
  FORMSUBMIT_ENDPOINT,
  WA_NUMBER,
  WA_HREF,
  PHONE_DISPLAY,
  VALID_ENQUIRY,
  stubExternalAssets,
  interceptEnquiry,
  fillEnquiry,
  submitButton,
  formStatus,
  expect,
};
