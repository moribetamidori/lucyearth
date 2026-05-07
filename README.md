This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Storage on AWS S3

The app stores database rows in Supabase, but file uploads now go to AWS S3 through presigned upload URLs.

Required server environment variables:

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=your-s3-bucket
AWS_S3_PUBLIC_BASE_URL=https://cdn.example.com # optional, but recommended
AWS_S3_KEY_PREFIX=lucyearth # optional
```

If `AWS_S3_PUBLIC_BASE_URL` is not set, public URLs are built from the S3 bucket URL. The S3 bucket or CDN must allow public reads for uploaded objects.

S3 CORS must allow browser PUT uploads from your app origin, for example:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-domain.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type", "cache-control"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

To copy existing Supabase Storage objects to S3 and rewrite stored URLs:

```bash
pnpm run storage:migrate -- --dry-run
pnpm run storage:migrate
```

After verifying the S3 URLs work, delete the source Supabase Storage objects with:

```bash
pnpm run storage:migrate -- --skip-db-update --delete-source-after-copy
```

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
