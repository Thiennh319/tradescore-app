import {
  GOOGLE_DRIVE_CONFIG,
  type DriveResult,
  type DriveFile,
} from '../config/googleDrive';

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

interface DriveFilesListResponse {
  files?: Array<{ id: string; name: string; modifiedTime: string }>;
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 300000) {
    return cachedToken;
  }

  try {
    const body = new URLSearchParams({
      client_id: GOOGLE_DRIVE_CONFIG.clientId,
      client_secret: GOOGLE_DRIVE_CONFIG.clientSecret,
      refresh_token: GOOGLE_DRIVE_CONFIG.refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch(GOOGLE_DRIVE_CONFIG.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error('Token request failed: ' + response.status);
    }

    const json = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    cachedToken = json.access_token;
    tokenExpiry = Date.now() + json.expires_in * 1000;

    return cachedToken as string;
  } catch (err) {
    console.error('[DriveSync] getAccessToken failed:', err);
    throw new Error('AUTH_FAILED');
  }
}

export async function findFile(fileName: string): Promise<string | null> {
  try {
    const token = await getAccessToken();

    const query = encodeURIComponent(
      `name='${fileName}' and ` +
        `'${GOOGLE_DRIVE_CONFIG.folderId}' in parents ` +
        `and trashed=false`,
    );

    const url =
      GOOGLE_DRIVE_CONFIG.driveApiBase +
      `/files?q=${query}&fields=files(id,name,modifiedTime)`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) return null;

    const json = (await response.json()) as DriveFilesListResponse;

    if (json.files && json.files.length > 0) {
      return json.files[0].id as string;
    }

    return null;
  } catch (err) {
    console.error('[DriveSync] findFile failed:', fileName, err);
    return null;
  }
}

export async function listFiles(): Promise<DriveResult<DriveFile[]>> {
  try {
    const token = await getAccessToken();
    const q = `'${GOOGLE_DRIVE_CONFIG.folderId}' in parents and trashed=false`;
    const params = new URLSearchParams({
      q,
      fields: 'files(id,name,modifiedTime)',
      orderBy: 'modifiedTime desc',
    });
    const url = `${GOOGLE_DRIVE_CONFIG.driveApiBase}/files?${params.toString()}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`List failed: HTTP ${response.status}`);
    }

    const json = (await response.json()) as DriveFilesListResponse;
    return { success: true, data: json.files ?? [] };
  } catch {
    return { success: false, error: 'NETWORK_ERROR' };
  }
}

export async function uploadFile(
  fileName: string,
  content: string,
  mimeType: string = 'application/json',
): Promise<DriveResult<string>> {
  try {
    const token = await getAccessToken();
    const existingId = await findFile(fileName);

    const metadata = existingId
      ? JSON.stringify({ name: fileName })
      : JSON.stringify({
          name: fileName,
          parents: [GOOGLE_DRIVE_CONFIG.folderId],
        });

    const boundary = 'tradescore_boundary_001';
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;

    const url = existingId
      ? `${GOOGLE_DRIVE_CONFIG.driveUploadBase}/files/${existingId}?uploadType=multipart`
      : `${GOOGLE_DRIVE_CONFIG.driveUploadBase}/files?uploadType=multipart`;

    const method = existingId ? 'PATCH' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[DriveSync] uploadFile failed:', response.status, errText);
      return {
        success: false,
        error: 'UPLOAD_FAILED',
        message: `HTTP ${response.status}: ${errText}`,
      };
    }

    const json = (await response.json()) as { id: string };

    console.log(`[DriveSync] uploadFile ✅ ${fileName} → ${json.id}`);

    return { success: true, data: json.id as string };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[DriveSync] uploadFile error:', fileName, err);
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message,
    };
  }
}

export async function downloadFile(fileName: string): Promise<DriveResult<string>> {
  try {
    const fileId = await findFile(fileName);

    if (!fileId) {
      console.log(`[DriveSync] downloadFile: ${fileName} not found on Drive`);
      return {
        success: false,
        error: 'NOT_FOUND',
        message: `File not found: ${fileName}`,
      };
    }

    const token = await getAccessToken();

    const url = `${GOOGLE_DRIVE_CONFIG.driveApiBase}/files/${fileId}?alt=media`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: 'DOWNLOAD_FAILED',
        message: `HTTP ${response.status}`,
      };
    }

    const text = await response.text();

    console.log(`[DriveSync] downloadFile ✅ ${fileName} (${text.length} chars)`);

    return { success: true, data: text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[DriveSync] downloadFile error:', fileName, err);
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message,
    };
  }
}
