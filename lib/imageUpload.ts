import { supabase } from './supabase';
import type { CatPicture } from './supabase';
import { generateVideoThumbnail } from './videoThumbnail';
import imageCompression from 'browser-image-compression';
import { appStorage } from './storage';

/**
 * Converts HEIC to PNG first if needed
 * @param file - The original file
 * @returns Promise<File> - PNG file or original file if not HEIC
 */
async function convertHeicToPng(file: File): Promise<File> {
  const fileName = file.name.toLowerCase();
  const isHeic = fileName.endsWith('.heic') || fileName.endsWith('.heif');

  if (!isHeic) {
    return file;
  }

  try {
    // Dynamically import heic2any only on client side
    const heic2any = (await import('heic2any')).default;

    const pngBlob = await heic2any({
      blob: file,
      toType: 'image/png',
      quality: 1,
    });

    // heic2any can return Blob or Blob[]
    const blob = Array.isArray(pngBlob) ? pngBlob[0] : pngBlob;

    // Convert blob to File
    const pngFile = new File(
      [blob],
      file.name.replace(/\.heic$/i, '.png').replace(/\.heif$/i, '.png'),
      { type: 'image/png' }
    );

    return pngFile;
  } catch (error) {
    console.error('HEIC conversion error:', error);
    throw new Error('Failed to convert HEIC image. Please try a different format.');
  }
}

/**
 * Check if browser supports native WebP encoding via canvas
 */
function supportsWebPEncoding(): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

/**
 * Converts an image to WebP format with compression
 * Uses browser-image-compression library for reliable WebP encoding on all browsers
 * @param file - The original image file
 * @param quality - Quality of the WebP output (0-1), default 0.8
 * @returns Promise<Blob> - The compressed WebP blob
 */
export async function convertToWebP(file: File, quality = 1): Promise<Blob> {
  // First convert HEIC to PNG if needed
  const processedFile = await convertHeicToPng(file);
  const outputQuality = Math.max(quality, 1);

  // Use browser-image-compression for reliable WebP encoding
  // This library handles Safari and other browsers that don't support native WebP encoding
  const options = {
    maxSizeMB: 3,
    maxWidthOrHeight: 2000,
    useWebWorker: true,
    fileType: 'image/webp' as const,
    initialQuality: outputQuality,
  };

  try {
    const compressedFile = await imageCompression(processedFile, options);

    // Verify it's actually WebP
    if (compressedFile.type === 'image/webp') {
      return compressedFile;
    }

    // If library couldn't produce WebP, try native canvas as fallback
    if (supportsWebPEncoding()) {
      return await convertWithCanvas(processedFile, outputQuality);
    }

    // Last resort: return compressed file even if not WebP
    console.warn('WebP encoding not supported, using compressed image');
    return compressedFile;
  } catch (error) {
    console.error('Image compression error:', error);
    // Fallback to canvas method
    return convertWithCanvas(processedFile, outputQuality);
  }
}

/**
 * Canvas-based WebP conversion (fallback method)
 */
async function convertWithCanvas(file: File, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        const maxSize = 2000;
        let width = img.width;
        let height = img.height;

        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to convert image'));
            }
          },
          'image/webp',
          quality
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a cat picture or video to Supabase storage and saves metadata
 * @param file - The image or video file to upload
 * @param anonId - The anonymous user ID (optional)
 * @returns Promise with the uploaded media URL
 */
export async function uploadCatPicture(
  file: File,
  anonId?: string
): Promise<{ url: string; id: string }> {
  try {
    const isVideo = file.type.startsWith('video/');
    let uploadBlob: Blob;
    let fileName: string;
    let contentType: string;
    let thumbnailUrl: string | null = null;

    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 9);

    if (isVideo) {
      // For videos, upload as-is without conversion
      uploadBlob = file;
      const extension = file.name.split('.').pop() || 'mp4';
      fileName = `${timestamp}_${randomStr}.${extension}`;
      contentType = file.type;

      // Generate and upload thumbnail for videos
      try {
        const thumbnailBlob = await generateVideoThumbnail(file);
        const thumbnailFileName = `${timestamp}_${randomStr}_thumb.jpg`;

        const { data: thumbUploadData, error: thumbUploadError } = await appStorage
          .from('cat-pictures')
          .upload(thumbnailFileName, thumbnailBlob, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
          });

        if (!thumbUploadError && thumbUploadData) {
          thumbnailUrl = thumbUploadData.publicUrl;
        }
      } catch (thumbError) {
        console.warn('Failed to generate video thumbnail:', thumbError);
        // Continue without thumbnail if generation fails
      }
    } else {
      // For images, convert to WebP
      uploadBlob = await convertToWebP(file, 0.8);
      fileName = `${timestamp}_${randomStr}.webp`;
      contentType = 'image/webp';
    }

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await appStorage
      .from('cat-pictures')
      .upload(fileName, uploadBlob, {
        contentType: contentType,
        cacheControl: '3600',
      });

    if (uploadError) {
      throw uploadError;
    }

    if (!uploadData) {
      throw new Error('Upload completed without a public URL');
    }

    const mediaUrl = uploadData.publicUrl;

    // Save metadata to database
    const { data: dbData, error: dbError } = await supabase
      .from('cat_pictures')
      .insert({
        image_url: mediaUrl,
        anon_id: anonId || null,
        media_type: isVideo ? 'video' : 'image',
        thumbnail_url: thumbnailUrl,
      })
      .select()
      .single();

    if (dbError) {
      throw dbError;
    }

    return { url: mediaUrl, id: dbData.id };
  } catch (error) {
    console.error('Error uploading cat media:', error);
    throw error;
  }
}

/**
 * Fetch cat pictures with pagination from the database
 */
export async function fetchCatPictures(
  page: number = 1,
  pageSize: number = 9
): Promise<{ pictures: CatPicture[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('cat_pictures')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching cat pictures:', error);
    return { pictures: [], total: 0 };
  }

  return {
    pictures: data || [],
    total: count || 0,
  };
}

/**
 * Deletes a cat picture from storage and database
 * @param id - The picture ID
 * @param imageUrl - The image URL
 */
export async function deleteCatPicture(id: string, imageUrl: string) {
  try {
    // Extract filename from URL
    const urlParts = imageUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];

    // Delete from storage
    const { error: storageError } = await appStorage
      .from('cat-pictures')
      .remove([fileName]);

    if (storageError) {
      throw storageError;
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('cat_pictures')
      .delete()
      .eq('id', id);

    if (dbError) {
      throw dbError;
    }
  } catch (error) {
    console.error('Error deleting cat picture:', error);
    throw error;
  }
}
