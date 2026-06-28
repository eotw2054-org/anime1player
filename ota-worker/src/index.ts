// 自架 expo-updates endpoint（protocol v1），bundle/assets/manifest 全部喺 KV。
// 路由：
//   GET / (帶 expo-* headers)  → 由 KV 攞 manifest，包 multipart/mixed 回；冇 → 204
//   GET /assets/<key>          → 由 KV 攞 binary（bundle / asset）
//   GET /                      → health
// 唔做 code signing。

export interface Env {
  OTA: KVNamespace;
}

const BOUNDARY = 'expo-ota-boundary';

function noUpdate(): Response {
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

    // 派 bundle / asset（manifest 入面啲 url 指返呢度）
    if (url.pathname.startsWith('/assets/')) {
      const key = decodeURIComponent(url.pathname.slice('/assets/'.length));
      const { value, metadata } = await env.OTA.getWithMetadata<{ contentType?: string }>(
        `asset:${key}`,
        { type: 'arrayBuffer' }
      );
      if (!value) return new Response('not found', { status: 404 });
      return new Response(value, {
        status: 200,
        headers: {
          'content-type': metadata?.contentType ?? 'application/octet-stream',
          'cache-control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // 健康檢查
    if (!request.headers.get('expo-platform') && url.pathname === '/') {
      return new Response('anime1 OTA (KV) — ok', { status: 200 });
    }

    // Manifest（expo-updates 請求）
    const platform = request.headers.get('expo-platform') ?? 'android';
    const runtimeVersion = request.headers.get('expo-runtime-version') ?? '';
    const channel = request.headers.get('expo-channel-name') ?? 'production';
    if (!runtimeVersion) return noUpdate();

    const manifestJson = await env.OTA.get(`manifest:${channel}:${platform}:${runtimeVersion}`);
    if (!manifestJson) return noUpdate();
    return multipartManifest(manifestJson);
  },
};
