import { expect, test, type Page, type Route } from '@playwright/test';

// UI test with the API mocked in the browser; the database rules are covered by tests/pcea-db.test.ts.
test.use({ channel: 'chrome', timezoneId: 'Asia/Shanghai' });

const BASE = process.env.PCEA_TEST_URL ?? 'http://127.0.0.1:3108';
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function shanghaiToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}
const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

async function mockApi(page: Page) {
  const day = plusDays(shanghaiToday(), 1);
  const events = [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', eventDate: day, startTime: '19:00', timezone: 'America/New_York',
      title: 'Rooftop movie night', imageUrl: null, costAmount: 12, costCurrency: 'USD', note: 'Bring a blanket — tickets: https://example.com/tickets?id=1',
      createdBy: OTHER, creatorName: 'Guest #2', locked: false,
      responses: [{ userId: OTHER, userName: 'Guest #2', probability: 80, interest: 'high', note: 'organizer', attended: null, updatedAt: new Date().toISOString() }],
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', eventDate: day, startTime: null, timezone: 'Asia/Shanghai',
      title: 'Hike', imageUrl: null, costAmount: 0, costCurrency: 'CNY', note: null,
      createdBy: ME, creatorName: 'Lucy', locked: false, responses: [],
    },
  ];
  const me = { id: ME, name: 'Lucy', displayName: 'Lucy', userNumber: 1, timezone: 'Asia/Shanghai', recoveryCode: 'PCEA-ABCDE-FGHJK-MNPQR',
    calibration: { resolved: 0, brier: null, meanPrediction: null, attendedRate: null, buckets: [] } };
  const puts: unknown[] = [];
  await page.route('**/pcea/api/me', (route: Route) => route.fulfill({ json: me }));
  await page.route('**/pcea/api/events?**', (route: Route) => route.fulfill({ json: { events } }));
  await page.route('**/pcea/api/events/*/response', async (route: Route) => {
    const ev = events.find(e => route.request().url().includes(e.id))!;
    if (route.request().method() === 'DELETE') {
      ev.responses = ev.responses.filter(r => r.userId !== ME);
      return route.fulfill({ json: { ok: true } });
    }
    const body = route.request().postDataJSON();
    puts.push(body);
    ev.responses = [...ev.responses.filter(r => r.userId !== ME), { userId: ME, userName: 'Lucy', ...body, attended: null, updatedAt: new Date().toISOString() }];
    await route.fulfill({ json: { ok: true } });
  });
  return { day, puts };
}

