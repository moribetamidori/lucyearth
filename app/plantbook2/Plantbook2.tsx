'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { convertToWebP } from '@/lib/imageUpload';
import {
  supabase,
  type Plantbook2Character,
  type Plantbook2Craft,
  type Plantbook2Element,
  type Plantbook2Plant,
} from '@/lib/supabase';
import { appStorage } from '@/lib/storage';
import styles from './plantbook2.module.css';

const STORAGE_BUCKET = 'plantbook2-images';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type ImageDraft = { file: File | null; preview: string | null };
type ElementMode = 'base' | 'fusion';
type EditKind = 'plant' | 'element' | 'character' | 'craft';
type Editor = {
  kind: EditKind;
  id: string;
  name: string;
  image: ImageDraft;
  originalImagePath: string | null;
  removeImage: boolean;
  plantId: string;
  elementId: string;
  basePlantId: string;
  parentOneId: string;
  parentTwoId: string;
  notes: string;
};
const blankImage = (): ImageDraft => ({ file: null, preview: null });

function anonId() {
  return typeof window === 'undefined' ? null : localStorage.getItem('lucyearth_anon_id');
}

function sortLibrary<T extends { tier: number; title: string }>(items: T[]) {
  return [...items].sort((a, b) => a.tier - b.tier || a.title.localeCompare(b.title));
}

function errorMessage(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : fallback;
}

function Specimen({
  image,
  name,
  kind,
  size = 'normal',
}: {
  image: string | null;
  name: string;
  kind: 'plant' | 'element';
  size?: 'small' | 'normal' | 'large';
}) {
  return (
    <span className={`${styles.specimen} ${styles[size]} ${styles[kind]}`}>
      {image ? <span style={{ backgroundImage: `url(${JSON.stringify(image).slice(1, -1)})` }} /> : <b>{kind === 'plant' ? '♧' : '✦'}</b>}
      <span className={styles.srOnly}>{name}</span>
    </span>
  );
}

function ImagePicker({
  id,
  value,
  onChange,
  label = 'Add image',
}: {
  id: string;
  value: ImageDraft;
  onChange: (file: File | null) => void;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={styles.imagePicker}>
      <input
        ref={input}
        id={id}
        className={styles.srOnly}
        type="file"
        accept="image/*,.heic,.heif"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onChange(event.target.files?.[0] || null);
          event.target.value = '';
        }}
      />
      <button type="button" onClick={() => input.current?.click()}>
        {value.preview ? <span className={styles.pickerPreview} style={{ backgroundImage: `url(${JSON.stringify(value.preview).slice(1, -1)})` }} /> : <span className={styles.pickerEmpty}>⌁</span>}
        <span>{value.preview ? 'Replace image' : label}</span>
      </button>
      {value.preview && <button className={styles.removeImage} type="button" onClick={() => onChange(null)}>Remove</button>}
    </div>
  );
}

