'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, type WomenProfile } from '@/lib/supabase';
import { convertToWebP } from '@/lib/imageUpload';

type WomenModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isEditMode: boolean;
  anonId?: string;
  onLogActivity?: (action: string, details: string) => void;
};

type ViewMode = 'graph' | 'list';

type PositionedProfile = WomenProfile & {
  position: { x: number; y: number };
};

export default function WomenModal({
  isOpen,
  onClose,
  isEditMode,
  anonId,
  onLogActivity,
}: WomenModalProps) {
  const [profiles, setProfiles] = useState<WomenProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<ViewMode>('graph');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [isMobile, setIsMobile] = useState(false);
  const [graphScale, setGraphScale] = useState(1);
  const pinchStartDistance = useRef<number | null>(null);
  const pinchStartScale = useRef<number>(1);

  // Form state
  const [name, setName] = useState('');
  const [intro, setIntro] = useState('');
  const [accomplishments, setAccomplishments] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingMessage, setSavingMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchProfiles = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('women_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error('Error fetching women profiles:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchProfiles();
      if (onLogActivity) {
        onLogActivity('Opened Women Network', 'Viewed women graph + list');
      }
    }
  }, [fetchProfiles, isOpen, onLogActivity]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      // Auto-scale down slightly on small screens for better spacing
      setGraphScale(window.innerWidth < 480 ? 0.8 : window.innerWidth < 768 ? 0.9 : 1);
    };

    if (typeof window !== 'undefined') {
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    profiles.forEach((profile) => {
      profile.tags?.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [profiles]);

  const positionedProfiles: PositionedProfile[] = useMemo(() => {
    const goldenAngle = 137.5;

    return profiles.map((profile, index) => {
      const angle = (goldenAngle * index * Math.PI) / 180;
      // Keep desktop spacing and shrink nodes on mobile to avoid overlap
      const radius = Math.min(48, 14 + Math.sqrt(index + 1) * 10);
      const x = 50 + radius * Math.cos(angle);
      const y = 50 + radius * Math.sin(angle);

      return {
        ...profile,
        position: {
          x: Math.max(6, Math.min(94, x)),
          y: Math.max(6, Math.min(94, y)),
        },
      };
    });
  }, [profiles]);

  const connections = useMemo(() => {
    const links: Array<{ from: number; to: number; sharedTags: string[] }> = [];
    for (let i = 0; i < profiles.length; i++) {
      for (let j = i + 1; j < profiles.length; j++) {
        const tagsA = profiles[i].tags || [];
        const tagsB = profiles[j].tags || [];
        const shared = tagsA.filter((tag) => tagsB.includes(tag));
        if (shared.length > 0) {
          links.push({ from: i, to: j, sharedTags: shared });
        }
      }
    }
    return links;
  }, [profiles]);

  const filteredProfiles =
    filterTag === 'all'
      ? profiles
      : profiles.filter((profile) => profile.tags?.includes(filterTag));

  const availableTags = useMemo(() => {
    const query = tagsInput.trim().toLowerCase();
    return allTags.filter(
      (tag) =>
        !tags.includes(tag) &&
        (query.length === 0 || tag.toLowerCase().includes(query))
    );
  }, [allTags, tags, tagsInput]);

  const handleAddTag = (tag: string) => {
    const clean = tag.trim().toLowerCase();
    if (!clean) return;
    if (!tags.includes(clean)) {
      setTags((prev) => [...prev, clean]);
    }
    setTagsInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const startEdit = (profile: WomenProfile) => {
    setEditingId(profile.id);
    setName(profile.name);
    setIntro(profile.intro || '');
    setAccomplishments(profile.accomplishments || '');
    setTags(profile.tags || []);
    setTagsInput('');
    setSelectedImage(null);
    setImagePreview(profile.image_url || null);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!isEditMode) {
      alert('Enter edit mode to delete.');
      return;
    }
    const confirmDelete = confirm('Delete this profile? This cannot be undone.');
    if (!confirmDelete) return;
    try {
      await supabase.from('women_profiles').delete().eq('id', id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      console.error('Error deleting profile:', error);
      alert('Could not delete profile.');
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please choose an image.');
      return;
    }

    setSelectedImage(file);

    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const webpBlob = await convertToWebP(file, 0.82);
      const fileName = `women/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.webp`;

      const { error } = await supabase.storage
        .from('women-profiles')
        .upload(fileName, webpBlob, {
          contentType: 'image/webp',
          cacheControl: '3600',
        });

      if (error) throw error;

      const { data } = supabase.storage.from('women-profiles').getPublicUrl(fileName);
      return data.publicUrl;
    } catch (error) {
      console.error('Upload failed:', error);
      return null;
    }
  };

  const clampScale = (value: number) => Math.min(1.7, Math.max(0.6, value));

  const onPinchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartDistance.current = dist;
      pinchStartScale.current = graphScale;
    }
  };

  const onPinchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDistance.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / pinchStartDistance.current;
      setGraphScale(clampScale(pinchStartScale.current * ratio));
    }
  };

  const onPinchEnd = () => {
    pinchStartDistance.current = null;
  };

  const onWheelZoom = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setGraphScale((prev) => clampScale(prev + delta));
  };

  const handleCreateOrUpdate = async () => {
    if (!isEditMode) {
      alert('Enter edit mode to add women.');
      return;
    }

    if (!name.trim()) {
      alert('Name is required.');
      return;
    }

    setUploading(true);
    setSavingMessage(null);
    try {
      let imageUrl: string | null = null;

      if (selectedImage) {
        imageUrl = await uploadImage(selectedImage);
        if (!imageUrl) {
          alert('Image upload failed. Please try again.');
          return;
        }
      }

      let savedProfile: WomenProfile | null = null;

      if (editingId) {
        const { data, error } = await supabase
          .from('women_profiles')
          .update({
            name: name.trim(),
            intro: intro.trim() || null,
            accomplishments: accomplishments.trim() || null,
            image_url: imageUrl ?? imagePreview,
            tags,
          })
          .eq('id', editingId)
          .select()
          .single();
        if (error) throw error;
        savedProfile = data;
        setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)));
        setSavingMessage('Updated profile');
      } else {
        const { data, error } = await supabase
          .from('women_profiles')
          .insert({
            name: name.trim(),
            intro: intro.trim() || null,
            accomplishments: accomplishments.trim() || null,
            image_url: imageUrl,
            tags,
            created_by: anonId || null,
          })
          .select()
          .single();

        if (error) throw error;

        savedProfile = data;
        setProfiles((prev) => [data, ...prev]);
        setSavingMessage('Saved to network');
      }

      setName('');
      setIntro('');
      setAccomplishments('');
      setTags([]);
      setTagsInput('');
      setSelectedImage(null);
      setImagePreview(null);
      setEditingId(null);
      setShowForm(false);

      if (onLogActivity && savedProfile) {
        onLogActivity(
          editingId ? 'Updated woman profile' : 'Added woman profile',
          `${savedProfile.name} (${tags.join(', ') || 'no tags'})`
        );
      }
    } catch (error) {
      console.error('Error creating profile:', error);
      alert('Could not save profile. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white border-4 border-gray-900 w-full max-w-6xl max-h-[90vh] overflow-y-auto p-6 shadow-lg">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 border-2 border-gray-900 bg-gray-100 hover:bg-red-400 hover:text-white transition-colors"
          aria-label="Close women modal"
        >
          ✕
        </button>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pr-12">
            <div>
              <div className="text-xs text-gray-500">NETWORK</div>
              <h2 className="text-2xl font-semibold">Women Galaxy</h2>
              <p className="text-sm text-gray-600 max-w-xl">
                Add women, note their accomplishments, and see how shared tags weave them together.
              </p>
              <p className="text-[11px] text-gray-500 mt-1">Pinch or scroll to zoom the graph on mobile.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setView('graph')}
                className={`px-3 py-2 text-xs border-2 border-gray-900 ${view === 'graph' ? 'bg-blue-500 text-white' : 'bg-white hover:bg-blue-100'}`}
              >
                GRAPH
              </button>
              <button
                onClick={() => setView('list')}
                className={`px-3 py-2 text-xs border-2 border-gray-900 ${view === 'list' ? 'bg-blue-500 text-white' : 'bg-white hover:bg-blue-100'}`}
              >
                LIST
              </button>
              <button
                onClick={() => {
                  setShowForm(true);
                  setEditingId(null);
                  setName('');
                  setIntro('');
                  setAccomplishments('');
                  setTags([]);
                  setTagsInput('');
                  setSelectedImage(null);
                  setImagePreview(null);
                  setSavingMessage(null);
                }}
                className="px-3 py-2 text-xs border-2 border-gray-900 bg-amber-200 hover:bg-amber-300"
              >
                Add Woman
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-[2fr,1fr] gap-4">
            <div className="border-2 border-gray-900 p-4 bg-gradient-to-br from-sky-50 via-white to-violet-50 relative overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center h-[400px] text-gray-500 text-sm">
                  Loading network...
                </div>
              ) : view === 'graph' ? (
                <GraphView
                  profiles={positionedProfiles}
                  connections={connections}
                  isMobile={isMobile}
                  graphScale={graphScale}
                  onPinchStart={onPinchStart}
                  onPinchMove={onPinchMove}
                  onPinchEnd={onPinchEnd}
                  onWheelZoom={onWheelZoom}
                  isEditMode={isEditMode}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                />
              ) : (
                <ListView
                  profiles={filteredProfiles}
                  allTags={allTags}
                  filterTag={filterTag}
                  setFilterTag={setFilterTag}
                  isEditMode={isEditMode}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                />
              )}
            </div>

            <aside className="border-2 border-gray-900 p-4 bg-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  {editingId ? 'Edit Woman' : 'Add Woman'}
                </h3>
                <span className={`text-xs px-2 py-1 border ${isEditMode ? 'bg-green-100 border-green-500 text-green-700' : 'bg-red-100 border-red-500 text-red-700'}`}>
                  {isEditMode ? 'EDIT MODE' : 'VIEW ONLY'}
                </span>
              </div>

              {!showForm && !editingId ? (
                <div className="mt-4 space-y-2">
                  <p className="text-sm text-gray-600">Click &quot;Add Woman&quot; to open the form, or edit from any card.</p>
                  <button
                    onClick={() => setShowForm(true)}
                    className="w-full py-2 border-2 border-gray-900 bg-blue-500 text-white text-sm hover:bg-blue-600"
                  >
                    Open Form
                  </button>
                </div>
              ) : (
              <div className="space-y-3 mt-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name"
                  className="w-full px-3 py-2 border-2 border-gray-900 text-sm"
                />
                <textarea
                  value={intro}
                  onChange={(e) => setIntro(e.target.value)}
                  placeholder="Intro / why they matter"
                  className="w-full px-3 py-2 border-2 border-gray-900 text-sm h-20"
                />
                <textarea
                  value={accomplishments}
                  onChange={(e) => setAccomplishments(e.target.value)}
                  placeholder="Accomplishments, milestones, or impact"
                  className="w-full px-3 py-2 border-2 border-gray-900 text-sm h-24"
                />
                <div>
                  <label className="text-xs text-gray-600">Tags</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 text-[11px] rounded-full"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="text-xs text-gray-600 hover:text-red-500"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag(tagsInput);
                      }
                    }}
                    placeholder="Type to add tag"
                    className="w-full px-3 py-2 border-2 border-gray-900 text-sm mt-2"
                  />
                  {availableTags.length > 0 && (
                    <div className="mt-2 border-2 border-gray-900 bg-white max-h-32 overflow-y-auto">
                      {availableTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleAddTag(tag)}
                          className="block w-full text-left px-3 py-1 text-sm hover:bg-blue-100"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600">Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="w-full text-sm"
                  />
                  {imagePreview && (
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-32 object-cover border-2 border-gray-900"
                    />
                  )}
                </div>
                {savingMessage && (
                  <div className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1">
                    {savingMessage}
                  </div>
                )}
                <button
                  onClick={handleCreateOrUpdate}
                  disabled={uploading}
                  className="w-full py-2 border-2 border-gray-900 bg-blue-500 text-white text-sm hover:bg-blue-600 disabled:opacity-60"
                >
                  {uploading ? 'Saving...' : editingId ? 'Update Profile' : 'Save to Network'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setName('');
                      setIntro('');
                      setAccomplishments('');
                      setTags([]);
                      setTagsInput('');
                      setImagePreview(null);
                      setSelectedImage(null);
                      setShowForm(false);
                    }}
                    className="w-full py-2 border-2 border-gray-900 bg-gray-100 text-sm hover:bg-gray-200"
                  >
                    Cancel edit
                  </button>
                )}
                {!editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setName('');
                      setIntro('');
                      setAccomplishments('');
                      setTags([]);
                      setTagsInput('');
                      setImagePreview(null);
                      setSelectedImage(null);
                      setSavingMessage(null);
                    }}
                    className="w-full py-2 border-2 border-gray-900 bg-gray-100 text-sm hover:bg-gray-200"
                  >
                    Close form
                  </button>
                )}
              </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function GraphView({
  profiles,
  connections,
  isMobile,
  graphScale,
  onPinchStart,
  onPinchMove,
  onPinchEnd,
  onWheelZoom,
  isEditMode,
  onEdit,
  onDelete,
}: {
  profiles: PositionedProfile[];
  connections: Array<{ from: number; to: number; sharedTags: string[] }>;
  isMobile: boolean;
  graphScale: number;
  onPinchStart: (e: React.TouchEvent) => void;
  onPinchMove: (e: React.TouchEvent) => void;
  onPinchEnd: () => void;
  onWheelZoom: (e: React.WheelEvent) => void;
  isEditMode: boolean;
  onEdit: (profile: WomenProfile) => void;
  onDelete: (id: string) => void;
}) {
  const nodeScale = isMobile ? 0.7 : 1;

  return (
    <div
      className="relative h-[420px] overflow-hidden rounded-sm border border-gray-200 bg-white/60 touch-none"
      onTouchStart={onPinchStart}
      onTouchMove={onPinchMove}
      onTouchEnd={onPinchEnd}
      onWheel={onWheelZoom}
    >
      <div
        className="absolute inset-0 origin-center"
        style={{
          transform: `scale(${graphScale})`,
          transition: isMobile ? 'transform 0.05s linear' : 'transform 0.12s ease',
        }}
      >
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          {connections.map((link, idx) => {
            const from = profiles[link.from]?.position;
            const to = profiles[link.to]?.position;
            if (!from || !to) return null;
          return (
            <line
              key={idx}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="#93c5fd"
              strokeWidth={0.8}
              strokeDasharray={link.sharedTags.length > 1 ? '2 2' : '0'}
              opacity={0.9}
            />
          );
        })}
      </svg>

        {profiles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
            No women added yet. Switch to edit mode to seed the graph.
          </div>
        )}

        {profiles.map((profile) => (
          <div
            key={profile.id}
            className="group absolute w-36 text-center p-2 bg-white border-2 border-gray-900 shadow-md transition-all"
            style={{
              left: `${profile.position.x}%`,
              top: `${profile.position.y}%`,
              transform: `translate(-50%, -50%) scale(${nodeScale})`,
              transformOrigin: 'center',
          }}
        >
          <div className="w-14 h-14 max-sm:w-12 max-sm:h-12 mx-auto rounded-full overflow-hidden border border-gray-300 bg-gray-100">
            {profile.image_url ? (
              <img src={profile.image_url} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-xl">👩‍🚀</div>
              )}
            </div>
            <div className="mt-2 text-sm max-sm:text-xs font-semibold truncate">{profile.name}</div>
            <div className="text-[11px] max-sm:text-[10px] text-gray-600 line-clamp-2 leading-tight h-8">
              {profile.intro || 'Awaiting intro'}
            </div>
            <div className="flex flex-wrap justify-center gap-1 mt-2">
              {(profile.tags || []).slice(0, 3).map((tag) => (
                <span key={tag} className="px-1.5 py-0.5 bg-blue-100 border border-blue-300 text-[10px] rounded">
                  {tag}
                </span>
              ))}
              {(profile.tags?.length || 0) > 3 && (
                <span className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 text-[10px] rounded">
                  +{(profile.tags?.length || 0) - 3}
                </span>
              )}
            </div>
            {isEditMode && (
              <div className="flex justify-center gap-2 mt-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity max-md:opacity-100">
                <button
                  type="button"
                  onClick={() => onEdit(profile)}
                  className="px-2 py-1 text-[10px] border border-gray-900 bg-white hover:bg-blue-100"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(profile.id)}
                  className="px-2 py-1 text-[10px] border border-gray-900 bg-white hover:bg-red-100"
                >
                  Del
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ListView({
          profiles,
          allTags,
          filterTag,
          setFilterTag,
          isEditMode,
          onEdit,
          onDelete,
        }: {
  profiles: WomenProfile[];
  allTags: string[];
  filterTag: string;
  setFilterTag: (tag: string) => void;
  isEditMode: boolean;
          onEdit: (profile: WomenProfile) => void;
          onDelete: (id: string) => void;
        }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterTag('all')}
          className={`px-2.5 py-1 text-xs border-2 border-gray-900 ${filterTag === 'all' ? 'bg-blue-500 text-white' : 'bg-white hover:bg-blue-100'}`}
        >
          All tags
        </button>
        {allTags.map((tag) => (
          <button
            key={tag}
            onClick={() => setFilterTag(tag)}
            className={`px-2.5 py-1 text-xs border-2 border-gray-900 ${filterTag === tag ? 'bg-blue-500 text-white' : 'bg-white hover:bg-blue-100'}`}
          >
            {tag}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-3 max-h-[330px] overflow-y-auto pr-1">
        {profiles.length === 0 ? (
          <div className="text-sm text-gray-500 col-span-full">
            No women match this tag yet. Try a different tag or add a profile.
          </div>
        ) : (
          profiles.map((profile) => (
            <div key={profile.id} className="group flex gap-3 border-2 border-gray-900 bg-white p-3 shadow-sm">
              <div className="w-20 h-20 rounded border border-gray-300 overflow-hidden flex-shrink-0 bg-gray-50">
                {profile.image_url ? (
                  <img src={profile.image_url} alt={profile.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">👩‍🚀</div>
                )}
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold truncate">{profile.name}</h4>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                    {new Date(profile.created_at).toLocaleDateString()}
                  </span>
                </div>
                {profile.intro && <p className="text-sm text-gray-700 line-clamp-2">{profile.intro}</p>}
                {profile.accomplishments && (
                  <p className="text-xs text-gray-600 line-clamp-3">{profile.accomplishments}</p>
                )}
                <div className="flex flex-wrap gap-1 pt-1">
                  {(profile.tags || []).map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 bg-blue-50 border border-blue-200 text-[10px] rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                {isEditMode && (
                  <div className="flex gap-2 pt-2 md:opacity-0 md:hover:opacity-100 md:group-hover:opacity-100 transition-opacity max-md:opacity-100">
                    <button
                      type="button"
                      onClick={() => onEdit(profile)}
                      className="px-2 py-1 text-xs border border-gray-900 bg-white hover:bg-blue-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(profile.id)}
                      className="px-2 py-1 text-xs border border-gray-900 bg-white hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
