// jsdelivr-data-client v1.0.0
// Tiny wrapper around https://data.jsdelivr.com/v1
// MIT © 2025 YourName

const BASE = 'https://data.jsdelivr.com/v1';

/**
 * @typedef {Object} ClientOptions
 * @property {string} userAgent  Your UA: "MyTool/0.1 (+https://github.com/me/tool)"
 * @property {typeof fetch} [fetchImpl]  custom fetch (node polyfill)
 */

export function createJsDelivrClient(opts) {
  if (!opts?.userAgent) {
    throw new Error('userAgent is required: "MyTool/0.1 (+link)"');
  }
  const fetchImpl = opts.fetchImpl || fetch;

  async function request(path) {
    const res = await fetchImpl(BASE + path, {
      headers: { 'User-Agent': opts.userAgent }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    }
    return res.json();
  }

  return {
    /** Raw call with path starting with '/' */
    raw: request,

    /** Info about package (tags, versions) */
    getPackage(name) {
      return request(`/package/npm/${encodeURIComponent(name)}`);
    },

    /** List of versions only */
    async getVersions(name) {
      const data = await request(`/package/npm/${encodeURIComponent(name)}`);
      return data.versions ?? [];
    },

    /** Files of exact version */
    getFiles(name, version) {
      return request(`/package/npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}/files`);
    },

    /** Stats: period = 'day' | 'week' | 'month' */
    getStats(name, period = 'month') {
      return request(`/package/npm/${encodeURIComponent(name)}/stats?period=${period}`);
    }
  };
}
