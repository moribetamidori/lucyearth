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
import Image from 'next/image';
import ImageLightbox from './ImageLightbox';
import { ActionButtonGroup } from './ActionButtons';

type TimelineModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isEditMode: boolean;
  onLogActivity?: (action: string, details?: string) => void;
};

const timelineColors = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#ef4444'];
const weekdayLabels = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const PAGE_SIZE = 10;

type TimelineImage = {
  url: string;
  filename: string | null;
};

const getToday = () => new Date().toISOString().slice(0, 10);
const getCurrentTime = () => new Date().toISOString().slice(11, 16);
const getStartOfMonth = (baseDate = new Date()) =>
  new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
const formatDateKeyFromParts = (year: number, monthIndex: number, day: number) =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const parseDateKey = (dateKey: string) => {
  const [yearStr, monthStr, dayStr] = dateKey.split('-');
  return {
    year: Number(yearStr),
    month: Number(monthStr) - 1,
    day: Number(dayStr),
  };
};
const isDateKeyInMonth = (dateKey: string | null, monthDate: Date) => {
  if (!dateKey) return false;
  const parsed = parseDateKey(dateKey);
  return parsed.year === monthDate.getFullYear() && parsed.month === monthDate.getMonth();
};
const getMonthMetadata = (monthDate: Date) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return {
    daysInMonth,
    startingDayOfWeek: firstDay.getDay(),
  };
};
const getDisplayLabelForDateKey = (dateKey: string) => {
  const parsed = parseDateKey(dateKey);
  const dateObj = new Date(parsed.year, parsed.month, parsed.day);
  return dateObj.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const sortEntries = (items: TimelineEntry[]) =>
  [...items].sort(
    (a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime()
  );

const mapEntryImages = (entry: TimelineEntry): TimelineImage[] => {
  if (entry.image_urls && entry.image_urls.length > 0) {
    return entry.image_urls
      .map((url, index) => ({
        url,
        filename: entry.image_filenames?.[index] ?? null,
      }))
      .filter((item): item is TimelineImage => Boolean(item.url));
  }

  if (entry.image_url) {
    return [
      {
        url: entry.image_url,
        filename: entry.image_filename || null,
      },
    ];
  }

  return [];
};

const getEntryImageUrls = (entry: TimelineEntry) => mapEntryImages(entry).map((image) => image.url);

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
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<TimelineImage[]>([]);
  const [editingEntry, setEditingEntry] = useState<TimelineEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);
  const [imagesMarkedForRemoval, setImagesMarkedForRemoval] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'timeline' | 'calendar'>('timeline');
  const [calendarMonth, setCalendarMonth] = useState(() => getStartOfMonth());
  const [calendarEntries, setCalendarEntries] = useState<TimelineEntry[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const refreshCalendarView = useCallback(() => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth(), 1));
  }, []);
  const revokeObjectUrls = useCallback((urls: string[]) => {
    urls.forEach((url) => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
  }, []);

  const resetForm = useCallback(() => {
    setTitle('');
    setDetails('');
    setEventDate(getToday());
    setEventTime(getCurrentTime());
    setNewImageFiles([]);
    setExistingImages([]);
    setImagesMarkedForRemoval([]);
    setEditingEntry(null);
    setNewImagePreviews((prev) => {
      revokeObjectUrls(prev);
      return [];
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [revokeObjectUrls]);

  const loadEntries = useCallback(
    async (options?: { offset?: number; append?: boolean }) => {
      const { offset = 0, append = false } = options || {};
      if (append) {
        setLoadingMore(true);
        setLoadMoreError(null);
      } else {
        setLoading(true);
        setError(null);
        setLoadMoreError(null);
      }
      const { data, error } = await supabase
        .from('timeline_entries')
        .select('*')
        .order('event_time', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.error('Failed to load timeline entries:', error);
        if (append) {
          setLoadMoreError('Failed to load more entries. Please try again.');
        } else {
          setError('Failed to load timeline. Please try again later.');
        }
      } else {
        const fetched = data || [];
        if (append) {
          setEntries((prev) => {
            const existingIds = new Set(prev.map((item) => item.id));
            const deduped = fetched.filter((item) => !existingIds.has(item.id));
            return [...prev, ...deduped];
          });
        } else {
          setEntries(fetched);
        }
        setHasMore(fetched.length === PAGE_SIZE);
      }
      if (append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    },
    []
  );

  const handleLoadMore = useCallback(() => {
    if (loadingMore) return;
    loadEntries({ offset: entries.length, append: true });
  }, [entries.length, loadEntries, loadingMore]);

  useEffect(() => {
    if (isOpen) {
      loadEntries();
      if (onLogActivity) {
        onLogActivity('Opened Timeline', 'Viewing life timeline entries');
      }
    } else {
      resetForm();
      setViewMode('timeline');
      setCalendarEntries([]);
      setCalendarError(null);
      setCalendarLoading(false);
      setSelectedCalendarDate(null);
      setCalendarMonth(getStartOfMonth());
    }
  }, [isOpen, loadEntries, onLogActivity, resetForm]);

  useEffect(() => {
    if (!isEditMode) {
      resetForm();
    }
  }, [isEditMode, resetForm]);

  useEffect(() => {
    return () => {
      revokeObjectUrls(newImagePreviews);
    };
  }, [newImagePreviews, revokeObjectUrls]);

  useEffect(() => {
    if (!isOpen || viewMode !== 'calendar') return;
    let active = true;

    const fetchMonthEntries = async () => {
      setCalendarLoading(true);
      setCalendarError(null);
      const start = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
      const end = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
      const { data, error } = await supabase
        .from('timeline_entries')
        .select('*')
        .gte('event_time', start.toISOString())
        .lt('event_time', end.toISOString())
        .order('event_time', { ascending: true });

      if (!active) return;

      if (error) {
        console.error('Failed to load calendar entries:', error);
        setCalendarEntries([]);
        setCalendarError('Failed to load calendar data. Please try again.');
      } else {
        const fetched = data || [];
        setCalendarEntries(fetched);
        setSelectedCalendarDate((prev) => {
          if (prev && isDateKeyInMonth(prev, calendarMonth)) {
            return prev;
          }
          const todayKey = getToday();
          if (isDateKeyInMonth(todayKey, calendarMonth)) {
            return todayKey;
          }
          return fetched.length > 0 ? fetched[0].event_time.slice(0, 10) : null;
        });
      }
      setCalendarLoading(false);
    };

    fetchMonthEntries();
    return () => {
      active = false;
    };
  }, [calendarMonth, isOpen, viewMode]);

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const selectedFiles = Array.from(fileList);
    const imageFiles = selectedFiles.filter((file) => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      alert('Please select image files only.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    if (imageFiles.length !== selectedFiles.length) {
      alert('Some files were skipped because they are not images.');
    }

    const previewUrls = imageFiles.map((file) => URL.createObjectURL(file));
    setNewImageFiles((prev) => [...prev, ...imageFiles]);
    setNewImagePreviews((prev) => [...prev, ...previewUrls]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveExistingImage = (index: number) => {
    setExistingImages((prev) => {
      const target = prev[index];
      if (target?.filename) {
        setImagesMarkedForRemoval((prevRemoval) =>
          prevRemoval.includes(target.filename!)
            ? prevRemoval
            : [...prevRemoval, target.filename!]
        );
      }
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const handleRemoveNewImage = (index: number) => {
    setNewImageFiles((prev) => prev.filter((_, idx) => idx !== index));
    setNewImagePreviews((prev) => {
      const target = prev[index];
      if (target && target.startsWith('blob:')) {
        URL.revokeObjectURL(target);
      }
      return prev.filter((_, idx) => idx !== index);
    });
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
    setExistingImages(mapEntryImages(entry));
    setImagesMarkedForRemoval([]);
    setNewImageFiles([]);
    setNewImagePreviews((prev) => {
      revokeObjectUrls(prev);
      return [];
    });
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

      const filenamesToRemove = mapEntryImages(entry)
        .map((image) => image.filename)
        .filter((filename): filename is string => Boolean(filename));

      if (filenamesToRemove.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('timeline-images')
          .remove(filenamesToRemove);
        if (storageError) {
          console.warn('Failed to remove timeline image:', storageError);
        }
      }

      setEntries((prev) => prev.filter((item) => item.id !== entry.id));
      if (viewMode === 'calendar') {
        refreshCalendarView();
      }
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
      if (imagesMarkedForRemoval.length > 0) {
        const { error: removeError } = await supabase.storage
          .from('timeline-images')
          .remove(imagesMarkedForRemoval);
        if (removeError) {
          console.warn('Failed to delete previous timeline images:', removeError);
        }
        setImagesMarkedForRemoval([]);
      }

      const uploads =
        newImageFiles.length > 0
          ? await Promise.all(newImageFiles.map((file) => uploadImage(file)))
          : [];

      const allImages: TimelineImage[] = [
        ...existingImages,
        ...uploads.map((upload) => ({
          url: upload.publicUrl,
          filename: upload.fileName,
        })),
      ];
      const imageUrls = allImages.length > 0 ? allImages.map((image) => image.url) : null;
      const imageFilenames =
        allImages.length > 0 ? allImages.map((image) => image.filename ?? null) : null;
      const primaryImage = allImages[0] ?? null;

      const payload = {
        title: title.trim(),
        details: details.trim() ? details.trim() : null,
        event_time: timestamp.toISOString(),
        image_url: primaryImage?.url ?? null,
        image_filename: primaryImage?.filename ?? null,
        image_urls: imageUrls,
        image_filenames: imageFilenames,
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
        if (viewMode === 'calendar') {
          refreshCalendarView();
        }
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
        if (viewMode === 'calendar') {
          refreshCalendarView();
        }
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


  const calendarEntriesByDate = useMemo(() => {
    const grouped: Record<string, TimelineEntry[]> = {};
    calendarEntries.forEach((entry) => {
      const dateKey = entry.event_time.slice(0, 10);
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(entry);
    });
    Object.keys(grouped).forEach((key) => {
      grouped[key].sort(
        (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
      );
    });
    return grouped;
  }, [calendarEntries]);

  const selectedCalendarEntries = useMemo(() => {
    if (!selectedCalendarDate) return [];
    return calendarEntriesByDate[selectedCalendarDate] || [];
  }, [calendarEntriesByDate, selectedCalendarDate]);

  const calendarMonthMeta = useMemo(() => getMonthMetadata(calendarMonth), [calendarMonth]);

  const calendarMonthLabel = useMemo(
    () =>
      calendarMonth.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    [calendarMonth]
  );
  const { daysInMonth, startingDayOfWeek } = calendarMonthMeta;

  const handleOpenLightbox = (images: string[], initialIndex = 0) => {
    setLightboxImages(images);
    setLightboxIndex(initialIndex);
    setShowLightbox(true);
  };

  const handleCalendarDayClick = (day: number) => {
    const dateKey = formatDateKeyFromParts(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      day
    );
    setSelectedCalendarDate(dateKey);
  };

  const goToPrevMonth = () => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const renderTimelineView = () => (
    <>
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
            const entryImages = getEntryImageUrls(entry);
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
                    <div className="text-xs text-gray-500">#{entries.length - index}</div>
                  </div>
                  <div className="mt-3">
                    <div className="text-lg font-bold">{entry.title}</div>
                    {entry.details && (
                      <div className="text-sm text-gray-700 mt-1 whitespace-pre-line">
                        {entry.details}
                      </div>
                    )}
                  </div>
                  {entryImages.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {entryImages.map((imageUrl, imageIndex) => (
                        <div
                          key={`${entry.id}-${imageIndex}`}
                          className="relative w-28 h-28 border-2 border-gray-900 overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform"
                          onClick={() => handleOpenLightbox(entryImages, imageIndex)}
                        >
                          <Image
                            src={imageUrl}
                            alt={`${entry.title} image ${imageIndex + 1}`}
                            fill
                            sizes="112px"
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {hasMore && (
            <div className="pt-2 text-center space-y-2">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-4 py-2 border-2 border-gray-900 bg-white text-sm font-semibold hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loadingMore ? 'Loading...' : 'Load more entries'}
              </button>
              {loadMoreError && <div className="text-xs text-red-500">{loadMoreError}</div>}
            </div>
          )}
        </div>
      )}
    </>
  );

  const renderCalendarView = () => (
    <div className="h-full flex flex-col">
      {calendarLoading ? (
        <div className="text-center text-gray-500 mt-20">Loading calendar...</div>
      ) : calendarError ? (
        <div className="text-center text-red-500 mt-20">{calendarError}</div>
      ) : (
        <div className="border-2 border-gray-900 bg-white shadow-[4px_4px_0_0_#000] p-4">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={goToPrevMonth}
              className="px-3 py-1 border-2 border-gray-900 text-xs font-semibold hover:bg-blue-100"
              aria-label="Previous month"
            >
              {'<'}
            </button>
            <div className="text-base font-bold tracking-wide">
              {calendarMonthLabel.toUpperCase()}
            </div>
            <button
              type="button"
              onClick={goToNextMonth}
              className="px-3 py-1 border-2 border-gray-900 text-xs font-semibold hover:bg-blue-100"
              aria-label="Next month"
            >
              {'>'}
            </button>
          </div>
          <div className="grid grid-cols-7 gap-2 text-[10px] text-gray-500 mb-2">
            {weekdayLabels.map((day) => (
              <div key={day} className="text-center tracking-wide">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: startingDayOfWeek }).map((_, idx) => (
              <div key={`empty-${idx}`} className="aspect-square" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const dateKey = formatDateKeyFromParts(
                calendarMonth.getFullYear(),
                calendarMonth.getMonth(),
                day
              );
              const entryCount = calendarEntriesByDate[dateKey]?.length || 0;
              const isSelected = selectedCalendarDate === dateKey;
              const isToday = dateKey === getToday();
              const dotsToShow = Math.min(entryCount, 4);
              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => handleCalendarDayClick(day)}
                  className={`aspect-square border-2 border-gray-900 flex flex-col items-center justify-center transition-colors p-1 cursor-pointer ${isSelected
                      ? 'bg-yellow-100'
                      : entryCount > 0
                        ? 'bg-white hover:bg-gray-100'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                >
                  <div className="text-xs font-semibold">
                    {day}
                    {isToday && <span className="ml-1 text-[10px] text-blue-600">•</span>}
                  </div>
                  {entryCount > 0 && (
                    <div className="flex flex-wrap items-center justify-center gap-[2px] mt-1">
                      {Array.from({ length: dotsToShow }).map((_, dotIdx) => (
                        <span
                          key={`${dateKey}-dot-${dotIdx}`}
                          className="w-2 h-2 rounded-full border border-gray-900"
                          style={{
                            backgroundColor:
                              timelineColors[(dotIdx + entryCount) % timelineColors.length],
                          }}
                        />
                      ))}
                      {entryCount > dotsToShow && (
                        <span className="text-[10px] font-semibold text-blue-600">
                          +{entryCount - dotsToShow}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const renderCalendarEntriesPanel = () => (
    <div className="min-h-[60vh] lg:min-h-0 lg:min-w-[45%] lg:w-[50%] max-w-[420px] lg:max-w-[360px] border-t-4 lg:border-t-0 lg:border-l-4 border-gray-900 p-4 flex flex-col bg-white overflow-y-auto">
      <div className="text-xs text-gray-500 tracking-[0.2em] uppercase">
        {selectedCalendarDate
          ? `Entries for ${getDisplayLabelForDateKey(selectedCalendarDate)}`
          : 'Select a day to view entries'}
      </div>
      {selectedCalendarDate ? (
        selectedCalendarEntries.length > 0 ? (
          <div className="mt-4 space-y-4 overflow-y-auto pr-1">
            {selectedCalendarEntries.map((entry) => {
              const entryImages = getEntryImageUrls(entry);
              const entryDate = new Date(entry.event_time);
              const timeLabel = entryDate.toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
              });
              return (
                <div
                  key={entry.id}
                  className="border-2 border-gray-900 p-3 shadow-[3px_3px_0_0_#000] bg-white relative"
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
                  <div className="flex items-center justify-between text-xs text-gray-500 pr-12">
                    <span>{timeLabel}</span>
                    {entryImages.length > 0 && (
                      <span>
                        {entryImages.length} photo
                        {entryImages.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-base font-semibold">{entry.title}</div>
                  {entry.details && (
                    <div className="text-sm text-gray-700 mt-1 whitespace-pre-line">
                      {entry.details}
                    </div>
                  )}
                  {entryImages.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {entryImages.map((imageUrl, imageIndex) => (
                        <div
                          key={`${entry.id}-calendar-${imageIndex}`}
                          className="relative w-24 h-24 border-2 border-gray-900 overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform"
                          onClick={() => handleOpenLightbox(entryImages, imageIndex)}
                        >
                          <Image
                            src={imageUrl}
                            alt={`${entry.title} image ${imageIndex + 1}`}
                            fill
                            sizes="96px"
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 text-sm text-gray-500">
            {`No entries logged on ${getDisplayLabelForDateKey(selectedCalendarDate)}.`}
          </div>
        )
      ) : (
        <div className="mt-6 text-sm text-gray-500">
          Choose a date on the calendar to preview your notes.
        </div>
      )}
    </div>
  );

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
          <div className="p-4 border-b-4 border-gray-900 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-2xl font-bold tracking-wider">TIMELINE</div>
            </div>
            <div className="flex flex-wrap items-center gap-3 justify-between sm:justify-end">
              <div className="flex border-2 border-gray-900 divide-x-2 divide-gray-900 text-xs font-semibold bg-white shadow-[4px_4px_0_0_#000]">
                <button
                  type="button"
                  onClick={() => setViewMode('timeline')}
                  aria-pressed={viewMode === 'timeline'}
                  className={`px-3 py-1 tracking-wide ${viewMode === 'timeline'
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                >
                  TIMELINE
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('calendar')}
                  aria-pressed={viewMode === 'calendar'}
                  className={`px-3 py-1 tracking-wide ${viewMode === 'calendar'
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                >
                  CALENDAR
                </button>
              </div>
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
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
            {/* Timeline / Calendar column */}
            <div className="flex-1 min-h-[45vh] lg:min-h-0 lg:min-w-[50%] overflow-y-auto p-4 relative">
              {viewMode === 'timeline' ? renderTimelineView() : renderCalendarView()}
            </div>

            {viewMode === 'timeline' && isEditMode && (
              <div className="min-h-[60vh] lg:min-h-0 lg:min-w-[45%] lg:w-[50%] max-w-[420px] border-t-4 lg:border-t-0 lg:border-l-4 border-gray-900 p-4 flex flex-col overflow-hidden">
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
                <form
                  onSubmit={handleSubmit}
                  className="space-y-3 overflow-y-auto pr-1 flex-1 min-h-0"
                >
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
                    <label className="text-xs font-semibold text-gray-600">
                      Images <span className="text-gray-400">(optional)</span>
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,.heic,.heif"
                      multiple
                      onChange={handleImageChange}
                      className="mt-1 w-full text-xs"
                    />
                    {existingImages.length > 0 && (
                      <div className="mt-2">
                        <div className="text-[10px] uppercase text-gray-500 tracking-wide mb-1">
                          Existing
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {existingImages.map((image, index) => (
                            <div
                              key={`${image.filename ?? image.url}-${index}`}
                              className="relative w-20 h-20 border-2 border-gray-900 overflow-hidden"
                            >
                              <Image
                                src={image.url}
                                alt={`Existing upload ${index + 1}`}
                                fill
                                sizes="80px"
                                className="object-cover"
                                unoptimized
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveExistingImage(index)}
                                className="absolute -top-2 -right-2 w-6 h-6 bg-gray-900 text-white text-xs flex items-center justify-center hover:bg-red-600"
                                aria-label="Remove existing image"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {newImagePreviews.length > 0 && (
                      <div className="mt-2">
                        <div className="text-[10px] uppercase text-gray-500 tracking-wide mb-1">
                          New uploads
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {newImagePreviews.map((preview, index) => (
                            <div
                              key={`new-${index}`}
                              className="relative w-20 h-20 border-2 border-gray-900 overflow-hidden"
                            >
                              <Image
                                src={preview}
                                alt={`New upload ${index + 1}`}
                                fill
                                sizes="80px"
                                className="object-cover"
                                unoptimized
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveNewImage(index)}
                                className="absolute -top-2 -right-2 w-6 h-6 bg-gray-900 text-white text-xs flex items-center justify-center hover:bg-red-600"
                                aria-label="Remove new image"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {imagesMarkedForRemoval.length > 0 && editingEntry && (
                      <div className="text-xs text-gray-500 mt-1">
                        Removed images will be deleted once you save.
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
              </div>
            )}
            {viewMode === 'calendar' && (
              renderCalendarEntriesPanel()
            )}
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