test('shows events by day, flags other timezones in red, and records a prediction', async ({ page }) => {
  const { day, puts } = await mockApi(page);
  await page.goto(`${BASE}/pcea?date=${day}`);

  // English by default.
  const movie = page.getByRole('article', { name: 'Rooftop movie night' });
  await expect(movie).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add event' })).toBeVisible();
  await expect(movie.getByText(/7:00 PM · America\/New_York \(EST\)/)).toBeVisible();
  const red = movie.getByTestId('viewer-time');
  await expect(red).toContainText('= yours:');
  await expect(red).toContainText('8:00 AM');
  await expect(red).toContainText('Asia/Shanghai');
  await expect(red).toHaveCSS('color', 'rgb(212, 42, 42)');
  await expect(movie.getByText('$12.00')).toBeVisible();
  await expect(movie.getByTestId('expected')).toHaveText('0.8');
  await expect(movie.getByRole('link', { name: 'https://example.com/tickets?id=1' })).toHaveAttribute('target', '_blank');

  // The hike was created in the viewer's own timezone: no red note.
  const hike = page.getByRole('article', { name: 'Hike' });
  await expect(hike.getByText('Free')).toBeVisible();
  await expect(hike.getByTestId('viewer-time')).toHaveCount(0);
  await expect(hike.getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(movie.getByRole('button', { name: 'Edit' })).toHaveCount(0);

  const form = movie.getByTestId('my-response');
  await expect(form.getByRole('button', { name: 'Submit' })).toBeDisabled();
  await form.getByRole('button', { name: '68%' }).click();
  await form.getByRole('button', { name: /Somewhat/ }).click();
  await form.getByLabel('My note').fill('Depends on work');
  await form.getByRole('button', { name: 'Submit' }).click();
  await expect(movie.getByTestId('expected')).toHaveText('1.5');
  await expect(page.getByTestId('day-expected')).toHaveText('1.5');
  expect(puts[0]).toEqual({ probability: 68, interest: 'some', note: 'Depends on work' });

  // After submitting, the form goes away; my answer shows (expanded by default) in the list with edit/delete.
  await expect(form).toHaveCount(0);
  const mine = movie.getByTestId('my-response-row');
  await expect(mine).toContainText('68%');
  await expect(mine).toContainText('Depends on work');
  await expect(movie.getByText('organizer')).toBeVisible();
  await mine.getByRole('button', { name: 'Edit' }).click();
  const editor = mine.getByTestId('my-response');
  await expect(editor.getByLabel('My note')).toHaveValue('Depends on work');
  await editor.getByLabel('Custom probability').fill('35');
  await editor.getByRole('button', { name: 'Update' }).click();
  await expect(movie.getByTestId('expected')).toHaveText('1.1');
  await expect(mine.getByTestId('my-response')).toHaveCount(0);
  await expect(mine).toContainText('35%');

  // Delete asks once more; cancel keeps it.
  await mine.getByRole('button', { name: 'Delete' }).click();
  await expect(mine.getByText('Delete your answer?')).toBeVisible();
  await mine.getByRole('button', { name: 'Cancel' }).click();
  await expect(mine.getByText('Delete your answer?')).toHaveCount(0);

  await movie.getByRole('button', { name: 'Hide answers' }).click();
  await expect(movie.getByText('organizer')).toHaveCount(0);
  await movie.getByRole('button', { name: /^See everyone/ }).click();
  await expect(movie.getByText('organizer')).toBeVisible();

  await page.getByRole('button', { name: '+ Add event' }).click();
  await expect(page.getByRole('dialog', { name: 'Add event' })).toContainText('Asia/Shanghai');
  await page.screenshot({ path: '/private/tmp/pcea-editor.png', fullPage: true });
  await page.keyboard.press('Escape');

  // Switch to Chinese; it sticks across a reload.
  await page.getByRole('button', { name: 'Switch to Chinese' }).click();
  await expect(page.getByRole('button', { name: '+ 添加活动' })).toBeVisible();
  await expect(movie.getByText('预计人数')).toBeVisible();
  await expect(red).toContainText('你的');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.reload();
  await expect(page.getByRole('button', { name: '+ 添加活动' })).toBeVisible();
  await expect(hike.getByText('免费')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/private/tmp/pcea-mobile-zh.png', fullPage: true });
  await page.getByRole('button', { name: '切换到英文' }).click();
  await expect(page.getByRole('button', { name: '+ Add event' })).toBeVisible();
  await page.screenshot({ path: '/private/tmp/pcea-mobile.png', fullPage: true });
});

test('server errors show in the active language', async ({ page }) => {
  const { day } = await mockApi(page);
  await page.route('**/pcea/api/events/*/response', route => route.fulfill({ status: 409, json: { code: 'locked', error: 'This event has ended — predictions are locked.' } }));
  await page.goto(`${BASE}/pcea?date=${day}`);
  const form = page.getByRole('article', { name: 'Hike' }).getByTestId('my-response');
  await form.getByRole('button', { name: '50%' }).click();
  await form.getByRole('button', { name: /Not interested/ }).click();
  await form.getByRole('button', { name: 'Submit' }).click();
  await expect(form.getByRole('status')).toHaveText('This event has ended — predictions are locked.');
  await page.getByRole('button', { name: 'Switch to Chinese' }).click();
  await expect(form.getByRole('status')).toHaveText('这个活动已经结束，概率和兴趣已锁定。');
});

test('first visit asks for a name before anything else; avatars stack at the end of the bar', async ({ page }) => {
  const { day } = await mockApi(page);
  let me = { id: ME, name: 'Guest #1', displayName: null as string | null, userNumber: 1, timezone: 'Asia/Shanghai', recoveryCode: 'PCEA-ABCDE-FGHJK-MNPQR',
    calibration: { resolved: 0, brier: null, meanPrediction: null, attendedRate: null, buckets: [] } };
  await page.route('**/pcea/api/me', async route => {
    if (route.request().method() === 'PATCH') {
      const name = route.request().postDataJSON().displayName;
      me = { ...me, name, displayName: name };
    }
    await route.fulfill({ json: me });
  });
  const crowd = Array.from({ length: 7 }, (_, i) => ({
    userId: `0000000${i}-0000-4000-8000-000000000000`, userName: ['Mia', 'Noah', '张三', 'Ava', 'Leo', 'Zoe', 'Kai'][i],
    probability: [100, 80, 68, 50, 20, 0, 90][i], interest: 'high', note: null, attended: null, updatedAt: new Date().toISOString(),
  }));
  await page.route('**/pcea/api/events?**', route => route.fulfill({ json: { events: [{
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', eventDate: day, startTime: '10:00', timezone: 'Asia/Shanghai', title: 'Board games',
    imageUrl: null, costAmount: null, costCurrency: 'USD', note: null, createdBy: OTHER, creatorName: 'Mia', locked: false, responses: crowd,
  }] } }));
  await page.goto(`${BASE}/pcea?date=${day}`);

  const welcome = page.getByRole('dialog', { name: 'Hi! What’s your name?' });
  await expect(welcome).toBeVisible();
  await expect(welcome.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await welcome.getByRole('button', { name: /recovery code/ }).click();
  await expect(welcome.getByPlaceholder('PCEA-XXXXX-XXXXX-XXXXX')).toBeVisible();
  await welcome.getByRole('button', { name: 'I’m new here' }).click();
  await welcome.getByLabel('Name').fill('lucy');
  await expect(welcome.getByText('L', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/private/tmp/pcea-welcome.png' });
  await welcome.getByRole('button', { name: 'Continue' }).click();
  await expect(welcome).toHaveCount(0);
  await expect(page.getByTestId('me-avatar')).toHaveText('L');
  await expect(page.getByTestId('me-avatar')).toHaveAttribute('title', 'lucy');

  // 7 answers: 4 initials (highest probability first) + "+3".
  const stack = page.getByTestId('avatar-stack');
  await expect(stack.locator('span')).toHaveText(['M', 'K', 'N', '张', '+3']);
  await expect(stack.locator('span').first()).toHaveAttribute('title', 'Mia · 100% · Interested');
  await page.locator('article').screenshot({ path: '/private/tmp/pcea-avatars.png' });
  await stack.click();
  await expect(page.getByRole('list').getByText('Zoe')).toBeVisible();
});

test('events with a location show their stop letter and the day’s drive times', async ({ page }) => {
  const { day } = await mockApi(page);
  const base = { timezone: 'America/Los_Angeles', imageUrl: null, costAmount: null, costCurrency: 'USD', note: null, createdBy: OTHER, creatorName: 'Mia', locked: false, responses: [] };
  await page.route('**/pcea/api/events?**', route => route.fulfill({ json: { events: [
    { ...base, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', eventDate: day, startTime: '09:00', title: 'Brunch', location: 'Ferry Building, San Francisco' },
    { ...base, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd02', eventDate: day, startTime: '13:00', title: 'Hike', location: 'Muir Woods' },
    { ...base, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd03', eventDate: day, startTime: '15:00', title: 'Call', location: null },
    { ...base, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd04', eventDate: day, startTime: '19:00', title: 'Dinner', location: 'Sausalito' },
  ] } }));
  const stop = (n: number, title: string, location: string, letter: string) =>
    ({ eventId: `dddddddd-dddd-4ddd-8ddd-dddddddddd0${n}`, title, location, letter, lat: null, lng: null });
  let routeCalls = 0;
  await page.route('**/pcea/api/route?**', route => { routeCalls++; return route.fulfill({ json: {
    configured: true,
    stops: [stop(1, 'Brunch', 'Ferry Building, San Francisco', 'A'), stop(2, 'Hike', 'Muir Woods', 'B'), stop(4, 'Dinner', 'Sausalito', 'C')],
    legs: [
      { from: 'A', to: 'B', durationSeconds: 2460, distanceMeters: 27000, path: [] },
      { from: 'B', to: 'C', durationSeconds: 1500, distanceMeters: 16000, path: [] },
    ],
    totalSeconds: 3960, totalMeters: 43000,
  } }); });
  await page.goto(`${BASE}/pcea?date=${day}`);

  const panel = page.getByTestId('route-map');
  await expect(panel.getByTestId('route-leg')).toHaveText([/A→B 41 min/, /B→C 25 min/]);
  await expect(panel.getByTestId('route-total')).toContainText('Total driving 1 h 6 min');
  await expect(panel).toContainText('1 event has no location');
  await expect(page.getByRole('article', { name: 'Hike' }).getByTestId('stop-letter')).toHaveText('B');
  await expect(page.getByRole('article', { name: 'Dinner' }).getByRole('link', { name: 'Sausalito' }))
    .toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=Sausalito');
  await page.getByRole('button', { name: 'Switch to Chinese' }).click();
  await expect(panel.getByTestId('route-total')).toContainText('总开车时间 1小时6分钟');
  expect(routeCalls).toBe(1);
});

test('on a phone the title fits one line and the tagline hides behind the i button', async ({ page }) => {
  const { day } = await mockApi(page);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${BASE}/pcea?date=${day}`);
    const title = page.getByRole('heading', { level: 1 });
    const box = (await title.boundingBox())!;
    expect(box.height).toBeLessThan(40); // one line
    // Title, i button, language and avatar all share the first row without overlapping or overflowing.
    const lang = (await page.getByRole('button', { name: 'Switch to Chinese' }).boundingBox())!;
    const info = (await page.getByRole('button', { name: 'What is PCEA?' }).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(info.x);
    expect(info.x + info.width).toBeLessThanOrEqual(lang.x);
    expect(Math.abs((box.y + box.height / 2) - (lang.y + lang.height / 2))).toBeLessThan(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  const tagline = page.locator('#pcea-tagline');
  await expect(tagline).toBeHidden();
  const info = page.getByRole('button', { name: 'What is PCEA?' });
  await info.click();
  await expect(tagline).toBeVisible();
  await page.screenshot({ path: '/private/tmp/claude-501/pcea-mobile-info.png' });
  await info.click();
  await expect(tagline).toBeHidden();
  await page.screenshot({ path: '/private/tmp/claude-501/pcea-mobile-header.png' });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.screenshot({ path: '/private/tmp/claude-501/pcea-mobile-320.png' });
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(tagline).toBeVisible();
  await expect(info).toBeHidden();
});

test('deleting my answer needs a second click, then the form comes back', async ({ page }) => {
  const { day } = await mockApi(page);
  await page.goto(`${BASE}/pcea?date=${day}`);
  const hike = page.getByRole('article', { name: 'Hike' });
  const form = hike.getByTestId('my-response');
  await form.getByRole('button', { name: '80%' }).click();
  await form.getByRole('button', { name: /Somewhat/ }).click();
  await form.getByRole('button', { name: 'Submit' }).click();
  const mine = hike.getByTestId('my-response-row');
  await expect(mine).toContainText('80%');
  await expect(form).toHaveCount(0);
  await mine.getByRole('button', { name: 'Delete' }).click();
  await mine.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(mine).toHaveCount(0);
  await expect(hike.getByTestId('my-response').getByRole('button', { name: 'Submit' })).toBeVisible();
});

test('location field suggests Google places and fills the full address', async ({ page }) => {
  // Stand-in for the Places (New) JS API; the dev server runs with a dummy NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
  await page.addInitScript(() => {
    const places = [
      { main: 'The Castro Theatre', secondary: '429 Castro St, San Francisco, CA, USA', name: 'The Castro Theatre', address: '429 Castro St, San Francisco, CA 94114, USA' },
      { main: 'The Castro', secondary: 'San Francisco, CA, USA', name: 'The Castro', address: 'The Castro, San Francisco, CA, USA' },
    ];
    const calls: string[] = [];
    (window as unknown as { __placesCalls: string[] }).__placesCalls = calls;
    (window as unknown as { google: unknown }).google = { maps: { importLibrary: async (name: string) => name !== 'places' ? {} : {
      AutocompleteSessionToken: class {},
      AutocompleteSuggestion: { fetchAutocompleteSuggestions: async ({ input }: { input: string }) => {
        calls.push(input);
        return { suggestions: places.filter(p => p.main.toLowerCase().includes(input.toLowerCase())).map(p => ({ placePrediction: {
          mainText: { text: p.main }, secondaryText: { text: p.secondary }, text: { text: `${p.main}, ${p.secondary}` },
          toPlace: () => { const place = { displayName: '', formattedAddress: '', fetchFields: async () => { place.displayName = p.name; place.formattedAddress = p.address; } }; return place; },
        } })) };
      } },
    } } };
  });
  const { day } = await mockApi(page);
  let created: Record<string, unknown> | null = null;
  await page.route('**/pcea/api/events', async route => {
    created = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' } });
  });
  await page.goto(`${BASE}/pcea?date=${day}`);
  await page.getByRole('button', { name: '+ Add event' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add event' });
  await dialog.getByLabel('Title *').fill('Escape game');

  const loc = dialog.getByRole('combobox', { name: 'Location (optional)' });
  await loc.pressSequentially('the castro', { delay: 20 });
  const options = dialog.getByRole('listbox', { name: 'Location (optional)' }).getByRole('option');
  await expect(options).toHaveCount(2);
  await expect(options.first()).toContainText('The Castro Theatre');
  await expect(dialog.getByText('powered by Google')).toBeVisible();
  await page.screenshot({ path: '/private/tmp/pcea-places.png' });

  // Escape closes only the dropdown; the editor stays open.
  await loc.press('Escape');
  await expect(options).toHaveCount(0);
  await expect(dialog).toBeVisible();

  // Keyboard pick: Enter chooses the highlighted place instead of submitting.
  await loc.press('Space');
  await loc.press('Backspace');
  await expect(options).toHaveCount(2);
  await loc.press('ArrowDown');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await loc.press('Enter');
  await expect(loc).toHaveValue('The Castro Theatre, 429 Castro St, San Francisco, CA 94114, USA');
  expect(created).toBeNull();

  // Mouse pick; a name already at the start of the address isn't repeated.
  await loc.fill('');
  await loc.pressSequentially('castro', { delay: 20 });
  await options.nth(1).click();
  await expect(loc).toHaveValue('The Castro, San Francisco, CA, USA');

  // Free text still works.
  await loc.fill('My place, back door');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toHaveCount(0);
  expect(created!.location).toBe('My place, back door');
  const calls = await page.evaluate(() => (window as unknown as { __placesCalls: string[] }).__placesCalls);
  expect(calls.length).toBeLessThan(8); // debounced, not one call per keystroke
});
