'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import Image from 'next/image';
import { supabase, type SportEntry } from '@/lib/supabase';
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
  name: string;
  imageUrl: string | null;
  count: number;
  bestWeight: number;
};

const STORAGE_BUCKET = 'sport-equipment-images';
const TABLE_NAME = 'sport_entries';

const todayInputValue = () => new Date().toISOString().slice(0, 10);

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

  const [sportName, setSportName] = useState('Strength');
  const [equipmentName, setEquipmentName] = useState('');
  const [achievedOn, setAchievedOn] = useState(todayInputValue);
  const [weightValue, setWeightValue] = useState('');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lb');
  const [notes, setNotes] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [equipmentMenuOpen, setEquipmentMenuOpen] = useState(false);

  const clearPreview = useCallback(() => {
    setImagePreview((current) => {
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
    setNotes('');
    setImageFile(null);
    setExistingImageUrl(null);
    setEquipmentMenuOpen(false);
    clearPreview();
    setShowForm(false);
    setError('');
  }, [clearPreview]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const { data, error: fetchError } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .order('achieved_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);

      if (fetchError) throw fetchError;
      setEntries((data ?? []) as SportEntry[]);
    } catch (fetchError) {
      console.warn('Failed to load sports progress', fetchError);
      setError(`Could not load sports progress: ${getErrorMessage(fetchError)}`);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const equipmentOptions = useMemo(() => {
    const map = new Map<string, EquipmentOption>();

    entries.forEach((entry) => {
      const current = map.get(entry.equipment_name);
      const weight = Number(entry.weight_value);
      if (!current) {
        map.set(entry.equipment_name, {
          name: entry.equipment_name,
          imageUrl: entry.equipment_image_url,
          count: 1,
          bestWeight: weight,
        });
        return;
      }

      map.set(entry.equipment_name, {
        ...current,
        imageUrl: current.imageUrl || entry.equipment_image_url,
        count: current.count + 1,
        bestWeight: Math.max(current.bestWeight, weight),
      });
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const selectedEntries = useMemo(() => {
    const scoped =
      selectedEquipment === 'all'
        ? entries
        : entries.filter((entry) => entry.equipment_name === selectedEquipment);

    return [...scoped].sort((a, b) => {
      const dateCompare = a.achieved_on.localeCompare(b.achieved_on);
      if (dateCompare !== 0) return dateCompare;
      return a.created_at.localeCompare(b.created_at);
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

  const currentEquipmentImage = useMemo(() => {
    if (imagePreview) return imagePreview;
    if (existingImageUrl) return existingImageUrl;

    const match = equipmentOptions.find(
      (option) => option.name.toLowerCase() === equipmentName.trim().toLowerCase()
    );

    return match?.imageUrl || '';
  }, [equipmentName, equipmentOptions, existingImageUrl, imagePreview]);

  const startAdd = (equipmentToReuse?: string) => {
    const reusableEquipment =
      equipmentToReuse || (selectedEquipment === 'all' ? '' : selectedEquipment);
    const latestForEquipment = reusableEquipment
      ? entries.find((entry) => entry.equipment_name === reusableEquipment) || null
      : null;

    setEditingEntry(null);
    setSportName(latestForEquipment?.sport_name || 'Strength');
    setEquipmentName(reusableEquipment);
    setAchievedOn(todayInputValue());
    setWeightValue('');
    setWeightUnit(latestForEquipment?.weight_unit || 'lb');
    setNotes('');
    setImageFile(null);
    setExistingImageUrl(latestForEquipment?.equipment_image_url || null);
    setEquipmentMenuOpen(false);
    clearPreview();
    setShowForm(true);
    setError('');

    if (reusableEquipment) {
      setSelectedEquipment(reusableEquipment);
    }
  };

  const reuseEquipment = (equipment: EquipmentOption) => {
    const latestForEquipment =
      entries.find((entry) => entry.equipment_name === equipment.name) || null;

    setEquipmentName(equipment.name);
    setSportName(latestForEquipment?.sport_name || sportName || 'Strength');
    setWeightUnit(latestForEquipment?.weight_unit || weightUnit);
    setExistingImageUrl(equipment.imageUrl);
    setImageFile(null);
    clearPreview();
    setSelectedEquipment(equipment.name);
    setEquipmentMenuOpen(false);
    setError('');
  };

  const startEdit = (entry: SportEntry) => {
    setEditingEntry(entry);
    setSportName(entry.sport_name);
    setEquipmentName(entry.equipment_name);
    setAchievedOn(entry.achieved_on);
    setWeightValue(formatWeight(Number(entry.weight_value)));
    setWeightUnit(entry.weight_unit);
    setNotes(entry.notes || '');
    setImageFile(null);
    setExistingImageUrl(entry.equipment_image_url);
    setEquipmentMenuOpen(false);
    clearPreview();
    setShowForm(true);
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

  const uploadEquipmentImage = async (file: File) => {
    const webpBlob = await convertToWebP(file, 0.85);
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.webp`;

    const { data, error: uploadError } = await appStorage
      .from(STORAGE_BUCKET)
      .upload(fileName, webpBlob, {
        contentType: 'image/webp',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError || !data) throw uploadError || new Error('Upload returned no data');
    return data.publicUrl;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isEditMode) return;

    const trimmedEquipment = equipmentName.trim();
    const trimmedSport = sportName.trim() || 'Strength';
    const parsedWeight = Number(weightValue);

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

    setSaving(true);
    setError('');

    try {
      const matchingEquipment = equipmentOptions.find(
        (option) => option.name.toLowerCase() === trimmedEquipment.toLowerCase()
      );
      let equipmentImageUrl = existingImageUrl || matchingEquipment?.imageUrl || null;

      if (imageFile) {
        equipmentImageUrl = await uploadEquipmentImage(imageFile);
      }

      if (!equipmentImageUrl) {
        setError('Add an equipment image for the first entry with this equipment.');
        setSaving(false);
        return;
      }

      const payload = {
        anon_id: anonId || null,
        sport_name: trimmedSport,
        equipment_name: trimmedEquipment,
        equipment_image_url: equipmentImageUrl,
        achieved_on: achievedOn,
        weight_value: parsedWeight,
        weight_unit: weightUnit,
        notes: notes.trim() || null,
      };

      if (editingEntry) {
        const { data, error: updateError } = await supabase
          .from(TABLE_NAME)
          .update(payload)
          .eq('id', editingEntry.id)
          .select()
          .single<SportEntry>();

        if (updateError || !data) throw updateError || new Error('Update returned no data');
        setEntries((current) => current.map((entry) => (entry.id === data.id ? data : entry)));
        onLogActivity?.('Updated Sports Entry', `${trimmedEquipment} ${formatWeight(parsedWeight)}${weightUnit}`);
      } else {
        const { data, error: insertError } = await supabase
          .from(TABLE_NAME)
          .insert(payload)
          .select()
          .single<SportEntry>();

        if (insertError || !data) throw insertError || new Error('Insert returned no data');
        setEntries((current) => [data, ...current]);
        onLogActivity?.('Added Sports Entry', `${trimmedEquipment} ${formatWeight(parsedWeight)}${weightUnit}`);
      }

      setSelectedEquipment(trimmedEquipment);
      resetForm();
    } catch (saveError) {
      console.warn('Failed to save sports entry', saveError);
      setError(`Could not save sports entry: ${getErrorMessage(saveError)}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry: SportEntry) => {
    if (!isEditMode) return;
    if (!confirm(`Delete ${entry.equipment_name} from ${formatDate(entry.achieved_on)}?`)) return;

    setSaving(true);
    setError('');

    try {
      const { error: deleteError } = await supabase.from(TABLE_NAME).delete().eq('id', entry.id);
      if (deleteError) throw deleteError;

      setEntries((current) => current.filter((item) => item.id !== entry.id));
      onLogActivity?.('Deleted Sports Entry', entry.equipment_name);
    } catch (deleteError) {
      console.warn('Failed to delete sports entry', deleteError);
      setError(`Could not delete sports entry: ${getErrorMessage(deleteError)}`);
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

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
                className={`border-2 border-gray-900 px-3 py-2 mb-4 text-sm ${
                  error ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-gray-700'
                }`}
              >
                {error || 'Loading sports progress...'}
              </div>
            )}

            <div className="grid sm:grid-cols-4 gap-3 mb-4">
              <StatBox
                label="LATEST"
                value={
                  stats.latest
                    ? `${formatWeight(Number(stats.latest.weight_value))}${stats.latest.weight_unit}`
                    : '--'
                }
                detail={stats.latest?.equipment_name || 'No logs yet'}
                tone="bg-cyan-100"
              />
              <StatBox
                label="PERSONAL BEST"
                value={
                  stats.best
                    ? `${formatWeight(Number(stats.best.weight_value))}${stats.best.weight_unit}`
                    : '--'
                }
                detail={stats.best?.equipment_name || 'Start tracking'}
                tone="bg-lime-100"
              />
              <StatBox
                label="CHANGE"
                value={`${stats.delta > 0 ? '+' : ''}${formatWeight(stats.delta)}`}
                detail="vs previous log"
                tone="bg-yellow-100"
              />
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

            {equipmentOptions.length > 0 && (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
                {equipmentOptions.map((option) => (
                  <div
                    key={option.name}
                    className={`border-4 border-gray-900 bg-white p-3 hover:-translate-y-0.5 transition-transform ${
                      selectedEquipment === option.name ? 'shadow-[4px_4px_0_0_#000]' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedEquipment(option.name)}
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
            )}

            <div className="space-y-3">
              {entries.length === 0 && !loading ? (
                <div className="border-4 border-gray-900 bg-gray-50 p-6 text-center text-sm text-gray-500">
                  No sports entries yet.
                </div>
              ) : (
                entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="border-4 border-gray-900 bg-white p-3 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="relative w-full sm:w-24 h-32 sm:h-20 border-2 border-gray-900 bg-gray-100 shrink-0 overflow-hidden">
                      {entry.equipment_image_url ? (
                        <Image
                          src={entry.equipment_image_url}
                          alt={entry.equipment_name}
                          fill
                          sizes="(max-width: 640px) 100vw, 96px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">🏋️</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h3 className="text-lg font-bold">{entry.equipment_name}</h3>
                        <span className="text-xs text-gray-500">{entry.sport_name}</span>
                      </div>
                      <div className="text-sm text-gray-700">{formatDate(entry.achieved_on)}</div>
                      {entry.notes && <div className="text-xs text-gray-500 mt-1">{entry.notes}</div>}
                    </div>
                    <div className="sm:text-right">
                      <div className="text-3xl font-bold leading-none">
                        {formatWeight(Number(entry.weight_value))}
                        <span className="text-base ml-1">{entry.weight_unit}</span>
                      </div>
                      {isEditMode && (
                        <div className="flex sm:justify-end gap-2 mt-3">
                          <button
                            type="button"
                            onClick={() => startEdit(entry)}
                            className="px-3 py-1.5 border-2 border-gray-900 hover:bg-gray-100 text-xs"
                          >
                            EDIT
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteEntry(entry)}
                            disabled={saving}
                            className="px-3 py-1.5 border-2 border-gray-900 hover:bg-red-500 hover:text-white text-xs"
                          >
                            DELETE
                          </button>
                          <button
                            type="button"
                            onClick={() => startAdd(entry.equipment_name)}
                            className="px-3 py-1.5 border-2 border-gray-900 bg-cyan-100 hover:bg-cyan-200 text-xs"
                          >
                            LOG AGAIN
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <aside className="p-4 sm:p-5 bg-gray-50">
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

                  <label className="block">
                    <span className="text-xs text-gray-500">NOTES</span>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      className="mt-1 w-full border-2 border-gray-900 px-3 py-2 min-h-20 resize-y"
                      placeholder="Sets, reps, form notes..."
                    />
                  </label>
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
                <h3 className="text-lg font-bold mb-3">TRACKER</h3>
                <div className="text-sm text-gray-600 space-y-2">
                  <p>Each log stores the sport, equipment photo, date, weight achieved, and notes.</p>
                  <p>The diagram updates when you choose all equipment or a single equipment type.</p>
                </div>
                {isEditMode && (
                  <button
                    type="button"
                    onClick={() => startAdd()}
                    className="mt-4 w-full border-4 border-gray-900 bg-cyan-200 hover:bg-cyan-300 py-3 font-bold"
                  >
                    + LOG PROGRESS
                  </button>
                )}
              </div>
            )}
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
    <div className={`border-4 border-gray-900 p-3 ${tone}`}>
      <div className="text-[11px] text-gray-600 font-bold">{label}</div>
      <div className="text-2xl font-bold leading-tight truncate">{value}</div>
      <div className="text-xs text-gray-600 truncate">{detail}</div>
    </div>
  );
}

function ProgressDiagram({ entries }: { entries: SportEntry[] }) {
  const chartEntries = entries.slice(-12);
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
  const dateCounts = chartEntries.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.achieved_on] = (counts[entry.achieved_on] || 0) + 1;
    return counts;
  }, {});
  const seenDates: Record<string, number> = {};

  const points = chartEntries.map((entry, index) => {
    seenDates[entry.achieved_on] = (seenDates[entry.achieved_on] || 0) + 1;
    const x =
      chartEntries.length === 1
        ? width / 2
        : paddingX + (index / (chartEntries.length - 1)) * plotWidth;
    const y = paddingTop + plotHeight - (Number(entry.weight_value) / chartMax) * plotHeight;
    const duplicateDate = dateCounts[entry.achieved_on] > 1;
    return {
      x,
      y,
      entry,
      label: formatChartDate(entry.achieved_on),
      sublabel: duplicateDate ? `Log ${seenDates[entry.achieved_on]}` : entry.equipment_name,
    };
  });

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
        <polyline
          fill="none"
          stroke="#06b6d4"
          strokeWidth="5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
        />
        {points.map((point) => (
          <g key={`${point.entry.id}-${point.x}`}>
            <line x1={point.x} x2={point.x} y1={axisY} y2={axisY + 7} stroke="#111827" strokeWidth="2" />
            <circle cx={point.x} cy={point.y} r="8" fill="#bef264" stroke="#111827" strokeWidth="3" />
            <text x={point.x} y={point.y - 14} textAnchor="middle" fontSize="12" fontWeight="700" fill="#111827">
              {formatWeight(Number(point.entry.weight_value))}
            </text>
            <text x={point.x} y={axisY + 22} textAnchor="middle" fontSize="11" fontWeight="700" fill="#111827">
              {point.label}
            </text>
            <text x={point.x} y={axisY + 38} textAnchor="middle" fontSize="10" fill="#6b7280">
              {point.sublabel}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
