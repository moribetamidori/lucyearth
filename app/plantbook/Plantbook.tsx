'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import { convertToWebP } from '@/lib/imageUpload';
import { supabase, type PlantbookElement, type PlantbookEntry } from '@/lib/supabase';
import { appStorage } from '@/lib/storage';
import styles from './plantbook.module.css';

const STORAGE_BUCKET = 'plantbook-images';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type PartKey = 'plant' | 'element' | 'result';

type DraftPart = {
  title: string;
  file: File | null;
  previewUrl: string | null;
  existingUrl: string | null;
  existingPath: string | null;
  removeExisting: boolean;
};

type Draft = Record<PartKey, DraftPart>;

type UploadedImage = {
  url: string;
  path: string;
};

type ElementMode = 'existing' | 'new';

const PARTS: Array<{
  key: PartKey;
  label: string;
  hint: string;
  placeholder: string;
  mark: string;
}> = [
  { key: 'plant', label: 'Plant', hint: 'The living ingredient', placeholder: 'e.g. Lavender', mark: '⌇' },
  { key: 'element', label: 'Element', hint: 'What it meets', placeholder: 'e.g. Moonlight', mark: '✦' },
  { key: 'result', label: 'End result', hint: 'What it becomes', placeholder: 'e.g. Dream oil', mark: '✺' },
];

function emptyPart(): DraftPart {
  return {
    title: '',
    file: null,
    previewUrl: null,
    existingUrl: null,
    existingPath: null,
    removeExisting: false,
  };
}

function emptyDraft(): Draft {
  return {
    plant: emptyPart(),
    element: emptyPart(),
    result: emptyPart(),
  };
}

function entryToDraft(entry: PlantbookEntry): Draft {
  const element = entry.element;
  return {
    plant: {
      ...emptyPart(),
      title: entry.plant_title,
      existingUrl: entry.plant_image_url,
      existingPath: entry.plant_image_path,
    },
    element: {
      ...emptyPart(),
      title: element?.title || entry.element_title,
      existingUrl: element?.image_url ?? entry.element_image_url,
      existingPath: element?.image_path ?? entry.element_image_path,
    },
    result: {
      ...emptyPart(),
      title: entry.result_title,
      existingUrl: entry.result_image_url,
      existingPath: entry.result_image_path,
    },
  };
}

function elementForEntry(entry: PlantbookEntry) {
  return {
    title: entry.element?.title || entry.element_title,
    imageUrl: entry.element?.image_url ?? entry.element_image_url,
  };
}

function imageFor(part: DraftPart) {
  if (part.previewUrl) return part.previewUrl;
  if (!part.removeExisting) return part.existingUrl;
  return null;
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function PartImage({
  url,
  label,
  mark,
  large = false,
}: {
  url: string | null;
  label: string;
  mark: string;
  large?: boolean;
}) {
  if (url) {
    return (
      <div
        className={`${styles.partImage} ${large ? styles.partImageLarge : ''}`}
        style={{ backgroundImage: `url(${JSON.stringify(url).slice(1, -1)})` }}
        role="img"
        aria-label={label}
      />
    );
  }

  return (
    <div className={`${styles.partImage} ${styles.imagePlaceholder} ${large ? styles.partImageLarge : ''}`}>
      <span aria-hidden="true">{mark}</span>
      <small>no image</small>
    </div>
  );
}

function ImageField({
  partKey,
  part,
  mark,
  onSelect,
  onRemove,
}: {
  partKey: PartKey;
  part: DraftPart;
  mark: string;
  onSelect: (key: PartKey, file: File) => void;
  onRemove: (key: PartKey) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const visibleImage = imageFor(part);

  const acceptDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) onSelect(partKey, file);
  };

  return (
    <div className={styles.imageFieldWrap}>
      <input
        ref={inputRef}
        className={styles.fileInput}
        id={`${partKey}-image`}
        type="file"
        accept="image/*,.heic,.heif"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];
          if (file) onSelect(partKey, file);
          event.target.value = '';
        }}
      />
      <button
        className={`${styles.imageField} ${visibleImage ? styles.imageFieldFilled : ''}`}
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={acceptDrop}
      >
        {visibleImage ? (
          <span
            className={styles.imageFieldPreview}
            style={{ backgroundImage: `url(${JSON.stringify(visibleImage).slice(1, -1)})` }}
          />
        ) : (
          <>
            <span className={styles.uploadMark} aria-hidden="true">{mark}</span>
            <span>Add an image</span>
            <small>Drop or browse · max 10 MB</small>
          </>
        )}
      </button>
      {visibleImage && (
        <div className={styles.imageActions}>
          <button type="button" onClick={() => inputRef.current?.click()}>Replace</button>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={() => onRemove(partKey)}>Remove</button>
        </div>
      )}
    </div>
  );
}

