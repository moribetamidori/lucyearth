type UploadOptions = {
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
};

type UploadResult = {
  path: string;
  fullPath: string;
  publicUrl: string;
};

type StorageResponse<T> = {
  data: T | null;
  error: Error | null;
};

const uploadedPublicUrls = new Map<string, string>();

function cacheKey(bucket: string, path: string) {
  return `${bucket}:${path}`;
}

function normalizeCacheControl(cacheControl?: string) {
  if (!cacheControl) return undefined;
  return /^\d+$/.test(cacheControl) ? `max-age=${cacheControl}` : cacheControl;
}

async function parseErrorResponse(response: Response, fallback: string) {
  try {
    const body = await response.json();
    if (typeof body?.error === 'string') return body.error;
  } catch {
    // Ignore malformed error responses and use the fallback below.
  }

  return fallback;
}

async function requestPresignedUpload(
  bucket: string,
  path: string,
  contentType: string,
  cacheControl?: string,
  upsert?: boolean
) {
  const response = await fetch('/api/storage/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket, path, contentType, cacheControl, upsert }),
  });

  if (!response.ok) {
    throw new Error(
      await parseErrorResponse(response, `Failed to prepare upload (${response.status})`)
    );
  }

  return response.json() as Promise<UploadResult & { uploadUrl: string }>;
}

export async function uploadStorageObject(
  bucket: string,
  path: string,
  body: Blob,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const contentType = options.contentType || body.type || 'application/octet-stream';
  const cacheControl = normalizeCacheControl(options.cacheControl);
  const presigned = await requestPresignedUpload(
    bucket,
    path,
    contentType,
    cacheControl,
    options.upsert
  );

  const uploadHeaders: HeadersInit = {
    'Content-Type': contentType,
  };

  if (cacheControl) {
    uploadHeaders['Cache-Control'] = cacheControl;
  }

  const uploadResponse = await fetch(presigned.uploadUrl, {
    method: 'PUT',
    headers: uploadHeaders,
    body,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => '');
    throw new Error(
      `S3 upload failed (${uploadResponse.status})${errorText ? `: ${errorText}` : ''}`
    );
  }

  uploadedPublicUrls.set(cacheKey(bucket, path), presigned.publicUrl);
  return {
    path: presigned.path,
    fullPath: presigned.fullPath,
    publicUrl: presigned.publicUrl,
  };
}

export async function deleteStorageObjects(
  bucket: string,
  paths: string[]
): Promise<void> {
  if (paths.length === 0) return;

  const response = await fetch('/api/storage/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket, paths }),
  });

  if (!response.ok) {
    throw new Error(
      await parseErrorResponse(response, `Failed to delete storage objects (${response.status})`)
    );
  }
}

class StorageBucketAdapter {
  constructor(private bucket: string) {}

  async upload(
    path: string,
    body: Blob,
    options: UploadOptions = {}
  ): Promise<StorageResponse<UploadResult>> {
    try {
      const data = await uploadStorageObject(this.bucket, path, body, options);
      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  getPublicUrl(path: string): { data: { publicUrl: string } } {
    return {
      data: {
        publicUrl: uploadedPublicUrls.get(cacheKey(this.bucket, path)) || '',
      },
    };
  }

  async remove(paths: string[]): Promise<StorageResponse<{ path: string }[]>> {
    try {
      await deleteStorageObjects(this.bucket, paths);
      return {
        data: paths.map((path) => ({ path })),
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}

export const appStorage = {
  from(bucket: string) {
    return new StorageBucketAdapter(bucket);
  },
};
