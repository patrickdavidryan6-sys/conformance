import {
  ProxyAgent,
  getGlobalDispatcher,
  setGlobalDispatcher,
  type Dispatcher
} from 'undici';

/**
 * Route HTTP(S) requests made by the conformance process through a proxy.
 *
 * Proxy credentials can be supplied in the URL (for example,
 * `http://user:password@proxy.example:8080`). Undici derives the appropriate
 * Proxy-Authorization header without exposing the credentials in harness logs.
 */
export function configureProxy(proxyUrl: string): () => Promise<void> {
  const parsed = new URL(proxyUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Proxy URL must use http: or https:');
  }

  const previousDispatcher: Dispatcher = getGlobalDispatcher();
  const proxyDispatcher = new ProxyAgent(parsed.toString());
  setGlobalDispatcher(proxyDispatcher);

  return async () => {
    setGlobalDispatcher(previousDispatcher);
    await proxyDispatcher.close();
  };
}
