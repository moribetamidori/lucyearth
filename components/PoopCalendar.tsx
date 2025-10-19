'use client';

import { useState, useEffect } from 'react';
import { supabase, type PoopImage, type CalendarEntry } from '@/lib/supabase';

type PoopCalendarProps = {
  isOpen: boolean;
  onClose: () => void;
  isEditMode: boolean;
};

export default function PoopCalendar({ isOpen, onClose, isEditMode }: PoopCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date(2025, 9, 1)); // Oct 2025
  const [poopImages, setPoopImages] = useState<PoopImage[]>([]);
  const [calendarEntries, setCalendarEntries] = useState<CalendarEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showImageManager, setShowImageManager] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingEntry, setViewingEntry] = useState<{ image: PoopImage | null; note: string | null } | null>(null);

  // Fetch poop images
  useEffect(() => {
    fetchPoopImages();
    fetchCalendarEntries();
  }, []);

  const fetchPoopImages = async () => {
    const { data, error } = await supabase
      .from('poop_images')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) setPoopImages(data);
  };

  const fetchCalendarEntries = async () => {
    const { data, error } = await supabase
      .from('calendar_entries')
      .select('*');

    if (data) setCalendarEntries(data);
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek };
  };

  const handleDateClick = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const existingEntry = calendarEntries.find(e => e.date === dateStr);

    if (!isEditMode) {
      // View mode - show entry if it exists
      if (existingEntry?.poop_image_id) {
        const image = poopImages.find(img => img.id === existingEntry.poop_image_id);
        setViewingEntry({
          image: image || null,
          note: existingEntry.notes || null,
        });
        setShowViewModal(true);
      }
      return;
    }

    // Edit mode
    setSelectedDate(dateStr);
    setNoteText(existingEntry?.notes || '');
    setSelectedImageId(existingEntry?.poop_image_id || null);
    setShowImagePicker(true);
  };

  const handleSaveEntry = async () => {
    if (!selectedDate || !selectedImageId) return;

    const { data, error } = await supabase
      .from('calendar_entries')
      .upsert({
        date: selectedDate,
        poop_image_id: selectedImageId,
        notes: noteText || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'date' });

    if (!error) {
      await fetchCalendarEntries();
      setShowImagePicker(false);
      setSelectedDate(null);
      setNoteText('');
      setSelectedImageId(null);
    }
  };

  const getPoopImageForDate = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const entry = calendarEntries.find(e => e.date === dateStr);
    if (entry?.poop_image_id) {
      return poopImages.find(img => img.id === entry.poop_image_id);
    }
    return null;
  };

  const hasNoteForDate = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const entry = calendarEntries.find(e => e.date === dateStr);
    return entry?.notes && entry.notes.trim().length > 0;
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  if (!isOpen) return null;

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentMonth);
  const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border-4 border-gray-900 max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl">POOP.CAL</h2>
          <button
            onClick={onClose}
            className="text-2xl hover:text-red-500 cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Month navigation */}
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={prevMonth}
            className="px-4 py-2 border-2 border-gray-900 hover:bg-blue-500 hover:text-white text-sm cursor-pointer"
          >
            {'<'}
          </button>
          <div className="text-base">{monthName.toUpperCase()}</div>
          <button
            onClick={nextMonth}
            className="px-4 py-2 border-2 border-gray-900 hover:bg-blue-500 hover:text-white text-sm cursor-pointer"
          >
            {'>'}
          </button>
        </div>

        {/* Manage Images Button - Only show in edit mode */}
        {isEditMode && (
          <div className="mb-6">
            <button
              onClick={() => setShowImageManager(!showImageManager)}
              className="px-4 py-2 border-2 border-gray-900 hover:bg-purple-500 hover:text-white text-xs cursor-pointer"
            >
              {showImageManager ? 'HIDE IMAGES' : 'MANAGE IMAGES'}
            </button>
          </div>
        )}

        {/* Image Manager */}
        {showImageManager && isEditMode && (
          <ImageManager
            poopImages={poopImages}
            onUpdate={fetchPoopImages}
          />
        )}

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-2 mb-6">
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
            <div key={day} className="text-center text-[10px] text-gray-500 py-2">
              {day}
            </div>
          ))}

          {[...Array(startingDayOfWeek)].map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}

          {[...Array(daysInMonth)].map((_, i) => {
            const day = i + 1;
            const poopImage = getPoopImageForDate(day);
            const hasNote = hasNoteForDate(day);
            const hasEntry = poopImage !== null;

            return (
              <div
                key={day}
                onClick={() => handleDateClick(day)}
                className={`aspect-square border-2 border-gray-900 flex flex-col items-center justify-center transition-colors p-1 relative ${
                  isEditMode ? 'cursor-pointer hover:bg-blue-100' : hasEntry ? 'cursor-pointer hover:bg-gray-50' : ''
                }`}
              >
                <div className="text-xs">{day}</div>
                {poopImage && (
                  <>
                    {/* Show tiny emoji on mobile, image on desktop */}
                    <div className="text-[9px] sm:hidden" title={poopImage.label}>
                      💩
                    </div>
                    <img
                      src={poopImage.image_url}
                      alt={poopImage.label}
                      title={poopImage.label}
                      className="hidden sm:block w-20 h-20 object-cover mt-1"
                    />
                  </>
                )}
                {hasNote && (
                  <div className="absolute top-1 right-1 text-xs hidden sm:block" title="Has note">
                    📝
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Image Picker Modal */}
        {showImagePicker && (
          <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white border-4 border-gray-900 p-6 max-w-md w-full">
              <h3 className="text-base mb-4">SELECT POOP IMAGE</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                {poopImages.map(img => (
                  <div
                    key={img.id}
                    onClick={() => setSelectedImageId(img.id)}
                    className={`border-2 p-4 cursor-pointer flex flex-col items-center transition-colors ${
                      selectedImageId === img.id
                        ? 'border-blue-500 bg-blue-100'
                        : 'border-gray-900 hover:bg-blue-50'
                    }`}
                  >
                    <img
                      src={img.image_url}
                      alt={img.label}
                      className="w-16 h-16 object-cover mb-2"
                    />
                    <div className="text-[10px] text-center">{img.label}</div>
                  </div>
                ))}
              </div>
              <div className="mb-4">
                <label className="text-xs block mb-2">NOTES (OPTIONAL)</label>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add a short note..."
                  className="w-full px-3 py-2 border-2 border-gray-900 text-sm resize-none"
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEntry}
                  disabled={!selectedImageId}
                  className="flex-1 px-4 py-2 border-2 border-gray-900 hover:bg-green-500 hover:text-white text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  SAVE
                </button>
                <button
                  onClick={() => {
                    setShowImagePicker(false);
                    setNoteText('');
                    setSelectedImageId(null);
                  }}
                  className="flex-1 px-4 py-2 border-2 border-gray-900 hover:bg-red-500 hover:text-white text-xs cursor-pointer"
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Modal - for non-edit mode */}
        {showViewModal && viewingEntry && (
          <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white border-4 border-gray-900 max-w-lg w-full p-8">
              <div className="flex flex-col items-center">
                {viewingEntry.image && (
                  <img
                    src={viewingEntry.image.image_url}
                    alt={viewingEntry.image.label}
                    className="max-w-full max-h-96 object-contain mb-4"
                  />
                )}
                {viewingEntry.note && (
                  <div className="w-full mt-4 p-4 border-2 border-gray-900 bg-gray-50">
                    <div className="text-xs text-gray-500 mb-2">NOTE</div>
                    <div className="text-sm whitespace-pre-wrap">{viewingEntry.note}</div>
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingEntry(null);
                }}
                className="mt-6 px-4 py-2 border-2 border-gray-900 hover:bg-blue-500 hover:text-white text-xs w-full cursor-pointer"
              >
                CLOSE
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Image Manager Component
type ImageManagerProps = {
  poopImages: PoopImage[];
  onUpdate: () => void;
};

function ImageManager({ poopImages, onUpdate }: ImageManagerProps) {
  const [newImageLabel, setNewImageLabel] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !newImageLabel) {
      alert('Please provide both an image and a label');
      return;
    }

    setUploading(true);

    try {
      // Upload to Supabase storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = fileName;

      const { error: uploadError } = await supabase.storage
        .from('poop-images')
        .upload(filePath, selectedFile);

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('poop-images')
        .getPublicUrl(filePath);

      // Insert into database
      const { error: dbError } = await supabase
        .from('poop_images')
        .insert({
          image_url: publicUrl,
          label: newImageLabel,
          is_emoji: false,
        });

      if (dbError) {
        throw dbError;
      }

      setNewImageLabel('');
      setSelectedFile(null);
      onUpdate();
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async (id: string, imageUrl: string) => {
    // Delete from storage
    if (imageUrl.includes('poop-images')) {
      const urlParts = imageUrl.split('/');
      const fileName = urlParts[urlParts.length - 1];

      await supabase.storage
        .from('poop-images')
        .remove([fileName]);
    }

    const { error } = await supabase
      .from('poop_images')
      .delete()
      .eq('id', id);

    if (!error) {
      onUpdate();
    }
  };

  return (
    <div className="border-2 border-gray-900 p-4 mb-6">
      <h3 className="text-sm mb-4">POOP IMAGES</h3>

      {/* Add New Image */}
      <div className="mb-4 space-y-2">
        <input
          type="text"
          placeholder="LABEL"
          value={newImageLabel}
          onChange={(e) => setNewImageLabel(e.target.value)}
          className="w-full px-3 py-2 border-2 border-gray-900 text-sm"
        />
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
          className="w-full px-3 py-2 border-2 border-gray-900 text-sm cursor-pointer"
        />
        {selectedFile && (
          <div className="text-xs text-gray-600">
            SELECTED: {selectedFile.name}
          </div>
        )}
        <button
          onClick={handleUpload}
          disabled={uploading || !selectedFile || !newImageLabel}
          className="px-4 py-2 border-2 border-gray-900 hover:bg-green-500 hover:text-white text-xs w-full cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? 'UPLOADING...' : 'UPLOAD IMAGE'}
        </button>
      </div>

      {/* Existing Images */}
      <div className="grid grid-cols-2 gap-2">
        {poopImages.map(img => (
          <div
            key={img.id}
            className="border-2 border-gray-900 p-2 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <img
                src={img.image_url}
                alt={img.label}
                className="w-8 h-8 object-cover"
              />
              <div className="text-[10px]">{img.label}</div>
            </div>
            <button
              onClick={() => handleDeleteImage(img.id, img.image_url)}
              className="text-red-500 hover:text-red-700 text-sm cursor-pointer"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
