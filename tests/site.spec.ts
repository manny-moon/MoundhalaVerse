import { test, expect, type Page } from '@playwright/test';

/**
 * Browser tests, each one guarding a bug that actually shipped at some point
 * rather than a hypothetical. The comments name what went wrong, so a failure
 * here says what broke and not just that something did.
 */

/** The entrance is gated on the scene reporting ready; everything waits on it. */
async function ready(page: Page) {
  await page.goto('');
  await page.waitForFunction(() => document.body.dataset.stage === 'ready');
}

/** Jump every animation to its resting state so layout can be measured. */
async function settle(page: Page) {
  await page.evaluate(() => {
    for (const a of document.getAnimations()) a.currentTime = 30_000;
  });
  await page.waitForTimeout(150);
}

const VIEWPORTS = [
  { name: 'small phone', width: 320, height: 568 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1366, height: 768 },
];

test.describe('layout', () => {
  for (const vp of VIEWPORTS) {
    test(`no page overflow at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await ready(page);
      await settle(page);
      // A transformed box still contributes to scrollable overflow, which is
      // what once popped a scrollbar mid-animation and made the page shake.
      const overflow = await page.evaluate(() => {
        const d = document.documentElement;
        return { x: d.scrollWidth - d.clientWidth, y: d.scrollHeight - d.clientHeight };
      });
      expect(overflow.x, 'horizontal overflow').toBe(0);
      expect(overflow.y, 'vertical overflow').toBe(0);
    });
  }

  test('the hero never runs underneath the nav rail', async ({ page }) => {
    // A phone held sideways was getting the portrait layout and overlapping.
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await ready(page);
      await settle(page);
      const clear = await page.evaluate(() => {
        const hero = document.querySelector('.intro')!.getBoundingClientRect();
        const rail = document.querySelector('.rail')!.getBoundingClientRect();
        return Math.round(rail.top - hero.bottom);
      });
      expect(clear, `${vp.name}: hero overlaps the rail`).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('accessibility', () => {
  test('every control has an accessible name, including narrow screens', async ({ page }) => {
    // Below 22rem the rail labels are display:none, which drops them from the
    // accessibility tree and left five unlabelled buttons for screen readers.
    for (const width of [340, 390, 1366]) {
      await page.setViewportSize({ width, height: 760 });
      await ready(page);
      await settle(page);
      await page.locator('#settings-toggle').click();
      await page.waitForTimeout(300);

      const unnamed = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('a, button, input')) {
          if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
          if (getComputedStyle(el).display === 'none') continue;
          const labelled =
            el.getAttribute('aria-label') ||
            (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ||
            [...el.querySelectorAll<HTMLElement>('*')]
              .filter((n) => getComputedStyle(n).display !== 'none')
              .map((n) => n.textContent)
              .join('') ||
            el.textContent;
          if (!labelled || !labelled.trim()) bad.push(el.id || el.className || el.tagName);
        }
        return bad;
      });
      expect(unnamed, `unnamed controls at ${width}px`).toEqual([]);
      await page.locator('#settings-toggle').click();
    }
  });

  test('a closed settings panel does not swallow clicks', async ({ page }) => {
    // `display: grid` on the panel outranked the user-agent [hidden] rule, so
    // an invisible 320x322 box sat over the corner eating every click.
    await page.setViewportSize({ width: 1366, height: 768 });
    await ready(page);
    await settle(page);
    const box = await page.evaluate(() => {
      const p = document.getElementById('settings-panel')!;
      const r = p.getBoundingClientRect();
      return { display: getComputedStyle(p).display, width: r.width, height: r.height };
    });
    expect(box.display).toBe('none');
    expect(box.width * box.height).toBe(0);
  });

});

/**
 * Reduced motion is emulated on the page rather than set through a fixture.
 * A describe-level `test.use({ reducedMotion })` did not reach the page here,
 * and the test quietly passed through the normal path instead of the one it
 * was written for. The first assertion below makes that impossible to miss.
 */
test.describe('reduced motion', () => {
  test('content is visible immediately, with nothing left to animate', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page);
    await page.waitForTimeout(400);

    const state = await page.evaluate(() => ({
      applied: matchMedia('(prefers-reduced-motion: reduce)').matches,
      name: getComputedStyle(document.querySelector('.intro__char')!).opacity,
      rail: getComputedStyle(document.querySelector('.rail')!).opacity,
      blurb: getComputedStyle(document.querySelector('.intro__blurb')!).opacity,
      headline: document.querySelector('#headline')?.textContent ?? '',
      pending: document
        .querySelector('.rail')!
        .getAnimations()
        .filter((a) => a.playState === 'running').length,
    }));

    expect(state.applied, 'the preference never reached the page').toBe(true);
    expect(Number(state.name)).toBe(1);
    expect(Number(state.rail)).toBe(1);
    expect(Number(state.blurb)).toBe(1);
    expect(state.pending, 'nothing should still be animating').toBe(0);
    // The headline is rendered outright instead of typing itself out.
    expect(state.headline.length).toBeGreaterThan(0);
  });
});

test.describe('navigation', () => {
  test('a rail button opens its panel and Escape closes it', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await ready(page);
    await settle(page);
    await page.locator('[data-nav="experience"]').click();
    await page.waitForFunction(() => document.body.dataset.modalOpen === 'true');
    await expect(page.locator('[data-panel="experience"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.body.dataset.modalOpen !== 'true');
  });

  test('a section hash opens that panel on load', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('#skills');
    await page.waitForFunction(() => document.body.dataset.stage === 'ready');
    await page.waitForFunction(() => document.body.dataset.modalOpen === 'true');
    await expect(page.locator('[data-panel="skills"]')).toBeVisible();
  });

  test('panels open immediately when the scene is switched off', async ({ page }) => {
    // With no render loop the flight never advances, so the panel used to wait
    // out a multi-second safety timer for a move that would never finish.
    await page.setViewportSize({ width: 1366, height: 768 });
    await ready(page);
    await settle(page);
    await page.locator('#settings-toggle').click();
    await page.waitForTimeout(300);
    await page.locator('#motion-toggle').uncheck();
    await page.locator('#settings-toggle').click();
    await page.waitForTimeout(300);

    const started = Date.now();
    await page.locator('[data-nav="projects"]').click();
    await page.waitForFunction(() => document.body.dataset.modalOpen === 'true', undefined, {
      timeout: 3000,
    });
    expect(Date.now() - started, 'panel should not wait on a stopped flight').toBeLessThan(2000);
  });
});

test.describe('assets and metadata', () => {
  test('nothing 404s and the résumé is downloadable', async ({ page, request }) => {
    const failures: string[] = [];
    page.on('response', (r) => {
      if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
    });
    await ready(page);
    await settle(page);
    expect(failures).toEqual([]);

    const pdf = await request.get('files/Manny_Resume.pdf');
    expect(pdf.status()).toBe(200);
    expect(Number(pdf.headers()['content-length'] ?? 0)).toBeGreaterThan(50_000);
  });

  test('the résumé route renders real crawlable text', async ({ page }) => {
    await page.goto('resume/');
    await expect(page.locator('h1')).toContainText('Emmanuel Moundhala');
    await expect(page.getByText('Katapult Engineering').first()).toBeVisible();
  });

  test('the page carries its social and search metadata', async ({ page }) => {
    await page.goto('');
    const meta = await page.evaluate(() => ({
      title: document.title,
      description: document
        .querySelector('meta[name="description"]')
        ?.getAttribute('content'),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      jsonLd: !!document.querySelector('script[type="application/ld+json"]'),
    }));
    expect(meta.title).toBeTruthy();
    expect(meta.description?.length ?? 0).toBeGreaterThan(40);
    expect(meta.canonical).toContain('http');
    expect(meta.jsonLd).toBe(true);
  });
});

test.describe('sound (experimental)', () => {
  test('no audio graph exists until it is asked for', async ({ page }) => {
    // The point of the feature is that it costs nothing and makes no noise
    // unless someone opts in, so this asserts the absence rather than the
    // presence: zero AudioContexts constructed on a normal visit.
    await page.addInitScript(() => {
      (window as any).__contexts = 0;
      const Real = window.AudioContext;
      window.AudioContext = class extends Real {
        constructor(...args: any[]) {
          super(...args);
          (window as any).__contexts += 1;
        }
      } as any;
    });
    await ready(page);
    await settle(page);
    await page.waitForTimeout(500);

    expect(await page.evaluate(() => (window as any).__contexts)).toBe(0);
    expect(await page.locator('#sound-toggle').isChecked()).toBe(false);

    // Turning it on is a gesture, which is the only thing that may start audio.
    await page.locator('#settings-toggle').click();
    await page.waitForTimeout(300);
    await page.locator('#sound-toggle').check();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => (window as any).__contexts)).toBe(1);
  });
});
