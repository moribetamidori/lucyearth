import { supabase } from './supabase';

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
 * Converts an image to WebP format with compression
 * @param file - The original image file
 * @param quality - Quality of the WebP output (0-1), default 0.8
 * @returns Promise<Blob> - The compressed WebP blob
 */
export async function convertToWebP(file: File, quality = 0.8): Promise<Blob> {
  // First convert HEIC to PNG if needed
  const processedFile = await convertHeicToPng(file);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Calculate dimensions (max 1200px on longest side for compression)
        const maxSize = 1200;
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

        // Draw image
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to WebP blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to convert image to WebP'));
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
    reader.readAsDataURL(processedFile);
  });
}

/**
 * Uploads a cat picture to Supabase storage and saves metadata
 * @param file - The image file to upload
 * @param anonId - The anonymous user ID (optional)
 * @returns Promise with the uploaded image URL
 */
export async function uploadCatPicture(
  file: File,
  anonId?: string
): Promise<{ url: string; id: string }> {
  try {
    // Convert to WebP
    const webpBlob = await convertToWebP(file, 0.8);

    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 9);
    const fileName = `${timestamp}_${randomStr}.webp`;

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('cat-pictures')
      .upload(fileName, webpBlob, {
        contentType: 'image/webp',
        cacheControl: '3600',
      });

    if (uploadError) {
      throw uploadError;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('cat-pictures')
      .getPublicUrl(fileName);

    const imageUrl = urlData.publicUrl;

    // Save metadata to database
    const { data: dbData, error: dbError } = await supabase
      .from('cat_pictures')
      .insert({
        image_url: imageUrl,
        anon_id: anonId || null,
      })
      .select()
      .single();

    if (dbError) {
      throw dbError;
    }

    return { url: imageUrl, id: dbData.id };
  } catch (error) {
    console.error('Error uploading cat picture:', error);
    throw error;
  }
}

/**
 * Fetches all cat pictures from the database
 * @returns Promise<CatPicture[]>
 */
export async function fetchCatPictures() {
  const { data, error } = await supabase
    .from('cat_pictures')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching cat pictures:', error);
    return [];
  }

  return data || [];
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
    const { error: storageError } = await supabase.storage
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
