import type { GistResult } from '../types/driveSync';

const GIST_ID =
  process.env.EXPO_PUBLIC_GITHUB_GIST_ID ??
  process.env.VITE_GITHUB_GIST_ID ??
  '2a065cc81393e76e48d270291e8f7b37';
const TOKEN =
  process.env.EXPO_PUBLIC_GITHUB_TOKEN ?? process.env.VITE_GITHUB_TOKEN ?? '';

const UPLOAD_MAX_RETRIES = 3;
const UPLOAD_RETRY_BASE_MS = 600;

type GistFetchResult =
  | { ok: true; gist: Record<string, unknown> }
  | { ok: false; error: 'NOT_FOUND' | 'NETWORK_ERROR' };

/** Serialize mọi PATCH — tránh race khi upload song song cùng gist. */
let uploadChain: Promise<unknown> = Promise.resolve();

function withUploadLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = uploadChain.then(fn, fn);
  uploadChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function gistHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: TOKEN ? `Bearer ${TOKEN}` : '',
  };
}

async function fetchGist(): Promise<GistFetchResult> {
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: gistHeaders(),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error('[GitHubGist] fetchGist failed', res.status, txt);
      if (res.status === 404) return { ok: false, error: 'NOT_FOUND' };
      return { ok: false, error: 'NETWORK_ERROR' };
    }
    const gist = (await res.json()) as Record<string, unknown>;
    return { ok: true, gist };
  } catch (err) {
    console.error('[GitHubGist] fetchGist error', err);
    return { ok: false, error: 'NETWORK_ERROR' };
  }
}

export async function downloadFile(fileName: string): Promise<GistResult<string>> {
  try {
    const gistResult = await fetchGist();
    if (!gistResult.ok) {
      return { success: false, error: gistResult.error };
    }
    const gist = gistResult.gist;
    const files = gist.files as
      | Record<string, { content?: string; raw_url?: string }>
      | undefined;
    const file = files?.[fileName];
    if (!file) {
      console.log(`[GitHubGist] downloadFile: ${fileName} not found in gist`);
      return { success: false, error: 'NOT_FOUND', message: `File not found in gist: ${fileName}` };
    }
    const content = file.content ?? null;
    if (content == null) {
      const rawUrl = file.raw_url;
      if (!rawUrl) return { success: false, error: 'NOT_FOUND' };
      const r = await fetch(rawUrl);
      if (!r.ok) return { success: false, error: 'DOWNLOAD_FAILED', message: `HTTP ${r.status}` };
      const text = await r.text();
      return { success: true, data: text };
    }
    console.log(`[GitHubGist] downloadFile ✅ ${fileName} (${String(content).length} chars)`);
    return { success: true, data: String(content) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GitHubGist] downloadFile error:', err);
    return { success: false, error: 'NETWORK_ERROR', message };
  }
}

/** Upload nhiều file trong một PATCH — tránh ghi đè lẫn nhau. */
export async function uploadFiles(
  fileContents: Record<string, string>,
): Promise<GistResult<string>> {
  return withUploadLock(async () => {
    const names = Object.keys(fileContents);
    if (names.length === 0) {
      return { success: true, data: GIST_ID };
    }

    if (!TOKEN) {
      console.error('[GitHubGist] uploadFiles: missing GITHUB token (EXPO_PUBLIC_ or VITE_)');
      return { success: false, error: 'AUTH_FAILED', message: 'No token' };
    }

    const body = {
      files: Object.fromEntries(
        names.map((fileName) => [fileName, { content: fileContents[fileName] }]),
      ),
    };

    for (let attempt = 0; attempt < UPLOAD_MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
          method: 'PATCH',
          headers: {
            ...gistHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const json = (await res.json()) as { id?: string };
          console.log(`[GitHubGist] uploadFiles ✅ ${names.join(', ')}`);
          return { success: true, data: json.id ?? GIST_ID };
        }

        const errText = await res.text();
        const retryable = res.status === 409 || res.status === 422 || res.status === 503;
        console.error(
          `[GitHubGist] uploadFiles failed (attempt ${attempt + 1}/${UPLOAD_MAX_RETRIES}):`,
          res.status,
          errText,
        );

        if (retryable && attempt < UPLOAD_MAX_RETRIES - 1) {
          await sleep(UPLOAD_RETRY_BASE_MS * (attempt + 1));
          continue;
        }

        return {
          success: false,
          error: res.status === 401 || res.status === 403 ? 'AUTH_FAILED' : 'UPLOAD_FAILED',
          message: `HTTP ${res.status}: ${errText}`,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[GitHubGist] uploadFiles error:', err);
        if (attempt < UPLOAD_MAX_RETRIES - 1) {
          await sleep(UPLOAD_RETRY_BASE_MS * (attempt + 1));
          continue;
        }
        return { success: false, error: 'NETWORK_ERROR', message };
      }
    }

    return { success: false, error: 'UPLOAD_FAILED', message: 'Max retries exceeded' };
  });
}

export async function uploadFile(
  fileName: string,
  content: string,
  _mimeType: string = 'application/json',
): Promise<GistResult<string>> {
  return uploadFiles({ [fileName]: content });
}

export async function listFiles(): Promise<GistResult<string[]>> {
  try {
    const gistResult = await fetchGist();
    if (!gistResult.ok) return { success: false, error: gistResult.error };
    const files = Object.keys((gistResult.gist.files as Record<string, unknown>) ?? {});
    return { success: true, data: files };
  } catch {
    return { success: false, error: 'NETWORK_ERROR' };
  }
}

export default {
  downloadFile,
  uploadFile,
  uploadFiles,
  listFiles,
};
