import { readFileSync } from 'fs';

const src = readFileSync('config/googleDrive.ts', 'utf8');
const clientId = src.match(/clientId: '([^']+)'/)[1];
const clientSecret = src.match(/clientSecret: '([^']+)'/)[1];
const refreshToken = src.match(/refreshToken: '([^']+)'/)[1];
const folderId = src.match(/folderId: '([^']+)'/)[1];

const body = new URLSearchParams({
  client_id: clientId,
  client_secret: clientSecret,
  refresh_token: refreshToken,
  grant_type: 'refresh_token',
});

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body,
});
const tokenJson = await tokenRes.json();
console.log('AUTH:', tokenRes.status, tokenJson.error || 'OK');

if (!tokenJson.access_token) {
  console.log(JSON.stringify(tokenJson, null, 2));
  process.exit(1);
}

const query = encodeURIComponent(
  `name='tradescore_journal.json' and '${folderId}' in parents and trashed=false`,
);
const findRes = await fetch(
  `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
  { headers: { Authorization: `Bearer ${tokenJson.access_token}` } },
);
const findJson = await findRes.json();
console.log('FIND:', findRes.status, findJson.error?.message || 'OK', 'count:', findJson.files?.length ?? 0);

const testContent = JSON.stringify({
  version: '1.0.2',
  lastUpdated: new Date().toISOString(),
  deviceId: 'APK',
  data: [],
});
const metadata = JSON.stringify({
  name: 'tradescore_journal.json',
  parents: [folderId],
});
const boundary = 'tradescore_boundary_001';
const multipart =
  `--${boundary}\r\n` +
  `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
  `${metadata}\r\n` +
  `--${boundary}\r\n` +
  `Content-Type: application/json\r\n\r\n` +
  `${testContent}\r\n` +
  `--${boundary}--`;

const uploadUrl = findJson.files?.[0]?.id
  ? `https://www.googleapis.com/upload/drive/v3/files/${findJson.files[0].id}?uploadType=multipart`
  : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

const uploadRes = await fetch(uploadUrl, {
  method: findJson.files?.[0]?.id ? 'PATCH' : 'POST',
  headers: {
    Authorization: `Bearer ${tokenJson.access_token}`,
    'Content-Type': `multipart/related; boundary=${boundary}`,
  },
  body: multipart,
});
const uploadText = await uploadRes.text();
console.log('UPLOAD:', uploadRes.status, uploadText.slice(0, 300));
