'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { supabase, type Recipe, type RecipeIngredient, type RecipeVariation } from '@/lib/supabase';
import { convertToWebP } from '@/lib/imageUpload';
import { appStorage } from '@/lib/storage';
import { ActionButton } from './ActionButtons';

type RecipeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  anonId?: string;
  isEditMode: boolean;
  onLogActivity?: (action: string, details: string) => void;
};

type IngredientFormRow = {
  id: string;
  name: string;
  amount: string;
  unit: RecipeIngredient['unit'];
};

type VariationForm = {
  id: string;
  name: string;
  ingredients: IngredientFormRow[];
};

const STORAGE_BUCKET = 'recipe-images';

function createId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createIngredientRow(name = '', amount = '', unit: RecipeIngredient['unit'] = 'g') {
  return { id: createId(), name, amount, unit };
}

function createVariation(name = 'Classic'): VariationForm {
  return {
    id: createId(),
    name,
    ingredients: [createIngredientRow()],
  };
}

function duplicateVariation(variation: VariationForm, name: string): VariationForm {
  return {
    id: createId(),
    name,
    ingredients: variation.ingredients.map((ingredient) => ({
      ...ingredient,
      id: createId(),
    })),
  };
}

function formatAmount(amount: number) {
  if (!Number.isFinite(amount)) return '0';
  const rounded = Math.round(amount * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/0+$/g, '');
}

function getStorageFileName(imageUrl: string) {
  return imageUrl.split('/').pop()?.split('?')[0] || '';
}

function variationToForm(variation: RecipeVariation): VariationForm {
  const ingredients =
    variation.ingredients.length > 0
      ? variation.ingredients.map((ingredient) => ({
          id: ingredient.id || createId(),
          name: ingredient.name,
          amount: String(ingredient.amount),
          unit: ingredient.unit === 'lb' ? 'lb' : ('g' as RecipeIngredient['unit']),
        }))
      : [createIngredientRow()];

  return {
    id: variation.id || createId(),
    name: variation.name || 'Variation',
    ingredients,
  };
}