export default function Plantbook2() {
  const [plants, setPlants] = useState<Plantbook2Plant[]>([]);
  const [elements, setElements] = useState<Plantbook2Element[]>([]);
  const [characters, setCharacters] = useState<Plantbook2Character[]>([]);
  const [crafts, setCrafts] = useState<Plantbook2Craft[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<'element' | 'character' | 'craft' | 'edit' | 'delete' | ''>('');
  const [editor, setEditor] = useState<Editor | null>(null);

  const [elementName, setElementName] = useState('');
  const [elementMode, setElementMode] = useState<ElementMode>('base');
  const [elementParentOne, setElementParentOne] = useState('');
  const [elementParentTwo, setElementParentTwo] = useState('');
  const [elementImage, setElementImage] = useState<ImageDraft>(blankImage);
  const [characterName, setCharacterName] = useState('');
  const [basePlantName, setBasePlantName] = useState('');
  const [basePlantImage, setBasePlantImage] = useState<ImageDraft>(blankImage);
  const [plantId, setPlantId] = useState('');
  const [elementId, setElementId] = useState('');
  const [resultName, setResultName] = useState('');
  const [resultImage, setResultImage] = useState<ImageDraft>(blankImage);
  const [notes, setNotes] = useState('');
  const previewUrls = useRef<Set<string>>(new Set());

  const fetchBook = useCallback(async () => {
    setLoading(true);
    setPageError('');
    const [plantResult, elementResult, characterResult, craftResult] = await Promise.all([
      supabase.from('plantbook2_plants').select('*').order('tier').order('title'),
      supabase.from('plantbook2_elements').select('*').order('tier').order('title'),
      supabase.from('plantbook2_characters').select('*, base_plant:plantbook2_plants(*)').order('created_at', { ascending: false }),
      supabase.from('plantbook2_crafts').select('*, plant:plantbook2_plants!plant_id(*), element:plantbook2_elements!element_id(*), result_plant:plantbook2_plants!result_plant_id(*)').order('created_at', { ascending: false }),
    ]);
    const failed = [plantResult, elementResult, characterResult, craftResult].find((result) => result.error);
    if (failed?.error) {
      setPageError('Plantbook II could not be opened. Apply the new database migration, then try again.');
      console.warn('Could not load Plantbook2:', failed.error.message);
    } else {
      setPlants((plantResult.data || []) as Plantbook2Plant[]);
      setElements((elementResult.data || []) as Plantbook2Element[]);
      setCharacters((characterResult.data || []) as Plantbook2Character[]);
      setCrafts((craftResult.data || []) as Plantbook2Craft[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void fetchBook(); }, [fetchBook]);
  useEffect(() => {
    const urls = previewUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);
  useEffect(() => {
    if (!editor) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeEditor(); };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  const setImage = (setter: (value: ImageDraft) => void, current: ImageDraft, file: File | null) => {
    setNotice('');
    if (current.preview) {
      URL.revokeObjectURL(current.preview);
      previewUrls.current.delete(current.preview);
    }
    if (!file) return setter(blankImage());
    if ((!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) || file.size > MAX_IMAGE_BYTES) {
      setNotice(file.size > MAX_IMAGE_BYTES ? 'Images must be smaller than 10 MB.' : 'Please choose an image file.');
      return setter(blankImage());
    }
    const preview = URL.createObjectURL(file);
    previewUrls.current.add(preview);
    setter({ file, preview });
  };

  const clearImage = (draft: ImageDraft, setter: (value: ImageDraft) => void) => {
    if (draft.preview) {
      URL.revokeObjectURL(draft.preview);
      previewUrls.current.delete(draft.preview);
    }
    setter(blankImage());
  };

  const uploadImage = async (file: File, folder: string) => {
    const blob = await convertToWebP(file, 0.84);
    const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.webp`;
    const { data, error } = await appStorage.from(STORAGE_BUCKET).upload(path, blob, {
      contentType: 'image/webp', cacheControl: '31536000', upsert: false,
    });
    if (error || !data) throw error || new Error('Image upload failed.');
    return { url: data.publicUrl, path: data.path };
  };

  const closeEditor = () => {
    if (editor?.image.preview?.startsWith('blob:')) {
      URL.revokeObjectURL(editor.image.preview);
      previewUrls.current.delete(editor.image.preview);
    }
    setEditor(null);
  };

  const openElementEditor = (element: Plantbook2Element) => setEditor({
    kind: 'element', id: element.id, name: element.title,
    image: { file: null, preview: element.image_url }, originalImagePath: element.image_path,
    removeImage: false, plantId: '', elementId: '', basePlantId: '',
    parentOneId: element.parent_element_id || '',
    parentTwoId: element.second_parent_element_id || '', notes: '',
  });

  const openCharacterEditor = (character: Plantbook2Character) => setEditor({
    kind: 'character', id: character.id, name: character.name, image: blankImage(),
    originalImagePath: null, removeImage: false, plantId: '', elementId: '',
    basePlantId: character.base_plant_id, parentOneId: '', parentTwoId: '', notes: '',
  });

  const openCraftEditor = (craft: Plantbook2Craft) => setEditor({
    kind: 'craft', id: craft.id, name: craft.result_plant?.title || '',
    image: { file: null, preview: craft.result_plant?.image_url || null },
    originalImagePath: craft.result_plant?.image_path || null, removeImage: false,
    plantId: craft.plant_id, elementId: craft.element_id, basePlantId: '',
    parentOneId: '', parentTwoId: '', notes: craft.notes || '',
  });

  const changeEditorImage = (file: File | null) => {
    if (!editor) return;
    if (editor.image.preview?.startsWith('blob:')) {
      URL.revokeObjectURL(editor.image.preview);
      previewUrls.current.delete(editor.image.preview);
    }
    if (!file) {
      setEditor({ ...editor, image: blankImage(), removeImage: true });
      return;
    }
    if ((!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) || file.size > MAX_IMAGE_BYTES) {
      setNotice(file.size > MAX_IMAGE_BYTES ? 'Images must be smaller than 10 MB.' : 'Please choose an image file.');
      return;
    }
    const preview = URL.createObjectURL(file);
    previewUrls.current.add(preview);
    setEditor({ ...editor, image: { file, preview }, removeImage: false });
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editor || !editor.name.trim()) return setNotice('A name is required.');
    setBusy('edit'); setNotice('');
    let uploaded: { url: string; path: string } | null = null;
    try {
      if (editor.image.file) uploaded = await uploadImage(editor.image.file, editor.kind === 'element' ? 'elements' : 'plants');
      const imageValues = {
        image_url: uploaded?.url || (editor.removeImage ? null : editor.image.preview),
        image_path: uploaded?.path || (editor.removeImage ? null : editor.originalImagePath),
      };

      if (editor.kind === 'plant') {
        const { error } = await supabase.from('plantbook2_plants').update({ title: editor.name.trim(), ...imageValues }).eq('id', editor.id);
        if (error) throw error;
      } else if (editor.kind === 'element') {
        const firstParent = elements.find((item) => item.id === editor.parentOneId);
        const secondParent = elements.find((item) => item.id === editor.parentTwoId);
        if (Boolean(firstParent) !== Boolean(secondParent)) throw new Error('Choose two ingredients, or leave both empty for a Tier 1 element.');
        const tier = firstParent && secondParent ? Math.max(firstParent.tier, secondParent.tier) + 1 : 1;
        const { error } = await supabase.from('plantbook2_elements').update({
          title: editor.name.trim(), tier, parent_element_id: firstParent?.id || null,
          second_parent_element_id: secondParent?.id || null, ...imageValues,
        }).eq('id', editor.id);
        if (error) throw error;
      } else if (editor.kind === 'character') {
        if (!editor.basePlantId) throw new Error('Choose a base plant.');
        const { error } = await supabase.from('plantbook2_characters').update({
          name: editor.name.trim(), base_plant_id: editor.basePlantId,
        }).eq('id', editor.id);
        if (error) throw error;
      } else {
        const craft = crafts.find((item) => item.id === editor.id);
        const source = plants.find((item) => item.id === editor.plantId);
        if (!craft?.result_plant || !source || !editor.elementId) throw new Error('Choose both recipe ingredients.');
        const originalResult = craft.result_plant;
        const { error: plantError } = await supabase.from('plantbook2_plants').update({
          title: editor.name.trim(), tier: source.tier + 1, parent_plant_id: source.id, ...imageValues,
        }).eq('id', originalResult.id);
        if (plantError) throw plantError;
        const { error: craftError } = await supabase.from('plantbook2_crafts').update({
          plant_id: source.id, element_id: editor.elementId, notes: editor.notes.trim() || null,
        }).eq('id', editor.id);
        if (craftError) {
          await supabase.from('plantbook2_plants').update({
            title: originalResult.title, tier: originalResult.tier,
            parent_plant_id: originalResult.parent_plant_id,
            image_url: originalResult.image_url, image_path: originalResult.image_path,
          }).eq('id', originalResult.id);
          throw craftError;
        }
      }

      if (editor.originalImagePath && editor.originalImagePath !== imageValues.image_path) {
        void appStorage.from(STORAGE_BUCKET).remove([editor.originalImagePath]);
      }
      const label = editor.kind === 'craft' ? 'Recipe' : editor.kind[0].toUpperCase() + editor.kind.slice(1);
      closeEditor();
      await fetchBook();
      setNotice(`${label} updated.`);
    } catch (error) {
      if (uploaded) void appStorage.from(STORAGE_BUCKET).remove([uploaded.path]);
      setNotice(errorMessage(error, 'This item could not be updated.'));
    } finally { setBusy(''); }
  };

  const deleteItem = async (kind: EditKind, id: string, title: string, imagePath: string | null = null) => {
    const detail = kind === 'craft' ? 'The result plant will stay in your plant library.' : 'This cannot be undone.';
    if (!window.confirm(`Delete ${kind === 'craft' ? 'the recipe for' : ''} “${title}”? ${detail}`)) return;
    setBusy('delete'); setNotice('');
    const table = {
      plant: 'plantbook2_plants', element: 'plantbook2_elements',
      character: 'plantbook2_characters', craft: 'plantbook2_crafts',
    }[kind];
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      const inUse = error.code === '23503';
      setNotice(inUse
        ? `“${title}” is still used by a character or recipe. Delete or edit those references first.`
        : errorMessage(error, 'This item could not be deleted.'));
    } else {
      if (imagePath) void appStorage.from(STORAGE_BUCKET).remove([imagePath]);
      await fetchBook();
      setNotice(`“${title}” deleted.`);
    }
    setBusy('');
  };

  const selectedPlant = useMemo(() => plants.find((plant) => plant.id === plantId) || null, [plants, plantId]);
  const selectedElement = useMemo(() => elements.find((element) => element.id === elementId) || null, [elements, elementId]);
  const elementUseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    crafts.forEach((craft) => counts.set(craft.element_id, (counts.get(craft.element_id) || 0) + 1));
    return counts;
  }, [crafts]);
  const elementParentOneRecord = elements.find((element) => element.id === elementParentOne);
  const elementParentTwoRecord = elements.find((element) => element.id === elementParentTwo);
  const nextElementTier = elementMode === 'base'
    ? 1
    : Math.max(elementParentOneRecord?.tier || 0, elementParentTwoRecord?.tier || 0) + 1;
  const nextPlantTier = (selectedPlant?.tier || 0) + 1;
  const editingCraft = editor?.kind === 'craft' ? crafts.find((craft) => craft.id === editor.id) : null;

  const addElement = async (event: FormEvent) => {
    event.preventDefault();
    if (!elementName.trim()) return setNotice('Give the element a name.');
    if (elementMode === 'fusion' && (!elementParentOneRecord || !elementParentTwoRecord)) {
      return setNotice('Choose two elements to fuse.');
    }
    setBusy('element'); setNotice('');
    let uploaded: { url: string; path: string } | null = null;
    try {
      if (elementImage.file) uploaded = await uploadImage(elementImage.file, 'elements');
      const { data, error } = await supabase.from('plantbook2_elements').insert({
        anon_id: anonId(), title: elementName.trim(), tier: nextElementTier,
        parent_element_id: elementMode === 'fusion' ? elementParentOne : null,
        second_parent_element_id: elementMode === 'fusion' ? elementParentTwo : null,
        image_url: uploaded?.url || null, image_path: uploaded?.path || null,
      }).select().single();
      if (error) throw error;
      setElements((current) => sortLibrary([...current, data as Plantbook2Element]));
      setElementName(''); setElementParentOne(''); setElementParentTwo(''); clearImage(elementImage, setElementImage);
      setNotice(elementMode === 'fusion'
        ? `${elementParentOneRecord?.title} + ${elementParentTwoRecord?.title} became ${data.title}, a Tier ${data.tier} element.`
        : `${data.title} is now saved as a Tier 1 element.`);
    } catch (error) {
      if (uploaded) void appStorage.from(STORAGE_BUCKET).remove([uploaded.path]);
      setNotice(errorMessage(error, 'Could not save this element.'));
    } finally { setBusy(''); }
  };

  const addCharacter = async (event: FormEvent) => {
    event.preventDefault();
    if (!characterName.trim() || !basePlantName.trim()) return setNotice('Add both a character name and a base plant.');
    setBusy('character'); setNotice('');
    let uploaded: { url: string; path: string } | null = null;
    let newPlant: Plantbook2Plant | null = null;
    try {
      if (basePlantImage.file) uploaded = await uploadImage(basePlantImage.file, 'plants');
      const { data: plantData, error: plantError } = await supabase.from('plantbook2_plants').insert({
        anon_id: anonId(), title: basePlantName.trim(), tier: 1,
        image_url: uploaded?.url || null, image_path: uploaded?.path || null,
      }).select().single();
      if (plantError) throw plantError;
      newPlant = plantData as Plantbook2Plant;
      const { data: characterData, error: characterError } = await supabase.from('plantbook2_characters').insert({
        anon_id: anonId(), name: characterName.trim(), base_plant_id: newPlant.id,
      }).select('*, base_plant:plantbook2_plants(*)').single();
      if (characterError) throw characterError;
      setPlants((current) => sortLibrary([...current, newPlant as Plantbook2Plant]));
      setCharacters((current) => [characterData as Plantbook2Character, ...current]);
      setCharacterName(''); setBasePlantName(''); clearImage(basePlantImage, setBasePlantImage);
      setNotice(`${characterData.name} joined with ${newPlant.title} as their Tier 1 plant.`);
    } catch (error) {
      if (newPlant) await supabase.from('plantbook2_plants').delete().eq('id', newPlant.id);
      if (uploaded) void appStorage.from(STORAGE_BUCKET).remove([uploaded.path]);
      setNotice(errorMessage(error, 'Could not save this character.'));
    } finally { setBusy(''); }
  };

  const craftPlant = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPlant || !selectedElement || !resultName.trim()) return setNotice('Choose a plant and element, then name the result.');
    setBusy('craft'); setNotice('');
    let uploaded: { url: string; path: string } | null = null;
    let newPlant: Plantbook2Plant | null = null;
    try {
      if (resultImage.file) uploaded = await uploadImage(resultImage.file, 'results');
      const { data: plantData, error: plantError } = await supabase.from('plantbook2_plants').insert({
        anon_id: anonId(), title: resultName.trim(), tier: selectedPlant.tier + 1,
        parent_plant_id: selectedPlant.id, image_url: uploaded?.url || null, image_path: uploaded?.path || null,
      }).select().single();
      if (plantError) throw plantError;
      newPlant = plantData as Plantbook2Plant;
      const { data: craftData, error: craftError } = await supabase.from('plantbook2_crafts').insert({
        anon_id: anonId(), plant_id: selectedPlant.id, element_id: selectedElement.id,
        result_plant_id: newPlant.id, notes: notes.trim() || null,
      }).select('*, plant:plantbook2_plants!plant_id(*), element:plantbook2_elements!element_id(*), result_plant:plantbook2_plants!result_plant_id(*)').single();
      if (craftError) throw craftError;
      setPlants((current) => sortLibrary([...current, newPlant as Plantbook2Plant]));
      setCrafts((current) => [craftData as Plantbook2Craft, ...current]);
      setPlantId(newPlant.id); setElementId(''); setResultName(''); setNotes(''); clearImage(resultImage, setResultImage);
      setNotice(`${newPlant.title} was crafted and is ready for the next recipe.`);
    } catch (error) {
      if (newPlant) await supabase.from('plantbook2_plants').delete().eq('id', newPlant.id);
      if (uploaded) void appStorage.from(STORAGE_BUCKET).remove([uploaded.path]);
      setNotice(errorMessage(error, 'The recipe could not be saved.'));
    } finally { setBusy(''); }
  };

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.back}>← Lucy Earth</Link>
        <span>PLANTBOOK / II</span>
        <Link href="/plantbook" className={styles.previous}>Vol. I</Link>
      </header>

      {pageError && <div className={styles.alert}>{pageError} <button onClick={() => void fetchBook()}>Try again</button></div>}
      {notice && <div className={styles.notice} role="status"><span>✦</span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}

      <div className={styles.workspace}>
        <section className={styles.setupPanel}>
          <div className={styles.sectionHeading}><span>01</span><div><p>Origin stories</p><h2>Character + base plant</h2></div></div>
          <form onSubmit={addCharacter} className={`${styles.compactForm} ${styles.characterForm}`}>
            <label>Character name<input value={characterName} onChange={(e) => setCharacterName(e.target.value)} placeholder="Lumi" /></label>
            <label>Base plant<input value={basePlantName} onChange={(e) => setBasePlantName(e.target.value)} placeholder="Fern" /></label>
            <div className={styles.tierPreview}><span>begins at</span><b>Tier 1</b></div>
            <ImagePicker id="base-plant-image" value={basePlantImage} onChange={(file) => setImage(setBasePlantImage, basePlantImage, file)} label="Base plant image" />
            <button className={styles.inkButton} disabled={Boolean(busy)}>{busy === 'character' ? 'Remembering…' : 'Add character'}</button>
          </form>
          <div className={styles.roster}>
            {characters.length ? characters.map((character) => <article key={character.id}>
              <Specimen image={character.base_plant?.image_url || null} name={character.base_plant?.title || ''} kind="plant" size="small" />
              <div><b>{character.name}</b><span>paired with {character.base_plant?.title || 'a base plant'}</span></div>
              <div className={styles.itemActions}><button type="button" onClick={() => openCharacterEditor(character)}>Edit</button><button type="button" disabled={busy === 'delete'} onClick={() => void deleteItem('character', character.id, character.name)}>Delete</button></div>
            </article>) : <p>No characters yet. Begin an origin story.</p>}
          </div>
        </section>

        <section className={styles.setupPanel}>
          <div className={styles.sectionHeading}><span>02</span><div><p>Material archive</p><h2>Add an element</h2></div></div>
          <form onSubmit={addElement} className={`${styles.compactForm} ${styles.elementForm}`}>
            <div className={styles.elementMode}>
              <button type="button" className={elementMode === 'base' ? styles.elementModeActive : ''} onClick={() => { setElementMode('base'); setElementParentOne(''); setElementParentTwo(''); }}>New Tier 1</button>
              <button type="button" className={elementMode === 'fusion' ? styles.elementModeActive : ''} onClick={() => setElementMode('fusion')} disabled={elements.length === 0}>Fuse elements</button>
            </div>
            <label>Element name<input value={elementName} onChange={(e) => setElementName(e.target.value)} placeholder="Moonlight" /></label>
            {elementMode === 'fusion' ? <>
              <label>First ingredient
                <select value={elementParentOne} onChange={(e) => { setElementParentOne(e.target.value); setElementParentTwo(''); }}>
                  <option value="">Select an element…</option>
                  {elements.map((element) => <option key={element.id} value={element.id}>T{element.tier} · {element.title}</option>)}
                </select>
              </label>
              <label>Second ingredient
                <select value={elementParentTwo} onChange={(e) => setElementParentTwo(e.target.value)} disabled={!elementParentOne}>
                  <option value="">{elementParentOneRecord ? 'Select any element…' : 'Choose the first ingredient…'}</option>
                  {elements.map((element) => <option key={element.id} value={element.id}>T{element.tier} · {element.title}</option>)}
                </select>
              </label>
            </> : <div className={styles.baseElementNote}><b>Tier 1</b><span>The beginning of a new element line</span></div>}
            <div className={styles.tierPreview}><span>will become</span><b>Tier {nextElementTier}</b></div>
            <ImagePicker id="element-image" value={elementImage} onChange={(file) => setImage(setElementImage, elementImage, file)} />
            <button className={styles.inkButton} disabled={Boolean(busy)}>{busy === 'element' ? 'Remembering…' : 'Add to elements'}</button>
          </form>
          <div className={styles.library}>
            {elements.length ? elements.map((element) => <div className={styles.libraryItem} key={element.id}>
              <Specimen image={element.image_url} name={element.title} kind="element" size="small" />
              <span><b>{element.title}</b><small>Tier {element.tier}{element.parent_element_id && element.second_parent_element_id ? ' · fused' : ''}</small></span>
              <span className={styles.useCount}>{elementUseCounts.get(element.id) || 0} {(elementUseCounts.get(element.id) || 0) === 1 ? 'plant' : 'plants'}</span>
              <div className={styles.itemActions}><button type="button" onClick={() => openElementEditor(element)}>Edit</button><button type="button" disabled={busy === 'delete'} onClick={() => void deleteItem('element', element.id, element.title, element.image_path)}>Delete</button></div>
            </div>) : <p>No elements yet. Add the first material.</p>}
          </div>
        </section>
      </div>

      <section className={styles.craftSection}>
        <div className={styles.sectionHeading}><span>03</span><div><p>The main table</p><h2>Craft a new plant</h2></div></div>
        <form onSubmit={craftPlant} className={styles.equation}>
          <div className={styles.ingredientCard}>
            <div className={styles.cardTop}><span>PLANT / SOURCE</span>{selectedPlant && <b>TIER {selectedPlant.tier}</b>}</div>
            <Specimen image={selectedPlant?.image_url || null} name={selectedPlant?.title || 'Plant'} kind="plant" size="large" />
            <label>Choose remembered plant<select value={plantId} onChange={(e) => setPlantId(e.target.value)}><option value="">Select a plant…</option>{plants.map((plant) => <option key={plant.id} value={plant.id}>T{plant.tier} · {plant.title}</option>)}</select></label>
          </div>
          <div className={styles.operator}>+</div>
          <div className={styles.ingredientCard}>
            <div className={styles.cardTop}><span>ELEMENT / CATALYST</span>{selectedElement && <b>TIER {selectedElement.tier}</b>}</div>
            <Specimen image={selectedElement?.image_url || null} name={selectedElement?.title || 'Element'} kind="element" size="large" />
            <label>Choose remembered element<select value={elementId} onChange={(e) => setElementId(e.target.value)}><option value="">Select an element…</option>{elements.map((element) => <option key={element.id} value={element.id}>T{element.tier} · {element.title}</option>)}</select></label>
          </div>
          <div className={`${styles.operator} ${styles.arrow}`}>→</div>
          <div className={`${styles.ingredientCard} ${styles.resultCard}`}>
            <div className={styles.cardTop}><span>NEW PLANT / RESULT</span>{selectedPlant && <b>TIER {nextPlantTier}</b>}</div>
            <ImagePicker id="result-image" value={resultImage} onChange={(file) => setImage(setResultImage, resultImage, file)} label="Result plant image" />
            <label>Name this plant<input value={resultName} onChange={(e) => setResultName(e.target.value)} placeholder="Dream fern" /></label>
          </div>
          <label className={styles.notes}>Field notes <span>optional</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What changed? What does it need?" /></label>
          <button className={styles.craftButton} disabled={Boolean(busy) || loading}>{busy === 'craft' ? 'Crafting…' : 'Craft & remember'}<span>New result returns to the plant list</span></button>
        </form>
      </section>

      <section className={styles.ledger}>
        <div className={styles.ledgerHeading}><div><p>04 / Recorded transformations</p><h2>Recipe ledger</h2></div><span>{crafts.length.toString().padStart(2, '0')} entries</span></div>
        {loading ? <div className={styles.empty}>Opening the specimen drawers…</div> : crafts.length ? <div className={styles.tableWrap}><table><thead><tr><th>No.</th><th>Source plant</th><th></th><th>Element</th><th></th><th>Result plant</th><th>Tier</th><th>Field note</th><th>Manage</th></tr></thead><tbody>{crafts.map((craft, index) => <tr key={craft.id}>
          <td className={styles.rowNumber}>{String(crafts.length - index).padStart(2, '0')}</td>
          <td><div className={styles.tableSpecimen}><Specimen image={craft.plant?.image_url || null} name={craft.plant?.title || ''} kind="plant" size="small" /><b>{craft.plant?.title}</b></div></td>
          <td className={styles.symbol}>+</td>
          <td><div className={styles.tableSpecimen}><Specimen image={craft.element?.image_url || null} name={craft.element?.title || ''} kind="element" size="small" /><b>{craft.element?.title}</b></div></td>
          <td className={styles.symbol}>→</td>
          <td><div className={styles.tableSpecimen}><Specimen image={craft.result_plant?.image_url || null} name={craft.result_plant?.title || ''} kind="plant" size="small" /><b>{craft.result_plant?.title}</b></div></td>
          <td><span className={styles.tierBadge}>T{craft.result_plant?.tier}</span></td><td className={styles.noteCell}>{craft.notes || '—'}</td><td><div className={styles.itemActions}><button type="button" onClick={() => openCraftEditor(craft)}>Edit</button><button type="button" disabled={busy === 'delete'} onClick={() => void deleteItem('craft', craft.id, craft.result_plant?.title || 'recipe')}>Delete</button></div></td>
        </tr>)}</tbody></table></div> : <div className={styles.empty}><span>♧ + ✦</span><h3>Your first recipe begins above.</h3><p>Every result will be kept here and returned to your plant library.</p></div>}
      </section>

      {editor && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
        <section className={styles.editorModal} role="dialog" aria-modal="true" aria-labelledby="edit-title">
          <header><div><p>Edit {editor.kind}</p><h2 id="edit-title">{editor.name}</h2></div><button type="button" onClick={closeEditor} aria-label="Close editor">×</button></header>
          <form onSubmit={saveEdit}>
            <label>{editor.kind === 'craft' ? 'Result plant name' : 'Name'}<input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
            {editor.kind === 'character' && <label>Base plant<select value={editor.basePlantId} onChange={(event) => setEditor({ ...editor, basePlantId: event.target.value })}>{plants.filter((plant) => plant.tier === 1).map((plant) => <option key={plant.id} value={plant.id}>{plant.title}</option>)}</select></label>}
            {editor.kind === 'element' && <>
              <label>First ingredient <span>empty = Tier 1</span><select value={editor.parentOneId} onChange={(event) => setEditor({ ...editor, parentOneId: event.target.value, parentTwoId: event.target.value ? editor.parentTwoId : '' })}><option value="">No ingredients</option>{elements.filter((element) => element.id !== editor.id).map((element) => <option key={element.id} value={element.id}>T{element.tier} · {element.title}</option>)}</select></label>
              <label>Second ingredient<select value={editor.parentTwoId} disabled={!editor.parentOneId} onChange={(event) => setEditor({ ...editor, parentTwoId: event.target.value })}><option value="">Select an element…</option>{elements.filter((element) => element.id !== editor.id).map((element) => <option key={element.id} value={element.id}>T{element.tier} · {element.title}</option>)}</select></label>
            </>}
            {editor.kind === 'craft' && <>
              <label>Source plant<select value={editor.plantId} onChange={(event) => setEditor({ ...editor, plantId: event.target.value })}>{plants.filter((plant) => plant.id !== editingCraft?.result_plant_id).map((plant) => <option key={plant.id} value={plant.id}>T{plant.tier} · {plant.title}</option>)}</select></label>
              <label>Element<select value={editor.elementId} onChange={(event) => setEditor({ ...editor, elementId: event.target.value })}>{elements.map((element) => <option key={element.id} value={element.id}>T{element.tier} · {element.title}</option>)}</select></label>
              <label className={styles.modalNotes}>Field notes<textarea value={editor.notes} onChange={(event) => setEditor({ ...editor, notes: event.target.value })} /></label>
            </>}
            {(editor.kind === 'plant' || editor.kind === 'element' || editor.kind === 'craft') && <div className={styles.modalImage}><span>{editor.kind === 'craft' ? 'Result image' : 'Image'}</span><ImagePicker id="editor-image" value={editor.image} onChange={changeEditorImage} /></div>}
            <footer><button type="button" onClick={closeEditor}>Cancel</button><button type="submit" disabled={busy === 'edit'}>{busy === 'edit' ? 'Saving…' : 'Save changes'}</button></footer>
          </form>
        </section>
      </div>}

      <footer className={styles.footer}><span>Plantbook II · perpetual index</span><span>{new Date().getFullYear()} / Lucy Earth</span></footer>
    </main>
  );
}
