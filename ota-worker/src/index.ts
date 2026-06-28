// 自架 expo-updates manifest endpoint（protocol v1）。
// bundle/assets 存喺 GitHub raw；呢個 worker 只係讀 precomputed manifest → 包 multipart/mixed 回。
// 保持 stateless（冇 R2/KV）。唔做 code signing。

export interface Env {
  GITHUB_RAW_BASE: string;
}

const BOUNDARY = 'expo-ota-boundary';

function noUpdate(): Response {
  // expo-updates：冇 compatible update
  return new Response(null, {
    status: 204,
    headers: {
      'expo-protocol-version': '1',
      'expo-sfv-version': '0',
      'cache-control': 'private, max-age=0',
    },
  });
}

function multipartManifest(manifestJson: string): Response {
  const body =
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="manifest"\r\n` +
    `Content-Type: application/json; charset=utf-8\r\n\r\n` +
    `${manifestJson}\r\n` +
    `--${BOUNDARY}--\r\n`;
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': `multipart/mixed; boundary=${BOUNDARY}`,
      'expo-protocol-version': '1',
      'expo-sfv-version': '0',
      'cache-control': 'private, max-age=0',
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 健康檢查 / 根路徑（瀏覽器打開）
    if (!request.headers.get('expo-platform') && url.pathname === '/') {
      return new Response('anime1 OTA manifest endpoint — ok', { status: 200 });
    }

    const platform = request.headers.get('expo-platform') ?? 'android';
    const runtimeVersion = request.headers.get('expo-runtime-version') ?? '';
    const channel = request.headers.get('expo-channel-name') ?? 'production';
    if (!runtimeVersion) return noUpdate();

    // 由 GitHub raw 攞 precomputed manifest（加 cache-bust 減少 raw CDN 延遲）
    const manifestUrl =
      `${env.GITHUB_RAW_BASE}/updates/${channel}/${platform}/${runtimeVersion}/manifest.json` +
      `?t=${Date.now()}`;

    let res: Response;
    try {
      res = await fetch(manifestUrl, { cf: { cacheTtl: 0 } as any });
    } catch {
      return noUpdate();
    }
    if (!res.ok) return noUpdate();

    const manifestJson = await res.text();
    return multipartManifest(manifestJson);
  },
};
