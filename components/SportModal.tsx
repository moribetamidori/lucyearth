'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import Image from 'next/image';
import { supabase, type SportEntry, type SportEquipment } from '@/lib/supabase';
import { convertToWebP } from '@/lib/imageUpload';
import { appStorage } from '@/lib/storage';

type SportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  anonId?: string;
  isEditMode: boolean;
  onLogActivity?: (action: string, details?: string) => void;
};

type WeightUnit = SportEntry['weight_unit'];

type EquipmentOption = {
  id: string | null;
  name: string;
  sportName: string;
  imageUrl: string | null;
  count: number;
  bestWeight: number;
};

const STORAGE_BUCKET = 'sport-equipment-images';
const TABLE_NAME = 'sport_entries';
const EQUIPMENT_TABLE_NAME = 'sport_equipment';
const LOG_PAGE_SIZE = 10;
const ENTRY_FETCH_BATCH_SIZE = 200;
const CHART_COLORS = [
  '#bef264',
  '#67e8f9',
  '#f9a8d4',
  '#fde047',
  '#c4b5fd',
  '#fdba74',
  '#86efac',
  '#fca5a5',
  '#93c5fd',
  '#d8b4fe',
];

const todayInputValue = () => {
  const date = new Date();
  return formatLocalDateKey(date);
};

const formatLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatWeight = (value: number) =>
  Number.isInteger(value) ? `${value}` : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

const formatDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatChartDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = record.message;
    if (typeof message === 'string') return message;
  }
  return 'Unknown error';
};

const isMissingCanonicalSportsSchemaError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  const message = typeof record.message === 'string' ? record.message : '';
  const code = typeof record.code === 'string' ? record.code : '';

  return (
    code === 'PGRST205' ||
    message.includes("Could not find the table 'public.sport_equipment'") ||
    message.includes("Could not find the 'sport_equipment_id' column")
  );
};

const isMissingSportSetsRepsSchemaError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  const message = typeof record.message === 'string' ? record.message : '';

  return (
    message.includes("Could not find the 'sets_count' column") ||
    message.includes("Could not find the 'reps_count' column")
  );
};

const normalizeEquipmentName = (name: string) => name.trim().toLowerCase();

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
};

