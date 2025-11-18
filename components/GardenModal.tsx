'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { supabase, type GardenSpecies } from '@/lib/supabase';
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

export default function GardenModal({ isOpen, onClose, onLogActivity, isEditMode }: GardenModalProps) {
  const [speciesList, setSpeciesList] = useState<GardenSpecies[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState<GardenSpecies | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

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

  useEffect(() => {
    if (isOpen) {
      fetchSpecies();
      onLogActivity('Opened Garden', 'Viewing backyard plant species');
    } else {
      setSelectedSpecies(null);
      closeForm();
    }
  }, [isOpen, onLogActivity]);

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

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
    setImageFile(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview('');
  };

  const closeForm = () => {
    clearForm();
    setIsAdding(false);
  };

  const fetchSpecies = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('garden_species')
      .select('*')
      .order('common_name', { ascending: true });

    if (error) {
      console.error('Failed to load garden species', error);
    } else {
      setSpeciesList(data || []);
    }
    setLoading(false);
  };

  const handleSelectSpecies = (species: GardenSpecies) => {
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
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!commonName.trim()) {
      setFormError('Common name is required.');
      return;
    }
    if (!imageFile) {
      setFormError('Please select an image for this plant.');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
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
        image_url: urlData.publicUrl,
      };

      const { data, error } = await supabase
        .from('garden_species')
        .insert(payload)
        .select()
        .single<GardenSpecies>();

      if (error) {
        throw error;
      }

      setSpeciesList((prev) => {
        const next = [...prev, data];
        return next.sort((a, b) => a.common_name.localeCompare(b.common_name));
      });

      onLogActivity('Added Garden species', payload.common_name);
      closeForm();
    } catch (error) {
      console.error('Failed to add garden species', error);
      setFormError('Could not save this plant. Please try again.');
    } finally {
      setSaving(false);
    }
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

  const selectedStats: SpeciesStat[] = selectedSpecies
    ? [
        { label: 'Scientific Name', value: selectedSpecies.scientific_name },
        { label: 'Location', value: selectedSpecies.location },
        { label: 'Sunlight', value: selectedSpecies.sunlight },
        { label: 'Watering', value: selectedSpecies.watering_schedule },
        { label: 'Soil', value: selectedSpecies.soil_type },
        { label: 'Bloom Season', value: selectedSpecies.bloom_season },
        { label: 'Planted On', value: formatDate(selectedSpecies.planted_on) },
        { label: 'Last Groomed', value: formatDate(selectedSpecies.last_pruned_on) },
        { label: 'Status', value: selectedSpecies.status },
        { label: 'Notes', value: selectedSpecies.notes },
      ]
    : [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div
        className="bg-white w-full max-w-5xl h-[90vh] flex flex-col relative overflow-hidden"
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
            <div>
              <h2
                className="text-2xl font-bold text-gray-900"
                style={{ fontFamily: "var(--font-courier), 'Courier New', monospace" }}
              >
                GARDEN
              </h2>
              <p className="text-xs text-gray-500 -mt-1">
                Backyard species roster
              </p>
            </div>
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
            <div className="absolute inset-0 overflow-y-auto p-6 bg-white space-y-6">
              {isEditMode && isAdding && (
                <form
                  onSubmit={handleSubmit}
                  className="border-4 border-dashed border-gray-900 p-4 space-y-4 bg-white"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs tracking-wide">Location</label>
                      <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="border-2 border-gray-900 px-3 py-2 text-sm"
                        placeholder="Back fence / NE corner"
                      />
                    </div>
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
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    <div className="flex flex-col gap-1">
                      <label className="text-xs tracking-wide">Last groomed</label>
                      <input
                        type="date"
                        value={lastPrunedOn}
                        onChange={(e) => setLastPrunedOn(e.target.value)}
                        className="border-2 border-gray-900 px-3 py-2 text-sm"
                      />
                    </div>
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
                  <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
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
                          className="max-h-32 object-cover"
                        />
                      </div>
                    )}
                  </div>
                  {formError && (
                    <div className="text-xs text-red-600">{formError}</div>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 border-2 border-gray-900 bg-emerald-300 hover:bg-emerald-400 text-sm font-semibold disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Plant'}
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
              )}

              {loading ? (
                <div className="text-center text-sm text-gray-500">
                  Loading the backyard...
                </div>
              ) : speciesList.length === 0 ? (
                <div className="text-center text-sm text-gray-500">
                  No species logged yet. {isEditMode ? 'Use ADD PLANT to begin cataloging.' : 'Ask Lucy to log a few plants.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {speciesList.map((species) => (
                    <button
                      key={species.id}
                      onClick={() => handleSelectSpecies(species)}
                      className="group relative border-4 border-gray-900"
                      style={{ boxShadow: '6px 6px 0 0 #000' }}
                    >
                      <div className="aspect-square overflow-hidden bg-gray-100">
                        <img
                          src={species.image_url}
                          alt={species.common_name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                      <div className="p-3 bg-white text-left">
                        <div className="text-lg font-bold text-gray-900">
                          {species.common_name}
                        </div>
                        {species.scientific_name && (
                          <div className="text-xs uppercase tracking-wide text-gray-500 mt-1">
                            {species.scientific_name}
                          </div>
                        )}
                        {species.status && (
                          <div className="mt-3 inline-flex items-center px-2 py-0.5 text-[11px] uppercase tracking-wide bg-green-50 border border-gray-900">
                            {species.status}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedSpecies && (
            <div className="absolute inset-0 bg-white flex flex-col">
              <div
                className="p-4 flex items-center justify-between bg-green-50"
                style={{ borderBottom: '3px solid #000' }}
              >
                <button
                  onClick={() => setSelectedSpecies(null)}
                  className="px-3 py-1 border-2 border-gray-900 bg-white hover:bg-gray-100 text-sm font-semibold"
                >
                  ← Back to list
                </button>
                <div className="text-right">
                  <div className="text-2xl font-bold">{selectedSpecies.common_name}</div>
                  {selectedSpecies.scientific_name && (
                    <div className="text-xs uppercase text-gray-600">
                      {selectedSpecies.scientific_name}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 grid grid-cols-1 lg:grid-cols-2">
                <div className="relative bg-gray-900/5">
                  <img
                    src={selectedSpecies.image_url}
                    alt={selectedSpecies.common_name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-6 flex flex-col gap-6 overflow-y-auto">
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
