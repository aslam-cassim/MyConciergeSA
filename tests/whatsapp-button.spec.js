const { test } = require('@playwright/test');
const {
  WA_NUMBER,
  WA_HREF,
  PHONE_DISPLAY,
  stubExternalAssets,
  fillEnquiry,
  submitButton,
  formStatus,
  expect,
} = require('./helpers');

test.describe('WhatsApp button', () => {
  test.beforeEach(async ({ page }) => {
    await stubExternalAssets(page);
    await page.goto('/#contact');
  });

  test('is visible with the correct wa.me link and a safe target', async ({ page }) => {
    const cta = page.locator('a.whatsapp-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', WA_HREF);
    await expect(cta).toHaveAttribute('target', '_blank');
    await expect(cta).toHaveAttribute('rel', /noopener/);
    await expect(cta).toHaveAttribute('rel', /noreferrer/);
    await expect(cta).toContainText('Message on WhatsApp');
    await expect(cta).toContainText(/urgent requests/i);
  });

  test('has an accessible name and a decorative (non-announced) icon', async ({ page }) => {
    const cta = page.locator('a.whatsapp-cta');
    await expect(cta).toHaveAccessibleName(/message on whatsapp/i);
    await expect(cta.locator('.wa-icon')).toHaveAttribute('aria-hidden', 'true');
    await expect(cta.locator('.wa-icon svg')).toBeVisible();
  });

  test('opens wa.me in a new tab with the right number when clicked', async ({ page, context }) => {
    // stub wa.me so the click never leaves the sandbox
    await context.route(/wa\.me/, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>wa.me stub</title>' }),
    );

    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('a.whatsapp-cta').click(),
    ]);

    await popup.waitForLoadState('domcontentloaded');
    expect(popup.url()).toBe(WA_HREF);
    await popup.close();
  });

  test('meets a 44px minimum tap target', async ({ page }) => {
    const box = await page.locator('a.whatsapp-cta').boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  });

  test('keyboard: the CTA is focusable and activates with Enter', async ({ page, context }) => {
    await context.route(/wa\.me/, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }),
    );
    const cta = page.locator('a.whatsapp-cta');
    await cta.focus();
    await expect(cta).toBeFocused();

    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.keyboard.press('Enter'),
    ]);
    expect(popup.url()).toBe(WA_HREF);
    await popup.close();
  });

  test('the same number is used everywhere it appears', async ({ page }) => {
    await expect(page.locator('a.whatsapp-cta')).toHaveAttribute('href', `https://wa.me/${WA_NUMBER}`);
    await expect(page.locator('a[href^="tel:"]')).toHaveAttribute('href', `tel:+${WA_NUMBER}`);
    await expect(
      page.locator('.contact-detail', { hasText: 'Phone / WhatsApp' }),
    ).toContainText(PHONE_DISPLAY);
  });

  test('the form error state points people to the same WhatsApp number', async ({ page }) => {
    await page.route('https://formsubmit.co/**', (route) => route.fulfill({ status: 500, body: 'x' }));

    await fillEnquiry(page, { service: 'Lifestyle Management' });
    await submitButton(page).click();

    const status = formStatus(page);
    await expect(status).toHaveClass(/is-error/);
    await expect(status).toContainText(PHONE_DISPLAY);
    await expect(status).toContainText(/whatsapp/i);
  });
});

test.describe('WhatsApp button on a phone-sized viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('is reachable in the contact section on mobile', async ({ page }) => {
    await stubExternalAssets(page);
    await page.goto('/#contact');
    const cta = page.locator('a.whatsapp-cta');
    await expect(cta).toBeVisible();
    await cta.scrollIntoViewIfNeeded();
    const box = await cta.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  });
});
