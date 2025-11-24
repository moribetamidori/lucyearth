'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, type BookshelfBook } from '@/lib/supabase';
import { convertToWebP } from '@/lib/imageUpload';
import { ActionButton } from './ActionButtons';

type BookshelfModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isEditMode: boolean;
  onLogActivity: (action: string, details?: string) => void;
};

type BookFormState = {
  title: string;
  author: string;
  spineColor: string;
  spineFontColor: string;
  spineFontSize: number;
  height: number;
  width: number;
  length: number;
  spineTexture: string;
  orderIndex: number;
};

const fallbackSpineColors = ['#fcd34d', '#c4b5fd', '#fca5a5', '#86efac', '#a5f3fc'];

const defaultForm: BookFormState = {
  title: '',
  author: '',
  spineColor: '#d9d2c5',
  spineFontColor: '#0f172a',
  spineFontSize: 12,
  height: 180,
  width: 22,
  length: 120,
  spineTexture: '',
  orderIndex: 0,
};

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const positiveOrDefault = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback;

const sortBooks = (list: BookshelfBook[]) =>
  [...list].sort((a, b) => {
    if (a.order_index === b.order_index) {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    return a.order_index - b.order_index;
  });

const shiftColor = (hex: string, amount: number) => {
  const normalized = hex.replace('#', '');
  if (![3, 6].includes(normalized.length)) return '#d1d5db';

  const full = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized;

  const num = parseInt(full, 16);
  const r = clampNumber(((num >> 16) & 0xff) + amount, 0, 255);
  const g = clampNumber(((num >> 8) & 0xff) + amount, 0, 255);
  const b = clampNumber((num & 0xff) + amount, 0, 255);
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const getShadowColor = (color: string) => shiftColor(color, -25);

const extractFileName = (url: string) => {
  try {
    const parsed = new URL(url);
    const pieces = parsed.pathname.split('/');
    return pieces[pieces.length - 1];
  } catch {
    return url.split('/').pop() || '';
  }
};

export default function BookshelfModal({
  isOpen,
  onClose,
  isEditMode,
  onLogActivity,
}: BookshelfModalProps) {
  const [books, setBooks] = useState<BookshelfBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hoveredBookId, setHoveredBookId] = useState<string | null>(null);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [coverBookId, setCoverBookId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [mobileActionsId, setMobileActionsId] = useState<string | null>(null);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [formState, setFormState] = useState<BookFormState>(defaultForm);

  const activeBook = useMemo(
    () => books.find((book) => book.id === coverBookId) || null,
    [coverBookId, books]
  );

  const detailBook = useMemo(
    () => books.find((book) => book.id === activeBookId) || null,
    [activeBookId, books]
  );

  useEffect(() => {
    if (isOpen) {
      fetchBooks();
      onLogActivity('Opened Bookshelf', 'Browsing the pixel shelf');
    } else {
      setActiveBookId(null);
      setCoverBookId(null);
      setHoveredBookId(null);
      setShowAddForm(false);
    }
  }, [isOpen, onLogActivity]);

  const fetchBooks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('bookshelf_books')
      .select('*')
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to load bookshelf', error);
    } else if (data) {
      const sorted = sortBooks(data);
      setBooks(sorted);
      if (!coverBookId && sorted.length > 0) {
        setActiveBookId(sorted[0].id);
      }
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormState(defaultForm);
    setCoverFile(null);
    setCoverPreview(null);
    setEditingBookId(null);
    setShowAddForm(false);
  };

  const handleSelectCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image for the cover.');
      return;
    }
    setCoverFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setCoverPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.title.trim()) {
      alert('Title is required.');
      return;
    }

    setSaving(true);

    let coverUrl: string | null = null;
    let previousCoverUrl: string | null = null;

    if (editingBookId) {
      const existing = books.find((b) => b.id === editingBookId);
      previousCoverUrl = existing?.cover_url || null;
      coverUrl = existing?.cover_url || null;
    }

    if (coverFile) {
      const webpBlob = await convertToWebP(coverFile, 0.82);
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.webp`;
      const { error: uploadError } = await supabase.storage
        .from('book-covers')
        .upload(fileName, webpBlob, {
          contentType: 'image/webp',
          cacheControl: '3600',
        });

      if (uploadError) {
        console.error('Failed to upload cover', uploadError);
        alert('Could not upload the cover image. Please try again.');
        setSaving(false);
        return;
      }

      const { data } = supabase.storage.from('book-covers').getPublicUrl(fileName);
      coverUrl = data.publicUrl;
    }

    const payload = {
      title: formState.title.trim(),
      author: formState.author.trim() || null,
      spine_color: formState.spineColor,
      spine_font_color: formState.spineFontColor,
      spine_font_size: clampNumber(formState.spineFontSize, 8, 28),
      height: positiveOrDefault(formState.height, 120),
      width: positiveOrDefault(formState.width, 20),
      length: positiveOrDefault(formState.length, 120),
      spine_texture: formState.spineTexture.trim() || null,
      order_index: formState.orderIndex,
      cover_url: coverUrl,
    };

    if (editingBookId) {
      const { data, error } = await supabase
        .from('bookshelf_books')
        .update(payload)
        .eq('id', editingBookId)
        .select()
        .single();

      if (error) {
        console.error('Failed to update book', error);
        alert('Could not update this book. Please try again.');
      } else if (data) {
        setBooks((prev) =>
          sortBooks(prev.map((book) => (book.id === editingBookId ? data : book)))
        );
        onLogActivity('Updated bookshelf book', `"${payload.title}"`);
        setActiveBookId(data.id);
        if (previousCoverUrl && previousCoverUrl !== coverUrl) {
          const previousFile = extractFileName(previousCoverUrl);
          if (previousFile) {
            await supabase.storage.from('book-covers').remove([previousFile]);
          }
        }
        resetForm();
      }
    } else {
      const { data, error } = await supabase
        .from('bookshelf_books')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('Failed to add book', error);
        alert('Could not add this book. Please try again.');
      } else if (data) {
        setBooks((prev) => sortBooks([...prev, data]));
        onLogActivity('Added bookshelf book', `"${payload.title}"`);
        setActiveBookId(data.id);
        resetForm();
      }
    }

    setSaving(false);
  };

  const handleEdit = (book: BookshelfBook) => {
    setEditingBookId(book.id);
    setShowAddForm(true);
    setFormState({
      title: book.title,
      author: book.author || '',
      spineColor: book.spine_color || '#d9d2c5',
      spineFontColor: book.spine_font_color || '#0f172a',
      spineFontSize: book.spine_font_size || 12,
      height: book.height,
      width: book.width,
      length: book.length,
      spineTexture: book.spine_texture || '',
      orderIndex: book.order_index ?? 0,
    });
    setCoverPreview(book.cover_url || null);
    setCoverFile(null);
  };

  const handleDelete = async (book: BookshelfBook) => {
    const confirmed = confirm(`Remove "${book.title}" from the shelf?`);
    if (!confirmed) return;

    const { error } = await supabase
      .from('bookshelf_books')
      .delete()
      .eq('id', book.id);

    if (error) {
      console.error('Failed to delete book', error);
      alert('Could not delete this book. Please try again.');
      return;
    }

    if (book.cover_url) {
      const fileName = extractFileName(book.cover_url);
      if (fileName) {
        await supabase.storage.from('book-covers').remove([fileName]);
      }
    }

    const remaining = books.filter((item) => item.id !== book.id);
    setBooks(sortBooks(remaining));
    if (activeBookId === book.id) {
      setActiveBookId(remaining[0]?.id || null);
    }
    if (editingBookId === book.id) {
      resetForm();
    }
    onLogActivity('Deleted bookshelf book', `"${book.title}"`);
  };

  const handleSelectBook = (book: BookshelfBook) => {
    setActiveBookId(book.id);
    setCoverBookId((current) => (current === book.id ? null : book.id));
    onLogActivity('Opened book cover', book.title);
  };

  const coverSize = useMemo(() => {
    if (!activeBook) return { height: 0, width: 0 };
    const height = positiveOrDefault(activeBook.height + 20, 140);
    const width = positiveOrDefault(activeBook.length, 120);
    return { height, width };
  }, [activeBook]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div
        className="bg-white w-full max-w-6xl h-[90vh] flex flex-col"
        style={{ border: '4px solid #000', boxShadow: '8px 8px 0 0 #000' }}
      >
        <div
          className="p-4 flex items-center justify-between bg-white"
          style={{ borderBottom: '4px solid #000' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">📚</span>
            <div>
              <h2 className="text-2xl font-bold">BOOKSHELF</h2>
              <p className="text-xs text-gray-600 leading-tight">
                  My proud collections
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isEditMode && (
              <button
                onClick={() => {
                  setShowAddForm((prev) => !prev);
                  setEditingBookId(null);
                  setFormState(defaultForm);
                  setCoverFile(null);
                  setCoverPreview(null);
                }}
                className="px-3 py-2 bg-amber-300 hover:bg-amber-400 text-sm font-semibold"
                style={{ border: '3px solid #000', boxShadow: '3px 3px 0 0 #000' }}
              >
                {showAddForm ? 'Close form' : 'Add book'}
              </button>
            )}
            <button
              onClick={onClose}
              className="w-10 h-10 bg-red-500 hover:bg-red-600 text-white font-bold text-xl transition-colors"
              style={{ border: '3px solid #000', boxShadow: '3px 3px 0 0 #000' }}
            >
              ×
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[2fr,1fr] flex-1 overflow-hidden bg-gradient-to-b from-white via-amber-50 to-amber-100">
          <div className="p-6 flex flex-col gap-4">
            <div
              className="relative flex-1 rounded-none"
              style={{ border: '4px solid #000', boxShadow: '6px 6px 0 0 #000' }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,0,0,0.04),transparent_40%)] pointer-events-none" />
              <div className="absolute left-4 right-4 bottom-6 h-4 bg-amber-200 border-4 border-black" />
              {activeBook && (
                <div
                  className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center gap-3 px-6 pb-12 pt-16"
                  style={{ zIndex: 50 }}
                >
                  <div
                    className="relative flex items-center justify-center bg-white"
                    style={{
                      width: `${coverSize.width}px`,
                      height: `${coverSize.height}px`,
                      maxHeight: '70vh',
                      maxWidth: '90vw',
                      border: '4px solid #000',
                      boxShadow: '6px 8px 0 0 rgba(0,0,0,0.28)',
                    }}
                  >
                    {activeBook.cover_url ? (
                      <img
                        src={activeBook.cover_url}
                        alt={activeBook.title}
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-amber-100 to-amber-300" />
                    )}
                  </div>
                  <div className="px-3 py-1 bg-black text-white text-[10px] tracking-[0.08em] shadow-[4px_4px_0_rgba(0,0,0,0.35)]">
                    {activeBook.title}
                  </div>
                </div>
              )}
              <div className="relative h-full overflow-x-auto overflow-y-hidden px-5">
                <div className="flex items-end gap-0 h-full pb-10">
                  {loading && <div className="text-sm text-gray-600">Loading shelf...</div>}
                  {!loading && books.length === 0 && (
                    <div className="text-sm text-gray-700">
                      Shelf is empty. Add a book to see it stand here.
                    </div>
                  )}
                  {books.map((book) => {
                    const topColor = shiftColor(book.spine_color || fallbackSpineColors[0], 18);
                    const shade = getShadowColor(book.spine_color || fallbackSpineColors[0]);
                    const isHovered = hoveredBookId === book.id;
                    const isActive = activeBookId === book.id;

                    return (
                      <div
                        key={book.id}
                        className="group relative flex flex-col justify-end"
                        style={{ height: book.height + 28, minWidth: book.width + 2 }}
                        onMouseEnter={() => setHoveredBookId(book.id)}
                        onMouseLeave={() => setHoveredBookId(null)}
                        onClick={() => handleSelectBook(book)}
                      >
                        <div
                          className={`relative flex justify-center items-start cursor-pointer transition-transform duration-150 ease-out`}
                          style={{
                            height: `${book.height}px`,
                            width: `${book.width}px`,
                            transform: isHovered ? 'translateY(-10px) scaleX(1.08)' : 'translateY(0)',
                            zIndex: 30,
                          }}
                        >
                          <div
                            className="relative h-full w-full flex items-center justify-center"
                            style={{
                              background: `linear-gradient(180deg, ${topColor} 0%, ${book.spine_color} 55%, ${shade} 100%)`,
                              border: '3px solid #000',
                              boxShadow: '4px 6px 0 rgba(0,0,0,0.35)',
                              paddingTop: '18px',
                              paddingBottom: '10px',
                            }}
                          >
                            <div
                              className="absolute inset-1 opacity-60 pointer-events-none"
                              style={{
                                background: book.spine_texture
                                  ? `url(${book.spine_texture}) center/cover repeat`
                                  : 'repeating-linear-gradient(90deg, transparent, transparent 6px, rgba(255,255,255,0.08) 8px)',
                              }}
                            />
                            <div
                              className="relative font-bold tracking-[0.08em] text-center"
                              style={{
                                writingMode: 'vertical-rl',
                                textOrientation: 'mixed',
                                opacity: isHovered || isActive ? 1 : 0.72,
                                color: book.spine_font_color || '#0f172a',
                                fontSize: `${clampNumber(book.spine_font_size || 12, 8, 28)}px`,
                              }}
                            >
                              {book.title}
                            </div>
                          </div>
                        </div>
                        {isEditMode && (
                          <>
                            <button
                              className="sm:hidden absolute left-1/2 -translate-x-1/2 -bottom-3 bg-black text-white text-[10px] px-2 py-1"
                              style={{ boxShadow: '2px 2px 0 0 #000', zIndex: 45 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setMobileActionsId((prev) => (prev === book.id ? null : book.id));
                              }}
                            >
                              ⋮
                            </button>
                            <div
                              className={`absolute -right-2 top-1 flex flex-col gap-1 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto ${
                                mobileActionsId === book.id ? 'opacity-100 sm:opacity-100' : 'opacity-0 sm:opacity-0 group-hover:opacity-100 sm:group-hover:opacity-100'
                              }`}
                              style={{ zIndex: 45 }}
                            >
                              <ActionButton
                                variant="edit"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(book);
                                }}
                              />
                              <ActionButton
                                variant="delete"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(book);
                                }}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div
            className="bg-white h-full overflow-y-auto flex flex-col gap-4 p-6"
            style={{ borderLeft: '4px solid #000' }}
          >
            <div
              className="border-4 border-black p-4 space-y-3 bg-amber-50"
              style={{ boxShadow: '4px 4px 0 0 #000' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-black animate-pulse" />
                <div className="text-lg font-bold">BOOK DETAILS</div>
              </div>
              {detailBook ? (
                <div className="space-y-1 text-sm leading-tight">
                  <div className="font-semibold">{detailBook.title}</div>
                  {detailBook.author && <div className="text-gray-700">by {detailBook.author}</div>}
                  <div className="text-gray-700">
                    Height {detailBook.height}px · Width {detailBook.width}px · Length{' '}
                    {detailBook.length}px
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Spine</span>
                    <div
                      className="w-6 h-4 border border-black"
                      style={{ background: detailBook.spine_color || fallbackSpineColors[0] }}
                    />
                    <div
                      className="w-6 h-4 border border-black"
                      style={{ background: detailBook.spine_font_color || '#0f172a' }}
                      title="Title color"
                    />
                    <span className="text-xs text-gray-600">
                      {detailBook.spine_font_size || 12}px
                    </span>
                  </div>
                  {detailBook.spine_texture && (
                    <div className="text-gray-700 truncate">
                      Texture: {detailBook.spine_texture}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-600">Click a book to preview its cover.</div>
              )}
            </div>

            {isEditMode && showAddForm && (
              <form
                onSubmit={handleSubmit}
                className="border-4 border-dashed border-black p-4 space-y-3 bg-white"
                style={{ boxShadow: '4px 4px 0 0 #000' }}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm">
                    {editingBookId ? 'Edit Book' : 'Add Book'}
                  </div>
                  {editingBookId && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="text-xs underline text-gray-700 hover:text-black"
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <label className="flex flex-col gap-1">
                    Title
                    <input
                      type="text"
                      value={formState.title}
                      onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                      className="border-2 border-black px-2 py-1"
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Author (optional)
                    <input
                      type="text"
                      value={formState.author}
                      onChange={(e) => setFormState({ ...formState, author: e.target.value })}
                      className="border-2 border-black px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Spine color
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formState.spineColor}
                        onChange={(e) => setFormState({ ...formState, spineColor: e.target.value })}
                        className="h-10 w-12 border-2 border-black"
                      />
                      <input
                        type="text"
                        value={formState.spineColor}
                        onChange={(e) => setFormState({ ...formState, spineColor: e.target.value })}
                        className="flex-1 border-2 border-black px-2 py-1"
                      />
                    </div>
                  </label>
                  <label className="flex flex-col gap-1">
                    Spine font color
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formState.spineFontColor}
                        onChange={(e) =>
                          setFormState({ ...formState, spineFontColor: e.target.value })
                        }
                        className="h-10 w-12 border-2 border-black"
                      />
                      <input
                        type="text"
                        value={formState.spineFontColor}
                        onChange={(e) =>
                          setFormState({ ...formState, spineFontColor: e.target.value })
                        }
                        className="flex-1 border-2 border-black px-2 py-1"
                      />
                    </div>
                  </label>
                  <label className="flex flex-col gap-1">
                    Spine font size (px)
                    <input
                      type="number"
                      min={8}
                      max={28}
                      value={formState.spineFontSize}
                      onChange={(e) =>
                        setFormState({ ...formState, spineFontSize: Number(e.target.value) || 0 })
                      }
                      className="border-2 border-black px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Spine texture (url, optional)
                    <input
                      type="text"
                      value={formState.spineTexture}
                      onChange={(e) => setFormState({ ...formState, spineTexture: e.target.value })}
                      className="border-2 border-black px-2 py-1"
                      placeholder="Pattern or noise texture URL"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Height (px)
                    <input
                      type="number"
                      value={formState.height}
                      onChange={(e) =>
                        setFormState({ ...formState, height: Number(e.target.value) || 0 })
                      }
                      className="border-2 border-black px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Width / spine (px)
                    <input
                      type="number"
                      value={formState.width}
                      onChange={(e) =>
                        setFormState({ ...formState, width: Number(e.target.value) || 0 })
                      }
                      className="border-2 border-black px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Length / depth (px)
                    <input
                      type="number"
                      value={formState.length}
                      onChange={(e) =>
                        setFormState({ ...formState, length: Number(e.target.value) || 0 })
                      }
                      className="border-2 border-black px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Order index
                    <input
                      type="number"
                      value={formState.orderIndex}
                      onChange={(e) =>
                        setFormState({ ...formState, orderIndex: Number(e.target.value) || 0 })
                      }
                      className="border-2 border-black px-2 py-1"
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-sm">
                  Cover image (shows when clicked)
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleSelectCover}
                    className="text-xs"
                  />
                  {coverPreview && (
                    <div
                      className="relative border-2 border-black bg-white flex items-center justify-center"
                      style={{
                        height: `${positiveOrDefault(formState.height + 20, 140)}px`,
                        width: `${positiveOrDefault(formState.length, 120)}px`,
                      }}
                    >
                      <img
                        src={coverPreview}
                        alt="Cover preview"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  )}
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-black text-white py-2 text-sm tracking-wide hover:bg-gray-900 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editingBookId ? 'Update Book' : 'Add Book'}
                </button>
              </form>
            )}

            {!isEditMode && (
              <div className="text-xs text-gray-600 leading-relaxed">
                Books here know their height, width, and length. Hover to fatten a spine; click to
                pull it forward and show the cover.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
