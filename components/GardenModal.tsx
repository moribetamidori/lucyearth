'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { supabase, type GardenPlacement, type GardenSpecies } from '@/lib/supabase';
import { convertToWebP } from '@/lib/imageUpload';

type GardenModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onLogActivity: (action: string, details?: string) => void;
  isEditMode: boolean;
};

type SpeciesStat = {
  label: string;
  value: string | null | undefined;
};

type GardenPlacementWithSpecies = GardenPlacement & { species?: GardenSpecies | null };

const GRID_CELL_SIZE = 18; // px — sized for easy clicking
const GRID_GAP = 2;

const placementPalette = ['#bbf7d0', '#bfdbfe', '#fed7aa', '#fef08a', '#fbcfe8', '#e0f2fe'];

const derivePlacementColor = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return placementPalette[Math.abs(hash) % placementPalette.length];
};

export default function GardenModal({ isOpen, onClose, onLogActivity, isEditMode }: GardenModalProps) {
  const [speciesList, setSpeciesList] = useState<GardenSpecies[]>([]);
  const [placements, setPlacements] = useState<GardenPlacementWithSpecies[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState<GardenSpecies | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingSpecies, setEditingSpecies] = useState<GardenSpecies | null>(null);
  const [editingPlacementId, setEditingPlacementId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedCells, setSelectedCells] = useState<number[]>([]);
  const [gridCols, setGridCols] = useState(50);
  const [gridRows, setGridRows] = useState(20);

  const [commonName, setCommonName] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [sunlight, setSunlight] = useState('');
  const [wateringSchedule, setWateringSchedule] = useState('');
  const [soilType, setSoilType] = useState('');
  const [bloomSeason, setBloomSeason] = useState('');
  const [plantedOn, setPlantedOn] = useState('');
  const [lastPrunedOn, setLastPrunedOn] = useState('');
  const [status, setStatus] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  const gridAreaRef = useRef<HTMLDivElement | null>(null);

  const gridCells = useMemo(
    () => Array.from({ length: gridCols * gridRows }, (_, index) => index),
    [gridCols, gridRows]
  );

  const placementLookup = useMemo(() => {
    const lookup = new Map<number, GardenPlacementWithSpecies>();
    placements.forEach((placement) => {
      placement.cells.forEach((cell) => lookup.set(cell, placement));
    });
    return lookup;
  }, [placements]);

  const selectedCellsSet = useMemo(() => new Set(selectedCells), [selectedCells]);

  const selectedPlacement = selectedSpecies
    ? placements.find((placement) => placement.species_id === selectedSpecies.id) || null
    : null;

  useEffect(() => {
    if (isOpen) {
      fetchGardenData();
      onLogActivity('Opened Garden', 'Viewing backyard plant species');
    } else {
      setSelectedSpecies(null);
      closeForm();
    }
  }, [isOpen, onLogActivity]);

  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  useEffect(() => {
    const updateGridSize = () => {
      const el = gridAreaRef.current;
      if (!el) return;

      const padding = 16; // matches grid padding in this container
      const cellSpan = GRID_CELL_SIZE + GRID_GAP;
      const availableWidth = Math.max(0, el.clientWidth - padding);
      const availableHeight = Math.max(0, el.clientHeight - padding);

      const measuredCols = Math.max(12, Math.ceil(availableWidth / cellSpan));
      let measuredRows = Math.max(12, Math.ceil(availableHeight / cellSpan));

      const maxCellIndex =
        placements.length > 0 ? Math.max(...placements.flatMap((p) => p.cells)) : -1;
      if (maxCellIndex >= 0) {
        const neededRows = Math.ceil((maxCellIndex + 1) / measuredCols);
        measuredRows = Math.max(measuredRows, neededRows);
      }

      if (measuredCols !== gridCols || measuredRows !== gridRows) {
        setGridCols(measuredCols);
        setGridRows(measuredRows);
      }
    };

    updateGridSize();
    const observer = new ResizeObserver(updateGridSize);
    if (gridAreaRef.current) {
      observer.observe(gridAreaRef.current);
    }
    window.addEventListener('resize', updateGridSize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateGridSize);
    };
  }, [placements, gridCols, gridRows]);

  const clearForm = () => {
    setSaving(false);
    setFormError('');
    setCommonName('');
    setScientificName('');
    setSunlight('');
    setWateringSchedule('');
    setSoilType('');
    setBloomSeason('');
    setPlantedOn('');
    setLastPrunedOn('');
    setStatus('');
    setLocation('');
    setNotes('');
    setSelectedCells([]);
    setEditingSpecies(null);
    setEditingPlacementId(null);
    setImageFile(null);
    if (imagePreview && imagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview('');
  };

  const closeForm = () => {
    clearForm();
    setIsAdding(false);
  };

  const fetchGardenData = async () => {
    setLoading(true);
    const { data: speciesData, error: speciesError } = await supabase
      .from('garden_species')
      .select('*')
      .order('common_name', { ascending: true });

    if (speciesError) {
      console.error('Failed to load garden species', speciesError);
      setLoading(false);
      return;
    }

    const speciesListData = speciesData || [];
    const speciesMap = new Map(speciesListData.map((species) => [species.id, species]));

    const { data: placementData, error: placementError } = await supabase
      .from('garden_placements')
      .select('*')
      .order('created_at', { ascending: true });

    if (placementError) {
      console.error('Failed to load garden placements', placementError);
    }

    setSpeciesList(speciesListData);
    setPlacements(
      (placementData || []).map((placement) => ({
        ...placement,
        color:
          placement.color ||
          derivePlacementColor(
            speciesMap.get(placement.species_id)?.common_name || placement.species_id
          ),
        species: speciesMap.get(placement.species_id) || null,
      }))
    );
    setLoading(false);
  };

  const handleSelectSpecies = (species: GardenSpecies) => {
    if (isAdding && editingSpecies && editingSpecies.id === species.id) {
      // If currently editing this species, keep the form open
      return;
    }
    setSelectedSpecies(species);
    onLogActivity('Opened Garden species', species.common_name);
  };

  const closeModal = () => {
    setSelectedSpecies(null);
    closeForm();
    onClose();
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    if (imagePreview && imagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview(URL.createObjectURL(file));
  };

  const toggleCellSelection = (cellIndex: number) => {
    setSelectedCells((prev) =>
      prev.includes(cellIndex) ? prev.filter((cell) => cell !== cellIndex) : [...prev, cellIndex]
    );
  };

  const handleCellClick = (cellIndex: number) => {
    const placement = placementLookup.get(cellIndex);
    if (placement?.species) {
      if (isAdding && editingSpecies && placement.species_id === editingSpecies.id) {
        toggleCellSelection(cellIndex);
        return;
      }
      handleSelectSpecies(placement.species);
      return;
    }

    if (!isEditMode || !isAdding) return;
    toggleCellSelection(cellIndex);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!commonName.trim()) {
      setFormError('Common name is required.');
      return;
    }
    if (!imageFile && !editingSpecies) {
      setFormError('Please select an image for this plant.');
      return;
    }
    if (selectedCells.length === 0) {
      setFormError('Pick at least one grid block for this plant.');
      return;
    }
    const hasConflict = selectedCells.some((cell) => {
      const occupant = placementLookup.get(cell);
      return occupant && occupant.species_id !== editingSpecies?.id;
    });
    if (hasConflict) {
      setFormError('Some selected blocks already have a different plant on them.');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      let imageUrl = editingSpecies?.image_url || '';
      if (imageFile) {
        const webpBlob = await convertToWebP(imageFile, 0.85);
        const filePath = `species/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.webp`;

        const { error: uploadError } = await supabase.storage
          .from('garden-species')
          .upload(filePath, webpBlob, {
            contentType: 'image/webp',
            cacheControl: '3600',
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data: urlData } = supabase.storage
          .from('garden-species')
          .getPublicUrl(filePath);
        imageUrl = urlData.publicUrl;
      }

      const payload = {
        common_name: commonName.trim(),
        scientific_name: scientificName.trim() || null,
        sunlight: sunlight.trim() || null,
        watering_schedule: wateringSchedule.trim() || null,
        soil_type: soilType.trim() || null,
        bloom_season: bloomSeason.trim() || null,
        planted_on: plantedOn || null,
        last_pruned_on: lastPrunedOn || null,
        status: status.trim() || null,
        location: location.trim() || null,
        notes: notes.trim() || null,
        image_url: imageUrl,
      };

      if (editingSpecies) {
        const { data: updatedSpecies, error: speciesUpdateError } = await supabase
          .from('garden_species')
          .update(payload)
          .eq('id', editingSpecies.id)
          .select()
          .single<GardenSpecies>();

        if (speciesUpdateError || !updatedSpecies) {
          throw speciesUpdateError;
        }

        const placementColor = derivePlacementColor(commonName.trim() || updatedSpecies.common_name);

        let updatedPlacement: GardenPlacement | null = null;

        if (editingPlacementId) {
          const { data, error: placementUpdateError } = await supabase
            .from('garden_placements')
            .update({
              cells: selectedCells,
              color: placementColor,
            })
            .eq('id', editingPlacementId)
            .select()
            .single<GardenPlacement>();

          if (placementUpdateError || !data) {
            throw placementUpdateError;
          }
          updatedPlacement = data;
        } else {
          const { data, error: placementInsertError } = await supabase
            .from('garden_placements')
            .insert({
              species_id: updatedSpecies.id,
              cells: selectedCells,
              color: placementColor,
            })
            .select()
            .single<GardenPlacement>();

          if (placementInsertError || !data) {
            throw placementInsertError;
          }
          updatedPlacement = data;
        }

        setSpeciesList((prev) =>
          prev
            .map((s) => (s.id === updatedSpecies.id ? updatedSpecies : s))
            .sort((a, b) => a.common_name.localeCompare(b.common_name))
        );

        setPlacements((prev) => {
          const updatedList = prev.map((placement) =>
            placement.id === updatedPlacement!.id
              ? {
                  ...updatedPlacement!,
                  color: updatedPlacement!.color || placementColor,
                  species: updatedSpecies,
                }
              : placement
          );

          const exists = prev.some((p) => p.id === updatedPlacement!.id);
          if (!exists) {
            updatedList.push({
              ...updatedPlacement!,
              color: updatedPlacement!.color || placementColor,
              species: updatedSpecies,
            });
          }

          return updatedList;
        });

        onLogActivity('Updated Garden species', payload.common_name);
        closeForm();
      } else {
        const { data: speciesRecord, error: speciesInsertError } = await supabase
          .from('garden_species')
          .insert(payload)
          .select()
          .single<GardenSpecies>();

        if (speciesInsertError || !speciesRecord) {
          throw speciesInsertError;
        }

        const placementColor = derivePlacementColor(commonName.trim());

        const { data: placementRecord, error: placementInsertError } = await supabase
          .from('garden_placements')
          .insert({
            species_id: speciesRecord.id,
            cells: selectedCells,
            color: placementColor,
          })
          .select()
          .single<GardenPlacement>();

        if (placementInsertError || !placementRecord) {
          await supabase.from('garden_species').delete().eq('id', speciesRecord.id);
          throw placementInsertError;
        }

        setSpeciesList((prev) => {
          const next = [...prev, speciesRecord];
          return next.sort((a, b) => a.common_name.localeCompare(b.common_name));
        });

        setPlacements((prev) => [
          ...prev,
          {
            ...placementRecord,
            color: placementRecord.color || placementColor,
            species: speciesRecord,
          },
        ]);

        onLogActivity('Added Garden species', payload.common_name);
        closeForm();
      }
    } catch (error) {
      console.error('Failed to save garden species', error);
      setFormError('Could not save this plant. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const startEditSpecies = (species: GardenSpecies) => {
    const placement = placements.find((p) => p.species_id === species.id);
    setIsAdding(true);
    setEditingSpecies(species);
    setEditingPlacementId(placement?.id || null);
    setCommonName(species.common_name);
    setScientificName(species.scientific_name || '');
    setSunlight(species.sunlight || '');
    setWateringSchedule(species.watering_schedule || '');
    setSoilType(species.soil_type || '');
    setBloomSeason(species.bloom_season || '');
    setPlantedOn(species.planted_on || '');
    setLastPrunedOn(species.last_pruned_on || '');
    setStatus(species.status || '');
    setLocation(species.location || '');
    setNotes(species.notes || '');
    setSelectedCells(placement?.cells || []);
    setImagePreview(species.image_url);
    setImageFile(null);
    setSelectedSpecies(null);
  };

  const renderStat = (label: string, value: string | null | undefined) => {
    if (!value) return null;
    return (
      <div key={label} className="space-y-1">
        <div className="text-[11px] uppercase tracking-wider text-gray-500">{label}</div>
        <div className="text-base text-gray-900">{value}</div>
      </div>
    );
  };

  const formatDate = (value: string | null | undefined) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const selectedStats: SpeciesStat[] = [];
  if (selectedSpecies) {
    selectedStats.push(
      { label: 'Location', value: selectedSpecies.location },
      { label: 'Sunlight', value: selectedSpecies.sunlight },
      { label: 'Watering', value: selectedSpecies.watering_schedule },
      { label: 'Soil', value: selectedSpecies.soil_type },
      { label: 'Bloom Season', value: selectedSpecies.bloom_season },
      { label: 'Planted On', value: formatDate(selectedSpecies.planted_on) },
      { label: 'Last Groomed', value: formatDate(selectedSpecies.last_pruned_on) },
      { label: 'Status', value: selectedSpecies.status },
      { label: 'Notes', value: selectedSpecies.notes }
    );

    if (selectedPlacement) {
      selectedStats.push({
        label: 'Grid Blocks',
        value: `${selectedPlacement.cells.length} selected blocks`,
      });
    }
  }

  const gridStyle = {
    gridTemplateColumns: `repeat(${gridCols}, ${GRID_CELL_SIZE}px)`,
    gridTemplateRows: `repeat(${gridRows}, ${GRID_CELL_SIZE}px)`,
    width: gridCols * GRID_CELL_SIZE + Math.max(0, gridCols - 1) * GRID_GAP,
    height: gridRows * GRID_CELL_SIZE + Math.max(0, gridRows - 1) * GRID_GAP,
    gap: GRID_GAP,
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div
        className="bg-white w-full max-w-6xl h-[90vh] flex flex-col relative overflow-hidden"
        style={{
          border: '4px solid #000',
          boxShadow: '8px 8px 0 0 #000',
        }}
      >
        <div
          className="p-4 flex items-center justify-between bg-white"
          style={{ borderBottom: '4px solid #000' }}
        >
          <div className="flex items-center gap-3">
            <img
              src="/images/garden/jatree.webp"
              alt="Garden"
              className="w-12 h-12 object-contain"
            />
            {selectedSpecies ? (
              <button
                onClick={() => setSelectedSpecies(null)}
                className="px-3 py-1 border-2 border-gray-900 bg-white hover:bg-gray-100 text-sm font-semibold"
              >
                ← Back to garden
              </button>
            ) : (
              <div>
                <h2
                  className="text-2xl font-bold text-gray-900"
                  style={{ fontFamily: "var(--font-courier), 'Courier New', monospace" }}
                >
                  GARDEN
                </h2>
                <p className="text-xs text-gray-500 -mt-1">
                  {gridCols} x {gridRows} grid — click blocks to explore plants
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isEditMode && !selectedSpecies && (
              <button
                onClick={() => {
                  if (isAdding) {
                    closeForm();
                  } else {
                    clearForm();
                    setIsAdding(true);
                  }
                }}
                className="px-4 py-2 border-2 border-gray-900 bg-emerald-200 hover:bg-emerald-300 text-sm font-semibold"
              >
                {isAdding ? 'Cancel' : '+ Add Plant'}
              </button>
            )}
            <button
              onClick={closeModal}
              className="w-10 h-10 bg-green-500 hover:bg-green-600 text-white font-bold text-xl transition-colors"
              style={{
                border: '3px solid #000',
                boxShadow: '3px 3px 0 0 #000',
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden">
          {!selectedSpecies && (
            <div className="absolute inset-0 grid lg:grid-cols-[2fr_1fr] gap-4 p-4 bg-white">
              <div className="flex flex-col overflow-hidden rounded-none lg:pr-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex flex-col gap-1">
                    <div className="text-sm font-semibold text-gray-900">Garden grid</div>
                    <div className="text-xs text-gray-500">
                      Pick blocks to place new plants. Tap colored blocks to open their stats.
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 px-2 py-1 border border-gray-900 bg-gray-50">
                      <span className="w-3 h-3 bg-blue-200 border border-blue-500" />
                      Selecting: {selectedCells.length}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 border border-gray-900 bg-gray-50">
                      <span className="w-3 h-3 bg-emerald-200 border border-emerald-500" />
                      Planted: {placements.length}
                    </span>
                  </div>
                </div>

                <div
                  className="relative flex-1 border-4 border-gray-900 bg-gradient-to-br from-white to-emerald-50"
                  style={{ boxShadow: '6px 6px 0 0 #000' }}
                >
                  <div className="absolute inset-0 overflow-auto flex items-center justify-center p-2" ref={gridAreaRef}>
                    <div className="grid" style={gridStyle}>
                      {gridCells.map((cellIndex) => {
                        const placement = placementLookup.get(cellIndex);
                        const isSelected = selectedCellsSet.has(cellIndex);
                        const isEditingCurrent =
                          editingSpecies && placement?.species_id === editingSpecies.id;
                        const displayPlacement =
                          isEditingCurrent && !isSelected ? null : placement;
                        const placementColor =
                          displayPlacement?.color && displayPlacement.color.startsWith('#')
                            ? displayPlacement.color
                            : displayPlacement?.color || undefined;
                        const row = Math.floor(cellIndex / gridCols) + 1;
                        const col = (cellIndex % gridCols) + 1;

                        return (
                          <button
                            key={cellIndex}
                            type="button"
                            onClick={() => handleCellClick(cellIndex)}
                            title={
                              displayPlacement?.species
                                ? `${displayPlacement.species.common_name} — R${row} C${col}`
                                : `R${row} C${col}`
                            }
                            className="relative transition-colors"
                            style={{
                              width: GRID_CELL_SIZE,
                              height: GRID_CELL_SIZE,
                              backgroundColor: displayPlacement
                                ? placementColor || '#c7f9cc'
                                : isSelected
                                  ? '#bfdbfe'
                                  : '#fff',
                              border: '1px solid #e5e7eb',
                              boxShadow: placement ? '0 0 0 1px #0f172a20 inset' : undefined,
                            }}
                          >
                            {displayPlacement?.species && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-4 h-4 rounded-sm overflow-hidden border border-black/10 bg-white/80 shadow-sm">
                                  <img
                                    src={displayPlacement.species.image_url}
                                    alt={displayPlacement.species.common_name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {loading ? (
                  <div className="mt-4 text-sm text-gray-500 text-center">Loading the backyard...</div>
                ) : (
                  <div className="mt-4 text-xs text-gray-500">
                    Scroll to explore all {gridCols} x {gridRows} blocks. Colors mark planted blocks; blue highlights
                    the blocks you&apos;re selecting for a new plant.
                  </div>
                )}
              </div>

              <div
                className="flex flex-col bg-white border-l-4 border-gray-900 overflow-hidden"
                style={{ boxShadow: '-4px 0 0 0 #000' }}
              >
                <div className="p-3 border-b-4 border-gray-900 flex items-center justify-between">
                  <div>
                    <div className="text-lg font-bold text-gray-900">Plants</div>
                    <div className="text-xs text-gray-500">
                      {isAdding
                        ? editingSpecies
                          ? 'Editing placement & details'
                          : 'Fill details & pick grid blocks'
                        : 'Tap a card or grid block'}
                    </div>
                  </div>
                  {isEditMode && !isAdding && (
                    <button
                      onClick={() => {
                        clearForm();
                        setIsAdding(true);
                      }}
                      className="px-3 py-1 border-2 border-gray-900 bg-emerald-200 hover:bg-emerald-300 text-xs font-semibold"
                    >
                      + Place Plant
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-4">
                  {isEditMode && isAdding ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="flex items-center justify-between bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-900">
                        <span>
                          {editingSpecies
                            ? 'Update details and adjust grid blocks as needed.'
                            : 'Select blocks on the grid to place this plant.'}
                        </span>
                        <span className="font-semibold">{selectedCells.length} selected</span>
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs tracking-wide">Common name *</label>
                          <input
                            type="text"
                            value={commonName}
                            onChange={(e) => setCommonName(e.target.value)}
                            className="border-2 border-gray-900 px-3 py-2 text-sm"
                            placeholder="Sequoia sempervirens"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs tracking-wide">Scientific name</label>
                          <input
                            type="text"
                            value={scientificName}
                            onChange={(e) => setScientificName(e.target.value)}
                            className="border-2 border-gray-900 px-3 py-2 text-sm"
                            placeholder="Taxodium distichum"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs tracking-wide">Location note</label>
                          <input
                            type="text"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            className="border-2 border-gray-900 px-3 py-2 text-sm"
                            placeholder="Back fence / NE corner"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs tracking-wide">Status</label>
                            <input
                              type="text"
                              value={status}
                              onChange={(e) => setStatus(e.target.value)}
                              className="border-2 border-gray-900 px-3 py-2 text-sm"
                              placeholder="Thriving / Needs water"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs tracking-wide">Sunlight</label>
                            <input
                              type="text"
                              value={sunlight}
                              onChange={(e) => setSunlight(e.target.value)}
                              className="border-2 border-gray-900 px-3 py-2 text-sm"
                              placeholder="Full sun / Partial shade"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs tracking-wide">Watering</label>
                            <input
                              type="text"
                              value={wateringSchedule}
                              onChange={(e) => setWateringSchedule(e.target.value)}
                              className="border-2 border-gray-900 px-3 py-2 text-sm"
                              placeholder="2x weekly"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs tracking-wide">Soil</label>
                            <input
                              type="text"
                              value={soilType}
                              onChange={(e) => setSoilType(e.target.value)}
                              className="border-2 border-gray-900 px-3 py-2 text-sm"
                              placeholder="Loam / Clay mix"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs tracking-wide">Bloom season</label>
                            <input
                              type="text"
                              value={bloomSeason}
                              onChange={(e) => setBloomSeason(e.target.value)}
                              className="border-2 border-gray-900 px-3 py-2 text-sm"
                              placeholder="Spring / Summer"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs tracking-wide">Planted on</label>
                            <input
                              type="date"
                              value={plantedOn}
                              onChange={(e) => setPlantedOn(e.target.value)}
                              className="border-2 border-gray-900 px-3 py-2 text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs tracking-wide">Last groomed</label>
                          <input
                            type="date"
                            value={lastPrunedOn}
                            onChange={(e) => setLastPrunedOn(e.target.value)}
                            className="border-2 border-gray-900 px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs tracking-wide">Notes</label>
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            className="border-2 border-gray-900 px-3 py-2 text-sm"
                            placeholder="Anything notable about this plant."
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs tracking-wide">Plant image *</label>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleImageChange}
                              className="text-sm"
                            />
                          </div>
                          {imagePreview && (
                            <div className="border-2 border-gray-900 bg-gray-50 flex items-center justify-center p-2">
                              <img
                                src={imagePreview}
                                alt="Preview"
                                className="max-h-24 object-cover"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      {formError && (
                        <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2">
                          {formError}
                        </div>
                      )}
                      <div className="flex gap-3">
                        <button
                          type="submit"
                          disabled={saving}
                          className="px-4 py-2 border-2 border-gray-900 bg-emerald-300 hover:bg-emerald-400 text-sm font-semibold disabled:opacity-50"
                        >
                          {saving ? 'Saving...' : editingSpecies ? 'Update Plant' : 'Save Plant'}
                        </button>
                        <button
                          type="button"
                          onClick={clearForm}
                          className="px-4 py-2 border-2 border-gray-900 bg-gray-100 hover:bg-gray-200 text-sm"
                        >
                          Clear
                        </button>
                      </div>
                    </form>
                  ) : loading ? (
                    <div className="text-sm text-gray-500 text-center py-4">
                      Loading the backyard...
                    </div>
                  ) : speciesList.length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-4">
                      No species logged yet.{' '}
                      {isEditMode ? 'Use PLACE PLANT to begin cataloging.' : 'Ask Lucy to log a few plants.'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {speciesList.map((species) => (
                        <div
                          key={species.id}
                          className="group relative border-2 border-gray-900 bg-white hover:-translate-y-0.5 transition-transform"
                          style={{ boxShadow: '4px 4px 0 0 #000' }}
                        >
                          {isEditMode && (
                            <div className="absolute top-2 right-2 flex gap-2 z-10">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditSpecies(species);
                                }}
                                className="px-2 py-1 border border-gray-900 bg-yellow-200 hover:bg-yellow-300 text-[11px] font-semibold"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => handleSelectSpecies(species)}
                            className="w-full text-left"
                          >
                            <div className="grid grid-cols-[60px_1fr] gap-3 p-3">
                              <div className="w-full h-[60px] overflow-hidden border border-gray-900 bg-gray-100">
                                <img
                                  src={species.image_url}
                                  alt={species.common_name}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                              </div>
                              <div className="flex flex-col">
                                <div className="text-base font-bold text-gray-900">
                                  {species.common_name}
                                </div>
                                {species.scientific_name && (
                                  <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-0.5">
                                    {species.scientific_name}
                                  </div>
                                )}
                                {species.status && (
                                  <div className="mt-2 inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-wide bg-green-50 border border-gray-900">
                                    {species.status}
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {selectedSpecies && (
            <div className="absolute inset-0 bg-white flex flex-col overflow-hidden">
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] overflow-hidden">
                <div className="relative bg-gradient-to-b from-emerald-50 via-white to-amber-50 flex items-center justify-center px-6 py-10">
                  <div
                    className="absolute inset-4 border-4 border-gray-900 pointer-events-none"
                    style={{ boxShadow: '8px 8px 0 0 #000' }}
                  />
                  <img
                    src={selectedSpecies.image_url}
                    alt={selectedSpecies.common_name}
                    className="relative z-10 max-h-[55vh] lg:max-h-[75vh] w-auto object-contain drop-shadow-[12px_14px_0_#00000020]"
                  />
                </div>
                <div className="p-6 flex flex-col gap-6 overflow-y-auto bg-white">
                  <div className="pb-4 border-b border-gray-200">
                    <div className="text-xl font-bold text-gray-900">
                      {selectedSpecies.common_name}
                    </div>
                    {selectedSpecies.scientific_name && (
                      <div className="text-xs uppercase tracking-wider text-gray-600">
                        {selectedSpecies.scientific_name}
                      </div>
                    )}
                  </div>
                  {selectedStats.map((stat) => renderStat(stat.label, stat.value))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
