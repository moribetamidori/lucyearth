'use client';

import { useState, useEffect, useRef } from 'react';
import { ArenaCollection, ArenaBlock } from '@/lib/supabase';
import {
  fetchCollections,
  fetchBlocksForCollection,
  createCollection,
  deleteCollection,
  uploadBlockToCollection,
  deleteBlock,
} from '@/lib/arenaUtils';

interface ArenaModalProps {
  isOpen: boolean;
  onClose: () => void;
  isEditMode: boolean;
  anonId: string;
  onLogActivity: (action: string, details: string) => void;
}

type View = 'collections' | 'blocks';

export default function ArenaModal({
  isOpen,
  onClose,
  isEditMode,
  anonId,
  onLogActivity,
}: ArenaModalProps) {
  const [view, setView] = useState<View>('collections');
  const [collections, setCollections] = useState<
    Array<ArenaCollection & { block_count: number }>
  >([]);
  const [currentCollection, setCurrentCollection] =
    useState<ArenaCollection | null>(null);
  const [blocks, setBlocks] = useState<ArenaBlock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [newCollectionTitle, setNewCollectionTitle] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load collections on mount
  useEffect(() => {
    if (isOpen) {
      loadCollections();
    }
  }, [isOpen]);

  const loadCollections = async () => {
    setIsLoading(true);
    const data = await fetchCollections();
    setCollections(data);
    setIsLoading(false);
  };

  const loadBlocks = async (collectionId: string) => {
    setIsLoading(true);
    const data = await fetchBlocksForCollection(collectionId);
    setBlocks(data);
    setIsLoading(false);
  };

  const handleCreateCollection = async () => {
    if (!newCollectionTitle.trim()) return;

    const collection = await createCollection(newCollectionTitle, anonId);
    if (collection) {
      onLogActivity('Created Arena collection', `Title: ${newCollectionTitle}`);
      setNewCollectionTitle('');
      setShowCreateForm(false);
      await loadCollections();
    }
  };

  const handleDeleteCollection = async (collectionId: string, title: string) => {
    if (!confirm(`Delete collection "${title}"?`)) return;

    const success = await deleteCollection(collectionId);
    if (success) {
      onLogActivity('Deleted Arena collection', `Title: ${title}`);
      await loadCollections();
    }
  };

  const handleOpenCollection = (collection: ArenaCollection & { block_count: number }) => {
    setCurrentCollection(collection);
    setView('blocks');
    loadBlocks(collection.id);
    onLogActivity('Opened Arena collection', `Title: ${collection.title}`);
  };

  const handleBackToCollections = () => {
    setView('collections');
    setCurrentCollection(null);
    setBlocks([]);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !currentCollection) return;

    const fileArray = Array.from(files);

    // Validate files
    for (const file of fileArray) {
      if (!file.type.startsWith('image/')) {
        alert(`"${file.name}" is not an image file.`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert(`"${file.name}" is larger than 10MB.`);
        return;
      }
    }

    setIsUploading(true);
    try {
      for (const file of fileArray) {
        await uploadBlockToCollection(file, currentCollection.id, anonId);
      }
      onLogActivity(
        'Uploaded blocks to Arena collection',
        `Collection: ${currentCollection.title}, Images: ${fileArray.length}`
      );
      await loadBlocks(currentCollection.id);
    } catch (error) {
      alert('Failed to upload one or more images.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteBlock = async (block: ArenaBlock) => {
    if (!confirm('Delete this block?')) return;

    const success = await deleteBlock(block.id, block.image_url);
    if (success && currentCollection) {
      onLogActivity('Deleted Arena block', `Collection: ${currentCollection.title}`);
      await loadBlocks(currentCollection.id);
      await loadCollections(); // Update block count
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffMonths > 0) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffMins > 0) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    return 'just now';
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      <div className="fixed inset-4 sm:inset-8 md:inset-16 bg-white z-50 flex flex-col border-4 border-black shadow-[8px_8px_0_0_#000]">
        {/* Header with breadcrumb */}
        <div className="border-b-4 border-black p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-bold">
            <button
              onClick={view === 'collections' ? onClose : handleBackToCollections}
              className="hover:text-blue-500 cursor-pointer"
            >
              Are.na
            </button>
            {view === 'blocks' && currentCollection && (
              <>
                <span>/</span>
                <span>{currentCollection.title}</span>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-2xl hover:text-red-500 font-bold"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {view === 'collections' && (
            <div>
              {/* Create new collection button */}
              {isEditMode && (
                <div className="mb-6">
                  {!showCreateForm ? (
                    <button
                      onClick={() => setShowCreateForm(true)}
                      className="px-4 py-2 bg-black text-white hover:bg-blue-500 transition-colors cursor-pointer"
                    >
                      + New Collection
                    </button>
                  ) : (
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={newCollectionTitle}
                        onChange={(e) => setNewCollectionTitle(e.target.value)}
                        placeholder="Collection title"
                        className="flex-1 px-3 py-2 border-2 border-black focus:outline-none focus:border-blue-500"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateCollection();
                          if (e.key === 'Escape') {
                            setShowCreateForm(false);
                            setNewCollectionTitle('');
                          }
                        }}
                      />
                      <button
                        onClick={handleCreateCollection}
                        className="px-4 py-2 bg-black text-white hover:bg-green-500"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => {
                          setShowCreateForm(false);
                          setNewCollectionTitle('');
                        }}
                        className="px-4 py-2 border-2 border-black hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Collections list */}
              {isLoading ? (
                <div className="text-center py-8">Loading collections...</div>
              ) : collections.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No collections yet.
                  {isEditMode && ' Create your first one!'}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  {collections.map((collection) => (
                    <div
                      key={collection.id}
                      className="relative aspect-square border-2 border-black p-2 hover:bg-gray-50 cursor-pointer group flex flex-col items-center justify-center text-center"
                      onClick={() => handleOpenCollection(collection)}
                    >
                      <div className="flex-1 flex flex-col items-center justify-center">
                        <h3 className="font-bold text-sm group-hover:text-blue-500 break-words line-clamp-2">
                          {collection.title}
                        </h3>
                        <div className="text-xs text-gray-600 mt-1">
                          {collection.block_count} block
                          {collection.block_count !== 1 ? 's' : ''}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {formatTimeAgo(collection.updated_at)}
                        </div>
                      </div>
                      {isEditMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCollection(collection.id, collection.title);
                          }}
                          className="absolute top-1 right-1 bg-red-500 text-white px-1.5 py-0.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Del
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'blocks' && currentCollection && (
            <div>
              {/* Upload button */}
              {isEditMode && (
                <div className="mb-6">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.heic,.heif"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-4 py-2 bg-black text-white hover:bg-blue-500 disabled:bg-gray-400 transition-colors"
                  >
                    {isUploading ? 'Uploading...' : '+ Add Images'}
                  </button>
                </div>
              )}

              {/* Blocks grid */}
              {isLoading ? (
                <div className="text-center py-8">Loading blocks...</div>
              ) : blocks.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No blocks yet.
                  {isEditMode && ' Add some images!'}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  {blocks.map((block) => (
                    <div
                      key={block.id}
                      className="relative aspect-square border-2 border-black group"
                    >
                      <img
                        src={block.image_url}
                        alt="Block"
                        className="w-full h-full object-cover cursor-pointer hover:opacity-90"
                        onClick={() => {
                          setSelectedImage(block.image_url);
                          onLogActivity(
                            'Viewed Arena block',
                            `Collection: ${currentCollection.title}, Block ID: ${block.id}`
                          );
                        }}
                      />
                      {isEditMode && (
                        <button
                          onClick={() => handleDeleteBlock(block)}
                          className="absolute top-1 right-1 bg-red-500 text-white px-1.5 py-0.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Del
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Image lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 backdrop-blur-md bg-white/80 z-[60] flex items-center justify-center p-8"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-full max-h-full">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-12 right-0 text-gray-900 text-4xl hover:text-blue-500 transition-colors"
            >
              ×
            </button>
            <img
              src={selectedImage}
              alt="Full size"
              className="max-w-full max-h-[calc(90vh-8rem)] object-contain border-4 border-black"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  );
}