const getEquipmentImagePath = (equipmentName: string) => {
  const normalizedName = normalizeEquipmentName(equipmentName);
  const slug = normalizedName.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'equipment'}-${hashString(normalizedName)}.webp`;
};

const getEntryEquipmentName = (entry: SportEntry) =>
  entry.sport_equipment?.name || entry.equipment_name;

const getEntrySportName = (entry: SportEntry) =>
  entry.sport_equipment?.sport_name || entry.sport_name;

const getEntryEquipmentImage = (entry: SportEntry) =>
  entry.sport_equipment?.image_url || entry.equipment_image_url;

const attachEquipmentToEntries = (
  entries: SportEntry[],
  equipment: SportEquipment[]
): SportEntry[] => {
  const equipmentById = new Map(equipment.map((item) => [item.id, item]));
  const equipmentByName = new Map(equipment.map((item) => [item.normalized_name, item]));

  return entries.map((entry) => ({
    ...entry,
    sport_equipment:
      (entry.sport_equipment_id ? equipmentById.get(entry.sport_equipment_id) : null) ||
      equipmentByName.get(normalizeEquipmentName(entry.equipment_name)) ||
      entry.sport_equipment ||
      null,
  }));
};

export default function SportModal({
  isOpen,
  onClose,
  anonId,
  isEditMode,
  onLogActivity,
}: SportModalProps) {
  const [entries, setEntries] = useState<SportEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<SportEntry | null>(null);
  const [visibleLogCount, setVisibleLogCount] = useState(LOG_PAGE_SIZE);
  const [totalEntryCount, setTotalEntryCount] = useState(0);
  const [loadingMoreLogs, setLoadingMoreLogs] = useState(false);

  const [sportName, setSportName] = useState('Strength');
  const [equipmentName, setEquipmentName] = useState('');
  const [achievedOn, setAchievedOn] = useState(todayInputValue);
  const [weightValue, setWeightValue] = useState('');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lb');
  const [setsCount, setSetsCount] = useState('');
  const [repsCount, setRepsCount] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [equipmentMenuOpen, setEquipmentMenuOpen] = useState(false);
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [editingEquipment, setEditingEquipment] = useState<EquipmentOption | null>(null);
  const [equipmentEditName, setEquipmentEditName] = useState('');
  const [equipmentEditSportName, setEquipmentEditSportName] = useState('');
  const [equipmentEditImageFile, setEquipmentEditImageFile] = useState<File | null>(null);
  const [equipmentEditImagePreview, setEquipmentEditImagePreview] = useState('');
  const [equipmentEditImageUrl, setEquipmentEditImageUrl] = useState<string | null>(null);

  const clearPreview = useCallback(() => {
    setImagePreview((current) => {
      if (current.startsWith('blob:')) URL.revokeObjectURL(current);
      return '';
    });
  }, []);

  const clearEquipmentEditPreview = useCallback(() => {
    setEquipmentEditImagePreview((current) => {
      if (current.startsWith('blob:')) URL.revokeObjectURL(current);
      return '';
    });
  }, []);

  const resetForm = useCallback(() => {
    setEditingEntry(null);
    setSportName('Strength');
    setEquipmentName('');
    setAchievedOn(todayInputValue());
    setWeightValue('');
    setWeightUnit('lb');
    setSetsCount('');
    setRepsCount('');
    setImageFile(null);
    setExistingImageUrl(null);
    setEquipmentMenuOpen(false);
    clearPreview();
    setShowForm(false);
    setError('');
  }, [clearPreview]);

  const resetEquipmentEdit = useCallback(() => {
    setEditingEquipment(null);
    setEquipmentEditName('');
    setEquipmentEditSportName('');
    setEquipmentEditImageFile(null);
    setEquipmentEditImageUrl(null);
    clearEquipmentEditPreview();
    setError('');
  }, [clearEquipmentEditPreview]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    setVisibleLogCount(LOG_PAGE_SIZE);

    try {
      const [
        { data, error: fetchError, count },
        { data: equipmentData, error: equipmentError },
      ] = await Promise.all([
        supabase
          .from(TABLE_NAME)
          .select('*', { count: 'exact' })
          .order('achieved_on', { ascending: false })
          .order('created_at', { ascending: false })
          .range(0, ENTRY_FETCH_BATCH_SIZE - 1),
        supabase.from(EQUIPMENT_TABLE_NAME).select('*'),
      ]);

      if (fetchError) throw fetchError;
      if (equipmentError && !isMissingCanonicalSportsSchemaError(equipmentError)) {
        throw equipmentError;
      }
      setEntries(
        attachEquipmentToEntries(
          (data ?? []) as SportEntry[],
          equipmentError ? [] : ((equipmentData ?? []) as SportEquipment[])
        )
      );
      setTotalEntryCount(count ?? data?.length ?? 0);
    } catch (fetchError) {
      console.warn('Failed to load sports progress', fetchError);
      setError(`Could not load sports progress: ${getErrorMessage(fetchError)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMoreLogs = async () => {
    const nextVisibleCount = visibleLogCount + LOG_PAGE_SIZE;

    if (nextVisibleCount <= entries.length || entries.length >= totalEntryCount) {
      setVisibleLogCount(nextVisibleCount);
      return;
    }

    setLoadingMoreLogs(true);
    setError('');

    try {
      const fetchEnd = Math.max(
        entries.length + ENTRY_FETCH_BATCH_SIZE - 1,
        nextVisibleCount - 1
      );
      const [
        { data, error: fetchError, count },
        { data: equipmentData, error: equipmentError },
      ] = await Promise.all([
        supabase
          .from(TABLE_NAME)
          .select('*', { count: 'exact' })
          .order('achieved_on', { ascending: false })
          .order('created_at', { ascending: false })
          .range(entries.length, fetchEnd),
        supabase.from(EQUIPMENT_TABLE_NAME).select('*'),
      ]);

      if (fetchError) throw fetchError;
      if (equipmentError && !isMissingCanonicalSportsSchemaError(equipmentError)) {
        throw equipmentError;
      }

      const freshEntries = attachEquipmentToEntries(
        (data ?? []) as SportEntry[],
        equipmentError ? [] : ((equipmentData ?? []) as SportEquipment[])
      );

      setEntries((current) => {
        const existingIds = new Set(current.map((entry) => entry.id));
        return [...current, ...freshEntries.filter((entry) => !existingIds.has(entry.id))];
      });
      setTotalEntryCount(count ?? totalEntryCount);
      setVisibleLogCount(nextVisibleCount);
    } catch (fetchError) {
      console.warn('Failed to load more sports logs', fetchError);
      setError(`Could not load more sports logs: ${getErrorMessage(fetchError)}`);
    } finally {
      setLoadingMoreLogs(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      resetForm();
      return;
    }

    onLogActivity?.('Opened Sports', 'Viewed sports progress tracker');
    void fetchEntries();
  }, [fetchEntries, isOpen, onLogActivity, resetForm]);

  useEffect(() => {
    return () => {
      if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  useEffect(() => {
    return () => {
      if (equipmentEditImagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(equipmentEditImagePreview);
      }
    };
  }, [equipmentEditImagePreview]);

  useEffect(() => {
    setVisibleLogCount(LOG_PAGE_SIZE);
  }, [selectedEquipment]);

  const equipmentOptions = useMemo(() => {
    const map = new Map<string, EquipmentOption>();

    entries.forEach((entry) => {
      const equipmentName = getEntryEquipmentName(entry);
      const normalizedName = normalizeEquipmentName(equipmentName);
      const current = map.get(normalizedName);
      const weight = Number(entry.weight_value);
      const imageUrl = getEntryEquipmentImage(entry);
      if (!current) {
        map.set(normalizedName, {
          id: entry.sport_equipment_id,
          name: equipmentName,
          sportName: getEntrySportName(entry),
          imageUrl,
          count: 1,
          bestWeight: weight,
        });
        return;
      }

      map.set(normalizedName, {
        ...current,
        id: current.id || entry.sport_equipment_id,
        imageUrl: current.imageUrl || imageUrl,
        count: current.count + 1,
        bestWeight: Math.max(current.bestWeight, weight),
      });
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const filteredEquipmentOptions = useMemo(() => {
    const query = normalizeEquipmentName(equipmentSearch);
    if (!query) return equipmentOptions;

    return equipmentOptions.filter((option) => {
      const searchableText = `${option.name} ${option.sportName}`.toLowerCase();
      return searchableText.includes(query);
    });
  }, [equipmentOptions, equipmentSearch]);

  const selectedEntries = useMemo(() => {
    const normalizedSelectedEquipment = normalizeEquipmentName(selectedEquipment);
    const scoped =
      selectedEquipment === 'all'
        ? entries
        : entries.filter(
          (entry) => normalizeEquipmentName(getEntryEquipmentName(entry)) === normalizedSelectedEquipment
        );

    return [...scoped].sort((a, b) => {
      const dateCompare = a.achieved_on.localeCompare(b.achieved_on);
      if (dateCompare !== 0) return dateCompare;
      return a.created_at.localeCompare(b.created_at);
    });
  }, [entries, selectedEquipment]);

  const selectedLogEntries = useMemo(() => {
    const normalizedSelectedEquipment = normalizeEquipmentName(selectedEquipment);
    const scoped =
      selectedEquipment === 'all'
        ? entries
        : entries.filter(
          (entry) => normalizeEquipmentName(getEntryEquipmentName(entry)) === normalizedSelectedEquipment
        );

    return [...scoped].sort((a, b) => {
      const dateCompare = b.achieved_on.localeCompare(a.achieved_on);
      if (dateCompare !== 0) return dateCompare;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [entries, selectedEquipment]);

  const stats = useMemo(() => {
    const latest = selectedEntries[selectedEntries.length - 1] || null;
    const previous = selectedEntries[selectedEntries.length - 2] || null;
    const best = selectedEntries.reduce<SportEntry | null>((currentBest, entry) => {
      if (!currentBest) return entry;
      return Number(entry.weight_value) > Number(currentBest.weight_value) ? entry : currentBest;
    }, null);
    const activeDays = new Set(selectedEntries.map((entry) => entry.achieved_on)).size;
    const delta =
      latest && previous ? Number(latest.weight_value) - Number(previous.weight_value) : 0;

    return {
      latest,
      best,
      activeDays,
      delta,
      sessionCount: selectedEntries.length,
    };
  }, [selectedEntries]);

  const visibleLogEntries = useMemo(
    () => selectedLogEntries.slice(0, visibleLogCount),
    [selectedLogEntries, visibleLogCount]
  );

  const hasMoreLogs =
    selectedEquipment === 'all'
      ? visibleLogCount < totalEntryCount || visibleLogCount < entries.length
      : visibleLogCount < selectedLogEntries.length;

  const selectedEquipmentOption = useMemo(
    () =>
      selectedEquipment === 'all'
        ? null
        : equipmentOptions.find(
          (option) =>
            normalizeEquipmentName(option.name) === normalizeEquipmentName(selectedEquipment)
        ) || null,
    [equipmentOptions, selectedEquipment]
  );

  const currentEquipmentImage = useMemo(() => {
    if (imagePreview) return imagePreview;

    const normalizedEquipmentName = normalizeEquipmentName(equipmentName);
    const match = equipmentOptions.find(
      (option) => normalizeEquipmentName(option.name) === normalizedEquipmentName
    );
    if (match?.imageUrl) return match.imageUrl;

    const existingImageStillApplies =
      existingImageUrl &&
      ((editingEntry &&
        normalizeEquipmentName(getEntryEquipmentName(editingEntry)) === normalizedEquipmentName) ||
        (!editingEntry &&
          selectedEquipment !== 'all' &&
          normalizeEquipmentName(selectedEquipment) === normalizedEquipmentName));

    return existingImageStillApplies ? existingImageUrl : '';
  }, [editingEntry, equipmentName, equipmentOptions, existingImageUrl, imagePreview, selectedEquipment]);

  const startAdd = (equipmentToReuse?: string) => {
    resetEquipmentEdit();
    const reusableEquipment =
      equipmentToReuse || (selectedEquipment === 'all' ? '' : selectedEquipment);
    const normalizedReusableEquipment = normalizeEquipmentName(reusableEquipment);
    const latestForEquipment = reusableEquipment
      ? entries.find(
        (entry) => normalizeEquipmentName(getEntryEquipmentName(entry)) === normalizedReusableEquipment
      ) || null
      : null;

    setEditingEntry(null);
    setSportName(latestForEquipment ? getEntrySportName(latestForEquipment) : 'Strength');
    setEquipmentName(latestForEquipment ? getEntryEquipmentName(latestForEquipment) : reusableEquipment);
    setAchievedOn(todayInputValue());
    setWeightValue('');
    setWeightUnit(latestForEquipment?.weight_unit || 'lb');
    setSetsCount('');
    setRepsCount('');
    setImageFile(null);
    setExistingImageUrl(latestForEquipment ? getEntryEquipmentImage(latestForEquipment) : null);
    setEquipmentMenuOpen(false);
    clearPreview();
    setShowForm(true);
    setError('');

    if (reusableEquipment) {
      setSelectedEquipment(reusableEquipment);
    }
  };

  const reuseEquipment = (equipment: EquipmentOption) => {
    resetEquipmentEdit();
    const normalizedEquipmentName = normalizeEquipmentName(equipment.name);
    const latestForEquipment =
      entries.find(
        (entry) => normalizeEquipmentName(getEntryEquipmentName(entry)) === normalizedEquipmentName
      ) || null;

    setEquipmentName(equipment.name);
    setSportName(latestForEquipment ? getEntrySportName(latestForEquipment) : equipment.sportName || sportName || 'Strength');
    setWeightUnit(latestForEquipment?.weight_unit || weightUnit);
    setExistingImageUrl(equipment.imageUrl);
    setImageFile(null);
    clearPreview();
    setSelectedEquipment(equipment.name);
    setEquipmentMenuOpen(false);
    setError('');
  };

  const startEdit = (entry: SportEntry) => {
    resetEquipmentEdit();
    setEditingEntry(entry);
    setSportName(getEntrySportName(entry));
    setEquipmentName(getEntryEquipmentName(entry));
    setAchievedOn(entry.achieved_on);
    setWeightValue(formatWeight(Number(entry.weight_value)));
    setWeightUnit(entry.weight_unit);
    setSetsCount(entry.sets_count ? String(entry.sets_count) : '');
    setRepsCount(entry.reps_count ? String(entry.reps_count) : '');
    setImageFile(null);
    setExistingImageUrl(getEntryEquipmentImage(entry));
    setEquipmentMenuOpen(false);
    clearPreview();
    setShowForm(true);
    setError('');
  };

  const startEditEquipment = (equipment: EquipmentOption) => {
    resetForm();
    setEditingEquipment(equipment);
    setEquipmentEditName(equipment.name);
    setEquipmentEditSportName(equipment.sportName || 'Strength');
    setEquipmentEditImageFile(null);
    setEquipmentEditImageUrl(equipment.imageUrl);
    clearEquipmentEditPreview();
    setError('');
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Equipment image must be smaller than 10MB.');
      return;
    }

    clearPreview();
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError('');
  };

  const handleEquipmentEditImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Equipment image must be smaller than 10MB.');
      return;
    }

    clearEquipmentEditPreview();
    setEquipmentEditImageFile(file);
    setEquipmentEditImagePreview(URL.createObjectURL(file));
    setError('');
  };

  const uploadEquipmentImage = async (file: File, equipmentName: string) => {
    const webpBlob = await convertToWebP(file, 0.85);
    const fileName = getEquipmentImagePath(equipmentName);

    const { data, error: uploadError } = await appStorage
      .from(STORAGE_BUCKET)
      .upload(fileName, webpBlob, {
        contentType: 'image/webp',
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError || !data) throw uploadError || new Error('Upload returned no data');
    return `${data.publicUrl}?v=${Date.now()}`;
  };

  const findSportEquipment = async (name: string) => {
    const { data, error: findError } = await supabase
      .from(EQUIPMENT_TABLE_NAME)
      .select('*')
      .eq('normalized_name', normalizeEquipmentName(name))
      .maybeSingle<SportEquipment>();

    if (findError && isMissingCanonicalSportsSchemaError(findError)) return null;
    if (findError) throw findError;
    return data;
  };

  const findSportEquipmentById = async (id: string) => {
    const { data, error: findError } = await supabase
      .from(EQUIPMENT_TABLE_NAME)
      .select('*')
      .eq('id', id)
      .maybeSingle<SportEquipment>();

    if (findError && isMissingCanonicalSportsSchemaError(findError)) return null;
    if (findError) throw findError;
    return data;
  };

  const saveSportEquipment = async ({
    name,
    sportName,
    imageUrl,
  }: {
    name: string;
    sportName: string;
    imageUrl: string;
  }) => {
    const existing = await findSportEquipment(name);

    if (existing) {
      const payload = {
        name,
        sport_name: sportName,
        image_url: imageUrl,
        anon_id: existing.anon_id || anonId || null,
      };
      const { data, error: updateError } = await supabase
        .from(EQUIPMENT_TABLE_NAME)
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single<SportEquipment>();

      if (updateError && isMissingCanonicalSportsSchemaError(updateError)) return null;
      if (updateError || !data) throw updateError || new Error('Equipment update returned no data');
      return data;
    }

    const { data, error: insertError } = await supabase
      .from(EQUIPMENT_TABLE_NAME)
      .insert({
        anon_id: anonId || null,
        sport_name: sportName,
        name,
        image_url: imageUrl,
      })
      .select()
      .single<SportEquipment>();

    if (!insertError && data) return data;
    if (insertError && isMissingCanonicalSportsSchemaError(insertError)) return null;

    const conflictingEquipment = await findSportEquipment(name);
    if (conflictingEquipment) return conflictingEquipment;

    throw insertError || new Error('Equipment insert returned no data');
  };

  const saveEquipmentSourceOfTruth = async ({
    source,
    name,
    sportName,
    imageUrl,
  }: {
    source: EquipmentOption;
    name: string;
    sportName: string;
    imageUrl: string;
  }) => {
    const existing =
      (source.id ? await findSportEquipmentById(source.id) : null) ||
      (await findSportEquipment(source.name));

    if (!existing) {
      return saveSportEquipment({ name, sportName, imageUrl });
    }

    const targetByName = await findSportEquipment(name);
    if (targetByName && targetByName.id !== existing.id) {
      const { data, error: targetUpdateError } = await supabase
        .from(EQUIPMENT_TABLE_NAME)
        .update({
          sport_name: sportName,
          image_url: imageUrl,
          anon_id: targetByName.anon_id || anonId || null,
        })
        .eq('id', targetByName.id)
        .select()
        .single<SportEquipment>();

      if (targetUpdateError && isMissingCanonicalSportsSchemaError(targetUpdateError)) return null;
      if (targetUpdateError || !data) {
        throw targetUpdateError || new Error('Equipment merge returned no data');
      }
      return data;
    }

    const { data, error: updateError } = await supabase
      .from(EQUIPMENT_TABLE_NAME)
      .update({
        name,
        sport_name: sportName,
        image_url: imageUrl,
        anon_id: existing.anon_id || anonId || null,
      })
      .eq('id', existing.id)
      .select()
      .single<SportEquipment>();

    if (updateError && isMissingCanonicalSportsSchemaError(updateError)) return null;
    if (updateError || !data) throw updateError || new Error('Equipment update returned no data');
    return data;
  };

  const updateLogsForEquipment = async ({
    source,
    equipment,
    name,
    sportName,
    imageUrl,
  }: {
    source: EquipmentOption;
    equipment: SportEquipment | null;
    name: string;
    sportName: string;
    imageUrl: string;
  }) => {
    const payload: Record<string, unknown> = {
      sport_name: sportName,
      equipment_name: name,
      equipment_image_url: equipment ? null : imageUrl,
    };

    if (equipment) {
      payload.sport_equipment_id = equipment.id;
    }

    const matchingIds = entries
      .filter(
        (entry) =>
          (source.id && entry.sport_equipment_id === source.id) ||
          normalizeEquipmentName(getEntryEquipmentName(entry)) === normalizeEquipmentName(source.name)
      )
      .map((entry) => entry.id);

    const updates = [];

    if (source.id && equipment) {
      updates.push(supabase.from(TABLE_NAME).update(payload).eq('sport_equipment_id', source.id));
    }
    updates.push(supabase.from(TABLE_NAME).update(payload).eq('equipment_name', source.name));
    if (matchingIds.length > 0) {
      updates.push(supabase.from(TABLE_NAME).update(payload).in('id', matchingIds));
    }

    for (const update of updates) {
      const { error: updateError } = await update;
      if (updateError && isMissingCanonicalSportsSchemaError(updateError)) continue;
      if (updateError) throw updateError;
    }
  };

  const handleEquipmentSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isEditMode || !editingEquipment) return;

    const trimmedEquipment = equipmentEditName.trim();
    const trimmedSport = equipmentEditSportName.trim() || 'Strength';

    if (!trimmedEquipment) {
      setError('Equipment name is required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      let equipmentImageUrl = equipmentEditImageUrl || editingEquipment.imageUrl || null;

      if (equipmentEditImageFile) {
        equipmentImageUrl = await uploadEquipmentImage(equipmentEditImageFile, trimmedEquipment);
      }

      if (!equipmentImageUrl) {
        setError('Equipment image is required.');
        setSaving(false);
        return;
      }

      const equipment = await saveEquipmentSourceOfTruth({
        source: editingEquipment,
        name: trimmedEquipment,
        sportName: trimmedSport,
        imageUrl: equipmentImageUrl,
      });

      await updateLogsForEquipment({
        source: editingEquipment,
        equipment,
        name: trimmedEquipment,
        sportName: trimmedSport,
        imageUrl: equipmentImageUrl,
      });

      onLogActivity?.('Updated Sports Equipment', trimmedEquipment);
      resetEquipmentEdit();
      setSelectedEquipment(equipment?.name || trimmedEquipment);
      await fetchEntries();
    } catch (saveError) {
      console.warn('Failed to save sports equipment', saveError);
      setError(`Could not save sports equipment: ${getErrorMessage(saveError)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isEditMode) return;

    const trimmedEquipment = equipmentName.trim();
    const trimmedSport = sportName.trim() || 'Strength';
    const parsedWeight = Number(weightValue);
    const parsedSets = setsCount === '' ? null : Number(setsCount);
    const parsedReps = repsCount === '' ? null : Number(repsCount);

    if (!trimmedEquipment) {
      setError('Equipment name is required.');
      return;
    }

    if (!achievedOn) {
      setError('Date is required.');
      return;
    }

    if (!Number.isFinite(parsedWeight) || parsedWeight < 0) {
      setError('Weight achieved must be a valid non-negative number.');
      return;
    }

    if (parsedSets !== null && (!Number.isInteger(parsedSets) || parsedSets < 1)) {
      setError('Sets must be a whole number greater than 0.');
      return;
    }

    if (parsedReps !== null && (!Number.isInteger(parsedReps) || parsedReps < 1)) {
      setError('Reps must be a whole number greater than 0.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const matchingEquipment = equipmentOptions.find(
        (option) =>
          normalizeEquipmentName(option.name) === normalizeEquipmentName(trimmedEquipment)
      );
      let equipmentImageUrl = existingImageUrl || matchingEquipment?.imageUrl || null;

      if (imageFile) {
        equipmentImageUrl = await uploadEquipmentImage(imageFile, trimmedEquipment);
      }

      if (!equipmentImageUrl) {
        setError('Add an equipment image for the first entry with this equipment.');
        setSaving(false);
        return;
      }

      const equipment = await saveSportEquipment({
        name: trimmedEquipment,
        sportName: trimmedSport,
        imageUrl: equipmentImageUrl,
      });

      const payload: Record<string, unknown> = {
        anon_id: anonId || null,
        sport_name: trimmedSport,
        equipment_name: trimmedEquipment,
        equipment_image_url: equipment ? null : equipmentImageUrl,
        achieved_on: achievedOn,
        weight_value: parsedWeight,
        weight_unit: weightUnit,
        sets_count: parsedSets,
        reps_count: parsedReps,
        notes: null,
      };

      if (equipment) {
        payload.sport_equipment_id = equipment.id;
      }

      if (editingEntry) {
        let { error: updateError } = await supabase
          .from(TABLE_NAME)
          .update(payload)
          .eq('id', editingEntry.id)
          .select()
          .single<SportEntry>();

        if (updateError && isMissingSportSetsRepsSchemaError(updateError)) {
          const legacyPayload = { ...payload };
          delete legacyPayload.sets_count;
          delete legacyPayload.reps_count;
          const retry = await supabase
            .from(TABLE_NAME)
            .update(legacyPayload)
            .eq('id', editingEntry.id)
            .select()
            .single<SportEntry>();
          updateError = retry.error;
        }

        if (updateError) throw updateError;
        onLogActivity?.('Updated Sports Entry', `${trimmedEquipment} ${formatWeight(parsedWeight)}${weightUnit}`);
      } else {
        let { error: insertError } = await supabase
          .from(TABLE_NAME)
          .insert(payload)
          .select()
          .single<SportEntry>();

        if (insertError && isMissingSportSetsRepsSchemaError(insertError)) {
          const legacyPayload = { ...payload };
          delete legacyPayload.sets_count;
          delete legacyPayload.reps_count;
          const retry = await supabase
            .from(TABLE_NAME)
            .insert(legacyPayload)
            .select()
            .single<SportEntry>();
          insertError = retry.error;
        }

        if (insertError) throw insertError;
        onLogActivity?.('Added Sports Entry', `${trimmedEquipment} ${formatWeight(parsedWeight)}${weightUnit}`);
      }

      resetForm();
      setSelectedEquipment(equipment?.name || trimmedEquipment);
      await fetchEntries();
    } catch (saveError) {
      console.warn('Failed to save sports entry', saveError);
      setError(`Could not save sports entry: ${getErrorMessage(saveError)}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry: SportEntry) => {
    if (!isEditMode) return;
    const equipmentName = getEntryEquipmentName(entry);
    if (!confirm(`Delete ${equipmentName} from ${formatDate(entry.achieved_on)}?`)) return;

    setSaving(true);
    setError('');

    try {
      const { error: deleteError } = await supabase.from(TABLE_NAME).delete().eq('id', entry.id);
      if (deleteError) throw deleteError;

      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setTotalEntryCount((current) => Math.max(current - 1, 0));
      onLogActivity?.('Deleted Sports Entry', equipmentName);
    } catch (deleteError) {
      console.warn('Failed to delete sports entry', deleteError);
      setError(`Could not delete sports entry: ${getErrorMessage(deleteError)}`);
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    resetForm();
    resetEquipmentEdit();
    onClose();
  };

  if (!isOpen) return null;

  const isAllEquipmentSelected = selectedEquipment === 'all';
  const isEditingSelectedEquipment =
    editingEquipment &&
    selectedEquipmentOption &&
    normalizeEquipmentName(editingEquipment.name) === normalizeEquipmentName(selectedEquipmentOption.name);
  const currentEquipmentEditImage = equipmentEditImagePreview || equipmentEditImageUrl || '';
  const sportsLogPanel = (
    <div className="border-4 border-gray-900 bg-white p-4 mt-4">
      <h3 className="text-lg font-bold mb-3">LOGS</h3>
      <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
        {visibleLogEntries.length === 0 && !loading ? (
          <div className="border-2 border-gray-900 bg-gray-50 p-4 text-center text-sm text-gray-500">
            {entries.length === 0 ? 'No sports entries yet.' : 'No logs for this sport.'}
          </div>
        ) : (
          visibleLogEntries.map((entry) => (
            <div key={entry.id} className="border-2 border-gray-900 bg-white p-3">
              <div className="flex gap-3">
                <div className="relative w-16 h-16 border-2 border-gray-900 bg-gray-100 shrink-0 overflow-hidden">
                  {getEntryEquipmentImage(entry) ? (
                    <Image
                      src={getEntryEquipmentImage(entry) || ''}
                      alt={getEntryEquipmentName(entry)}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl">🏋️</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold leading-tight truncate">{getEntryEquipmentName(entry)}</div>
                  <div className="text-xs text-gray-500 truncate">{getEntrySportName(entry)}</div>
                  <div className="text-xs text-gray-700 mt-1">{formatDate(entry.achieved_on)}</div>
                  {(entry.sets_count || entry.reps_count) && (
                    <div className="text-xs text-gray-500 mt-1">
                      {entry.sets_count ?? '--'} sets / {entry.reps_count ?? '--'} reps
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-bold leading-none">
                    {formatWeight(Number(entry.weight_value))}
                    <span className="text-sm ml-1">{entry.weight_unit}</span>
                  </div>
                </div>
              </div>
              {isEditMode && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => startEdit(entry)}
                    className="px-2 py-1.5 border-2 border-gray-900 hover:bg-gray-100 text-[11px] font-bold"
                  >
                    EDIT
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteEntry(entry)}
                    disabled={saving}
                    className="px-2 py-1.5 border-2 border-gray-900 hover:bg-red-500 hover:text-white text-[11px] font-bold disabled:opacity-50"
                  >
                    DELETE
                  </button>
                  <button
                    type="button"
                    onClick={() => startAdd(getEntryEquipmentName(entry))}
                    className="px-2 py-1.5 border-2 border-gray-900 bg-cyan-100 hover:bg-cyan-200 text-[11px] font-bold"
                  >
                    AGAIN
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        {hasMoreLogs && (
          <button
            type="button"
            onClick={() => void loadMoreLogs()}
            disabled={loadingMoreLogs}
            className="w-full border-2 border-gray-900 bg-white hover:bg-cyan-100 py-2 text-xs font-bold disabled:opacity-50"
          >
            {loadingMoreLogs ? 'LOADING...' : 'LOAD MORE'}
          </button>
        )}
      </div>
    </div>
  );

  const renderAsideContent = () => (
    <>
      {selectedEquipmentOption && (
        <div className="border-4 border-gray-900 bg-white p-4 mb-4">
          {isEditingSelectedEquipment ? (
            <form onSubmit={handleEquipmentSubmit}>
              <h3 className="text-lg font-bold mb-4">EDIT SPORT</h3>
              <label className="block mb-3">
                <span className="text-xs text-gray-500">NAME</span>
                <input
                  value={equipmentEditName}
                  onChange={(event) => setEquipmentEditName(event.target.value)}
                  className="mt-1 w-full border-2 border-gray-900 px-3 py-2"
                  placeholder="Equipment name"
                />
              </label>
              <label className="block mb-3">
                <span className="text-xs text-gray-500">SPORT</span>
                <input
                  value={equipmentEditSportName}
                  onChange={(event) => setEquipmentEditSportName(event.target.value)}
                  className="mt-1 w-full border-2 border-gray-900 px-3 py-2"
                  placeholder="Strength, weights, tennis..."
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">IMAGE</span>
                <div className="mt-1 w-full aspect-square border-2 border-gray-900 bg-gray-100 overflow-hidden flex items-center justify-center">
                  {currentEquipmentEditImage ? (
                    currentEquipmentEditImage.startsWith('blob:') ? (
                      <div
                        className="w-full h-full bg-center bg-cover"
                        style={{ backgroundImage: `url(${currentEquipmentEditImage})` }}
                      />
                    ) : (
                      <div className="relative w-full h-full">
                        <Image
                          src={currentEquipmentEditImage}
                          alt={equipmentEditName || 'Sport image'}
                          fill
                          sizes="(max-width: 1024px) 100vw, 340px"
                          className="object-cover"
                        />
                      </div>
                    )
                  ) : (
                    <span className="text-sm text-gray-500">Add sport image</span>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleEquipmentEditImageChange}
                  className="mt-2 w-full text-xs"
                />
              </label>
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button
                  type="button"
                  onClick={resetEquipmentEdit}
                  disabled={saving}
                  className="border-2 border-gray-900 py-2 text-xs font-bold hover:bg-gray-100 disabled:opacity-50"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="border-2 border-gray-900 bg-lime-200 hover:bg-lime-300 py-2 text-xs font-bold disabled:opacity-50"
                >
                  {saving ? 'SAVING...' : 'SAVE'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="relative w-full aspect-square border-2 border-gray-900 bg-gray-100 overflow-hidden mb-3">
                {selectedEquipmentOption.imageUrl ? (
                  <Image
                    src={selectedEquipmentOption.imageUrl}
                    alt={selectedEquipmentOption.name}
                    fill
                    sizes="(max-width: 1024px) 100vw, 340px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">🏋️</div>
                )}
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-xl font-bold leading-tight">{selectedEquipmentOption.name}</h3>
                  <div className="mt-2 text-sm text-gray-600">
                    {selectedEquipmentOption.count} logs / {formatWeight(selectedEquipmentOption.bestWeight)} best
                  </div>
                </div>
                {isEditMode && (
                  <button
                    type="button"
                    onClick={() => startEditEquipment(selectedEquipmentOption)}
                    className="shrink-0 border-2 border-gray-900 px-3 py-1.5 text-xs font-bold hover:bg-gray-100"
                  >
                    EDIT
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {showForm && isEditMode ? (
        <form onSubmit={handleSubmit} className="border-4 border-gray-900 bg-white p-4">
          <h3 className="text-lg font-bold mb-4">
            {editingEntry ? 'EDIT SPORTS LOG' : 'NEW SPORTS LOG'}
          </h3>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs text-gray-500">SPORT</span>
              <input
                value={sportName}
                onChange={(event) => setSportName(event.target.value)}
                className="mt-1 w-full border-2 border-gray-900 px-3 py-2"
                placeholder="Strength, tennis, rowing..."
              />
            </label>

            <label className="block">
              <span className="text-xs text-gray-500">EQUIPMENT</span>
              <input
                value={equipmentName}
                onChange={(event) => setEquipmentName(event.target.value)}
                className="mt-1 w-full border-2 border-gray-900 px-3 py-2"
                placeholder="Barbell, dumbbells, leg press..."
              />
            </label>

            {equipmentOptions.length > 0 && (
              <div className="relative">
                <div className="text-xs text-gray-500 mb-1">REUSE EQUIPMENT</div>
                <button
                  type="button"
                  onClick={() => setEquipmentMenuOpen((open) => !open)}
                  className="w-full border-2 border-gray-900 bg-white px-3 py-2 text-left flex items-center justify-between gap-3 hover:bg-gray-50"
                  aria-expanded={equipmentMenuOpen}
                >
                  <span className="truncate">
                    {equipmentName || 'Choose saved equipment'}
                  </span>
                  <span className="text-lg leading-none">{equipmentMenuOpen ? '▲' : '▼'}</span>
                </button>

                {equipmentMenuOpen && (
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 border-4 border-gray-900 bg-white shadow-[4px_4px_0_0_#000] max-h-56 overflow-y-auto">
                    {equipmentOptions.map((option) => (
                      <button
                        key={option.name}
                        type="button"
                        onClick={() => reuseEquipment(option)}
                        className={`w-full px-3 py-2 text-left flex items-center gap-3 border-b-2 border-gray-900 last:border-b-0 hover:bg-cyan-100 ${
                          equipmentName === option.name ? 'bg-cyan-200' : 'bg-white'
                        }`}
                      >
                        <div className="relative w-10 h-10 border-2 border-gray-900 bg-gray-100 shrink-0 overflow-hidden">
                          {option.imageUrl ? (
                            <Image
                              src={option.imageUrl}
                              alt={option.name}
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm">
                              🏋️
                            </div>
                          )}
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold truncate">{option.name}</span>
                          <span className="block text-xs text-gray-500">
                            {option.count} logs · {formatWeight(option.bestWeight)} best
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-[1fr_96px] gap-2">
              <label className="block">
                <span className="text-xs text-gray-500">WEIGHT ACHIEVED</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={weightValue}
                  onChange={(event) => setWeightValue(event.target.value)}
                  className="mt-1 w-full border-2 border-gray-900 px-3 py-2"
                  placeholder="135"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">UNIT</span>
                <select
                  value={weightUnit}
                  onChange={(event) => setWeightUnit(event.target.value as WeightUnit)}
                  className="mt-1 w-full border-2 border-gray-900 px-3 py-2 bg-white"
                >
                  <option value="lb">lb</option>
                  <option value="kg">kg</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-xs text-gray-500">DATE</span>
              <input
                type="date"
                value={achievedOn}
                onChange={(event) => setAchievedOn(event.target.value)}
                className="mt-1 w-full border-2 border-gray-900 px-3 py-2"
              />
            </label>

            <label className="block">
              <span className="text-xs text-gray-500">EQUIPMENT IMAGE</span>
              <div className="mt-1 h-40 border-2 border-gray-900 bg-gray-100 overflow-hidden flex items-center justify-center">
                {currentEquipmentImage ? (
                  currentEquipmentImage.startsWith('blob:') ? (
                    <div
                      className="w-full h-full bg-center bg-cover"
                      style={{ backgroundImage: `url(${currentEquipmentImage})` }}
                    />
                  ) : (
                    <div className="relative w-full h-full">
                      <Image
                        src={currentEquipmentImage}
                        alt={equipmentName || 'Equipment preview'}
                        fill
                        sizes="360px"
                        className="object-cover"
                      />
                    </div>
                  )
                ) : (
                  <span className="text-sm text-gray-500">Add or reuse equipment image</span>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="mt-2 w-full text-xs"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-gray-500"># OF SETS</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={setsCount}
                  onChange={(event) => setSetsCount(event.target.value)}
                  className="mt-1 w-full border-2 border-gray-900 px-3 py-2"
                  placeholder="3"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500"># OF REPS</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={repsCount}
                  onChange={(event) => setRepsCount(event.target.value)}
                  className="mt-1 w-full border-2 border-gray-900 px-3 py-2"
                  placeholder="12"
                />
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-4 w-full border-4 border-gray-900 bg-lime-200 hover:bg-lime-300 py-3 font-bold disabled:opacity-50"
          >
            {saving ? 'SAVING...' : editingEntry ? 'SAVE CHANGES' : 'SAVE LOG'}
          </button>
        </form>
      ) : (
        <div className="border-4 border-gray-900 bg-white p-4">
          {isEditMode && (
            <button
              type="button"
              onClick={() => startAdd()}
              className="w-full border-4 border-gray-900 bg-cyan-200 hover:bg-cyan-300 py-3 font-bold"
            >
              + LOG PROGRESS
            </button>
          )}
        </div>
      )}
      {sportsLogPanel}
    </>
  );

  return (
    <div className="fixed inset-0 bg-black/25 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="bg-white border-4 border-gray-900 w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden"
        style={{ boxShadow: '8px 8px 0 0 #000' }}
      >
        <div className="p-4 border-b-4 border-gray-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-3xl leading-none">🏋️</span>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold">SPORTS</h2>
              <p className="hidden sm:block text-xs text-gray-500">
                Record equipment, date, weight, and progress.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditMode && (
              <button
                type="button"
                onClick={showForm ? resetForm : () => startAdd()}
                className="px-3 py-2 border-2 border-gray-900 bg-cyan-200 hover:bg-cyan-300 text-xs font-bold"
              >
                {showForm ? 'CANCEL' : '+ LOG'}
              </button>
            )}
            <button
              type="button"
              onClick={closeModal}
              className="w-10 h-10 border-2 border-gray-900 hover:bg-red-500 hover:text-white text-2xl leading-none"
              aria-label="Close sports tracker"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto grid lg:grid-cols-[1fr_380px]">
          <div className="p-4 sm:p-5 border-b-4 lg:border-b-0 lg:border-r-4 border-gray-900">
            {(loading || error) && (
              <div
                className={`border-2 border-gray-900 px-3 py-2 mb-4 text-sm ${error ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-gray-700'
                  }`}
              >
                {error || 'Loading sports progress...'}
              </div>
            )}

            <div className={`grid gap-2 sm:gap-3 mb-4 ${isAllEquipmentSelected ? 'grid-cols-2' : 'grid-cols-4'}`}>
              <StatBox
                label="LATEST"
                value={
                  stats.latest
                    ? `${formatWeight(Number(stats.latest.weight_value))}${stats.latest.weight_unit}`
                    : '--'
                }
                detail={stats.latest ? getEntryEquipmentName(stats.latest) : 'No logs yet'}
                tone="bg-cyan-100"
              />
              {!isAllEquipmentSelected && (
                <>
                  <StatBox
                    label="PERSONAL BEST"
                    value={
                      stats.best
                        ? `${formatWeight(Number(stats.best.weight_value))}${stats.best.weight_unit}`
                        : '--'
                    }
                    detail={stats.best ? getEntryEquipmentName(stats.best) : 'Start tracking'}
                    tone="bg-lime-100"
                  />
                  <StatBox
                    label="CHANGE"
                    value={`${stats.delta > 0 ? '+' : ''}${formatWeight(stats.delta)}`}
                    detail="vs previous log"
                    tone="bg-yellow-100"
                  />
                </>
              )}
              <StatBox
                label="DAYS"
                value={`${stats.activeDays}`}
                detail={`${stats.sessionCount} total logs`}
                tone="bg-pink-100"
              />
            </div>

            <div className="border-4 border-gray-900 bg-white p-4 mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-lg font-bold">PROGRESS DIAGRAM</h3>
                  <p className="text-xs text-gray-500">
                    {selectedEquipment === 'all' ? 'All equipment' : selectedEquipment}
                  </p>
                </div>
                <select
                  value={selectedEquipment}
                  onChange={(event) => setSelectedEquipment(event.target.value)}
                  className="border-2 border-gray-900 px-3 py-2 bg-white text-sm"
                >
                  <option value="all">All equipment</option>
                  {equipmentOptions.map((option) => (
                    <option key={option.name} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              <ProgressDiagram entries={selectedEntries} />
            </div>

            <div className="lg:hidden -mx-4 sm:-mx-5 px-4 sm:px-5 py-4 sm:py-5 bg-gray-50 mb-4 border-y-4 border-gray-900">
              {renderAsideContent()}
            </div>

            {equipmentOptions.length > 0 && (
              <div className="mb-4">
                <input
                  type="search"
                  value={equipmentSearch}
                  onChange={(event) => setEquipmentSearch(event.target.value)}
                  placeholder="Search sport name"
                  className="w-full border-4 border-gray-900 bg-white px-3 py-2 mb-3 text-sm"
                />

                <div>
                  {filteredEquipmentOptions.length > 0 ? (
                    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {filteredEquipmentOptions.map((option) => (
                        <div
                          key={option.name}
                          className={`border-4 border-gray-900 bg-white p-3 hover:-translate-y-0.5 transition-transform ${selectedEquipment === option.name ? 'shadow-[4px_4px_0_0_#000]' : ''
                            }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              resetEquipmentEdit();
                              setSelectedEquipment(option.name);
                            }}
                            className="w-full flex items-center gap-3 text-left"
                          >
                            <div className="relative w-16 h-16 border-2 border-gray-900 bg-gray-100 shrink-0 overflow-hidden">
                              {option.imageUrl ? (
                                <Image
                                  src={option.imageUrl}
                                  alt={option.name}
                                  fill
                                  sizes="64px"
                                  className="object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xl">🏋️</div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold truncate">{option.name}</div>
                              <div className="text-xs text-gray-500">{option.count} logs</div>
                              <div className="text-sm">{formatWeight(option.bestWeight)} best</div>
                            </div>
                          </button>
                          {isEditMode && (
                            <button
                              type="button"
                              onClick={() => startAdd(option.name)}
                              className="mt-3 w-full border-2 border-gray-900 bg-cyan-100 hover:bg-cyan-200 py-2 text-xs font-bold"
                            >
                              LOG AGAIN
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="border-4 border-gray-900 bg-gray-50 p-5 text-center text-sm text-gray-500">
                      No matching sports.
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          <aside className="hidden lg:block p-4 sm:p-5 bg-gray-50">
            {renderAsideContent()}
          </aside>
        </div>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className={`border-4 border-gray-900 p-2 sm:p-3 flex flex-col justify-center min-w-0 ${tone}`}>
      <div className="text-[9px] sm:text-[11px] text-gray-600 font-bold truncate">{label}</div>
      <div className="text-base sm:text-2xl font-bold leading-tight truncate">{value}</div>
      <div className="text-[9px] sm:text-xs text-gray-600 truncate">{detail}</div>
    </div>
  );
}

function ProgressDiagram({ entries }: { entries: SportEntry[] }) {
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const chartEntries = entries;
  const maxWeight = Math.max(...chartEntries.map((entry) => Number(entry.weight_value)), 0);
  const chartMax = Math.max(maxWeight, 1);
  const width = 640;
  const height = 260;
  const paddingX = 44;
  const paddingTop = 28;
  const paddingBottom = 62;
  const axisY = height - paddingBottom;
  const plotWidth = width - paddingX * 2;
  const plotHeight = axisY - paddingTop;
  const uniqueDates = Array.from(new Set(chartEntries.map((entry) => entry.achieved_on)));
  const equipmentColors = Array.from(
    new Set(chartEntries.map((entry) => getEntryEquipmentName(entry)))
  ).reduce<Record<string, string>>((colors, equipmentName, index) => {
    colors[equipmentName] = CHART_COLORS[index % CHART_COLORS.length];
    return colors;
  }, {});
  const dateCounts = chartEntries.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.achieved_on] = (counts[entry.achieved_on] || 0) + 1;
    return counts;
  }, {});
  const dateXPositions = uniqueDates.reduce<Record<string, number>>((positions, date, index) => {
    positions[date] =
      uniqueDates.length === 1
        ? width / 2
        : paddingX + (index / (uniqueDates.length - 1)) * plotWidth;
    return positions;
  }, {});

  const points = chartEntries.map((entry) => {
    const x = dateXPositions[entry.achieved_on];
    const y = paddingTop + plotHeight - (Number(entry.weight_value) / chartMax) * plotHeight;
    return {
      x,
      y,
      entry,
      color: equipmentColors[getEntryEquipmentName(entry)],
    };
  });
  const pointGroups = points.reduce<Record<string, typeof points>>((groups, point) => {
    const equipmentName = getEntryEquipmentName(point.entry);
    const group = groups[equipmentName] || [];
    group.push(point);
    groups[equipmentName] = group;
    return groups;
  }, {});

  if (chartEntries.length === 0) {
    return (
      <div className="h-56 border-2 border-gray-900 bg-gray-50 flex items-center justify-center text-sm text-gray-500">
        Add a sports log to draw progress.
      </div>
    );
  }

  return (
    <div className="border-2 border-gray-900 bg-gray-50 overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64 block" role="img">
        <title>Sports weight progress over time</title>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = paddingTop + plotHeight - ratio * plotHeight;
          return (
            <g key={ratio}>
              <line x1={paddingX} x2={width - paddingX} y1={y} y2={y} stroke="#d1d5db" strokeWidth="1" />
              <text x={8} y={y + 4} fontSize="10" fill="#6b7280">
                {formatWeight(chartMax * ratio)}
              </text>
            </g>
          );
        })}
        <line x1={paddingX} x2={width - paddingX} y1={axisY} y2={axisY} stroke="#111827" strokeWidth="2" />
        {uniqueDates.map((date) => {
          const x = dateXPositions[date];

          return (
            <g key={date}>
              <line x1={x} x2={x} y1={axisY} y2={axisY + 7} stroke="#111827" strokeWidth="2" />
              <text x={x} y={axisY + 22} textAnchor="middle" fontSize="11" fontWeight="700" fill="#111827">
                {formatChartDate(date)}
              </text>
              {dateCounts[date] > 1 && (
                <text x={x} y={axisY + 38} textAnchor="middle" fontSize="10" fill="#6b7280">
                  {dateCounts[date]} logs
                </text>
              )}
            </g>
          );
        })}
        {Object.entries(pointGroups).map(([equipmentName, groupPoints]) =>
          groupPoints.length > 1 ? (
            <polyline
              key={equipmentName}
              fill="none"
              stroke={equipmentColors[equipmentName]}
              strokeWidth="5"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={groupPoints.map((point) => `${point.x},${point.y}`).join(' ')}
            />
          ) : null
        )}
        {points.map((point) => {
          const isHovered = hoveredPointId === point.entry.id;
          const equipmentName = getEntryEquipmentName(point.entry);
          const visibleEquipmentName =
            equipmentName.length > 22
              ? `${equipmentName.slice(0, 21)}...`
              : equipmentName;
          const fullTooltipLabel = `${equipmentName} - ${formatWeight(Number(point.entry.weight_value))}${point.entry.weight_unit}`;
          const tooltipLabel = `${visibleEquipmentName} - ${formatWeight(Number(point.entry.weight_value))}${point.entry.weight_unit}`;
          const tooltipWidth = Math.max(88, Math.min(180, tooltipLabel.length * 7 + 18));
          const tooltipX = Math.min(Math.max(point.x - tooltipWidth / 2, 6), width - tooltipWidth - 6);
          const tooltipY = Math.max(point.y - 48, 6);

          return (
            <g
              key={`${point.entry.id}-${point.x}`}
              onMouseEnter={() => setHoveredPointId(point.entry.id)}
              onMouseLeave={() => setHoveredPointId(null)}
              onFocus={() => setHoveredPointId(point.entry.id)}
              onBlur={() => setHoveredPointId(null)}
              tabIndex={0}
              role="img"
              aria-label={fullTooltipLabel}
              className="outline-none"
            >
              <circle
                cx={point.x}
                cy={point.y}
                r={isHovered ? '10' : '8'}
                fill={point.color}
                stroke="#111827"
                strokeWidth="3"
              />
              <title>{fullTooltipLabel}</title>
              <text x={point.x} y={point.y - 14} textAnchor="middle" fontSize="12" fontWeight="700" fill="#111827">
                {formatWeight(Number(point.entry.weight_value))}
              </text>
              {isHovered && (
                <g pointerEvents="none">
                  <rect
                    x={tooltipX}
                    y={tooltipY}
                    width={tooltipWidth}
                    height="28"
                    rx="0"
                    fill="#ffffff"
                    stroke="#111827"
                    strokeWidth="2"
                  />
                  <text
                    x={tooltipX + tooltipWidth / 2}
                    y={tooltipY + 18}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fill="#111827"
                  >
                    {tooltipLabel}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
