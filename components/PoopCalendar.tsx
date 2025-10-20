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
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

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
      .select('*')
      .order('created_at', { ascending: true });

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
    const existingEntries = calendarEntries.filter(e => e.date === dateStr);

    if (!isEditMode) {
      // View mode - show entries if they exist
      if (existingEntries.length > 0) {
        setSelectedDate(dateStr);
        setShowViewModal(true);
      }
      return;
    }

    // Edit mode - always open picker to add new entry
    setSelectedDate(dateStr);
    setNoteText('');
    setSelectedImageId(null);
    setShowImagePicker(true);
  };

  const handleSaveEntry = async (closeAfter: boolean = false) => {
    if (!selectedDate || !selectedImageId) return;

    console.log('Saving entry:', { date: selectedDate, poop_image_id: selectedImageId, notes: noteText, editingEntryId });

    let error;

    if (editingEntryId) {
      // Update existing entry
      const result = await supabase
        .from('calendar_entries')
        .update({
          poop_image_id: selectedImageId,
          notes: noteText || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingEntryId);
      error = result.error;
    } else {
      // Insert new entry
      const result = await supabase
        .from('calendar_entries')
        .insert({
          date: selectedDate,
          poop_image_id: selectedImageId,
          notes: noteText || null,
          updated_at: new Date().toISOString(),
        });
      error = result.error;
    }

    if (error) {
      console.error('Error saving entry:', error);
      alert(`Failed to save entry: ${error.message}`);
      return;
    }

    console.log('Entry saved successfully');
    await fetchCalendarEntries();
    setNoteText('');
    setSelectedImageId(null);
    setEditingEntryId(null);

    if (closeAfter) {
      setShowImagePicker(false);
      setSelectedDate(null);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm('Are you sure you want to delete this entry?')) return;

    const { error } = await supabase
      .from('calendar_entries')
      .delete()
      .eq('id', entryId);

    if (error) {
      console.error('Error deleting entry:', error);
      alert(`Failed to delete entry: ${error.message}`);
      return;
    }

    await fetchCalendarEntries();
  };

  const handleEditEntry = (entry: CalendarEntry) => {
    setEditingEntryId(entry.id);
    setSelectedImageId(entry.poop_image_id);
    setNoteText(entry.notes || '');
  };

  const getEntriesForDate = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return calendarEntries.filter(e => e.date === dateStr);
  };

  const getPoopImageForDate = (day: number) => {
    const entries = getEntriesForDate(day);
    if (entries.length > 0 && entries[0].poop_image_id) {
      return poopImages.find(img => img.id === entries[0].poop_image_id);
    }
    return null;
  };

  const hasNoteForDate = (day: number) => {
    const entries = getEntriesForDate(day);
    return entries.some(entry => entry.notes && entry.notes.trim().length > 0);
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
            const entries = getEntriesForDate(day);
            const poopImage = getPoopImageForDate(day);
            const hasNote = hasNoteForDate(day);
            const hasEntry = entries.length > 0;
            const additionalCount = entries.length - 1;

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
                      {additionalCount > 0 && <span className="text-[8px]">+{additionalCount}</span>}
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
                  <div className="absolute top-1 left-1 text-xs hidden sm:block" title="Has note">
                    📝
                  </div>
                )}
                {additionalCount > 0 && (
                  <div className="absolute top-1 right-1 text-[10px] font-bold text-blue-600 hidden sm:block">
                    +{additionalCount}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Image Picker Modal */}
        {showImagePicker && selectedDate && (
          <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white border-4 border-gray-900 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h3 className="text-base mb-4">
                {editingEntryId ? 'EDIT POOP ENTRY' : 'ADD POOP ENTRY'} - {selectedDate}
              </h3>

              {/* Show existing entries for this date */}
              {getEntriesForDate(parseInt(selectedDate.split('-')[2])).length > 0 && (
                <div className="mb-4 p-4 border-2 border-gray-900 bg-gray-50">
                  <div className="text-xs text-gray-500 mb-2">
                    EXISTING ENTRIES FOR THIS DAY ({getEntriesForDate(parseInt(selectedDate.split('-')[2])).length})
                  </div>
                  <div className="space-y-2">
                    {getEntriesForDate(parseInt(selectedDate.split('-')[2])).map((entry, idx) => {
                      const img = poopImages.find(img => img.id === entry.poop_image_id);
                      const isEditing = editingEntryId === entry.id;
                      return (
                        <div
                          key={entry.id || idx}
                          className={`flex items-center justify-between p-2 border-2 transition-colors ${
                            isEditing ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 text-xs">
                            {img && (
                              <img src={img.image_url} alt={img.label} className="w-8 h-8 object-cover" />
                            )}
                            <span>{img?.label}</span>
                            {entry.notes && <span className="text-gray-500" title={entry.notes}>📝</span>}
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEditEntry(entry)}
                              className="px-2 py-1 border border-gray-900 hover:bg-blue-500 hover:text-white text-[10px] cursor-pointer"
                            >
                              {isEditing ? 'EDITING' : 'EDIT'}
                            </button>
                            <button
                              onClick={() => handleDeleteEntry(entry.id)}
                              className="px-2 py-1 border border-gray-900 hover:bg-red-500 hover:text-white text-[10px] cursor-pointer"
                            >
                              DELETE
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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
                {!editingEntryId && (
                  <button
                    onClick={() => handleSaveEntry(false)}
                    disabled={!selectedImageId}
                    className="flex-1 px-4 py-2 border-2 border-gray-900 hover:bg-blue-500 hover:text-white text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ADD ANOTHER ENTRY
                  </button>
                )}
                <button
                  onClick={() => handleSaveEntry(true)}
                  disabled={!selectedImageId}
                  className="flex-1 px-4 py-2 border-2 border-gray-900 hover:bg-green-500 hover:text-white text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingEntryId ? 'UPDATE & CLOSE' : 'SAVE & CLOSE'}
                </button>
                <button
                  onClick={() => {
                    setShowImagePicker(false);
                    setSelectedDate(null);
                    setNoteText('');
                    setSelectedImageId(null);
                    setEditingEntryId(null);
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
        {showViewModal && selectedDate && (
          <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white border-4 border-gray-900 max-w-2xl w-full max-h-[90vh] overflow-y-auto p-8">
              <h3 className="text-base mb-4">ENTRIES FOR {selectedDate}</h3>
              <div className="space-y-6">
                {getEntriesForDate(parseInt(selectedDate.split('-')[2])).map((entry, idx) => {
                  const image = poopImages.find(img => img.id === entry.poop_image_id);
                  return (
                    <div key={entry.id || idx} className="border-2 border-gray-900 p-4">
                      <div className="text-xs text-gray-500 mb-2">ENTRY {idx + 1}</div>
                      <div className="flex flex-col items-center">
                        {image && (
                          <div className="flex flex-col items-center mb-4">
                            <img
                              src={image.image_url}
                              alt={image.label}
                              className="max-w-full max-h-64 object-contain mb-2"
                            />
                            <div className="text-sm font-semibold">{image.label}</div>
                          </div>
                        )}
                        {entry.notes && (
                          <div className="w-full p-4 border-2 border-gray-900 bg-gray-50">
                            <div className="text-xs text-gray-500 mb-2">NOTE</div>
                            <div className="text-sm whitespace-pre-wrap">{entry.notes}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setSelectedDate(null);
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