export default function Plantbook() {
  const [entries, setEntries] = useState<PlantbookEntry[]>([]);
  const [elements, setElements] = useState<PlantbookElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [elementMode, setElementMode] = useState<ElementMode>('new');
  const [selectedElementId, setSelectedElementId] = useState('');
  const [condition, setCondition] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<PlantbookEntry | null>(null);
  const [updatingElementId, setUpdatingElementId] = useState<string | null>(null);
  const previewUrls = useRef<Set<string>>(new Set());
  const existingElementImageInput = useRef<HTMLInputElement>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const [entriesResult, elementsResult] = await Promise.all([
      supabase
        .from('plantbook_entries')
        .select('*, element:plantbook_elements(*)')
        .order('created_at', { ascending: false }),
      supabase
        .from('plantbook_elements')
        .select('*')
        .order('title', { ascending: true }),
    ]);

    if (entriesResult.error || elementsResult.error) {
      const error = entriesResult.error || elementsResult.error;
      console.warn('Could not load Plantbook:', error?.message);
      setLoadError('The collection could not be loaded. Make sure the Plantbook migration has been applied.');
    } else {
      setEntries((entriesResult.data || []) as PlantbookEntry[]);
      setElements((elementsResult.data || []) as PlantbookElement[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    const urls = previewUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!selectedEntry) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedEntry(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [selectedEntry]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) =>
      [
        entry.plant_title,
        elementForEntry(entry).title,
        entry.result_title,
        entry.condition_text || '',
        entry.notes || '',
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [entries, search]);

  const resetForm = () => {
    PARTS.forEach(({ key }) => {
      const previewUrl = draft[key].previewUrl;
      if (previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
        previewUrls.current.delete(previewUrl);
      }
    });
    setDraft(emptyDraft());
    setEditingId(null);
    setSelectedElementId('');
    setElementMode(elements.length > 0 ? 'existing' : 'new');
    setCondition('');
    setNotes('');
    setFormError('');
    setShowForm(false);
  };

  const openNew = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (entry: PlantbookEntry) => {
    resetForm();
    setSelectedEntry(null);
    setDraft(entryToDraft(entry));
    setEditingId(entry.id);
    setElementMode(entry.element_id ? 'existing' : 'new');
    setSelectedElementId(entry.element_id || '');
    setCondition(entry.condition_text || '');
    setNotes(entry.notes || '');
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateTitle = (key: PartKey, title: string) => {
    setDraft((current) => ({
      ...current,
      [key]: { ...current[key], title },
    }));
  };

  const chooseElementMode = (mode: ElementMode) => {
    const previewUrl = draft.element.previewUrl;
    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
      previewUrls.current.delete(previewUrl);
    }
    setElementMode(mode);
    setSelectedElementId('');
    setDraft((current) => ({ ...current, element: emptyPart() }));
    setFormError('');
  };

  const chooseExistingElement = (elementId: string) => {
    setSelectedElementId(elementId);
    const element = elements.find((item) => item.id === elementId);
    setDraft((current) => ({
      ...current,
      element: element
        ? {
            ...emptyPart(),
            title: element.title,
            existingUrl: element.image_url,
            existingPath: element.image_path,
          }
        : emptyPart(),
    }));
  };

  const selectImage = (key: PartKey, file: File) => {
    setFormError('');
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
      setFormError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setFormError('Each image must be smaller than 10 MB.');
      return;
    }

    setDraft((current) => {
      const previous = current[key].previewUrl;
      if (previous?.startsWith('blob:')) {
        URL.revokeObjectURL(previous);
        previewUrls.current.delete(previous);
      }
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      return {
        ...current,
        [key]: {
          ...current[key],
          file,
          previewUrl,
          removeExisting: false,
        },
      };
    });
  };

  const removeImage = (key: PartKey) => {
    setDraft((current) => {
      const previous = current[key].previewUrl;
      if (previous?.startsWith('blob:')) {
        URL.revokeObjectURL(previous);
        previewUrls.current.delete(previous);
      }
      return {
        ...current,
        [key]: {
          ...current[key],
          file: null,
          previewUrl: null,
          removeExisting: true,
        },
      };
    });
  };

  const uploadImage = async (key: PartKey, file: File): Promise<UploadedImage> => {
    const blob = await convertToWebP(file, 0.82);
    const path = `${key}/${Date.now()}-${crypto.randomUUID()}.webp`;
    const { data, error } = await appStorage.from(STORAGE_BUCKET).upload(path, blob, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    });
    if (error || !data) throw error || new Error('The image upload did not return a URL.');
    return { url: data.publicUrl, path: data.path };
  };

  const updateSharedElementImage = async (elementId: string, file: File | null) => {
    const element = elements.find((item) => item.id === elementId);
    if (!element) {
      setFormError('The selected element is no longer available.');
      return;
    }

    if (file) {
      if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
        setFormError('Please choose an image file.');
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setFormError('Each image must be smaller than 10 MB.');
        return;
      }
    } else if (!window.confirm(`Remove the shared image for “${element.title}”? This changes every formula that uses it.`)) {
      return;
    }

    setFormError('');
    setUpdatingElementId(elementId);
    let uploaded: UploadedImage | null = null;

    try {
      if (file) uploaded = await uploadImage('element', file);

      const { data, error } = await supabase
        .from('plantbook_elements')
        .update({
          image_url: uploaded?.url || null,
          image_path: uploaded?.path || null,
        })
        .eq('id', elementId)
        .select()
        .single();
      if (error) throw error;

      const updatedElement = data as PlantbookElement;
      setElements((current) =>
        current.map((item) => (item.id === elementId ? updatedElement : item))
      );
      setEntries((current) =>
        current.map((entry) =>
          entry.element_id === elementId ? { ...entry, element: updatedElement } : entry
        )
      );
      setDraft((current) => ({
        ...current,
        element: {
          ...current.element,
          existingUrl: updatedElement.image_url,
          existingPath: updatedElement.image_path,
          removeExisting: false,
        },
      }));

      if (element.image_path && element.image_path !== updatedElement.image_path) {
        void appStorage.from(STORAGE_BUCKET).remove([element.image_path]);
      }
    } catch (error) {
      console.warn('Could not update shared element image:', error);
      if (uploaded) void appStorage.from(STORAGE_BUCKET).remove([uploaded.path]);
      const message =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'Could not update the shared element image. Please try again.';
      setFormError(message);
    } finally {
      setUpdatingElementId(null);
    }
  };

  const saveEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');

    if (elementMode === 'existing' && !selectedElementId) {
      setFormError('Choose an element from the library, or create a new one.');
      return;
    }

    const missingPart = PARTS.find(({ key }) => !draft[key].title.trim());
    if (missingPart) {
      setFormError(`${missingPart.label} needs a title.`);
      return;
    }

    setSaving(true);
    const newlyUploaded: UploadedImage[] = [];
    let newlyCreatedElementId: string | null = null;

    try {
      const images = {} as Record<PartKey, UploadedImage | null>;
      for (const key of ['plant', 'result'] as const) {
        const part = draft[key];
        if (part.file) {
          const uploaded = await uploadImage(key, part.file);
          images[key] = uploaded;
          newlyUploaded.push(uploaded);
        } else if (part.existingUrl && part.existingPath && !part.removeExisting) {
          images[key] = { url: part.existingUrl, path: part.existingPath };
        } else {
          images[key] = null;
        }
      }

      let referencedElement: PlantbookElement;
      if (elementMode === 'existing') {
        const existingElement = elements.find((element) => element.id === selectedElementId);
        if (!existingElement) throw new Error('The selected element is no longer available.');
        referencedElement = existingElement;
      } else {
        let elementImage: UploadedImage | null = null;
        if (draft.element.file) {
          elementImage = await uploadImage('element', draft.element.file);
          newlyUploaded.push(elementImage);
        } else if (
          draft.element.existingUrl &&
          draft.element.existingPath &&
          !draft.element.removeExisting
        ) {
          elementImage = {
            url: draft.element.existingUrl,
            path: draft.element.existingPath,
          };
        }

        const { data: createdElement, error: elementError } = await supabase
          .from('plantbook_elements')
          .insert({
            anon_id: typeof window === 'undefined' ? null : localStorage.getItem('lucyearth_anon_id'),
            title: draft.element.title.trim(),
            image_url: elementImage?.url || null,
            image_path: elementImage?.path || null,
          })
          .select()
          .single();
        if (elementError) throw elementError;
        referencedElement = createdElement as PlantbookElement;
        newlyCreatedElementId = referencedElement.id;
      }

      images.element = referencedElement.image_url && referencedElement.image_path
        ? { url: referencedElement.image_url, path: referencedElement.image_path }
        : null;

      const payload = {
        anon_id: typeof window === 'undefined' ? null : localStorage.getItem('lucyearth_anon_id'),
        plant_title: draft.plant.title.trim(),
        plant_image_url: images.plant?.url || null,
        plant_image_path: images.plant?.path || null,
        element_id: referencedElement.id,
        element_title: referencedElement.title,
        element_image_url: images.element?.url || null,
        element_image_path: images.element?.path || null,
        condition_text: condition.trim() || null,
        notes: notes.trim() || null,
        result_title: draft.result.title.trim(),
        result_image_url: images.result?.url || null,
        result_image_path: images.result?.path || null,
      };

      const query = editingId
        ? supabase.from('plantbook_entries').update(payload).eq('id', editingId)
        : supabase.from('plantbook_entries').insert(payload);
      const { data, error } = await query.select('*, element:plantbook_elements(*)').single();
      if (error) throw error;

      if (editingId) {
        const stalePaths = (['plant', 'result'] as const).flatMap((key) => {
          const part = draft[key];
          const replacementPath = images[key]?.path;
          return part.existingPath && part.existingPath !== replacementPath ? [part.existingPath] : [];
        });
        if (stalePaths.length) {
          void appStorage.from(STORAGE_BUCKET).remove(stalePaths);
        }
        setEntries((current) =>
          current.map((entry) => (entry.id === editingId ? (data as PlantbookEntry) : entry))
        );
      } else {
        setEntries((current) => [data as PlantbookEntry, ...current]);
      }
      if (newlyCreatedElementId) {
        setElements((current) =>
          [...current, referencedElement].sort((a, b) => a.title.localeCompare(b.title))
        );
      }
      resetForm();
    } catch (error) {
      console.warn('Could not save Plantbook entry:', error);
      if (newlyCreatedElementId) {
        void supabase.from('plantbook_elements').delete().eq('id', newlyCreatedElementId);
      }
      if (newlyUploaded.length) {
        void appStorage.from(STORAGE_BUCKET).remove(newlyUploaded.map((image) => image.path));
      }
      const message =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'Could not save this entry. Please try again.';
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry: PlantbookEntry) => {
    if (!window.confirm(`Remove “${entry.plant_title} + ${elementForEntry(entry).title}” from Plantbook?`)) return;
    setDeletingId(entry.id);
    const { error } = await supabase.from('plantbook_entries').delete().eq('id', entry.id);
    if (error) {
      console.warn('Could not delete Plantbook entry:', error.message);
      setLoadError('That entry could not be removed. Please try again.');
      setDeletingId(null);
      return;
    }

    setEntries((current) => current.filter((item) => item.id !== entry.id));
    const paths = [entry.plant_image_path, entry.result_image_path].filter(
      (path): path is string => Boolean(path)
    );
    if (paths.length) void appStorage.from(STORAGE_BUCKET).remove(paths);
    setDeletingId(null);
  };

  return (
    <main className={styles.page}>
      <div className={styles.paperGrain} aria-hidden="true" />
      <header className={styles.header}>
        <Link href="/" className={styles.homeLink} aria-label="Back to Lucy Earth">
          <span aria-hidden="true">←</span> Lucy Earth
        </Link>
        <span className={styles.issue}>FIELD NOTES · VOL. 01</span>
        <button className={styles.addButton} type="button" onClick={openNew}>
          <span aria-hidden="true">＋</span> New formula
        </button>
      </header>

      {showForm && (
        <section className={styles.editor} aria-labelledby="editor-heading">
          <div className={styles.editorHeading}>
            <div>
              <span className={styles.kicker}>{editingId ? 'Revise specimen' : 'New observation'}</span>
              <h2 id="editor-heading">{editingId ? 'Edit a formula' : 'Compose a formula'}</h2>
            </div>
            <button className={styles.closeButton} type="button" onClick={resetForm} aria-label="Close form">×</button>
          </div>

          <form onSubmit={saveEntry}>
            <div className={styles.formEquation}>
              {PARTS.map((part, index) => (
                <div className={styles.formPartGroup} key={part.key}>
                  {index > 0 && (
                    <div className={styles.operator} aria-hidden="true">{index === 1 ? '+' : '='}</div>
                  )}
                  <fieldset className={`${styles.formPart} ${part.key === 'result' ? styles.formResult : ''}`}>
                    <legend><span>{String(index + 1).padStart(2, '0')}</span> {part.label}</legend>
                    <p>{part.hint}</p>
                    {part.key === 'element' ? (
                      <>
                        <label>Element source</label>
                        <div className={styles.elementMode}>
                          <button
                            type="button"
                            className={elementMode === 'existing' ? styles.elementModeActive : ''}
                            onClick={() => chooseElementMode('existing')}
                            disabled={elements.length === 0}
                          >
                            From library
                          </button>
                          <button
                            type="button"
                            className={elementMode === 'new' ? styles.elementModeActive : ''}
                            onClick={() => chooseElementMode('new')}
                          >
                            Create new
                          </button>
                        </div>

                        {elementMode === 'existing' ? (
                          <>
                            <label htmlFor="existing-element">Choose element</label>
                            <select
                              id="existing-element"
                              className={styles.elementSelect}
                              value={selectedElementId}
                              onChange={(event) => chooseExistingElement(event.target.value)}
                            >
                              <option value="">Select from {elements.length} saved {elements.length === 1 ? 'element' : 'elements'}…</option>
                              {elements.map((element) => (
                                <option value={element.id} key={element.id}>{element.title}</option>
                              ))}
                            </select>
                            {selectedElementId && (
                              <div className={styles.selectedElementPreview}>
                                <PartImage
                                  url={imageFor(draft.element)}
                                  label={draft.element.title}
                                  mark="✦"
                                />
                                <div>
                                  <span>Shared element</span>
                                  <strong>{draft.element.title}</strong>
                                  <small>Changes appear in every formula that references it</small>
                                  <input
                                    ref={existingElementImageInput}
                                    className={styles.fileInput}
                                    type="file"
                                    accept="image/*,.heic,.heif"
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      if (file) void updateSharedElementImage(selectedElementId, file);
                                      event.target.value = '';
                                    }}
                                  />
                                  <div className={styles.sharedElementActions}>
                                    <button
                                      type="button"
                                      disabled={updatingElementId === selectedElementId}
                                      onClick={() => existingElementImageInput.current?.click()}
                                    >
                                      {updatingElementId === selectedElementId
                                        ? 'Saving image…'
                                        : draft.element.existingUrl
                                          ? 'Replace image'
                                          : 'Add image'}
                                    </button>
                                    {draft.element.existingUrl && (
                                      <button
                                        type="button"
                                        disabled={updatingElementId === selectedElementId}
                                        onClick={() => void updateSharedElementImage(selectedElementId, null)}
                                      >
                                        Remove
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <label htmlFor="element-title">Title</label>
                            <input
                              id="element-title"
                              type="text"
                              maxLength={100}
                              placeholder={part.placeholder}
                              value={draft.element.title}
                              onChange={(event) => updateTitle('element', event.target.value)}
                            />
                            <label>Image <em>optional</em></label>
                            <ImageField
                              partKey="element"
                              part={draft.element}
                              mark={part.mark}
                              onSelect={selectImage}
                              onRemove={removeImage}
                            />
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <label htmlFor={`${part.key}-title`}>Title</label>
                        <input
                          id={`${part.key}-title`}
                          type="text"
                          maxLength={100}
                          placeholder={part.placeholder}
                          value={draft[part.key].title}
                          onChange={(event) => updateTitle(part.key, event.target.value)}
                          autoFocus={index === 0}
                        />
                        <label>Image <em>optional</em></label>
                        <ImageField
                          partKey={part.key}
                          part={draft[part.key]}
                          mark={part.mark}
                          onSelect={selectImage}
                          onRemove={removeImage}
                        />
                      </>
                    )}
                  </fieldset>
                </div>
              ))}
            </div>

            <div className={styles.observationFields}>
              <label htmlFor="formula-condition">
                <span>Condition <em>optional</em></span>
                <input
                  id="formula-condition"
                  type="text"
                  maxLength={160}
                  placeholder="e.g. Under moonlight · 12°C · after rain"
                  value={condition}
                  onChange={(event) => setCondition(event.target.value)}
                />
              </label>
              <label htmlFor="formula-notes">
                <span>Notes <em>optional</em></span>
                <textarea
                  id="formula-notes"
                  rows={3}
                  maxLength={2000}
                  placeholder="Record observations, method, or anything worth remembering…"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
            </div>

            {formError && <p className={styles.formError} role="alert">{formError}</p>}
            <div className={styles.formFooter}>
              <span>Images are compressed before being stored in AWS S3.</span>
              <div>
                <button className={styles.cancelButton} type="button" onClick={resetForm}>Cancel</button>
                <button className={styles.saveButton} type="submit" disabled={saving}>
                  {saving ? 'Pressing specimen…' : editingId ? 'Save changes' : 'Add to Plantbook'}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      <section className={styles.collection} aria-labelledby="collection-heading">
        <div className={styles.collectionHeader}>
          <div>
            <span className={styles.kicker}>The collection</span>
            <h2 id="collection-heading">Recorded formulas</h2>
          </div>
          <div className={styles.collectionTools}>
            <span>{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
            <label className={styles.searchBox}>
              <span aria-hidden="true">⌕</span>
              <span className={styles.srOnly}>Search the collection</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" />
            </label>
          </div>
        </div>

        {loadError && (
          <div className={styles.notice} role="alert">
            <span>{loadError}</span>
            <button type="button" onClick={() => void fetchEntries()}>Try again</button>
          </div>
        )}

        {loading ? (
          <div className={styles.loadingState}>
            <span className={styles.loadingFlower}>✣</span>
            Opening the field notes…
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIllustration} aria-hidden="true">⌇</div>
            <h3>{search ? 'No matching formulas' : 'The first page is waiting'}</h3>
            <p>{search ? 'Try another plant, element, or result.' : 'Begin with a plant, add an element, and see what grows.'}</p>
            {!search && <button type="button" onClick={openNew}>Create the first formula</button>}
          </div>
        ) : (
          <div className={styles.entryList}>
            {filteredEntries.map((entry, index) => {
              const element = elementForEntry(entry);
              return (
              <article
                className={styles.entryCard}
                key={entry.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${entry.plant_title} plus ${element.title} formula`}
                onClick={() => setSelectedEntry(entry)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedEntry(entry);
                  }
                }}
              >
                <div className={styles.cardNumber}>{String(entries.length - index).padStart(3, '0')}</div>
                <div className={styles.cardEquation}>
                  <div className={styles.cardPart}>
                    <PartImage url={entry.plant_image_url} label={entry.plant_title} mark="⌇" />
                    <div><span>Plant</span><h3>{entry.plant_title}</h3></div>
                  </div>
                  <div className={styles.cardOperator} aria-hidden="true">＋</div>
                  <div className={styles.cardPart}>
                    <PartImage url={element.imageUrl} label={element.title} mark="✦" />
                    <div><span>Element · shared</span><h3>{element.title}</h3></div>
                  </div>
                  <div className={`${styles.cardOperator} ${styles.cardEquals}`} aria-hidden="true">→</div>
                  <div className={`${styles.cardPart} ${styles.cardResult}`}>
                    <PartImage url={entry.result_image_url} label={entry.result_title} mark="✺" large />
                    <div><span>End result</span><h3>{entry.result_title}</h3></div>
                  </div>
                </div>
                {(entry.condition_text || entry.notes) && (
                  <div className={styles.cardAnnotations}>
                    {entry.condition_text && (
                      <p><span>Condition</span>{entry.condition_text}</p>
                    )}
                    {entry.notes && (
                      <p><span>Notes</span>{entry.notes}</p>
                    )}
                  </div>
                )}
                <footer className={styles.cardFooter}>
                  <time dateTime={entry.created_at}>Recorded {displayDate(entry.created_at)}</time>
                  <div>
                    <button type="button" onClick={(event) => { event.stopPropagation(); openEdit(entry); }}>Edit</button>
                    <button
                      type="button"
                      disabled={deletingId === entry.id}
                      onClick={(event) => { event.stopPropagation(); void deleteEntry(entry); }}
                    >
                      {deletingId === entry.id ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </footer>
              </article>
              );
            })}
          </div>
        )}
      </section>

      {selectedEntry && (
        <div
          className={styles.detailBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedEntry(null);
          }}
        >
          <section
            className={styles.detailModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="formula-detail-title"
          >
            <header className={styles.detailHeader}>
              <div>
                <span>Plantbook specimen</span>
                <strong>Recorded {displayDate(selectedEntry.created_at)}</strong>
              </div>
              <button type="button" onClick={() => setSelectedEntry(null)} aria-label="Close enlarged formula" autoFocus>×</button>
            </header>
            <div className={styles.detailEquation}>
              <div className={styles.detailPart}>
                <PartImage url={selectedEntry.plant_image_url} label={selectedEntry.plant_title} mark="⌇" />
                <span>01 · Plant</span>
                <h2 id="formula-detail-title">{selectedEntry.plant_title}</h2>
              </div>
              <div className={styles.detailOperator} aria-hidden="true">＋</div>
              <div className={styles.detailPart}>
                <PartImage
                  url={elementForEntry(selectedEntry).imageUrl}
                  label={elementForEntry(selectedEntry).title}
                  mark="✦"
                />
                <span>02 · Shared element</span>
                <h2>{elementForEntry(selectedEntry).title}</h2>
              </div>
              <div className={`${styles.detailOperator} ${styles.detailArrow}`} aria-hidden="true">→</div>
              <div className={`${styles.detailPart} ${styles.detailResult}`}>
                <PartImage url={selectedEntry.result_image_url} label={selectedEntry.result_title} mark="✺" large />
                <span>03 · End result</span>
                <h2>{selectedEntry.result_title}</h2>
              </div>
            </div>
            {(selectedEntry.condition_text || selectedEntry.notes) && (
              <div className={styles.detailAnnotations}>
                {selectedEntry.condition_text && (
                  <div><span>Condition</span><p>{selectedEntry.condition_text}</p></div>
                )}
                {selectedEntry.notes && (
                  <div><span>Field notes</span><p>{selectedEntry.notes}</p></div>
                )}
              </div>
            )}
            <footer className={styles.detailFooter}>
              <span>Click outside or press Esc to close</span>
              <button type="button" onClick={() => openEdit(selectedEntry)}>Edit this formula</button>
            </footer>
          </section>
        </div>
      )}

      <footer className={styles.pageFooter}>
        <span>PLANTBOOK</span>
        <span>A living index of small transformations</span>
        <span>EST. 2026</span>
      </footer>
    </main>
  );
}
