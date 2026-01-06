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

type SortMode = 'recent' | 'oldest' | 'birth_asc' | 'birth_desc' | 'name';

const PAGE_SIZE = 12;

export default function WomenModal({
  isOpen,
  onClose,
  isEditMode,
  anonId,
  onLogActivity,
}: WomenModalProps) {
  const [profiles, setProfiles] = useState<WomenProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [filterTag, setFilterTag] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<WomenProfile | null>(null);
  const [loadingRandom, setLoadingRandom] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importName, setImportName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [birthYear, setBirthYear] = useState('');
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

  const listRef = useRef<HTMLDivElement>(null);

  // Fetch all tags once for the filter
  const fetchAllTags = useCallback(async () => {
    const { data } = await supabase
      .from('women_profiles')
      .select('tags');

    if (data) {
      const tagSet = new Set<string>();
      data.forEach((row) => {
        (row.tags || []).forEach((tag: string) => tagSet.add(tag));
      });
      setAllTags(Array.from(tagSet).sort((a, b) => a.localeCompare(b)));
    }
  }, []);

  // Fetch total count
  const fetchTotalCount = useCallback(async (tag: string, search: string) => {
    let query = supabase
      .from('women_profiles')
      .select('*', { count: 'exact', head: true });

    if (tag !== 'all') {
      query = query.contains('tags', [tag]);
    }

    if (search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`);
    }

    const { count } = await query;
    setTotalCount(count || 0);
  }, []);

  // Build the query with sorting
  const buildQuery = useCallback((tag: string, sort: SortMode, search: string, offset: number, limit: number) => {
    let query = supabase
      .from('women_profiles')
      .select('*');

    if (tag !== 'all') {
      query = query.contains('tags', [tag]);
    }

    if (search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`);
    }

    switch (sort) {
      case 'recent':
        query = query.order('created_at', { ascending: false });
        break;
      case 'oldest':
        query = query.order('created_at', { ascending: true });
        break;
      case 'birth_asc':
        query = query.order('birth_year', { ascending: true, nullsFirst: false });
        break;
      case 'birth_desc':
        query = query.order('birth_year', { ascending: false, nullsFirst: true });
        break;
      case 'name':
        query = query.order('name', { ascending: true });
        break;
    }

    return query.range(offset, offset + limit - 1);
  }, []);

  // Initial fetch
  const fetchProfiles = useCallback(async (tag: string, sort: SortMode, search: string) => {
    try {
      setLoading(true);
      setProfiles([]);
      setHasMore(true);

      await fetchTotalCount(tag, search);

      const { data, error } = await buildQuery(tag, sort, search, 0, PAGE_SIZE);

      if (error) throw error;
      setProfiles(data || []);
      setHasMore((data?.length || 0) >= PAGE_SIZE);
    } catch (error) {
      console.error('Error fetching women profiles:', error);
    } finally {
      setLoading(false);
    }
  }, [buildQuery, fetchTotalCount]);

  // Load more
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    try {
      setLoadingMore(true);
      const offset = profiles.length;

      const { data, error } = await buildQuery(filterTag, sortMode, searchQuery, offset, PAGE_SIZE);

      if (error) throw error;

      if (data && data.length > 0) {
        setProfiles((prev) => [...prev, ...data]);
        setHasMore(data.length >= PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading more profiles:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [buildQuery, filterTag, sortMode, searchQuery, profiles.length, loadingMore, hasMore]);

  // Fetch random woman
  const fetchRandomWoman = useCallback(async () => {
    if (loadingRandom) return;

    try {
      setLoadingRandom(true);

      // Get total count first
      const { count } = await supabase
        .from('women_profiles')
        .select('*', { count: 'exact', head: true });

      if (!count || count === 0) return;

      // Pick random offset
      const randomOffset = Math.floor(Math.random() * count);

      const { data, error } = await supabase
        .from('women_profiles')
        .select('*')
        .range(randomOffset, randomOffset)
        .single();

      if (error) throw error;
      if (data) {
        setSelectedProfile(data);
      }
    } catch (error) {
      console.error('Error fetching random woman:', error);
    } finally {
      setLoadingRandom(false);
    }
  }, [loadingRandom]);

  // Import from Wikipedia
  const handleImport = useCallback(async () => {
    if (!importName.trim() || importing) return;

    setImporting(true);
    setImportError(null);

    try {
      // Check if name contains wiki title (format: "Name:Wiki_Title")
      const [name, wikiTitle] = importName.includes(':')
        ? importName.split(':')
        : [importName, undefined];

      const response = await fetch('/api/import-woman', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), wikiTitle }),
      });

      const data = await response.json();

      if (!response.ok) {
        setImportError(data.error || 'Import failed');
        return;
      }

      // Add to profiles list and show detail modal
      setProfiles((prev) => [data.profile, ...prev]);
      setTotalCount((prev) => prev + 1);
      setSelectedProfile(data.profile);
      setShowImport(false);
      setImportName('');

      // Refresh tags
      fetchAllTags();
    } catch (error) {
      setImportError('Failed to import. Please try again.');
    } finally {
      setImporting(false);
    }
  }, [importName, importing, fetchAllTags]);

  useEffect(() => {
    if (isOpen) {
      fetchAllTags();
      fetchProfiles(filterTag, sortMode, searchQuery);
      if (onLogActivity) {
        onLogActivity('Opened Women Network', 'Viewed women list');
      }
    }
  }, [isOpen]);

  // Re-fetch when filter, sort, or search changes
  useEffect(() => {
    if (isOpen) {
      fetchProfiles(filterTag, sortMode, searchQuery);
    }
  }, [filterTag, sortMode, searchQuery]);

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
    setBirthYear(profile.birth_year?.toString() || '');
    setIntro(profile.intro || '');
    setAccomplishments(profile.accomplishments || '');
    setTags(profile.tags || []);
    setTagsInput('');
    setSelectedImage(null);
    setImagePreview(profile.image_url || null);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const confirmDelete = confirm('Delete this profile? This cannot be undone.');
    if (!confirmDelete) return;
    try {
      await supabase.from('women_profiles').delete().eq('id', id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      setTotalCount((prev) => prev - 1);
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

  const handleCreateOrUpdate = async () => {
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

      const parsedBirthYear = birthYear ? parseInt(birthYear, 10) : null;

      if (editingId) {
        const { data, error } = await supabase
          .from('women_profiles')
          .update({
            name: name.trim(),
            birth_year: parsedBirthYear,
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
            birth_year: parsedBirthYear,
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
        setTotalCount((prev) => prev + 1);
        setSavingMessage('Saved to network');
      }

      setName('');
      setBirthYear('');
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
      <div className="relative bg-white border-4 border-gray-900 w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-lg">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 border-2 border-gray-900 bg-gray-100 hover:bg-red-400 hover:text-white transition-colors z-10"
          aria-label="Close women modal"
        >
          ✕
        </button>

        {/* Header */}
        <div className="p-6 pb-4 border-b-2 border-gray-900">
          <div className="flex flex-wrap items-center justify-between gap-3 pr-12">
            <div>
              <div className="text-xs text-gray-500">NETWORK</div>
              <h2 className="text-2xl font-semibold">Women Galaxy</h2>
              <p className="text-sm text-gray-600">
                {totalCount} women across history
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowImport(true)}
                className="px-3 py-2 text-xs border-2 border-gray-900 bg-green-200 hover:bg-green-300"
              >
                Import from Wiki
              </button>
              <button
                onClick={() => {
                  setShowForm(true);
                  setEditingId(null);
                  setName('');
                  setBirthYear('');
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
                Add Manually
              </button>
            </div>
          </div>

          {/* Search, Sort & Filter */}
          <div className="mt-4 flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name..."
                className="px-3 py-1 text-sm border-2 border-gray-900 bg-white w-48"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Sort:</span>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="px-2 py-1 text-xs border-2 border-gray-900 bg-white"
              >
                <option value="birth_asc">Birth Year (Oldest First)</option>
                <option value="birth_desc">Birth Year (Newest First)</option>
                <option value="name">Name A-Z</option>
                <option value="recent">Recently Added</option>
                <option value="oldest">Oldest Added</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Filter:</span>
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="px-2 py-1 text-xs border-2 border-gray-900 bg-white max-w-[200px]"
              >
                <option value="all">All tags ({totalCount})</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={fetchRandomWoman}
              disabled={loadingRandom}
              className="px-3 py-1 text-xs border-2 border-gray-900 bg-violet-200 hover:bg-violet-300 disabled:opacity-50"
            >
              {loadingRandom ? 'Loading...' : 'Inspire me'}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* List */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto p-4 bg-gradient-to-br from-sky-50 via-white to-violet-50"
          >
            {loading ? (
              <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
                Loading...
              </div>
            ) : profiles.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
                No women found. Try a different filter or add some!
              </div>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {profiles.map((profile) => (
                    <ProfileCard
                      key={profile.id}
                      profile={profile}
                      onEdit={startEdit}
                      onDelete={handleDelete}
                      onClick={setSelectedProfile}
                    />
                  ))}
                </div>

                {/* Load More */}
                {hasMore && (
                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="px-6 py-2 border-2 border-gray-900 bg-white hover:bg-blue-50 text-sm disabled:opacity-50"
                    >
                      {loadingMore ? 'Loading...' : `Load More (${profiles.length} of ${totalCount})`}
                    </button>
                  </div>
                )}

                {!hasMore && profiles.length > 0 && (
                  <div className="mt-4 text-center text-xs text-gray-500">
                    Showing all {profiles.length} women
                  </div>
                )}
              </>
            )}
          </div>

          {/* Form Sidebar */}
          {showForm && (
            <aside className="w-80 border-l-2 border-gray-900 p-4 bg-white overflow-y-auto">
              <h3 className="text-lg font-semibold">
                {editingId ? 'Edit Woman' : 'Add Woman'}
              </h3>

              <div className="space-y-3 mt-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name"
                  className="w-full px-3 py-2 border-2 border-gray-900 text-sm"
                />
                <input
                  type="number"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  placeholder="Birth Year (e.g. 1867)"
                  min="1"
                  max="2025"
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
                  {availableTags.length > 0 && tagsInput && (
                    <div className="mt-2 border-2 border-gray-900 bg-white max-h-32 overflow-y-auto">
                      {availableTags.slice(0, 10).map((tag) => (
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
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setName('');
                    setBirthYear('');
                    setIntro('');
                    setAccomplishments('');
                    setTags([]);
                    setTagsInput('');
                    setImagePreview(null);
                    setSelectedImage(null);
                    setShowForm(false);
                    setSavingMessage(null);
                  }}
                  className="w-full py-2 border-2 border-gray-900 bg-gray-100 text-sm hover:bg-gray-200"
                >
                  {editingId ? 'Cancel' : 'Close'}
                </button>
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedProfile && (
        <ProfileDetailModal
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
          onEdit={(profile) => {
            setSelectedProfile(null);
            startEdit(profile);
          }}
        />
      )}

      {/* Import Modal */}
      {showImport && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
          onClick={() => {
            setShowImport(false);
            setImportError(null);
            setImportName('');
          }}
        >
          <div
            className="bg-white border-4 border-gray-900 w-full max-w-md p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Import from Wikipedia</h3>
            <p className="text-sm text-gray-600 mb-4">
              Enter a name to fetch their Wikipedia info, image, and auto-generate tags.
            </p>
            <input
              type="text"
              value={importName}
              onChange={(e) => setImportName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleImport();
              }}
              placeholder="e.g., Taylor Swift"
              className="w-full px-3 py-2 border-2 border-gray-900 text-sm mb-2"
              autoFocus
            />
            <p className="text-xs text-gray-500 mb-4">
              Tip: If not found, try &quot;Name:Wikipedia_Title&quot; (e.g., &quot;Grimes:Grimes_(musician)&quot;)
            </p>
            {importError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 mb-4">
                {importError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                disabled={importing || !importName.trim()}
                className="flex-1 py-2 border-2 border-gray-900 bg-green-500 text-white text-sm hover:bg-green-600 disabled:opacity-50"
              >
                {importing ? 'Importing...' : 'Import'}
              </button>
              <button
                onClick={() => {
                  setShowImport(false);
                  setImportError(null);
                  setImportName('');
                }}
                className="px-4 py-2 border-2 border-gray-900 bg-gray-100 text-sm hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileCard({
  profile,
  onEdit,
  onDelete,
  onClick,
}: {
  profile: WomenProfile;
  onEdit: (profile: WomenProfile) => void;
  onDelete: (id: string) => void;
  onClick: (profile: WomenProfile) => void;
}) {
  return (
    <div
      className="group flex gap-3 border-2 border-gray-900 bg-white p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onClick(profile)}
    >
      <div className="w-16 h-16 rounded border border-gray-300 overflow-hidden flex-shrink-0 bg-gray-50">
        {profile.image_url ? (
          <img src={profile.image_url} alt={profile.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl">👩‍🚀</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-sm truncate">{profile.name}</h4>
          {profile.birth_year && (
            <span className="text-[10px] text-gray-500 flex-shrink-0">
              b. {profile.birth_year}
            </span>
          )}
        </div>
        {profile.intro && (
          <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">{profile.intro}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-1">
          {(profile.tags || []).slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 bg-blue-50 border border-blue-200 text-[9px] rounded"
            >
              {tag}
            </span>
          ))}
          {(profile.tags?.length || 0) > 3 && (
            <span className="px-1.5 py-0.5 bg-gray-100 text-[9px] rounded">
              +{(profile.tags?.length || 0) - 3}
            </span>
          )}
        </div>
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(profile);
            }}
            className="px-2 py-0.5 text-[10px] border border-gray-400 text-gray-600 bg-white hover:bg-blue-100 hover:border-gray-900"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(profile.id);
            }}
            className="px-2 py-0.5 text-[10px] border border-gray-400 text-gray-600 bg-white hover:bg-red-100 hover:border-gray-900"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileDetailModal({
  profile,
  onClose,
  onEdit,
}: {
  profile: WomenProfile;
  onClose: () => void;
  onEdit: (profile: WomenProfile) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border-4 border-gray-900 w-full max-w-xl max-h-[80vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with image */}
        <div className="relative overflow-hidden">
          {/* Blurred background */}
          {profile.image_url ? (
            <div
              className="absolute inset-0 bg-cover bg-center blur-xl scale-110 opacity-60"
              style={{ backgroundImage: `url(${profile.image_url})` }}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-violet-200 to-sky-200" />
          )}
          {/* Overlay for better contrast */}
          <div className="absolute inset-0 bg-black/20" />
          {/* Square image */}
          <div className="relative p-8 flex justify-center">
            {profile.image_url ? (
              <img
                src={profile.image_url}
                alt={profile.name}
                className="w-48 h-48 object-cover border-4 border-gray-900"
              />
            ) : (
              <div className="w-48 h-48 bg-gradient-to-br from-violet-100 to-sky-100 flex items-center justify-center border-4 border-gray-900">
                <span className="text-5xl">👩‍🚀</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 border-2 border-gray-900 bg-white hover:bg-red-400 hover:text-white transition-colors flex items-center justify-center z-10"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-2xl font-bold">{profile.name}</h2>
            {profile.birth_year && (
              <span className="text-sm text-gray-500 border border-gray-300 px-2 py-0.5 rounded">
                b. {profile.birth_year}
              </span>
            )}
          </div>

          {/* Tags */}
          {profile.tags && profile.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {profile.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-blue-50 border border-blue-200 text-xs rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Intro */}
          {profile.intro && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">About</h3>
              <p className="text-sm text-gray-700 leading-relaxed">{profile.intro}</p>
            </div>
          )}

          {/* Accomplishments */}
          {profile.accomplishments && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Accomplishments</h3>
              <p className="text-sm text-gray-700 leading-relaxed">{profile.accomplishments}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t border-gray-200">
            <button
              onClick={() => onEdit(profile)}
              className="px-4 py-2 text-sm border-2 border-gray-900 bg-amber-200 hover:bg-amber-300"
            >
              Edit Profile
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border-2 border-gray-900 bg-gray-100 hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
