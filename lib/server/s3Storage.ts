import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type UploadParams = {
  bucket: string;
  path: string;
  contentType: string;
  cacheControl?: string;
  upsert?: boolean;
};

type DeleteParams = {
  bucket: string;
  paths: string[];
};

let s3Client: S3Client | null = null;

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return value;
}

function getAwsRegion() {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
}

function getS3BucketName() {
  return requireEnv('AWS_S3_BUCKET');
}

function getKeyPrefix() {
  return (process.env.AWS_S3_KEY_PREFIX || '').replace(/^\/+|\/+$/g, '');
}

function getS3() {
  if (s3Client) return s3Client;

  s3Client = new S3Client({
    region: getAwsRegion(),
    endpoint: process.env.AWS_S3_ENDPOINT || undefined,
    forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === 'true',
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

  return s3Client;
}

function normalizeBucket(bucket: string) {
  const normalized = bucket.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(normalized)) {
    throw new Error('Invalid storage bucket name');
  }
  return normalized;
}

function normalizePath(path: string) {
  const normalized = path.replace(/^\/+/, '');
  if (!normalized || normalized.includes('..') || /[\r\n]/.test(normalized)) {
    throw new Error('Invalid storage object path');
  }
  return normalized;
}

function normalizeCacheControl(cacheControl?: string) {
  if (!cacheControl) return undefined;
  return /^\d+$/.test(cacheControl) ? `max-age=${cacheControl}` : cacheControl;
}

function encodeKey(key: string) {
  return key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

export function getObjectKey(bucket: string, path: string) {
  const keyParts = [getKeyPrefix(), normalizeBucket(bucket), normalizePath(path)].filter(Boolean);
  return keyParts.join('/');
}

export function getPublicUrlForPath(bucket: string, path: string) {
  const key = getObjectKey(bucket, path);
  const publicBaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL?.replace(/\/+$/g, '');

  if (publicBaseUrl) {
    return `${publicBaseUrl}/${encodeKey(key)}`;
  }

  const s3Bucket = getS3BucketName();
  return `https://${s3Bucket}.s3.${getAwsRegion()}.amazonaws.com/${encodeKey(key)}`;
}

async function objectExists(key: string) {
  try {
    await getS3().send(
      new HeadObjectCommand({
        Bucket: getS3BucketName(),
        Key: key,
      })
    );
    return true;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return false;
    throw error;
  }
}

export async function createPresignedUploadUrl(params: UploadParams) {
  const key = getObjectKey(params.bucket, params.path);

  if (params.upsert === false && (await objectExists(key))) {
    throw new Error('Storage object already exists');
  }

  const commandInput: PutObjectCommandInput = {
    Bucket: getS3BucketName(),
    Key: key,
    ContentType: params.contentType,
    CacheControl: normalizeCacheControl(params.cacheControl),
  };

  const uploadUrl = await getSignedUrl(getS3(), new PutObjectCommand(commandInput), {
    expiresIn: 60 * 5,
  });

  return {
    uploadUrl,
    path: normalizePath(params.path),
    fullPath: key,
    publicUrl: getPublicUrlForPath(params.bucket, params.path),
  };
}

export async function uploadBufferToS3(
  bucket: string,
  path: string,
  body: Buffer,
  contentType: string,
  cacheControl = '3600',
  upsert = false
) {
  const key = getObjectKey(bucket, path);

  if (!upsert && (await objectExists(key))) {
    throw new Error('Storage object already exists');
  }

  await getS3().send(
    new PutObjectCommand({
      Bucket: getS3BucketName(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: normalizeCacheControl(cacheControl),
    })
  );

  return getPublicUrlForPath(bucket, path);
}

export async function deleteObjectsFromS3(params: DeleteParams) {
  const keys = params.paths.map((path) => getObjectKey(params.bucket, path));
  if (keys.length === 0) return;

  for (let index = 0; index < keys.length; index += 1000) {
    const chunk = keys.slice(index, index + 1000);
    await getS3().send(
      new DeleteObjectsCommand({
        Bucket: getS3BucketName(),
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      })
    );
  }
}
