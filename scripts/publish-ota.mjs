// 自架 OTA 發佈：expo export → 計 hash → 砌 manifest → 上載 bundle/assets/manifest 落 Cloudflare KV。
// 唔用 EAS，唔寫 GitHub repo。需要環境變數 CLOUDFLARE_API_TOKEN。
//
// 用法：node scripts/publish-ota.mjs
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';

const NAMESPACE_ID = 'f5444f7783374419abf63bca3296b54b';
const WORKER_URL = 'https://anime1-ota.eotw2054.workers.dev';
const CHANNEL = 'production';
const PLATFORM = 'android';
const RUNTIME = '1.0.1';
const DIST = path.resolve('dist');
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function sh(cmd, args) {
  // shell:true → Windows 先 spawn 到 npx.cmd（Node 24 唔俾直接 execFile .cmd）
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], shell: true }).toString();
}

function contentType(ext) {
  const m = {
    js: 'application/javascript', hbc: 'application/javascript',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', json: 'application/json',
    ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  };
  return m[(ext || '').toLowerCase()] || 'application/octet-stream';
}

function kvPut(key, filePath) {
  sh(NPX, ['wrangler', 'kv', 'key', 'put', '--namespace-id', NAMESPACE_ID, '--remote', `"${key}"`, '--path', `"${filePath}"`]);
}

// 上載一個檔（bundle 或 asset），回 manifest entry。key 帶副檔名 → worker 由副檔名定 content-type
function putFile(relPath, ext) {
  const abs = path.join(DIST, relPath);
  const buf = readFileSync(abs);
  const keyHex = createHash('sha256').update(buf).digest('hex');
  const hash = createHash('sha256').update(buf).digest('base64url');
  const e = (ext || 'js').toLowerCase();
  const key = `${keyHex}.${e}`;
  kvPut(`asset:${key}`, abs);
  return { key, contentType: contentType(e), url: `${WORKER_URL}/assets/${key}`, hash };
}

console.log('1/4  expo export …');
if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
sh(NPX, ['expo', 'export', '--platform', PLATFORM, '--output-dir', 'dist']);

console.log('2/4  讀 metadata + app config …');
const metadata = JSON.parse(readFileSync(path.join(DIST, 'metadata.json'), 'utf8'));
const fm = metadata.fileMetadata[PLATFORM];
const appJson = JSON.parse(readFileSync(path.resolve('app.json'), 'utf8'));
const expoClient = appJson.expo;

console.log('3/4  上載 bundle + assets 落 KV …');
const launchAsset = putFile(fm.bundle, 'js');
const assets = (fm.assets || []).map((a) => putFile(a.path, a.ext));
console.log(`     bundle + ${assets.length} assets 上載完`);

console.log('4/4  砌 manifest + 上載 …');
const manifest = {
  id: randomUUID(),
  createdAt: new Date().toISOString(),
  runtimeVersion: RUNTIME,
  launchAsset,
  assets,
  metadata: {},
  extra: { expoClient },
};
const manifestPath = path.join(DIST, '_manifest.json');
writeFileSync(manifestPath, JSON.stringify(manifest));
kvPut(`manifest:${CHANNEL}:${PLATFORM}:${RUNTIME}`, manifestPath);

console.log(`\n✅ 已發佈 OTA update ${manifest.id} → ${CHANNEL}/${PLATFORM}/${RUNTIME}`);
console.log(`   ${WORKER_URL}`);
