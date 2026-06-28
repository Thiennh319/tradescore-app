import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

let getAccessToken: typeof import('../googleDriveService').getAccessToken;
let findFile: typeof import('../googleDriveService').findFile;
let uploadFile: typeof import('../googleDriveService').uploadFile;
let downloadFile: typeof import('../googleDriveService').downloadFile;

beforeEach(async () => {
  mockFetch.mockReset();
  vi.resetModules();
  global.fetch = mockFetch;
  const mod = await import('../googleDriveService');
  getAccessToken = mod.getAccessToken;
  findFile = mod.findFile;
  uploadFile = mod.uploadFile;
  downloadFile = mod.downloadFile;
});

describe('getAccessToken', () => {
  it('trả về access_token khi API thành công', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'tok_test_123',
        expires_in: 3600,
      }),
    });

    const token = await getAccessToken();
    expect(token).toBe('tok_test_123');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('dùng cache khi token còn hạn', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'tok_cached',
        expires_in: 3600,
      }),
    });

    await getAccessToken();

    mockFetch.mockClear();
    const token2 = await getAccessToken();

    expect(token2).toBe('tok_cached');
    expect(mockFetch).toHaveBeenCalledTimes(0);
  });
});

describe('uploadFile', () => {
  it('upload file mới bằng POST', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'tok123',
        expires_in: 3600,
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [] }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'new_file_id' }),
    });

    const result = await uploadFile('test.json', JSON.stringify({ test: true }));

    expect(result.success).toBe(true);
    expect(result.data).toBe('new_file_id');

    const uploadCall = mockFetch.mock.calls[2];
    expect(uploadCall[1].method).toBe('POST');
  });

  it('update file cũ bằng PATCH', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'tok123',
        expires_in: 3600,
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        files: [{ id: 'existing_id' }],
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'existing_id' }),
    });

    const result = await uploadFile('existing.json', JSON.stringify({ updated: true }));

    expect(result.success).toBe(true);

    const uploadCall = mockFetch.mock.calls[2];
    expect(uploadCall[1].method).toBe('PATCH');
  });
});

describe('downloadFile', () => {
  it('trả về NOT_FOUND khi file không tồn tại', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'tok123',
        expires_in: 3600,
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [] }),
    });

    const result = await downloadFile('missing.json');

    expect(result.success).toBe(false);
    expect(result.error).toBe('NOT_FOUND');
  });
});

describe('uploadFile network error', () => {
  it('trả về NETWORK_ERROR khi fetch throw', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'tok123',
        expires_in: 3600,
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [] }),
    });

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await uploadFile('test.json', '{}');

    expect(result.success).toBe(false);
    expect(result.error).toBe('NETWORK_ERROR');
  });
});
