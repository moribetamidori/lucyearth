#!/usr/bin/env npx tsx

import { config } from 'dotenv';
import { resolve } from 'path';
import { deleteObjectsFromS3, uploadBufferToS3 } from '../lib/server/s3Storage';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const path = `__healthcheck__/${Date.now()}.txt`;
  const body = Buffer.from(`lucyearth s3 upload test ${new Date().toISOString()}\n`);

  console.log(`Uploading test object: ${path}`);
  const publicUrl = await uploadBufferToS3(
    'healthcheck',
    path,
    body,
    'text/plain',
    '60',
    true
  );
  console.log(`Public URL: ${publicUrl}`);

  const response = await fetch(publicUrl);
  if (!response.ok) {
    throw new Error(`Public URL check failed: ${response.status} ${await response.text()}`);
  }

  const text = await response.text();
  if (text !== body.toString()) {
    throw new Error('Public URL returned unexpected content');
  }

  await deleteObjectsFromS3({ bucket: 'healthcheck', paths: [path] });
  console.log('S3 upload, public read, and delete all work.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
