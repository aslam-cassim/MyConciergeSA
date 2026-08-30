const { test } = require('@playwright/test');
const {
  FORMSUBMIT_ENDPOINT,
  PHONE_DISPLAY,
  stubExternalAssets,
  interceptEnquiry,
  fillEnquiry,
  submitButton,
  formStatus,
  expect,
} = require('./helpers');

test.describe('Send Enquiry form', () => {
  test.beforeEach(async ({ page }) => {
    await stubExternalAssets(page);
    await page.goto('/#contact');
    await expect(page.locator('form.contact-form')).toBeVisible();
  });

  test('renders required fields, helper note and a polite status region', async ({ page }) => {
    await expect(page.locator('#fname')).toHaveJSProperty('required', true);
    await expect(page.locator('#email')).toHaveJSProperty('required', true);
    await expect(page.locator('#service')).toHaveJSProperty('required', true);
    await expect(page.locator('#message')).toHaveJSProperty('required', true);
    await expect(page.locator('#lname')).toHaveJSProperty('required', false);

    await expect(page.locator('#email')).toHaveAttribute('type', 'email');
    await expect(page.locator('.form-note')).toContainText(/answered personally by Sedick, usually within one business day/i);

    const status = formStatus(page);
    await expect(status).toHaveAttribute('role', 'status');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await expect(status).toBeHidden();

    await expect(submitButton(page)).toHaveText('Send Enquiry');
  });

  test('honeypot field exists and is hidden from real users', async ({ page }) => {
    const honey = page.locator('form.contact-form input[name="_honey"]');
    await expect(honey).toHaveCount(1);
    await expect(honey).toBeHidden();
    await expect(honey).toHaveAttribute('tabindex', '-1');
  });

  test('native validation blocks submit when everything is empty', async ({ page }) => {
    const requests = await interceptEnquiry(page);

    await submitButton(page).click();

    await expect
      .poll(() => page.locator('#fname').evaluate((el) => el.validity.valid))
      .toBe(false);
    await expect(formStatus(page)).toBeHidden();
    expect(requests).toHaveLength(0);
  });

  test('native validation blocks submit when only the service is unselected', async ({ page }) => {
    const requests = await interceptEnquiry(page);

    await fillEnquiry(page, { service: null });
    await submitButton(page).click();

    await expect
      .poll(() => page.locator('#service').evaluate((el) => el.validity.valid))
      .toBe(false);
    expect(requests).toHaveLength(0);
  });

  test('rejects a malformed email address', async ({ page }) => {
    const requests = await interceptEnquiry(page);

    await fillEnquiry(page, { email: 'not-an-email' });
    await submitButton(page).click();

    await expect
      .poll(() => page.locator('#email').evaluate((el) => el.validity.valid))
      .toBe(false);
    expect(requests).toHaveLength(0);
  });

  test('submits once as POST and shows a personal confirmation', async ({ page }) => {
    const requests = await interceptEnquiry(page); // default: 200 success

    await fillEnquiry(page);
    await submitButton(page).click();

    const status = formStatus(page);
    await expect(status).toBeVisible();
    await expect(status).toHaveClass(/is-success/);
    await expect(status).toContainText(/Sedick will reply to you personally/i);
    await expect(status).toContainText(PHONE_DISPLAY);

    await expect(submitButton(page)).toHaveText(/enquiry sent/i);
    await expect(submitButton(page)).toBeDisabled();

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].postData).toContain('thandi@example.com');
    expect(requests[0].postData).toContain('Cape Town Experiences');

    // form is cleared after a successful send
    await expect(page.locator('#fname')).toHaveValue('');
    await expect(page.locator('#email')).toHaveValue('');
    await expect(page.locator('#message')).toHaveValue('');
  });

  test('shows a spinner-style label while the request is in flight', async ({ page }) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await interceptEnquiry(page, async (route) => {
      await gate;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await fillEnquiry(page);
    await submitButton(page).click();

    await expect(submitButton(page)).toHaveText(/sending/i);
    await expect(submitButton(page)).toBeDisabled();

    release();
    await expect(submitButton(page)).toHaveText(/enquiry sent/i);
  });

  test('a failed send is recoverable: error message, button restored, input kept', async ({ page }) => {
    await interceptEnquiry(page, (route) => route.fulfill({ status: 500, body: 'server error' }));

    await fillEnquiry(page);
    await submitButton(page).click();

    const status = formStatus(page);
    await expect(status).toBeVisible();
    await expect(status).toHaveClass(/is-error/);
    await expect(status).toContainText(/something went wrong/i);
    await expect(status).toContainText(/whatsapp/i);
    await expect(status).toContainText(PHONE_DISPLAY);
    await expect(status).toContainText('info@myconciergesa.com');

    await expect(submitButton(page)).toBeEnabled();
    await expect(submitButton(page)).toHaveText('Send Enquiry');
    await expect(page.locator('#email')).toHaveValue('thandi@example.com');
    await expect(page.locator('#message')).not.toHaveValue('');
  });

  test('recovers on retry after a transient failure', async ({ page }) => {
    let attempt = 0;
    await interceptEnquiry(page, (route) => {
      attempt += 1;
      return attempt === 1
        ? route.fulfill({ status: 500, body: 'nope' })
        : route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await fillEnquiry(page);
    await submitButton(page).click();
    await expect(formStatus(page)).toHaveClass(/is-error/);

    await submitButton(page).click();
    await expect(formStatus(page)).toHaveClass(/is-success/);
    expect(attempt).toBe(2);
  });

  test('the "Request a Service" hero button jumps to the form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Request a Service' }).click();
    await expect(page).toHaveURL(/#contact$/);
    await expect(page.locator('form.contact-form')).toBeInViewport();
  });

  test('experience tiles deep-link to the form with the matching service pre-selected', async ({ page }) => {
    const cases = [
      ['Safari & Wildlife', 'Safari & Wildlife'],
      ['Helicopter & Air Charters', 'Travel Planning & Transport'],
      ['City & Cultural Access', 'Restaurant & Event Reservations'],
    ];

    for (const [tileHeading, expectedService] of cases) {
      await page.goto('/');
      await page.locator('a.exp-tile', { hasText: tileHeading }).click();
      await expect(page).toHaveURL(/#contact$/);
      await expect(page.locator('#service')).toHaveValue(expectedService);
    }
  });

  test('does not call the live formsubmit.co endpoint', async ({ page }) => {
    const external = [];
    page.on('request', (r) => {
      const url = r.url();
      if (url.includes('formsubmit.co')) external.push(url);
    });
    await interceptEnquiry(page); // intercepts before any request leaves

    await fillEnquiry(page);
    await submitButton(page).click();
    await expect(formStatus(page)).toBeVisible();

    // the only formsubmit.co URL seen is the one our route intercepted
    expect(external).toEqual([FORMSUBMIT_ENDPOINT]);
  });
});
