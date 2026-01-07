'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { supabase, type WishlistItem } from '@/lib/supabase';
import { convertToWebP } from '@/lib/imageUpload';
import { ActionButton } from './ActionButtons';

type WishlistModalProps = {
  isOpen: boolean;
  onClose: () => void;
  anonId?: string;
  isEditMode: boolean;
  onLogActivity?: (action: string, details: string) => void;
};

export default function WishlistModal({
  isOpen,
  onClose,
  anonId,
  isEditMode,
  onLogActivity,
}: WishlistModalProps) {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const stableLogActivity = useCallback(
    (action: string, details: string) => {
      onLogActivity?.(action, details);
    },
    [onLogActivity]
  );

  // Fetch items on mount
  useEffect(() => {
    if (isOpen) {
      fetchItems();
      stableLogActivity('Opened Wishlist modal', 'Viewed wishlist items');
    }
  }, [isOpen, stableLogActivity]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('wishlist_items')
        .select('*')
        .order('is_purchased', { ascending: true })
        .order('order_index', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error fetching wishlist items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be smaller than 10MB.');
      return;
    }

    setSelectedImage(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const webpBlob = await convertToWebP(file, 0.8);
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(7);
      const fileName = `${timestamp}_${randomString}.webp`;

      const { error } = await supabase.storage
        .from('wishlist-images')
        .upload(fileName, webpBlob, {
          contentType: 'image/webp',
          upsert: false,
        });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from('wishlist-images').getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      alert('Please enter a title.');
      return;
    }

    try {
      setUploading(true);

      let imageUrl: string | null = null;
      if (selectedImage) {
        imageUrl = await uploadImage(selectedImage);
        if (!imageUrl) {
          alert('Failed to upload image. Please try again.');
          return;
        }
      }

      // Get the next order index
      const maxOrder = items.length > 0
        ? Math.max(...items.filter(i => !i.is_purchased).map(i => i.order_index))
        : -1;

      const { data, error } = await supabase
        .from('wishlist_items')
        .insert({
          anon_id: anonId || null,
          title: title.trim(),
          link_url: linkUrl.trim() || null,
          image_url: imageUrl,
          is_purchased: false,
          order_index: maxOrder + 1,
        })
        .select()
        .single();

      if (error) throw error;

      setItems([data, ...items.filter(i => !i.is_purchased), ...items.filter(i => i.is_purchased)]);

      if (onLogActivity) {
        onLogActivity('Added Wishlist Item', `Added "${title}" to wishlist`);
      }

      cancelEdit();
      alert('Item added successfully!');
    } catch (error) {
      console.error('Error adding wishlist item:', error);
      alert('Failed to add item. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, imageUrl: string | null) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      const { error } = await supabase
        .from('wishlist_items')
        .delete()
        .eq('id', id);

      if (error) throw error;

      if (imageUrl) {
        const fileName = imageUrl.split('/').pop();
        if (fileName) {
          await supabase.storage.from('wishlist-images').remove([fileName]);
        }
      }

      setItems(items.filter((item) => item.id !== id));

      if (onLogActivity) {
        onLogActivity('Deleted Wishlist Item', 'Removed an item from wishlist');
      }
    } catch (error) {
      console.error('Error deleting wishlist item:', error);
      alert('Failed to delete item. Please try again.');
    }
  };

  const togglePurchased = async (item: WishlistItem) => {
    try {
      const newPurchasedState = !item.is_purchased;

      // Update in database
      const { error } = await supabase
        .from('wishlist_items')
        .update({
          is_purchased: newPurchasedState,
          order_index: newPurchasedState ? 9999 : 0 // Move to end if purchased
        })
        .eq('id', item.id);

      if (error) throw error;

      // Update local state and re-sort
      const updatedItems = items.map(i =>
        i.id === item.id
          ? { ...i, is_purchased: newPurchasedState, order_index: newPurchasedState ? 9999 : 0 }
          : i
      );

      // Sort: unpurchased first, then purchased
      updatedItems.sort((a, b) => {
        if (a.is_purchased !== b.is_purchased) {
          return a.is_purchased ? 1 : -1;
        }
        return a.order_index - b.order_index;
      });

      setItems(updatedItems);

      if (onLogActivity) {
        onLogActivity(
          newPurchasedState ? 'Marked as Purchased' : 'Unmarked as Purchased',
          `"${item.title}" ${newPurchasedState ? 'purchased' : 'unmarked'}`
        );
      }
    } catch (error) {
      console.error('Error toggling purchased status:', error);
      alert('Failed to update item. Please try again.');
    }
  };

  const startEdit = (item: WishlistItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setLinkUrl(item.link_url || '');
    setExistingImageUrl(item.image_url);
    setOriginalImageUrl(item.image_url);
    setSelectedImage(null);
    setImagePreview(null);
    setShowEditForm(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setTitle('');
    setLinkUrl('');
    setSelectedImage(null);
    setImagePreview(null);
    setExistingImageUrl(null);
    setOriginalImageUrl(null);
    setShowEditForm(false);
  };

  const handleUpdate = async () => {
    if (!title.trim() || !editingId) {
      alert('Please enter a title.');
      return;
    }

    try {
      setUploading(true);

      let imageUrl: string | null = existingImageUrl;
      if (selectedImage) {
        imageUrl = await uploadImage(selectedImage);
        if (!imageUrl) {
          alert('Failed to upload image. Please try again.');
          return;
        }
      }

      // Delete old image from storage if it was removed or replaced
      if (originalImageUrl && originalImageUrl !== imageUrl) {
        const oldFileName = originalImageUrl.split('/').pop();
        if (oldFileName) {
          await supabase.storage.from('wishlist-images').remove([oldFileName]);
        }
      }

      const { data, error } = await supabase
        .from('wishlist_items')
        .update({
          title: title.trim(),
          link_url: linkUrl.trim() || null,
          image_url: imageUrl,
        })
        .eq('id', editingId)
        .select()
        .single();

      if (error) throw error;

      setItems(items.map((item) => (item.id === editingId ? data : item)));

      if (onLogActivity) {
        onLogActivity('Updated Wishlist Item', `Updated "${title}"`);
      }

      cancelEdit();
      alert('Item updated successfully!');
    } catch (error) {
      console.error('Error updating wishlist item:', error);
      alert('Failed to update item. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const removeExistingImage = () => {
    setExistingImageUrl(null);
  };

  if (!isOpen) return null;

  const unpurchasedItems = items.filter(item => !item.is_purchased);
  const purchasedItems = items.filter(item => item.is_purchased);

  return (
    <>
      {/* Backdrop with transparent blur */}
      <div
        className="fixed inset-0 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div
          className="bg-white w-full max-w-4xl h-[90vh] flex flex-col"
          style={{
            border: '4px solid #000',
            boxShadow: '8px 8px 0 0 #000',
          }}
        >
          {/* Header */}
          <div
            className="p-4 flex items-center justify-between bg-white"
            style={{
              borderBottom: '4px solid #000',
            }}
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">🎁</span>
              <h2 className="text-2xl font-bold text-gray-900">WISHLIST</h2>
            </div>
            <button
              onClick={onClose}
              className="text-2xl hover:text-red-500 font-bold"
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Add new item form - only in edit mode */}
            {isEditMode && (
              <div className="mb-6">
                {!showEditForm ? (
                  <button
                    onClick={() => setShowEditForm(true)}
                    className="px-4 py-2 bg-black text-white hover:bg-rose-500 transition-colors cursor-pointer"
                  >
                    + New Item
                  </button>
                ) : (
                  <div className="border-2 border-black p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold">
                        {editingId ? 'EDIT ITEM' : 'ADD NEW ITEM'}
                      </h3>
                      <button
                        onClick={cancelEdit}
                        className="text-sm text-gray-500 hover:text-red-500"
                      >
                        ✕ CANCEL
                      </button>
                    </div>

                    {/* Title input */}
                    <div className="mb-4">
                      <label className="block text-sm font-bold mb-2">TITLE *</label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Enter item name..."
                        className="w-full px-3 py-2 border-2 border-gray-900 focus:outline-none focus:border-rose-500"
                        disabled={uploading}
                      />
                    </div>

                    {/* Link URL input */}
                    <div className="mb-4">
                      <label className="block text-sm font-bold mb-2">LINK (OPTIONAL)</label>
                      <input
                        type="url"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="https://example.com/product"
                        className="w-full px-3 py-2 border-2 border-gray-900 focus:outline-none focus:border-rose-500"
                        disabled={uploading}
                      />
                    </div>

                    {/* Image upload */}
                    <div className="mb-4">
                      <label className="block text-sm font-bold mb-2">IMAGE (OPTIONAL)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageSelect}
                        className="hidden"
                        id="wishlist-image-upload"
                        disabled={uploading}
                      />
                      <label
                        htmlFor="wishlist-image-upload"
                        className="inline-block px-4 py-2 bg-white border-2 border-gray-900 hover:bg-rose-50 cursor-pointer"
                      >
                        📷 CHOOSE IMAGE
                      </label>
                      {(imagePreview || existingImageUrl) && (
                        <div className="mt-4">
                          <div className="relative w-64 h-64 border-4 border-gray-900">
                            <Image
                              src={imagePreview || existingImageUrl || ''}
                              alt="Preview"
                              fill
                              sizes="256px"
                              className="object-contain"
                              unoptimized
                            />
                          </div>
                          <button
                            onClick={() => {
                              setSelectedImage(null);
                              setImagePreview(null);
                              if (existingImageUrl) {
                                removeExistingImage();
                              }
                            }}
                            className="mt-2 text-sm text-red-500 hover:underline"
                            disabled={uploading}
                          >
                            Remove image
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Submit button */}
                    <button
                      onClick={editingId ? handleUpdate : handleSubmit}
                      disabled={uploading}
                      className="w-full px-4 py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {uploading ? 'UPLOADING...' : editingId ? 'UPDATE ITEM' : 'ADD ITEM'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Items list */}
            <div>
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : items.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No items in your wishlist yet. {isEditMode && 'Add your first item above!'}
                </div>
              ) : (
                <>
                  {/* Unpurchased items */}
                  {unpurchasedItems.length > 0 && (
                    <div className="mb-8">
                      <h3 className="text-lg font-bold mb-4">WANT ({unpurchasedItems.length})</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {unpurchasedItems.map((item) => (
                          <WishlistItemCard
                            key={item.id}
                            item={item}
                            isEditMode={isEditMode}
                            onTogglePurchased={() => togglePurchased(item)}
                            onEdit={() => startEdit(item)}
                            onDelete={() => handleDelete(item.id, item.image_url)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Purchased items */}
                  {purchasedItems.length > 0 && (
                    <div>
                      <h3 className="text-lg font-bold mb-4 text-gray-500">PURCHASED ({purchasedItems.length})</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-60">
                        {purchasedItems.map((item) => (
                          <WishlistItemCard
                            key={item.id}
                            item={item}
                            isEditMode={isEditMode}
                            onTogglePurchased={() => togglePurchased(item)}
                            onEdit={() => startEdit(item)}
                            onDelete={() => handleDelete(item.id, item.image_url)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Separate component for each wishlist item card
function WishlistItemCard({
  item,
  isEditMode,
  onTogglePurchased,
  onEdit,
  onDelete,
}: {
  item: WishlistItem;
  isEditMode: boolean;
  onTogglePurchased: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`border-4 border-gray-900 p-4 bg-white flex gap-4 ${
        item.is_purchased ? 'bg-gray-100' : ''
      }`}
    >
      {/* Image */}
      {item.image_url && (
        <div className="flex-shrink-0 relative w-24 h-24 border-2 border-gray-900">
          <Image
            src={item.image_url}
            alt={item.title}
            fill
            sizes="96px"
            className="object-cover"
            unoptimized
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className={`font-bold text-lg break-words ${item.is_purchased ? 'line-through text-gray-500' : ''}`}>
            {item.title}
          </h4>
          {isEditMode && (
            <div className="flex gap-1 flex-shrink-0">
              <ActionButton
                variant="edit"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              />
              <ActionButton
                variant="delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              />
            </div>
          )}
        </div>

        {/* Link */}
        {item.link_url && (
          <a
            href={item.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline break-all mb-3 block"
          >
            🔗 View Link
          </a>
        )}

        {/* Purchased toggle button - only in edit mode */}
        {isEditMode && (
          <button
            onClick={onTogglePurchased}
            className={`px-3 py-1.5 border-2 border-gray-900 text-sm font-bold transition-colors ${
              item.is_purchased
                ? 'bg-green-500 text-white hover:bg-gray-200 hover:text-gray-900'
                : 'bg-white hover:bg-green-500 hover:text-white'
            }`}
          >
            {item.is_purchased ? '✓ PURCHASED' : 'MARK PURCHASED'}
          </button>
        )}
      </div>
    </div>
  );
}
