import { supabase, ArenaCollection, ArenaBlock } from './supabase';
import { convertToWebP } from './imageUpload';
import { generateVideoThumbnail } from './videoThumbnail';

// Create a new collection
export async function createCollection(
  title: string,
  anonId: string
): Promise<ArenaCollection | null> {
  try {
    const { data, error } = await supabase
      .from('arena_collections')
      .insert([
        {
          title,
          anon_id: anonId,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating collection:', error);
    return null;
  }
}

// Fetch all collections with block count
export async function fetchCollections(): Promise<
  Array<ArenaCollection & { block_count: number }>
> {
  try {
    const { data: collections, error: collectionsError } = await supabase
      .from('arena_collections')
      .select('*')
      .order('created_at', { ascending: false });

    if (collectionsError) throw collectionsError;

    // Get block counts for each collection
    const collectionsWithCount = await Promise.all(
      (collections || []).map(async (collection) => {
        const { count } = await supabase
          .from('arena_blocks')
          .select('*', { count: 'exact', head: true })
          .eq('collection_id', collection.id);

        return {
          ...collection,
          block_count: count || 0,
        };
      })
    );

    return collectionsWithCount;
  } catch (error) {
    console.error('Error fetching collections:', error);
    return [];
  }
}

// Update collection title
export async function updateCollection(
  collectionId: string,
  title: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('arena_collections')
      .update({ title })
      .eq('id', collectionId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating collection:', error);
    return false;
  }
}

// Delete a collection
export async function deleteCollection(collectionId: string): Promise<boolean> {
  try {
    // First, get all blocks in this collection
    const { data: blocks } = await supabase
      .from('arena_blocks')
      .select('image_url')
      .eq('collection_id', collectionId);

    // Delete images from storage
    if (blocks && blocks.length > 0) {
      const filePaths = blocks.map((block) => {
        const url = block.image_url;
        const parts = url.split('/');
        return parts[parts.length - 1];
      });

      await supabase.storage.from('arena-blocks').remove(filePaths);
    }

    // Delete the collection (cascade will delete blocks)
    const { error } = await supabase
      .from('arena_collections')
      .delete()
      .eq('id', collectionId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting collection:', error);
    return false;
  }
}

// Upload a block (image or video) to a collection
export async function uploadBlockToCollection(
  file: File,
  collectionId: string,
  anonId: string
): Promise<ArenaBlock | null> {
  try {
    const isVideo = file.type.startsWith('video/');
    let uploadBlob: Blob;
    let fileName: string;
    let contentType: string;
    let thumbnailUrl: string | null = null;

    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);

    if (isVideo) {
      // For videos, upload as-is without conversion
      uploadBlob = file;
      const extension = file.name.split('.').pop() || 'mp4';
      fileName = `${timestamp}_${randomString}.${extension}`;
      contentType = file.type;

      // Generate and upload thumbnail for videos
      try {
        const thumbnailBlob = await generateVideoThumbnail(file);
        const thumbnailFileName = `${timestamp}_${randomString}_thumb.jpg`;

        const { error: thumbUploadError } = await supabase.storage
          .from('arena-blocks')
          .upload(thumbnailFileName, thumbnailBlob, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
          });

        if (!thumbUploadError) {
          const { data: thumbUrlData } = supabase.storage
            .from('arena-blocks')
            .getPublicUrl(thumbnailFileName);
          thumbnailUrl = thumbUrlData.publicUrl;
        }
      } catch (thumbError) {
        console.warn('Failed to generate video thumbnail:', thumbError);
        // Continue without thumbnail if generation fails
      }
    } else {
      // For images, convert to WebP
      uploadBlob = await convertToWebP(file);
      fileName = `${timestamp}_${randomString}.webp`;
      contentType = 'image/webp';
    }

    // Upload to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from('arena-blocks')
      .upload(fileName, uploadBlob, {
        contentType: contentType,
        cacheControl: '3600',
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from('arena-blocks').getPublicUrl(fileName);

    // Save to database
    const { data: blockData, error: dbError } = await supabase
      .from('arena_blocks')
      .insert([
        {
          collection_id: collectionId,
          image_url: publicUrl,
          anon_id: anonId,
          media_type: isVideo ? 'video' : 'image',
          thumbnail_url: thumbnailUrl,
        },
      ])
      .select()
      .single();

    if (dbError) throw dbError;

    return blockData;
  } catch (error) {
    console.error('Error uploading block:', error);
    return null;
  }
}

// Fetch blocks for a collection
export async function fetchBlocksForCollection(
  collectionId: string
): Promise<ArenaBlock[]> {
  try {
    const { data, error } = await supabase
      .from('arena_blocks')
      .select('*')
      .eq('collection_id', collectionId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching blocks:', error);
    return [];
  }
}

// Delete a block
export async function deleteBlock(blockId: string, imageUrl: string): Promise<boolean> {
  try {
    // Extract filename from URL
    const urlParts = imageUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('arena-blocks')
      .remove([fileName]);

    if (storageError) throw storageError;

    // Delete from database
    const { error: dbError } = await supabase
      .from('arena_blocks')
      .delete()
      .eq('id', blockId);

    if (dbError) throw dbError;

    return true;
  } catch (error) {
    console.error('Error deleting block:', error);
    return false;
  }
}

// Move a block to another collection
export async function moveBlock(
  blockId: string,
  targetCollectionId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('arena_blocks')
      .update({ collection_id: targetCollectionId })
      .eq('id', blockId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error moving block:', error);
    return false;
  }
}
