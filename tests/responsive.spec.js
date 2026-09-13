const { test } = require('@playwright/test');
const { stubExternalAssets, expect } = require('./helpers');

// Regression coverage for the mobile/tablet "page jumps around" bugs:
// 1. The off-canvas mobile nav panel was contributing to the document's
//    horizontal scroll extent even while translated off-screen, because
//    overflow-x: hidden was only set on body, not html.
// 2. The hero used a static 100vh, which mobile browsers recalculate as
//    their address bar shows/hides, resizing the hero (and everything
//    below it) on the very first scroll.

const WIDTHS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet portrait', width: 768, height: 1024 },
  { name: 'tablet landscape', width: 1024, height: 768 },
];

test.describe('No horizontal scroll', () => {
  for (const { name, width, height } of WIDTHS) {
    test(`page has no horizontal overflow on ${name} (${width}x${height})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await stubExternalAssets(page);
      await page.goto('/');

      const { scrollWidth, innerWidth, overflowX } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        overflowX: [getComputedStyle(document.documentElement).overflowX, getComputedStyle(document.body).overflowX],
      }));

      expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
      expect(overflowX).toEqual(['hidden', 'hidden']);

      // A forced horizontal scroll attempt must not move the viewport —
      // this is what actually protects against iOS Safari's elastic
      // overscroll reaching the hidden off-canvas nav panel.
      await page.evaluate(() => window.scrollTo(500, 0));
      const scrollX = await page.evaluate(() => window.scrollX);
      expect(scrollX).toBe(0);
    });
  }

  test('opening the mobile nav does not introduce horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubExternalAssets(page);
    await page.goto('/');
    await page.click('#navToggle');
    await expect(page.locator('#navLinks')).toHaveClass(/open/);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const innerWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
  });
});

test.describe('Grid items never overflow their grid container', () => {
  // Regression coverage for the "text cut off under About / 35+" bug: a bare
  // `1fr` grid track refuses to shrink below its content's natural minimum
  // width (the classic CSS Grid "min-width: auto" gotcha), so .meet-grid's
  // track — and the nested .stat-row's — silently rendered ~86px wider than
  // the grid container itself at mobile widths, and the overflowing content
  // got clipped by overflow-x: hidden. The grid container's own box stays
  // correctly sized (it's laid out by its parent as normal); it's the
  // *items inside it* that spill past its right edge. Note this is NOT
  // caught by a page-level scrollWidth check: once overflow-x: hidden is set
  // on <html>, Chromium reports scrollWidth clipped to the viewport
  // regardless of internal content overflow.
  for (const { name, width, height } of WIDTHS) {
    test(`no grid item overflows its grid container on ${name} (${width}x${height})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await stubExternalAssets(page);
      await page.goto('/');

      const offenders = await page.evaluate(() => {
        const bad = [];
        document.querySelectorAll('body *').forEach((container) => {
          const display = getComputedStyle(container).display;
          if (display !== 'grid' && display !== 'inline-grid') return;
          const containerRect = container.getBoundingClientRect();
          Array.from(container.children).forEach((child) => {
            const r = child.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return; // not rendered
            if (r.right > containerRect.right + 1 || r.left < containerRect.left - 1) {
              bad.push({
                container: container.className || container.tagName,
                child: child.className || child.tagName,
                childRight: Math.round(r.right),
                childLeft: Math.round(r.left),
                containerRight: Math.round(containerRect.right),
                containerLeft: Math.round(containerRect.left),
              });
            }
          });
        });
        return bad;
      });

      expect(offenders).toEqual([]);
    });
  }
});

test.describe('Hero fills the real viewport height', () => {
  test('hero height tracks viewport height (not a fixed pixel value)', async ({ page }) => {
    await stubExternalAssets(page);

    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto('/');
    const shortHeroHeight = await page.locator('.hero').evaluate((el) => el.getBoundingClientRect().height);

    await page.setViewportSize({ width: 390, height: 900 });
    await page.reload();
    const tallHeroHeight = await page.locator('.hero').evaluate((el) => el.getBoundingClientRect().height);

    // A viewport-relative unit (vh/dvh) makes the hero grow with the
    // viewport; a static px value or a stale cached vh would not.
    expect(tallHeroHeight).toBeGreaterThan(shortHeroHeight);
    expect(shortHeroHeight).toBeGreaterThanOrEqual(680); // the CSS min-height floor
  });
});
