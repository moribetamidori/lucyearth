'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { supabase, type TimelineEntry } from '@/lib/supabase';
import { convertToWebP } from '@/lib/imageUpload';
import ImageLightbox from './ImageLightbox';
import { ActionButtonGroup } from './ActionButtons';

type TimelineModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isEditMode: boolean;
  onLogActivity?: (action: string, details?: string) => void;
};

const timelineColors = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#ef4444'];

const getToday = () => new Date().toISOString().slice(0, 10);
const getCurrentTime = () => new Date().toISOString().slice(11, 16);

const sortEntries = (items: TimelineEntry[]) =>
  [...items].sort(
    (a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime()
  );

export default function TimelineModal({
  isOpen,
  onClose,
  isEditMode,
  onLogActivity,
}: TimelineModalProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [eventDate, setEventDate] = useState(getToday());
  const [eventTime, setEventTime] = useState(getCurrentTime());
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<TimelineEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetForm = useCallback(() => {
    setTitle('');
    setDetails('');
    setEventDate(getToday());
    setEventTime(getCurrentTime());
    setImageFile(null);
    setImagePreview(null);
    setEditingEntry(null);
    setRemoveExistingImage(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('timeline_entries')
      .select('*')
      .order('event_time', { ascending: false });

    if (error) {
      console.error('Failed to load timeline entries:', error);
      setError('Failed to load timeline. Please try again later.');
    } else {
      setEntries(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadEntries();
      if (onLogActivity) {
        onLogActivity('Opened Timeline', 'Viewing life timeline entries');
      }
    } else {
      resetForm();
    }
  }, [isOpen, loadEntries, onLogActivity, resetForm]);

  useEffect(() => {
    if (!isEditMode) {
      resetForm();
    }
  }, [isEditMode, resetForm]);

  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    if (imagePreview && imagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview);
    }

    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    setImageFile(file);
    setRemoveExistingImage(false);
  };

  const handleRemoveImage = () => {
    if (imagePreview && imagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview(null);
    setImageFile(null);
    if (editingEntry?.image_url) {
      setRemoveExistingImage(true);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadImage = async (file: File) => {
    const webpBlob = await convertToWebP(file, 0.82);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filePath = `entries/${timestamp}_${random}.webp`;

    const { error } = await supabase.storage
      .from('timeline-images')
      .upload(filePath, webpBlob, {
        contentType: 'image/webp',
        upsert: false,
      });

    if (error) {
      throw error;
    }

    const { data } = supabase.storage.from('timeline-images').getPublicUrl(filePath);
    return { publicUrl: data.publicUrl, fileName: filePath };
  };

  const handleEditEntry = (entry: TimelineEntry) => {
    setEditingEntry(entry);
    setTitle(entry.title);
    setDetails(entry.details || '');
    const entryDate = new Date(entry.event_time);
    setEventDate(entryDate.toISOString().slice(0, 10));
    setEventTime(entryDate.toISOString().slice(11, 16));
    setImagePreview(entry.image_url);
    setImageFile(null);
    setRemoveExistingImage(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeleteEntry = async (entry: TimelineEntry) => {
    const confirmDelete = confirm('Delete this timeline entry?');
    if (!confirmDelete) return;

    try {
      const { error } = await supabase.from('timeline_entries').delete().eq('id', entry.id);
      if (error) throw error;

      if (entry.image_filename) {
        const { error: storageError } = await supabase.storage
          .from('timeline-images')
          .remove([entry.image_filename]);
        if (storageError) {
          console.warn('Failed to remove timeline image:', storageError);
        }
      }

      setEntries((prev) => prev.filter((item) => item.id !== entry.id));
      if (editingEntry?.id === entry.id) {
        resetForm();
      }

      if (onLogActivity) {
        onLogActivity('Deleted Timeline Entry', entry.title);
      }
    } catch (deleteError) {
      console.error('Failed to delete timeline entry:', deleteError);
      alert('Failed to delete entry. Please try again.');
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      alert('Please enter a short headline for this entry.');
      return;
    }

    const safeDate = eventDate || getToday();
    const safeTime = eventTime || '09:00';
    const timestamp = new Date(`${safeDate}T${safeTime}`);

    if (Number.isNaN(timestamp.getTime())) {
      alert('Please provide a valid date and time.');
      return;
    }

    setSaving(true);

    try {
      let nextImageUrl = editingEntry?.image_url || null;
      let nextImageFilename = editingEntry?.image_filename || null;

      if (removeExistingImage && nextImageFilename) {
        const { error: removeError } = await supabase.storage
          .from('timeline-images')
          .remove([nextImageFilename]);
        if (removeError) {
          console.warn('Failed to delete previous timeline image:', removeError);
        }
        nextImageUrl = null;
        nextImageFilename = null;
      }

      if (imageFile) {
        const upload = await uploadImage(imageFile);
        if (nextImageFilename && upload.fileName !== nextImageFilename) {
          const { error: purgeError } = await supabase.storage
            .from('timeline-images')
            .remove([nextImageFilename]);
          if (purgeError) {
            console.warn('Failed to remove older timeline image:', purgeError);
          }
        }
        nextImageUrl = upload.publicUrl;
        nextImageFilename = upload.fileName;
      }

      const payload = {
        title: title.trim(),
        details: details.trim() ? details.trim() : null,
        event_time: timestamp.toISOString(),
        image_url: nextImageUrl,
        image_filename: nextImageFilename,
      };

      if (editingEntry) {
        const { data, error } = await supabase
          .from('timeline_entries')
          .update(payload)
          .eq('id', editingEntry.id)
          .select()
          .single();

        if (error) throw error;

        setEntries((prev) =>
          sortEntries(prev.map((item) => (item.id === data.id ? data : item)))
        );
        if (onLogActivity) {
          onLogActivity('Updated Timeline Entry', data.title);
        }
      } else {
        const { data, error } = await supabase
          .from('timeline_entries')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;

        setEntries((prev) => sortEntries([data, ...prev]));
        if (onLogActivity) {
          onLogActivity('Added Timeline Entry', data.title);
        }
      }

      resetForm();
    } catch (submitError) {
      console.error('Failed to save timeline entry:', submitError);
      alert('Failed to save entry. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const getMarkerColor = useCallback((id: string, index: number) => {
    const base = id.charCodeAt(0) + index;
    return timelineColors[base % timelineColors.length];
  }, []);

  const timelineStats = useMemo(() => {
    if (entries.length === 0) return null;
    const first = entries[entries.length - 1];
    const last = entries[0];
    const spanYears =
      new Date(last.event_time).getFullYear() - new Date(first.event_time).getFullYear();
    return {
      total: entries.length,
      spanYears: Math.max(spanYears, 0),
    };
  }, [entries]);

  const timelineSummary = useMemo(() => {
    if (!timelineStats) {
      return 'Log the little things that made today special.';
    }
    const span = Math.max(timelineStats.spanYears, 0);
    const displayYears = span === 0 ? 1 : span;
    const plural = displayYears === 1 ? '' : 's';
    return `Tracking ${timelineStats.total} entries across ${displayYears} year${plural}`;
  }, [timelineStats]);

  const handleOpenLightbox = (imageUrl: string) => {
    setLightboxImages([imageUrl]);
    setLightboxIndex(0);
    setShowLightbox(true);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white w-full max-w-5xl h-[90vh] flex flex-col border-4 border-gray-900"
          style={{ boxShadow: '8px 8px 0 0 #000' }}
        >
          {/* Header */}
          <div className="p-4 border-b-4 border-gray-900 flex items-center justify-between gap-4">
            <div>
              <div className="text-2xl font-bold tracking-wider">TIMELINE</div>
              <div className="text-xs text-gray-500 mt-1">{timelineSummary}</div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`text-xs px-3 py-1 border-2 border-gray-900 ${isEditMode ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}
              >
                {isEditMode ? 'EDIT MODE' : 'VIEW ONLY'}
              </span>
              <button
                onClick={onClose}
                className="w-9 h-9 text-2xl border-2 border-gray-900 hover:bg-red-500 hover:text-white flex items-center justify-center"
              >
                ×
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Timeline column */}
            <div className="flex-1 overflow-y-auto p-4 relative">
              <div className="absolute left-10 top-4 bottom-4 border-l-2 border-dashed border-gray-300 pointer-events-none" />
              {loading ? (
                <div className="text-center text-gray-500 mt-20">Loading timeline...</div>
              ) : error ? (
                <div className="text-center text-red-500 mt-20">{error}</div>
              ) : entries.length === 0 ? (
                <div className="text-center text-gray-500 mt-20">
                  No entries yet. {isEditMode ? 'Log your first moment!' : 'Ask Lucy to log a few highlights.'}
                </div>
              ) : (
                <div className="space-y-6 relative">
                  {entries.map((entry, index) => {
                    const color = getMarkerColor(entry.id, index);
                    const entryDate = new Date(entry.event_time);
                    const dateLabel = entryDate.toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    });
                    const timeLabel = entryDate.toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    });
                    return (
                      <div key={entry.id} className="relative pl-12 group">
                        <div
                          className="absolute left-5 top-5 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-gray-900"
                          style={{ backgroundColor: color }}
                        />
                        <div
                          className="bg-white border-2 border-gray-900 p-4 shadow-[4px_4px_0_0_#000] relative"
                          style={{ minHeight: '120px' }}
                        >
                          {isEditMode && (
                            <ActionButtonGroup
                              buttons={[
                                {
                                  variant: 'edit',
                                  onClick: (e) => {
                                    e.stopPropagation();
                                    handleEditEntry(entry);
                                  },
                                },
                                {
                                  variant: 'delete',
                                  onClick: (e) => {
                                    e.stopPropagation();
                                    handleDeleteEntry(entry);
                                  },
                                },
                              ]}
                            />
                          )}
                          <div className="flex flex-wrap justify-between gap-2 pr-12">
                            <div>
                              <div className="text-sm font-semibold tracking-wide uppercase text-gray-600">
                                {dateLabel}
                              </div>
                              <div className="text-xs text-gray-500">{timeLabel}</div>
                            </div>
                            <div className="text-xs text-gray-500">
                              #{entries.length - index}
                            </div>
                          </div>
                          <div className="mt-3">
                            <div className="text-lg font-bold">{entry.title}</div>
                            {entry.details && (
                              <div className="text-sm text-gray-700 mt-1 whitespace-pre-line">
                                {entry.details}
                              </div>
                            )}
                          </div>
                          {entry.image_url && (
                            <div className="mt-4">
                              <div
                                className="w-28 h-28 border-2 border-gray-900 overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform"
                                onClick={() => handleOpenLightbox(entry.image_url!)}
                              >
                                <img
                                  src={entry.image_url}
                                  alt={entry.title}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Form column */}
            <div className="lg:w-[340px] border-t-4 border-gray-900 lg:border-t-0 lg:border-l-4 p-4 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold">
                  {editingEntry ? 'Edit Entry' : 'New Entry'}
                </h3>
                {editingEntry && (
                  <button
                    onClick={resetForm}
                    className="text-sm underline text-gray-500 hover:text-gray-800"
                  >
                    Cancel edit
                  </button>
                )}
              </div>
              {isEditMode ? (
                <form onSubmit={handleSubmit} className="space-y-3 overflow-y-auto pr-1">
                  <div>
                    <label className="text-xs font-semibold text-gray-600">Date</label>
                    <input
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="mt-1 w-full border-2 border-gray-900 px-2 py-1 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600">Time</label>
                    <input
                      type="time"
                      value={eventTime}
                      onChange={(e) => setEventTime(e.target.value)}
                      className="mt-1 w-full border-2 border-gray-900 px-2 py-1 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600">Headline</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="What happened?"
                      className="mt-1 w-full border-2 border-gray-900 px-2 py-1 text-sm"
                      maxLength={120}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600">
                      Notes <span className="text-gray-400">(optional)</span>
                    </label>
                    <textarea
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      placeholder="Add a few details..."
                      className="mt-1 w-full border-2 border-gray-900 px-2 py-1 text-sm h-24"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-600">
                        Image <span className="text-gray-400">(optional)</span>
                      </label>
                      {imagePreview && (
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="text-xs text-red-500 underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,.heic,.heif"
                      onChange={handleImageChange}
                      className="mt-1 w-full text-xs"
                    />
                    {imagePreview && (
                      <div className="mt-2 w-28 h-28 border-2 border-gray-900 overflow-hidden">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    {!imagePreview && editingEntry?.image_url && removeExistingImage && (
                      <div className="text-xs text-gray-500 mt-1">
                        Image will be removed when you save.
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="bg-gray-900 text-white py-2 text-sm hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {saving
                        ? 'Saving...'
                        : editingEntry
                          ? 'Save Changes'
                          : 'Add Entry'}
                    </button>
                    {!editingEntry && (
                      <button
                        type="button"
                        onClick={resetForm}
                        className="text-xs text-gray-500 underline"
                      >
                        Reset form
                      </button>
                    )}
                  </div>
                </form>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 px-4">
                  <div className="text-4xl mb-3">🕒</div>
                  <p className="text-sm">
                    Enter edit mode to log new timeline moments and attach optional images.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ImageLightbox
        images={lightboxImages}
        initialIndex={lightboxIndex}
        isOpen={showLightbox}
        onClose={() => setShowLightbox(false)}
      />
    </>
  );
}
