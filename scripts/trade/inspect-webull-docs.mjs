// Read-only verification helper for the schemas in Webull's official docs.
// No credentials, brokerage API calls, code evaluation, or filesystem writes.
import { inflateSync } from 'node:zlib';
import { load } from 'cheerio';

const origin = 'https://developer.webull.com';
async function read(path) {
  const url = new URL(path, origin);
  if (url.origin !== origin || !url.pathname.startsWith('/apis/')) throw new Error('Unexpected documentation URL');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Documentation request failed: ${response.status}`);
  return response.text();
}
const html = load(await read('/apis/docs/reference/account-balance/'));
const paths = html('script[src]').map((_, e) => html(e).attr('src')).get();
const [main, runtime] = await Promise.all([read(paths.find(p => /\/main\./.test(p))), read(paths.find(p => /\/runtime~main\./.test(p)))]);
const names = process.argv.slice(2);
if (!names.length) {
  console.log([...main.matchAll(/@site\/docs\/reference\/([^"/]+)\.api\.mdx/g)].map(m => m[1]).filter(n => /account|stock|instrument|order|snapshot|bars/.test(n)).join('\n'));
} else {
  const output = {};
  for (const name of names) {
    if (!/^[a-z-]+$/.test(name)) throw new Error('Invalid documentation page name');
    const index = main.indexOf(`@site/docs/reference/${name}.api.mdx`);
    if (index < 0) throw new Error(`Documentation page not found: ${name}`);
    const fragment = main.slice(main.lastIndexOf('[()=>', index), index);
    const id = [...fragment.matchAll(/\.e\("(\d+)"\)/g)].at(-1)?.[1];
    const mappings = [...runtime.matchAll(new RegExp(`(?:[,{])${id}:"([^"]+)"`, 'g'))].map(m => m[1]);
    const chunk = await read(`/apis/assets/js/${mappings[0]}.${mappings[1]}.js`);
    const encoded = chunk.match(/api:"([A-Za-z0-9+/=]+)"/)?.[1];
    if (!encoded) throw new Error(`Schema not found: ${name}`);
    output[name] = JSON.parse(inflateSync(Buffer.from(encoded, 'base64')).toString('utf8'));
  }
  console.log(JSON.stringify(output));
}
