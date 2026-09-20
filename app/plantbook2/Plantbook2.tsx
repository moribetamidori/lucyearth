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
type BookView = 'workbench' | 'ai-review' | 'plant-tree' | 'element-tree';
type ReviewFilter = 'pending' | 'approved' | 'all';
type SuggestionKind = 'element' | 'craft';
type Editor = {
  kind: EditKind;
  id: string;
  name: string;
  image: ImageDraft;
  originalImagePath: string | null;
  originalImageSource: string | null;
  originalImageAttribution: string | null;
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

function PlantFamilyBranch({
  plant,
  childrenByPlant,
  craftByResult,
  charactersByPlant,
  lineage = new Set<string>(),
  onEditCraft,
}: {
  plant: Plantbook2Plant;
  childrenByPlant: Map<string, Plantbook2Plant[]>;
  craftByResult: Map<string, Plantbook2Craft>;
  charactersByPlant: Map<string, Plantbook2Character[]>;
  lineage?: Set<string>;
  onEditCraft: (craft: Plantbook2Craft) => void;
}) {
  const craft = craftByResult.get(plant.id);
  const familyCharacters = charactersByPlant.get(plant.id) || [];
  const nextLineage = new Set(lineage);
  nextLineage.add(plant.id);
  const children = (childrenByPlant.get(plant.id) || []).filter((child) => !nextLineage.has(child.id));

  return (
    <li className={styles.treeBranch}>
      <article className={`${styles.treeNode} ${craft ? styles.hybridNode : styles.rootNode}`}>
        <div className={styles.treeNodeTop}>
          <span>{craft ? 'Hybrid plant' : 'Base plant'}{plant.ai_generated && <em className={styles.aiTag}>AI generated</em>}</span>
          <b>T{plant.tier}</b>
        </div>
        <div className={styles.treePlant}>
          <Specimen image={plant.image_url} name={plant.title} kind="plant" size="normal" />
          <h3>{plant.title}</h3>
        </div>
        {familyCharacters.length > 0 && (
          <div className={styles.treeCharacters}>
            <span>Family of</span>
            <strong>{familyCharacters.map((character) => character.name).join(' · ')}</strong>
          </div>
        )}
        {craft && (
          <div className={styles.treeCatalyst}>
            <span>hybridized with</span>
            <div>
              <Specimen image={craft.element?.image_url || null} name={craft.element?.title || 'Element'} kind="element" size="small" />
              <strong>{craft.element?.title || 'Unknown element'}</strong>
            </div>
            <button type="button" onClick={() => onEditCraft(craft)}>Edit recipe</button>
          </div>
        )}
      </article>
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <PlantFamilyBranch
              key={child.id}
              plant={child}
              childrenByPlant={childrenByPlant}
              craftByResult={craftByResult}
              charactersByPlant={charactersByPlant}
              lineage={nextLineage}
              onEditCraft={onEditCraft}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function ElementFamilyBranch({
  element,
  elementById,
  lineage = new Set<string>(),
  onEditElement,
}: {
  element: Plantbook2Element;
  elementById: Map<string, Plantbook2Element>;
  lineage?: Set<string>;
  onEditElement: (element: Plantbook2Element) => void;
}) {
  const nextLineage = new Set(lineage);
  nextLineage.add(element.id);
  const parentIds = [element.parent_element_id, element.second_parent_element_id].filter((id): id is string => Boolean(id));
  const parents = parentIds
    .map((id) => elementById.get(id))
    .filter((parent): parent is Plantbook2Element => parent !== undefined && !nextLineage.has(parent.id));
  const isFusion = parentIds.length > 0;

  return (
    <li className={styles.treeBranch}>
      <article className={`${styles.treeNode} ${styles.elementTreeNode} ${isFusion ? styles.hybridNode : styles.rootNode}`}>
        <div className={styles.treeNodeTop}>
          <span>{isFusion ? 'Fused element' : 'Base element'}{element.ai_generated && <em className={styles.aiTag}>AI generated</em>}</span>
          <b>T{element.tier}</b>
        </div>
        <div className={styles.treePlant}>
          <Specimen image={element.image_url} name={element.title} kind="element" size="normal" />
          <h3>{element.title}</h3>
        </div>
        {isFusion && (
          <div className={styles.elementFormula}>
            <span>fused from</span>
            <strong>{parents.map((parent) => parent.title).join(' + ') || 'Unknown ingredients'}</strong>
          </div>
        )}
        <button className={styles.treeEditButton} type="button" onClick={() => onEditElement(element)}>Edit element</button>
      </article>
      {parents.length > 0 && (
        <ul>
          {parents.map((parent, index) => (
            <ElementFamilyBranch
              key={`${parent.id}-${index}`}
              element={parent}
              elementById={elementById}
              lineage={nextLineage}
              onEditElement={onEditElement}
            />
          ))}
        </ul>
      )}
    </li>
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
  const [busy, setBusy] = useState<'element' | 'character' | 'craft' | 'edit' | 'delete' | 'curation' | ''>('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [bookView, setBookView] = useState<BookView>('workbench');
  const [treeCharacterFilter, setTreeCharacterFilter] = useState('');
  const [treeElementFilter, setTreeElementFilter] = useState('');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('pending');
  const [reviewSearch, setReviewSearch] = useState('');

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
  const [characterFilter, setCharacterFilter] = useState('');
  const [elementFilter, setElementFilter] = useState('');
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
    originalImageSource: null, originalImageAttribution: null,
    removeImage: false, plantId: '', elementId: '', basePlantId: '',
    parentOneId: element.parent_element_id || '',
    parentTwoId: element.second_parent_element_id || '', notes: '',
  });

  const openCharacterEditor = (character: Plantbook2Character) => setEditor({
    kind: 'character', id: character.id, name: character.name, image: blankImage(),
    originalImagePath: null, originalImageSource: null, originalImageAttribution: null,
    removeImage: false, plantId: '', elementId: '',
    basePlantId: character.base_plant_id, parentOneId: '', parentTwoId: '', notes: '',
  });

  const openCraftEditor = (craft: Plantbook2Craft) => setEditor({
    kind: 'craft', id: craft.id, name: craft.result_plant?.title || '',
    image: { file: null, preview: craft.result_plant?.image_url || null },
    originalImagePath: craft.result_plant?.image_path || null,
    originalImageSource: craft.result_plant?.image_source_url || null,
    originalImageAttribution: craft.result_plant?.image_attribution || null,
    removeImage: false,
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
      const plantCreditValues = {
        image_source_url: uploaded || editor.removeImage ? null : editor.originalImageSource,
        image_attribution: uploaded || editor.removeImage ? null : editor.originalImageAttribution,
      };

      if (editor.kind === 'plant') {
        const { error } = await supabase.from('plantbook2_plants').update({ title: editor.name.trim(), ...imageValues, ...plantCreditValues }).eq('id', editor.id);
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
        const ingredientConflict = crafts.find((item) =>
          item.id !== editor.id
          && item.plant_id === editor.plantId
          && item.element_id === editor.elementId
        );
        if (ingredientConflict) {
          throw new Error(`${source.title} + ${elements.find((item) => item.id === editor.elementId)?.title || 'that element'} already creates ${ingredientConflict.result_plant?.title || 'another plant'}. Choose a unique pair.`);
        }
        const originalResult = craft.result_plant;
        const { error: plantError } = await supabase.from('plantbook2_plants').update({
          title: editor.name.trim(), tier: source.tier + 1, parent_plant_id: source.id, ...imageValues, ...plantCreditValues,
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
            image_source_url: originalResult.image_source_url,
            image_attribution: originalResult.image_attribution,
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
    const generated = kind === 'craft'
      ? crafts.find((craft) => craft.id === id)?.ai_generated
      : kind === 'element'
        ? elements.find((element) => element.id === id)?.ai_generated
        : false;
    const detail = generated
      ? kind === 'craft'
        ? 'Its AI-generated result branch will also be removed.'
        : 'This AI-generated suggestion will be removed.'
      : kind === 'craft'
        ? 'The result plant will stay in your plant library.'
        : 'This cannot be undone.';
    if (!window.confirm(`Delete ${kind === 'craft' ? 'the recipe for' : ''} “${title}”? ${detail}`)) return;
    setBusy('delete'); setNotice('');
    if (generated && (kind === 'craft' || kind === 'element')) {
      const { error } = await supabase.rpc('delete_plantbook2_ai_suggestion', {
        item_kind: kind,
        item_id: id,
      });
      if (error) {
        setNotice(errorMessage(error, 'This AI suggestion could not be deleted.'));
      } else {
        if (imagePath) void appStorage.from(STORAGE_BUCKET).remove([imagePath]);
        await fetchBook();
        setNotice(`“${title}” and its generated branch were deleted.`);
      }
      setBusy('');
      return;
    }
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

  const approveSuggestion = async (kind: SuggestionKind, id: string, title: string) => {
    setBusy('curation'); setNotice('');
    const { error } = await supabase.rpc('set_plantbook2_ai_curation', {
      item_kind: kind,
      item_id: id,
      next_status: 'approved',
    });
    if (error) {
      setNotice(errorMessage(error, 'This suggestion could not be approved.'));
    } else {
      await fetchBook();
      setNotice(`“${title}” approved and kept in Plantbook II.`);
    }
    setBusy('');
  };

  const deleteSuggestion = async (kind: SuggestionKind, id: string, title: string) => {
    const craft = kind === 'craft' ? crafts.find((item) => item.id === id) : null;
    const descendants = craft ? (() => {
      const ids = new Set<string>([craft.result_plant_id]);
      let changed = true;
      while (changed) {
        changed = false;
        plants.forEach((plant) => {
          if (plant.parent_plant_id && ids.has(plant.parent_plant_id) && !ids.has(plant.id)) {
            ids.add(plant.id); changed = true;
          }
        });
      }
      return ids.size - 1;
    })() : 0;
    const branchNote = descendants > 0
      ? ` This will also remove ${descendants} generated descendant${descendants === 1 ? '' : 's'} in its family branch.`
      : '';
    if (!window.confirm(`Delete AI suggestion “${title}”?${branchNote} This cannot be undone.`)) return;

    setBusy('curation'); setNotice('');
    const { error } = await supabase.rpc('delete_plantbook2_ai_suggestion', {
      item_kind: kind,
      item_id: id,
    });
    if (error) {
      setNotice(errorMessage(error, 'This suggestion could not be deleted. It may now be used by a hand-made recipe.'));
    } else {
      await fetchBook();
      setNotice(`“${title}” deleted from the generated suggestions.`);
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
  const craftNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    crafts.forEach((craft, index) => numbers.set(craft.id, crafts.length - index));
    return numbers;
  }, [crafts]);
  const characterPlantIds = useMemo(() => {
    const lineages = new Map<string, Set<string>>();
    characters.forEach((character) => {
      const ids = new Set<string>([character.base_plant_id]);
      let changed = true;
      while (changed) {
        changed = false;
        plants.forEach((plant) => {
          if (plant.parent_plant_id && ids.has(plant.parent_plant_id) && !ids.has(plant.id)) {
            ids.add(plant.id);
            changed = true;
          }
        });
      }
      lineages.set(character.id, ids);
    });
    return lineages;
  }, [characters, plants]);
  const filteredCrafts = useMemo(() => {
    const characterPlants = characterFilter ? characterPlantIds.get(characterFilter) : null;
    return crafts.filter((craft) => {
      const matchesCharacter = !characterPlants
        || characterPlants.has(craft.plant_id)
        || characterPlants.has(craft.result_plant_id);
      const matchesElement = !elementFilter || craft.element_id === elementFilter;
      return matchesCharacter && matchesElement;
    });
  }, [characterFilter, characterPlantIds, crafts, elementFilter]);
  const generatedElements = useMemo(() => elements.filter((element) => element.ai_generated), [elements]);
  const generatedCrafts = useMemo(() => crafts.filter((craft) => craft.ai_generated), [crafts]);
  const pendingSuggestionCount = useMemo(
    () => generatedElements.filter((element) => element.curation_status === 'pending').length
      + generatedCrafts.filter((craft) => craft.curation_status === 'pending').length,
    [generatedCrafts, generatedElements],
  );
  const reviewItems = useMemo(() => {
    const term = reviewSearch.trim().toLocaleLowerCase();
    const statusMatches = (status: 'pending' | 'approved') => reviewFilter === 'all' || status === reviewFilter;
    const matches = (...values: Array<string | null | undefined>) => !term
      || values.some((value) => value?.toLocaleLowerCase().includes(term));
    return {
      elements: generatedElements.filter((element) => statusMatches(element.curation_status)
        && matches(element.title)),
      crafts: generatedCrafts.filter((craft) => statusMatches(craft.curation_status)
        && matches(craft.plant?.title, craft.element?.title, craft.result_plant?.title, craft.notes)),
    };
  }, [generatedCrafts, generatedElements, reviewFilter, reviewSearch]);
  const familyTree = useMemo(() => {
    const plantIds = new Set(plants.map((plant) => plant.id));
    const childrenByPlant = new Map<string, Plantbook2Plant[]>();
    const craftByResult = new Map(crafts.map((craft) => [craft.result_plant_id, craft]));
    const charactersByPlant = new Map<string, Plantbook2Character[]>();

    plants.forEach((plant) => {
      if (!plant.parent_plant_id || !plantIds.has(plant.parent_plant_id)) return;
      const siblings = childrenByPlant.get(plant.parent_plant_id) || [];
      siblings.push(plant);
      childrenByPlant.set(plant.parent_plant_id, siblings);
    });
    childrenByPlant.forEach((children) => children.sort((a, b) => a.tier - b.tier || a.title.localeCompare(b.title)));
    characters.forEach((character) => {
      const family = charactersByPlant.get(character.base_plant_id) || [];
      family.push(character);
      charactersByPlant.set(character.base_plant_id, family);
    });

    const roots = sortLibrary(plants.filter((plant) => !plant.parent_plant_id || !plantIds.has(plant.parent_plant_id)));
    const visited = new Set<string>();
    const visit = (plant: Plantbook2Plant, path = new Set<string>()) => {
      if (path.has(plant.id)) return;
      visited.add(plant.id);
      const nextPath = new Set(path);
      nextPath.add(plant.id);
      (childrenByPlant.get(plant.id) || []).forEach((child) => visit(child, nextPath));
    };
    roots.forEach((root) => visit(root));
    plants.forEach((plant) => {
      if (!visited.has(plant.id)) {
        roots.push(plant);
        visit(plant);
      }
    });

    return { roots, childrenByPlant, craftByResult, charactersByPlant };
  }, [characters, crafts, plants]);
  const visibleFamilyRoots = useMemo(() => {
    if (!treeCharacterFilter) return familyTree.roots;
    const character = characters.find((item) => item.id === treeCharacterFilter);
    const basePlant = character ? plants.find((plant) => plant.id === character.base_plant_id) : null;
    return basePlant ? [basePlant] : [];
  }, [characters, familyTree.roots, plants, treeCharacterFilter]);
  const elementTree = useMemo(() => {
    const elementById = new Map(elements.map((element) => [element.id, element]));
    const usedAsIngredient = new Set<string>();
    elements.forEach((element) => {
      if (element.parent_element_id) usedAsIngredient.add(element.parent_element_id);
      if (element.second_parent_element_id) usedAsIngredient.add(element.second_parent_element_id);
    });

    const roots = [...elements]
      .filter((element) => !usedAsIngredient.has(element.id))
      .sort((a, b) => b.tier - a.tier || a.title.localeCompare(b.title));
    const visited = new Set<string>();
    const visit = (element: Plantbook2Element, path = new Set<string>()) => {
      if (path.has(element.id)) return;
      visited.add(element.id);
      const nextPath = new Set(path);
      nextPath.add(element.id);
      [element.parent_element_id, element.second_parent_element_id].forEach((parentId) => {
        const parent = parentId ? elementById.get(parentId) : null;
        if (parent) visit(parent, nextPath);
      });
    };
    roots.forEach((root) => visit(root));
    elements.forEach((element) => {
      if (!visited.has(element.id)) {
        roots.push(element);
        visit(element);
      }
    });

    return { roots, elementById };
  }, [elements]);
  const visibleElementRoots = useMemo(() => {
    if (!treeElementFilter) return elementTree.roots;
    const element = elementTree.elementById.get(treeElementFilter);
    return element ? [element] : [];
  }, [elementTree, treeElementFilter]);
  const elementParentOneRecord = elements.find((element) => element.id === elementParentOne);
  const elementParentTwoRecord = elements.find((element) => element.id === elementParentTwo);
  const nextElementTier = elementMode === 'base'
    ? 1
    : Math.max(elementParentOneRecord?.tier || 0, elementParentTwoRecord?.tier || 0) + 1;
  const nextPlantTier = (selectedPlant?.tier || 0) + 1;
  const editingCraft = editor?.kind === 'craft' ? crafts.find((craft) => craft.id === editor.id) : null;
  const editingSourcePlant = editor?.kind === 'craft' ? plants.find((plant) => plant.id === editor.plantId) : null;
  const editingElement = editor?.kind === 'craft' ? elements.find((element) => element.id === editor.elementId) : null;
  const blockedEditingSourceIds = (() => {
    const ids = new Set<string>();
    if (!editingCraft?.result_plant_id) return ids;
    ids.add(editingCraft.result_plant_id);
    let changed = true;
    while (changed) {
      changed = false;
      plants.forEach((plant) => {
        if (plant.parent_plant_id && ids.has(plant.parent_plant_id) && !ids.has(plant.id)) {
          ids.add(plant.id);
          changed = true;
        }
      });
    }
    return ids;
  })();

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
    const ingredientConflict = crafts.find((craft) =>
      craft.plant_id === selectedPlant.id && craft.element_id === selectedElement.id
    );
    if (ingredientConflict) {
      return setNotice(`${selectedPlant.title} + ${selectedElement.title} already creates ${ingredientConflict.result_plant?.title || 'another plant'}. Every ingredient pair can have only one result.`);
    }
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

      <nav className={styles.viewBar} aria-label="Plantbook view">
        <div className={styles.viewSwitcher} role="group" aria-label="Choose a Plantbook view">
          <button type="button" className={bookView === 'workbench' ? styles.viewActive : ''} aria-pressed={bookView === 'workbench'} onClick={() => setBookView('workbench')}>Workbench</button>
          <button type="button" className={bookView === 'ai-review' ? styles.viewActive : ''} aria-pressed={bookView === 'ai-review'} onClick={() => setBookView('ai-review')}>AI review{pendingSuggestionCount > 0 ? ` · ${pendingSuggestionCount}` : ''}</button>
          <button type="button" className={bookView === 'plant-tree' ? styles.viewActive : ''} aria-pressed={bookView === 'plant-tree'} onClick={() => setBookView('plant-tree')}>Plant trees</button>
          <button type="button" className={bookView === 'element-tree' ? styles.viewActive : ''} aria-pressed={bookView === 'element-tree'} onClick={() => setBookView('element-tree')}>Element trees</button>
        </div>
        <span>{bookView === 'workbench' ? 'Create and record hybrids' : bookView === 'ai-review' ? 'Approve or reject generated curiosities' : bookView === 'plant-tree' ? 'Trace every plant lineage' : 'Trace every element fusion'}</span>
      </nav>

      {pageError && <div className={styles.alert}>{pageError} <button onClick={() => void fetchBook()}>Try again</button></div>}
      {notice && <div className={styles.notice} role="status"><span>✦</span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}

      {bookView === 'workbench' ? <>
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
              <span><b>{element.title}</b><small>Tier {element.tier}{element.parent_element_id && element.second_parent_element_id ? ' · fused' : ''}{element.ai_generated && <em className={styles.aiTag}>AI generated</em>}</small></span>
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
        <div className={styles.ledgerHeading}>
          <div><p>04 / Recorded transformations</p><h2>Recipe ledger</h2></div>
          <div className={styles.ledgerTools}>
            <label>Character<select value={characterFilter} onChange={(event) => setCharacterFilter(event.target.value)}><option value="">All characters</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>
            <label>Element<select value={elementFilter} onChange={(event) => setElementFilter(event.target.value)}><option value="">All elements</option>{elements.map((element) => <option key={element.id} value={element.id}>T{element.tier} · {element.title}</option>)}</select></label>
            <span>{filteredCrafts.length.toString().padStart(2, '0')} {filteredCrafts.length === 1 ? 'entry' : 'entries'}</span>
          </div>
        </div>
        {loading ? <div className={styles.empty}>Opening the specimen drawers…</div> : filteredCrafts.length ? <div className={styles.tableWrap}><table><thead><tr><th>No.</th><th>Source plant</th><th></th><th>Element</th><th></th><th>Result plant</th><th>Tier</th><th>Field note</th><th>Manage</th></tr></thead><tbody>{filteredCrafts.map((craft) => <tr key={craft.id}>
          <td className={styles.rowNumber}>{String(craftNumbers.get(craft.id) || 0).padStart(2, '0')}</td>
          <td><div className={styles.tableSpecimen}><Specimen image={craft.plant?.image_url || null} name={craft.plant?.title || ''} kind="plant" size="small" /><b>{craft.plant?.title}</b></div></td>
          <td className={styles.symbol}>+</td>
          <td><div className={styles.tableSpecimen}><Specimen image={craft.element?.image_url || null} name={craft.element?.title || ''} kind="element" size="small" /><b>{craft.element?.title}</b></div></td>
          <td className={styles.symbol}>→</td>
          <td><div className={styles.tableSpecimen}><Specimen image={craft.result_plant?.image_url || null} name={craft.result_plant?.title || ''} kind="plant" size="small" /><b>{craft.result_plant?.title}</b>{craft.ai_generated && <span className={styles.aiTag}>AI generated</span>}</div></td>
          <td><span className={styles.tierBadge}>T{craft.result_plant?.tier}</span></td><td className={styles.noteCell}>{craft.notes || '—'}</td><td><div className={styles.itemActions}><button type="button" onClick={() => openCraftEditor(craft)}>Edit</button><button type="button" disabled={busy === 'delete'} onClick={() => void deleteItem('craft', craft.id, craft.result_plant?.title || 'recipe')}>Delete</button></div></td>
        </tr>)}</tbody></table></div> : <div className={styles.empty}><span>♧ + ✦</span><h3>{crafts.length ? 'No recipes match these filters.' : 'Your first recipe begins above.'}</h3><p>{crafts.length ? 'Choose another character or element to see more plants.' : 'Every result will be kept here and returned to your plant library.'}</p>{crafts.length > 0 && <button type="button" onClick={() => { setCharacterFilter(''); setElementFilter(''); }}>Clear filters</button>}</div>}
      </section>
      </> : bookView === 'ai-review' ? <section className={styles.reviewView}>
        <div className={styles.reviewHeading}>
          <div><p>Curator&apos;s cabinet</p><h1>AI-generated suggestions</h1><span>Every result is a documented real-world plant or fungus. Keep the delightful ones; remove the rest.</span></div>
          <div className={styles.reviewTotals}>
            <span><b>{plants.length}</b> plants</span>
            <span><b>{elements.length}</b> elements</span>
            <span><b>{pendingSuggestionCount}</b> awaiting review</span>
          </div>
        </div>
        <div className={styles.reviewTools}>
          <label>Search suggestions<input type="search" value={reviewSearch} onChange={(event) => setReviewSearch(event.target.value)} placeholder="Plant, element, or scientific name…" /></label>
          <label>Review status<select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as ReviewFilter)}><option value="pending">Awaiting review</option><option value="approved">Approved</option><option value="all">All AI generated</option></select></label>
        </div>

        <section className={styles.reviewGroup}>
          <header><div><span>Element + element</span><h2>Element fusions</h2></div><b>{reviewItems.elements.length}</b></header>
          {reviewItems.elements.length > 0 ? <div className={styles.reviewGrid}>{reviewItems.elements.map((element) => {
            const firstParent = element.parent_element_id ? elementTree.elementById.get(element.parent_element_id) : null;
            const secondParent = element.second_parent_element_id ? elementTree.elementById.get(element.second_parent_element_id) : null;
            return <article className={styles.reviewCard} key={element.id}>
              <div className={styles.reviewCardTop}><span className={styles.aiTag}>AI generated</span><span className={element.curation_status === 'approved' ? styles.approvedTag : styles.pendingTag}>{element.curation_status === 'approved' ? 'Approved' : 'Awaiting review'}</span></div>
              <div className={styles.reviewFormula}><span>{firstParent?.title || '?'}</span><i>+</i><span>{secondParent?.title || '?'}</span><i>→</i><strong>{element.title}</strong></div>
              <p>Tier {element.tier} element fusion</p>
              <footer>{element.curation_status === 'pending' && <button className={styles.approveButton} type="button" disabled={busy === 'curation'} onClick={() => void approveSuggestion('element', element.id, element.title)}>Approve &amp; keep</button>}<button className={styles.rejectButton} type="button" disabled={busy === 'curation'} onClick={() => void deleteSuggestion('element', element.id, element.title)}>Delete</button></footer>
            </article>;
          })}</div> : <div className={styles.reviewEmpty}>No element suggestions match this view.</div>}
        </section>

        <section className={styles.reviewGroup}>
          <header><div><span>Plant + element</span><h2>Real-world plant families</h2></div><b>{reviewItems.crafts.length}</b></header>
          {reviewItems.crafts.length > 0 ? <div className={styles.reviewList}>{reviewItems.crafts.map((craft) => <article className={styles.reviewRecipe} key={craft.id}>
            <div className={styles.reviewRecipeMain}>
              <div className={styles.reviewCardTop}><span className={styles.aiTag}>AI generated</span><span className={craft.curation_status === 'approved' ? styles.approvedTag : styles.pendingTag}>{craft.curation_status === 'approved' ? 'Approved' : 'Awaiting review'}</span></div>
              <div className={styles.reviewVisualFormula}>
                <div><Specimen image={craft.plant?.image_url || null} name={craft.plant?.title || 'Source plant'} kind="plant" size="small" /><span><small>Source plant</small>{craft.plant?.title || 'Unknown plant'}</span></div>
                <i>+</i>
                <div><Specimen image={craft.element?.image_url || null} name={craft.element?.title || 'Element'} kind="element" size="small" /><span><small>Element</small>{craft.element?.title || 'Unknown element'}</span></div>
                <i>→</i>
                <div className={styles.reviewResult}><Specimen image={craft.result_plant?.image_url || null} name={craft.result_plant?.title || 'Result plant'} kind="plant" size="small" /><span><small>Result · Tier {craft.result_plant?.tier || '?'}</small>{craft.result_plant?.title || 'Unknown result'}</span></div>
              </div>
              <p>{craft.notes || 'Verified real-world taxon.'} · Tier {craft.result_plant?.tier || '?'}</p>
              {(craft.plant?.image_source_url || craft.result_plant?.image_source_url) && <div className={styles.photoCredits}>
                {craft.plant?.image_source_url && <a href={craft.plant.image_source_url} target="_blank" rel="noreferrer" title={craft.plant.image_attribution || undefined}>Source photo credit</a>}
                {craft.result_plant?.image_source_url && <a href={craft.result_plant.image_source_url} target="_blank" rel="noreferrer" title={craft.result_plant.image_attribution || undefined}>Result photo credit</a>}
              </div>}
            </div>
            <footer><button className={styles.editButton} type="button" disabled={busy === 'curation'} onClick={() => openCraftEditor(craft)}>Edit</button>{craft.curation_status === 'pending' && <button className={styles.approveButton} type="button" disabled={busy === 'curation'} onClick={() => void approveSuggestion('craft', craft.id, craft.result_plant?.title || 'Plant suggestion')}>Approve &amp; keep</button>}<button className={styles.rejectButton} type="button" disabled={busy === 'curation'} onClick={() => void deleteSuggestion('craft', craft.id, craft.result_plant?.title || 'Plant suggestion')}>Delete</button></footer>
          </article>)}</div> : <div className={styles.reviewEmpty}>No plant suggestions match this view.</div>}
        </section>
      </section> : bookView === 'plant-tree' ? <section className={styles.familyView}>
        <div className={styles.familyHeading}>
          <div><p>Lineage atlas</p><h1>Plant family trees</h1><span>Follow each base plant through every element-led hybrid.</span></div>
          <label>Character family
            <select value={treeCharacterFilter} onChange={(event) => setTreeCharacterFilter(event.target.value)}>
              <option value="">All families</option>
              {characters.map((character) => <option key={character.id} value={character.id}>{character.name} · {character.base_plant?.title || 'Base plant'}</option>)}
            </select>
          </label>
        </div>
        {loading ? <div className={styles.empty}>Growing the family trees…</div> : visibleFamilyRoots.length > 0 ? (
          <div className={styles.familyCanvas}>
            <div className={styles.familyForest}>
              {visibleFamilyRoots.map((root) => (
                <ul className={styles.treeRoot} key={root.id}>
                  <PlantFamilyBranch
                    plant={root}
                    childrenByPlant={familyTree.childrenByPlant}
                    craftByResult={familyTree.craftByResult}
                    charactersByPlant={familyTree.charactersByPlant}
                    onEditCraft={openCraftEditor}
                  />
                </ul>
              ))}
            </div>
          </div>
        ) : <div className={styles.empty}><span>♧</span><h3>No plant families yet.</h3><p>Return to the workbench to add a character and their base plant.</p><button type="button" onClick={() => setBookView('workbench')}>Open workbench</button></div>}
        {!loading && visibleFamilyRoots.length > 0 && <p className={styles.treeHint}>Scroll sideways to explore wide families. Each connector follows a plant into its next hybrid.</p>}
      </section> : <section className={styles.familyView}>
        <div className={styles.familyHeading}>
          <div><p>Element genealogy</p><h1>Element family trees</h1><span>Trace each fused element back through both of its ingredients.</span></div>
          <label>Element lineage
            <select value={treeElementFilter} onChange={(event) => setTreeElementFilter(event.target.value)}>
              <option value="">All final elements</option>
              {elements.map((element) => <option key={element.id} value={element.id}>T{element.tier} · {element.title}</option>)}
            </select>
          </label>
        </div>
        {loading ? <div className={styles.empty}>Tracing the element lineages…</div> : visibleElementRoots.length > 0 ? (
          <div className={styles.familyCanvas}>
            <div className={`${styles.familyForest} ${styles.reversedElementForest}`}>
              {visibleElementRoots.map((root) => (
                <ul className={`${styles.treeRoot} ${styles.reversedElementTree}`} key={root.id}>
                  <ElementFamilyBranch
                    element={root}
                    elementById={elementTree.elementById}
                    onEditElement={openElementEditor}
                  />
                </ul>
              ))}
            </div>
          </div>
        ) : <div className={styles.empty}><span>✦</span><h3>No element families yet.</h3><p>Return to the workbench to add or fuse elements.</p><button type="button" onClick={() => setBookView('workbench')}>Open workbench</button></div>}
        {!loading && visibleElementRoots.length > 0 && <p className={styles.treeHint}>Original ingredients form each crown; follow the branches downward to the final fusion.</p>}
      </section>}

      {editor && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
        <section className={`${styles.editorModal} ${editor.kind === 'craft' ? styles.craftEditorModal : ''}`} role="dialog" aria-modal="true" aria-labelledby="edit-title">
          <header><div><p>Edit {editor.kind}</p><h2 id="edit-title">{editor.name}</h2></div><button type="button" onClick={closeEditor} aria-label="Close editor">×</button></header>
          <form onSubmit={saveEdit}>
            {editor.kind === 'craft' && <div className={styles.editorRecipePreview}>
              <figure><Specimen image={editingSourcePlant?.image_url || null} name={editingSourcePlant?.title || 'Source plant'} kind="plant" size="large" /><figcaption><small>Source plant</small><strong>{editingSourcePlant?.title || 'Choose a plant'}</strong></figcaption></figure>
              <i>+</i>
              <figure><Specimen image={editingElement?.image_url || null} name={editingElement?.title || 'Element'} kind="element" size="large" /><figcaption><small>Element</small><strong>{editingElement?.title || 'Choose an element'}</strong></figcaption></figure>
              <i>→</i>
              <figure><Specimen image={editor.image.preview} name={editor.name || 'Result plant'} kind="plant" size="large" /><figcaption><small>Result plant</small><strong>{editor.name || 'Unnamed plant'}</strong></figcaption></figure>
            </div>}
            <label>{editor.kind === 'craft' ? 'Result plant name' : 'Name'}<input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
            {editor.kind === 'character' && <label>Base plant<select value={editor.basePlantId} onChange={(event) => setEditor({ ...editor, basePlantId: event.target.value })}>{plants.filter((plant) => plant.tier === 1).map((plant) => <option key={plant.id} value={plant.id}>{plant.title}</option>)}</select></label>}
            {editor.kind === 'element' && <>
              <label>First ingredient <span>empty = Tier 1</span><select value={editor.parentOneId} onChange={(event) => setEditor({ ...editor, parentOneId: event.target.value, parentTwoId: event.target.value ? editor.parentTwoId : '' })}><option value="">No ingredients</option>{elements.filter((element) => element.id !== editor.id).map((element) => <option key={element.id} value={element.id}>T{element.tier} · {element.title}</option>)}</select></label>
              <label>Second ingredient<select value={editor.parentTwoId} disabled={!editor.parentOneId} onChange={(event) => setEditor({ ...editor, parentTwoId: event.target.value })}><option value="">Select an element…</option>{elements.filter((element) => element.id !== editor.id).map((element) => <option key={element.id} value={element.id}>T{element.tier} · {element.title}</option>)}</select></label>
            </>}
            {editor.kind === 'craft' && <>
              <label>Source plant<select value={editor.plantId} onChange={(event) => setEditor({ ...editor, plantId: event.target.value })}>{plants.filter((plant) => !blockedEditingSourceIds.has(plant.id)).map((plant) => <option key={plant.id} value={plant.id}>T{plant.tier} · {plant.title}</option>)}</select></label>
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
