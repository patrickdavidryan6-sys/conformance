import http from 'http';
import type { AddressInfo } from 'net';
import { afterEach, describe, expect, test } from 'vitest';
import { configureProxy } from './proxy';

describe('configureProxy', () => {
  let closeProxy: (() => Promise<void>) | undefined;
  let proxyServer: http.Server | undefined;

  afterEach(async () => {
    await closeProxy?.();
    closeProxy = undefined;
    if (proxyServer) {
      await new Promise<void>((resolve) => proxyServer!.close(() => resolve()));
      proxyServer = undefined;
    }
  });

  test('routes fetch requests and sends proxy URL credentials', async () => {
    let authorization: string | undefined;
    let requestedTarget: string | undefined;
    proxyServer = http.createServer();
    proxyServer.on('connect', (req, socket) => {
      authorization = req.headers['proxy-authorization'];
      requestedTarget = req.url;
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      socket.once('data', () => {
        socket.end(
          'HTTP/1.1 200 OK\r\n' +
            'Content-Type: text/plain\r\n' +
            'Content-Length: 10\r\n' +
            'Connection: close\r\n\r\n' +
            'proxied-ok'
        );
      });
    });
    await new Promise<void>((resolve) =>
      proxyServer!.listen(0, '127.0.0.1', resolve)
    );
    const port = (proxyServer.address() as AddressInfo).port;

    closeProxy = configureProxy(
      `http://proxy-user:proxy-password@127.0.0.1:${port}`
    );
    const response = await fetch('http://example.test/resource');

    expect(await response.text()).toBe('proxied-ok');
    expect(requestedTarget).toBe('example.test:80');
    expect(authorization).toBe(
      `Basic ${Buffer.from('proxy-user:proxy-password').toString('base64')}`
    );
  });

  test('rejects unsupported proxy protocols', () => {
    expect(() => configureProxy('socks5://proxy.example:1080')).toThrow(
      'Proxy URL must use http: or https:'
    );
  });
});
