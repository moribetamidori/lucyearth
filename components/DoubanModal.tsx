'use client';

import { useState, useEffect } from 'react';
import { supabase, type DoubanRating } from '@/lib/supabase';
import { convertToWebP } from '@/lib/imageUpload';
import { ActionButton } from './ActionButtons';

type DoubanModalProps = {
  isOpen: boolean;
  onClose: () => void;
  anonId?: string;
  isEditMode: boolean;
  onLogActivity?: (action: string, details: string) => void;
};

type Category = 'movie' | 'tv' | 'book' | 'music' | 'game';

const categoryEmojis: Record<Category, string> = {
  movie: '🎬',
  tv: '📺',
  book: '📚',
  music: '🎵',
  game: '🎮',
};

const categoryLabels: Record<Category, string> = {
  movie: 'MOVIE',
  tv: 'TV SHOW',
  book: 'BOOK',
  music: 'MUSIC',
  game: 'GAME',
};

export default function DoubanModal({
  isOpen,
  onClose,
  anonId,
  isEditMode,
  onLogActivity,
}: DoubanModalProps) {
  const [ratings, setRatings] = useState<DoubanRating[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Category>('movie');
  const [rating, setRating] = useState(5);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Filter state
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all');
  const [filterMinRating, setFilterMinRating] = useState(1);

  // Fetch ratings on mount
  useEffect(() => {
    if (isOpen) {
      fetchRatings();
      if (onLogActivity) {
        onLogActivity('Opened Douban modal', 'Viewed ratings');
      }
    }
  }, [isOpen]);

  const fetchRatings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('douban_ratings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRatings(data || []);
    } catch (error) {
      console.error('Error fetching ratings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be smaller than 10MB.');
      return;
    }

    setSelectedImage(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      // Convert to WebP
      const webpBlob = await convertToWebP(file, 0.8);
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(7);
      const fileName = `${timestamp}_${randomString}.webp`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('douban-images')
        .upload(fileName, webpBlob, {
          contentType: 'image/webp',
          upsert: false,
        });

      if (error) throw error;

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('douban-images').getPublicUrl(fileName);

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

      // Upload image if selected
      let imageUrl: string | null = null;
      if (selectedImage) {
        imageUrl = await uploadImage(selectedImage);
        if (!imageUrl) {
          alert('Failed to upload image. Please try again.');
          return;
        }
      }

      // Insert rating into database
      const { data, error } = await supabase
        .from('douban_ratings')
        .insert({
          anon_id: anonId || null,
          title: title.trim(),
          category,
          rating,
          image_url: imageUrl,
        })
        .select()
        .single();

      if (error) throw error;

      // Add to ratings list
      setRatings([data, ...ratings]);

      // Log activity
      if (onLogActivity) {
        onLogActivity(
          'Added Douban Rating',
          `Rated "${title}" (${categoryLabels[category]}) - ${rating} stars`
        );
      }

      // Reset form
      setTitle('');
      setCategory('movie');
      setRating(5);
      setSelectedImage(null);
      setImagePreview(null);
      setShowEditForm(false);

      alert('Rating added successfully!');
    } catch (error) {
      console.error('Error adding rating:', error);
      alert('Failed to add rating. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, imageUrl: string | null) => {
    if (!confirm('Are you sure you want to delete this rating?')) return;

    try {
      // Delete from database
      const { error } = await supabase
        .from('douban_ratings')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Delete image from storage if exists
      if (imageUrl) {
        const fileName = imageUrl.split('/').pop();
        if (fileName) {
          await supabase.storage.from('douban-images').remove([fileName]);
        }
      }

      // Update state
      setRatings(ratings.filter((r) => r.id !== id));

      if (onLogActivity) {
        onLogActivity('Deleted Douban Rating', `Removed a rating`);
      }
    } catch (error) {
      console.error('Error deleting rating:', error);
      alert('Failed to delete rating. Please try again.');
    }
  };

  if (!isOpen) return null;

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
              <span className="text-3xl">🫘</span>
              <h2 className="text-2xl font-bold text-gray-900">DOUBAN</h2>
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
            {/* Add new rating form - only in edit mode */}
            {isEditMode && (
              <div className="mb-6">
                {/* Edit button / header */}
                {!showEditForm ? (
                  <button
                    onClick={() => setShowEditForm(true)}
                    className="px-4 py-2 bg-black text-white hover:bg-blue-500 transition-colors cursor-pointer"
                  >
                    + New Rating
                  </button>
                ) : (
                  <div className="border-2 border-black p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold">ADD NEW RATING</h3>
                      <button
                        onClick={() => {
                          setShowEditForm(false);
                          // Reset form
                          setTitle('');
                          setCategory('movie');
                          setRating(5);
                          setSelectedImage(null);
                          setImagePreview(null);
                        }}
                        className="text-sm text-gray-500 hover:text-red-500"
                      >
                        ✕ CANCEL
                      </button>
                    </div>

                    {/* Title input */}
                    <div className="mb-4">
                      <label className="block text-sm font-bold mb-2">TITLE</label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Enter title..."
                        className="w-full px-3 py-2 border-2 border-gray-900 focus:outline-none focus:border-blue-500"
                        disabled={uploading}
                      />
                    </div>

                    {/* Category selection */}
                    <div className="mb-4">
                      <label className="block text-sm font-bold mb-2">CATEGORY</label>
                      <div className="flex gap-2 flex-wrap">
                        {(Object.keys(categoryEmojis) as Category[]).map((cat) => (
                          <button
                            key={cat}
                            onClick={() => setCategory(cat)}
                            className={`px-4 py-2 border-2 border-gray-900 transition-colors ${
                              category === cat
                                ? 'bg-blue-500 text-white'
                                : 'bg-white hover:bg-blue-50'
                            }`}
                            disabled={uploading}
                          >
                            {categoryEmojis[cat]} {categoryLabels[cat]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Star rating */}
                    <div className="mb-4">
                      <label className="block text-sm font-bold mb-2">RATING</label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => setRating(star)}
                            className="text-4xl transition-all hover:scale-110"
                            disabled={uploading}
                          >
                            {star <= rating ? '⭐' : '☆'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Image upload */}
                    <div className="mb-4">
                      <label className="block text-sm font-bold mb-2">IMAGE (OPTIONAL)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageSelect}
                        className="hidden"
                        id="douban-image-upload"
                        disabled={uploading}
                      />
                      <label
                        htmlFor="douban-image-upload"
                        className="inline-block px-4 py-2 bg-white border-2 border-gray-900 hover:bg-blue-50 cursor-pointer"
                      >
                        📷 CHOOSE IMAGE
                      </label>
                      {imagePreview && (
                        <div className="mt-4">
                          <img
                            src={imagePreview}
                            alt="Preview"
                            className="max-w-xs border-4 border-gray-900"
                          />
                          <button
                            onClick={() => {
                              setSelectedImage(null);
                              setImagePreview(null);
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
                      onClick={handleSubmit}
                      disabled={uploading}
                      className="w-full px-4 py-3 bg-green-500 hover:bg-green-600 text-white font-bold disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {uploading ? 'UPLOADING...' : 'ADD RATING'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Ratings list */}
            <div>
              <h3 className="text-lg font-bold mb-4">MY RATINGS</h3>

              {/* Filters */}
              {ratings.length > 0 && (
                <div className="mb-6 p-4 border-2 border-gray-900 bg-gray-50">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    {/* Category filter tags */}
                    <div className="flex-1">
                      <label className="block text-sm font-bold mb-2">FILTER BY CATEGORY</label>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setFilterCategory('all')}
                          className={`px-3 py-1.5 border-2 border-gray-900 transition-colors text-sm ${
                            filterCategory === 'all'
                              ? 'bg-gray-900 text-white'
                              : 'bg-white hover:bg-gray-100'
                          }`}
                        >
                          ALL
                        </button>
                        {(Object.keys(categoryEmojis) as Category[]).map((cat) => (
                          <button
                            key={cat}
                            onClick={() => setFilterCategory(cat)}
                            className={`px-3 py-1.5 border-2 border-gray-900 transition-colors text-sm ${
                              filterCategory === cat
                                ? 'bg-gray-900 text-white'
                                : 'bg-white hover:bg-gray-100'
                            }`}
                          >
                            {categoryEmojis[cat]} {categoryLabels[cat]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Star rating filter */}
                    <div className="flex-shrink-0">
                      <label className="block text-sm font-bold mb-2">MINIMUM RATING</label>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => setFilterMinRating(star)}
                            className="text-3xl transition-all hover:scale-110 cursor-pointer"
                          >
                            {star <= filterMinRating ? '⭐' : '☆'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : ratings.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No ratings yet. Add your first rating above!
                </div>
              ) : (() => {
                const filteredRatings = ratings.filter((r) => {
                  // Filter by category
                  if (filterCategory !== 'all' && r.category !== filterCategory) {
                    return false;
                  }
                  // Filter by minimum rating
                  if (r.rating < filterMinRating) {
                    return false;
                  }
                  return true;
                });

                if (filteredRatings.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-500">
                      No ratings match your filters. Try adjusting the filters above.
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredRatings.map((r) => (
                    <div
                      key={r.id}
                      className="border-4 border-gray-900 p-4 bg-white flex gap-4"
                    >
                      {/* Image */}
                      {r.image_url && (
                        <div className="flex-shrink-0">
                          <img
                            src={r.image_url}
                            alt={r.title}
                            className="w-24 h-24 object-cover border-2 border-gray-900"
                          />
                        </div>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h4 className="font-bold text-lg break-words">{r.title}</h4>
                          {isEditMode && (
                            <ActionButton
                              variant="delete"
                              onClick={() => handleDelete(r.id, r.image_url)}
                              className="flex-shrink-0"
                            />
                          )}
                        </div>
                        <div className="text-sm mb-2">
                          {categoryEmojis[r.category]} {categoryLabels[r.category]}
                        </div>
                        <div className="flex gap-1 mb-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span key={star} className="text-lg">
                              {star <= r.rating ? '⭐' : '☆'}
                            </span>
                          ))}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(r.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