export default function RecipeModal({
  isOpen,
  onClose,
  anonId,
  isEditMode,
  onLogActivity,
}: RecipeModalProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [variations, setVariations] = useState<VariationForm[]>([createVariation()]);
  const [activeVariationId, setActiveVariationId] = useState(variations[0].id);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const activeVariation = variations.find((variation) => variation.id === activeVariationId) || variations[0];

  const stableLogActivity = useCallback(
    (action: string, details: string) => {
      onLogActivity?.(action, details);
    },
    [onLogActivity]
  );

  const fetchRecipes = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRecipes((data || []) as Recipe[]);
    } catch (error) {
      console.error('Error fetching recipes:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchRecipes();
      stableLogActivity('Opened Recipes', 'Viewed recipe collection');
    }
  }, [fetchRecipes, isOpen, stableLogActivity]);

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be smaller than 10MB.');
      return;
    }

    setSelectedImage(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const webpBlob = await convertToWebP(file, 0.8);
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.webp`;
      const { data, error } = await appStorage.from(STORAGE_BUCKET).upload(fileName, webpBlob, {
        contentType: 'image/webp',
        cacheControl: '3600',
        upsert: false,
      });

      if (error) throw error;
      return data?.publicUrl || null;
    } catch (error) {
      console.error('Error uploading recipe image:', error);
      return null;
    }
  };

  const buildVariationPayload = (): RecipeVariation[] =>
    variations
      .map((variation) => {
        const ingredients: RecipeIngredient[] = variation.ingredients
          .map((ingredient) => ({
            id: ingredient.id,
            name: ingredient.name.trim(),
            amount: Number(ingredient.amount),
            unit: ingredient.unit,
          }))
          .filter(
            (ingredient) =>
              ingredient.name && Number.isFinite(ingredient.amount) && ingredient.amount > 0
          );

        return {
          id: variation.id,
          name: variation.name.trim(),
          ingredients,
        };
      })
      .filter((variation) => variation.name && variation.ingredients.length > 0);

  const resetForm = () => {
    const nextVariation = createVariation();
    setEditingId(null);
    setName('');
    setVariations([nextVariation]);
    setActiveVariationId(nextVariation.id);
    setSelectedImage(null);
    setImagePreview(null);
    setExistingImageUrl(null);
    setOriginalImageUrl(null);
    setShowEditForm(false);
  };

  const validateForm = () => {
    if (!name.trim()) {
      alert('Please enter a recipe name.');
      return false;
    }

    const payload = buildVariationPayload();
    if (payload.length === 0) {
      alert('Please add at least one variation with ingredients.');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      setUploading(true);

      let imageUrl: string | null = null;
      if (selectedImage) {
        imageUrl = await uploadImage(selectedImage);
        if (!imageUrl) {
          alert('Failed to upload image. Please try again.');
          return;
        }
      }

      const { data, error } = await supabase
        .from('recipes')
        .insert({
          anon_id: anonId || null,
          name: name.trim(),
          variations: buildVariationPayload(),
          image_url: imageUrl,
        })
        .select()
        .single();

      if (error) throw error;

      setRecipes([data as Recipe, ...recipes]);
      stableLogActivity('Added Recipe', `Added "${name.trim()}"`);
      resetForm();
      alert('Recipe added successfully!');
    } catch (error) {
      console.error('Error adding recipe:', error);
      alert('Failed to add recipe. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const startEdit = (recipe: Recipe) => {
    const nextVariations =
      recipe.variations.length > 0 ? recipe.variations.map(variationToForm) : [createVariation()];
    setEditingId(recipe.id);
    setName(recipe.name);
    setVariations(nextVariations);
    setActiveVariationId(nextVariations[0].id);
    setExistingImageUrl(recipe.image_url);
    setOriginalImageUrl(recipe.image_url);
    setSelectedImage(null);
    setImagePreview(null);
    setShowEditForm(true);
  };

  const handleUpdate = async () => {
    if (!editingId || !validateForm()) return;

    try {
      setUploading(true);

      let imageUrl: string | null = existingImageUrl;
      if (selectedImage) {
        imageUrl = await uploadImage(selectedImage);
        if (!imageUrl) {
          alert('Failed to upload image. Please try again.');
          return;
        }
      }

      if (originalImageUrl && originalImageUrl !== imageUrl) {
        const oldFileName = getStorageFileName(originalImageUrl);
        if (oldFileName) {
          await appStorage.from(STORAGE_BUCKET).remove([oldFileName]);
        }
      }

      const { data, error } = await supabase
        .from('recipes')
        .update({
          name: name.trim(),
          variations: buildVariationPayload(),
          image_url: imageUrl,
        })
        .eq('id', editingId)
        .select()
        .single();

      if (error) throw error;

      setRecipes(recipes.map((recipe) => (recipe.id === editingId ? (data as Recipe) : recipe)));
      stableLogActivity('Updated Recipe', `Updated "${name.trim()}"`);
      resetForm();
      alert('Recipe updated successfully!');
    } catch (error) {
      console.error('Error updating recipe:', error);
      alert('Failed to update recipe. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (recipe: Recipe) => {
    if (!confirm(`Delete "${recipe.name}"?`)) return;

    try {
      const { error } = await supabase.from('recipes').delete().eq('id', recipe.id);
      if (error) throw error;

      if (recipe.image_url) {
        const fileName = getStorageFileName(recipe.image_url);
        if (fileName) {
          await appStorage.from(STORAGE_BUCKET).remove([fileName]);
        }
      }

      setRecipes(recipes.filter((item) => item.id !== recipe.id));
      stableLogActivity('Deleted Recipe', `Deleted "${recipe.name}"`);
    } catch (error) {
      console.error('Error deleting recipe:', error);
      alert('Failed to delete recipe. Please try again.');
    }
  };

  const updateVariation = (id: string, update: Partial<VariationForm>) => {
    setVariations((current) =>
      current.map((variation) => (variation.id === id ? { ...variation, ...update } : variation))
    );
  };

  const updateIngredient = (
    variationId: string,
    id: string,
    update: Partial<IngredientFormRow>
  ) => {
    setVariations((current) =>
      current.map((variation) =>
        variation.id === variationId
          ? {
              ...variation,
              ingredients: variation.ingredients.map((ingredient) =>
                ingredient.id === id ? { ...ingredient, ...update } : ingredient
              ),
            }
          : variation
      )
    );
  };

  const removeVariation = (id: string) => {
    setVariations((current) => {
      if (current.length === 1) return current;
      const next = current.filter((variation) => variation.id !== id);
      if (activeVariationId === id) setActiveVariationId(next[0].id);
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 backdrop-blur-sm z-40" onClick={onClose} />

      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div
          className="bg-white w-full max-w-6xl h-[90vh] flex flex-col"
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
              <span className="text-3xl">🍳</span>
              <h2 className="text-2xl font-bold text-gray-900">RECIPES</h2>
            </div>
            <button onClick={onClose} className="text-2xl hover:text-red-500 font-bold">
              ×
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {isEditMode && (
              <div className="mb-6">
                {!showEditForm ? (
                  <button
                    onClick={() => setShowEditForm(true)}
                    className="px-4 py-2 bg-black text-white hover:bg-orange-500 transition-colors cursor-pointer"
                  >
                    + New Recipe
                  </button>
                ) : (
                  <div className="border-2 border-black p-4">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <h3 className="text-lg font-bold">
                        {editingId ? 'EDIT RECIPE' : 'ADD NEW RECIPE'}
                      </h3>
                      <button
                        onClick={resetForm}
                        className="text-sm text-gray-500 hover:text-red-500"
                        disabled={uploading}
                      >
                        ✕ CANCEL
                      </button>
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-bold mb-2">NAME *</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Recipe name..."
                        className="w-full px-3 py-2 border-2 border-gray-900 focus:outline-none focus:border-orange-500"
                        disabled={uploading}
                      />
                    </div>

                    <div className="mb-4">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        {variations.map((variation) => (
                          <button
                            key={variation.id}
                            onClick={() => setActiveVariationId(variation.id)}
                            className={`px-3 py-2 border-2 border-gray-900 text-sm font-bold ${
                              activeVariationId === variation.id
                                ? 'bg-orange-500 text-white'
                                : 'bg-white hover:bg-orange-50'
                            }`}
                            disabled={uploading}
                          >
                            {variation.name.trim() || 'Variation'}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            const defaultVariation = variations[0] || activeVariation;
                            const nextVariation = duplicateVariation(
                              defaultVariation,
                              `Variation ${variations.length + 1}`
                            );
                            setVariations((current) => [...current, nextVariation]);
                            setActiveVariationId(nextVariation.id);
                          }}
                          className="px-3 py-2 border-2 border-gray-900 text-sm font-bold hover:bg-orange-100"
                          disabled={uploading}
                        >
                          + Variation
                        </button>
                      </div>

                      <div className="border-2 border-gray-900 p-4 bg-orange-50">
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 mb-4 max-sm:grid-cols-1">
                          <div>
                            <label className="block text-xs font-bold mb-1">VARIATION</label>
                            <input
                              type="text"
                              value={activeVariation.name}
                              onChange={(event) =>
                                updateVariation(activeVariation.id, { name: event.target.value })
                              }
                              className="w-full px-3 py-2 border-2 border-gray-900 bg-white focus:outline-none focus:border-orange-500"
                              disabled={uploading}
                            />
                          </div>
                          <div className="flex items-end">
                            <button
                              onClick={() => removeVariation(activeVariation.id)}
                              className="px-3 py-2 border-2 border-gray-900 text-sm font-bold hover:bg-red-500 hover:text-white disabled:opacity-40"
                              disabled={uploading || variations.length === 1}
                            >
                              DELETE
                            </button>
                          </div>
                        </div>

                        <IngredientRows
                          rows={activeVariation.ingredients}
                          disabled={uploading}
                          onAdd={() =>
                            updateVariation(activeVariation.id, {
                              ingredients: [
                                ...activeVariation.ingredients,
                                createIngredientRow(),
                              ],
                            })
                          }
                          onChange={(id, update) =>
                            updateIngredient(activeVariation.id, id, update)
                          }
                          onReorder={(fromId, toId, placement) => {
                            const fromIndex = activeVariation.ingredients.findIndex(
                              (row) => row.id === fromId
                            );
                            const targetIndex = activeVariation.ingredients.findIndex(
                              (row) => row.id === toId
                            );
                            if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) {
                              return;
                            }

                            const nextIngredients = [...activeVariation.ingredients];
                            const [movedIngredient] = nextIngredients.splice(fromIndex, 1);
                            let insertIndex = placement === 'after' ? targetIndex + 1 : targetIndex;
                            if (fromIndex < insertIndex) {
                              insertIndex -= 1;
                            }
                            nextIngredients.splice(insertIndex, 0, movedIngredient);
                            updateVariation(activeVariation.id, {
                              ingredients: nextIngredients,
                            });
                          }}
                          onRemove={(id) => {
                            const nextIngredients =
                              activeVariation.ingredients.length === 1
                                ? [createIngredientRow()]
                                : activeVariation.ingredients.filter((row) => row.id !== id);
                            updateVariation(activeVariation.id, {
                              ingredients: nextIngredients,
                            });
                          }}
                        />
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-bold mb-2">IMAGE (OPTIONAL)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageSelect}
                        className="hidden"
                        id="recipe-image-upload"
                        disabled={uploading}
                      />
                      <label
                        htmlFor="recipe-image-upload"
                        className="inline-block px-4 py-2 bg-white border-2 border-gray-900 hover:bg-orange-50 cursor-pointer"
                      >
                        📷 CHOOSE IMAGE
                      </label>
                      {(imagePreview || existingImageUrl) && (
                        <div className="mt-4">
                          <div className="relative w-64 h-64 border-4 border-gray-900 bg-gray-50">
                            <Image
                              src={imagePreview || existingImageUrl || ''}
                              alt="Recipe preview"
                              fill
                              sizes="256px"
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                          <button
                            onClick={() => {
                              setSelectedImage(null);
                              setImagePreview(null);
                              setExistingImageUrl(null);
                            }}
                            className="mt-2 text-sm text-red-500 hover:underline"
                            disabled={uploading}
                          >
                            Remove image
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={editingId ? handleUpdate : handleSubmit}
                      disabled={uploading}
                      className="w-full px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {uploading ? 'UPLOADING...' : editingId ? 'UPDATE RECIPE' : 'ADD RECIPE'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : recipes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No recipes yet. {isEditMode && 'Add your first recipe above!'}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {recipes.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    isEditMode={isEditMode}
                    onEdit={() => startEdit(recipe)}
                    onDelete={() => handleDelete(recipe)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function IngredientRows({
  rows,
  disabled,
  onAdd,
  onChange,
  onReorder,
  onRemove,
}: {
  rows: IngredientFormRow[];
  disabled: boolean;
  onAdd: () => void;
  onChange: (id: string, update: Partial<IngredientFormRow>) => void;
  onReorder: (fromId: string, toId: string, placement: 'before' | 'after') => void;
  onRemove: (id: string) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{
    id: string;
    placement: 'before' | 'after';
  } | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <h4 className="text-sm font-bold">INGREDIENTS</h4>
        <button
          onClick={onAdd}
          className="px-2 py-1 border-2 border-gray-900 text-xs font-bold bg-white hover:bg-orange-100"
          disabled={disabled}
        >
          + ROW
        </button>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            onDragOver={(event) => {
              if (disabled || !draggedId || draggedId === row.id) return;
              event.preventDefault();
              const bounds = event.currentTarget.getBoundingClientRect();
              const placement = event.clientY - bounds.top > bounds.height / 2 ? 'after' : 'before';
              setDragOver({ id: row.id, placement });
            }}
            onDragLeave={() => {
              if (dragOver?.id === row.id) setDragOver(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedId && dragOver) {
                onReorder(draggedId, dragOver.id, dragOver.placement);
              }
              setDraggedId(null);
              setDragOver(null);
            }}
            className={`grid grid-cols-[2.5rem_minmax(0,1fr)_6rem_5rem_2rem] gap-2 max-sm:grid-cols-[2.5rem_minmax(0,1fr)_5rem_4rem_2rem] ${
              dragOver?.id === row.id && dragOver.placement === 'before'
                ? 'border-t-4 border-orange-500 pt-1'
                : ''
            } ${
              dragOver?.id === row.id && dragOver.placement === 'after'
                ? 'border-b-4 border-orange-500 pb-1'
                : ''
            } ${draggedId === row.id ? 'opacity-40' : ''}`}
          >
            <div
              role="button"
              tabIndex={disabled ? -1 : 0}
              draggable={!disabled}
              onDragStart={(event) => {
                setDraggedId(row.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', row.id);
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setDragOver(null);
              }}
              className="h-full min-h-12 border-2 border-gray-900 bg-white flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-orange-100"
              aria-label={`Drag ${row.name || 'ingredient'} to reorder`}
            >
              <span className="grid grid-cols-2 gap-1" aria-hidden="true">
                {Array.from({ length: 6 }).map((_, dotIndex) => (
                  <span key={dotIndex} className="w-1 h-1 bg-gray-900 rounded-full" />
                ))}
              </span>
            </div>
            <input
              type="text"
              value={row.name}
              onChange={(event) => onChange(row.id, { name: event.target.value })}
              placeholder="Ingredient"
              className="min-w-0 px-3 py-2 border-2 border-gray-900 bg-white focus:outline-none focus:border-orange-500"
              disabled={disabled}
            />
            <input
              type="number"
              min="0"
              step="0.1"
              value={row.amount}
              onChange={(event) => onChange(row.id, { amount: event.target.value })}
              placeholder="0"
              className="min-w-0 px-3 py-2 border-2 border-gray-900 bg-white focus:outline-none focus:border-orange-500"
              disabled={disabled}
            />
            <select
              value={row.unit}
              onChange={(event) =>
                onChange(row.id, { unit: event.target.value as RecipeIngredient['unit'] })
              }
              className="min-w-0 px-2 py-2 border-2 border-gray-900 bg-white focus:outline-none focus:border-orange-500"
              disabled={disabled}
            >
              <option value="g">g</option>
              <option value="lb">lb</option>
            </select>
            <button
              onClick={() => onRemove(row.id)}
              className="border-2 border-gray-900 bg-white hover:bg-red-500 hover:text-white font-bold"
              disabled={disabled}
              aria-label="Remove row"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecipeCard({
  recipe,
  isEditMode,
  onEdit,
  onDelete,
}: {
  recipe: Recipe;
  isEditMode: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [activeVariationId, setActiveVariationId] = useState(recipe.variations[0]?.id || '');
  const activeVariation =
    recipe.variations.find((variation) => variation.id === activeVariationId) || recipe.variations[0];
  const [anchorIngredientId, setAnchorIngredientId] = useState(
    activeVariation?.ingredients[0]?.id || ''
  );
  const [scalingIngredientId, setScalingIngredientId] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState(1);

  useEffect(() => {
    const nextVariation = recipe.variations[0];
    setActiveVariationId(nextVariation?.id || '');
    setAnchorIngredientId(nextVariation?.ingredients[0]?.id || '');
    setScalingIngredientId(null);
    setMultiplier(1);
  }, [recipe.id, recipe.variations]);

  if (!activeVariation) return null;

  const anchorIngredient =
    activeVariation.ingredients.find((ingredient) => ingredient.id === anchorIngredientId) ||
    activeVariation.ingredients[0];

  const setScaledAmountFromIngredient = (ingredient: RecipeIngredient, amount: number) => {
    if (Number.isFinite(amount) && ingredient.amount > 0) {
      setAnchorIngredientId(ingredient.id);
      setScalingIngredientId(ingredient.id);
      setMultiplier(amount / ingredient.amount);
    }
  };

  const setMultiplierFromIngredient = (ingredient: RecipeIngredient, nextMultiplier: number) => {
    setAnchorIngredientId(ingredient.id);
    setScalingIngredientId(ingredient.id);
    setMultiplier(nextMultiplier);
  };

  return (
    <div className="border-4 border-gray-900 p-4 bg-white flex gap-4 max-md:flex-col">
      {recipe.image_url ? (
        <div className="flex-shrink-0 relative w-44 h-44 border-2 border-gray-900 bg-gray-50 max-md:w-full max-md:h-56">
          <Image
            src={recipe.image_url}
            alt={recipe.name}
            fill
            sizes="(max-width: 768px) 100vw, 176px"
            className="object-cover"
            unoptimized
          />
        </div>
      ) : (
        <div className="flex-shrink-0 w-44 h-44 border-2 border-gray-900 bg-orange-50 grid place-items-center text-4xl max-md:w-full max-md:h-32">
          🍽️
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h4 className="font-bold text-xl break-words">{recipe.name}</h4>
          {isEditMode && (
            <div className="flex gap-1 flex-shrink-0">
              <ActionButton
                variant="edit"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit();
                }}
              />
              <ActionButton
                variant="delete"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {recipe.variations.map((variation) => (
            <button
              key={variation.id}
              onClick={() => {
                setActiveVariationId(variation.id);
                setAnchorIngredientId(variation.ingredients[0]?.id || '');
                setScalingIngredientId(null);
                setMultiplier(1);
              }}
              className={`px-3 py-1.5 border-2 border-gray-900 text-sm font-bold ${
                variation.id === activeVariation.id
                  ? 'bg-orange-500 text-white'
                  : 'bg-white hover:bg-orange-50'
              }`}
            >
              {variation.name}
            </button>
          ))}
        </div>

        <div className="border-2 border-gray-900 p-3">
          <h5 className="text-sm font-bold mb-2">INGREDIENTS</h5>
          <div className="space-y-2">
            {activeVariation.ingredients.map((ingredient) => {
              const scaledAmount = ingredient.amount * multiplier;
              const isScaling = scalingIngredientId === ingredient.id || anchorIngredient?.id === ingredient.id;
              const shouldFade = Boolean(scalingIngredientId) && scalingIngredientId !== ingredient.id;

              return (
                <div
                  key={ingredient.id}
                  className={`grid grid-cols-[16rem_minmax(18rem,1fr)_8.5rem_4.5rem] gap-5 border-b border-gray-200 py-2 text-sm items-center transition-opacity max-lg:grid-cols-[12rem_minmax(12rem,1fr)_7.5rem_4rem] max-sm:grid-cols-1 ${
                    shouldFade ? 'opacity-35' : 'opacity-100'
                  }`}
                >
                <span className="break-words min-w-0">{ingredient.name}</span>
                <input
                  type="range"
                  min="0.25"
                  max="3"
                  step="0.05"
                  value={isScaling ? multiplier : 1}
                  onFocus={() => setScalingIngredientId(ingredient.id)}
                  onBlur={() => setScalingIngredientId(null)}
                  onPointerDown={() => setScalingIngredientId(ingredient.id)}
                  onPointerUp={() => setScalingIngredientId(null)}
                  onChange={(event) =>
                    setMultiplierFromIngredient(ingredient, Number(event.target.value))
                  }
                  className="w-full min-w-0 accent-orange-500"
                  aria-label={`Scale ${ingredient.name}`}
                />
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={formatAmount(scaledAmount)}
                  onFocus={() => setScalingIngredientId(ingredient.id)}
                  onBlur={() => setScalingIngredientId(null)}
                  onChange={(event) =>
                    setScaledAmountFromIngredient(ingredient, Number(event.target.value))
                  }
                  className="w-full min-w-0 px-3 py-2 border-2 border-gray-900 focus:outline-none focus:border-orange-500"
                  aria-label={`Target amount for ${ingredient.name}`}
                />
                <span className="font-bold whitespace-nowrap text-right">
                  {formatAmount(scaledAmount)} {ingredient.unit}
                </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
