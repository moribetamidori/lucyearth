'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import {
  supabase,
  type KanbanCard,
  type KanbanColor,
  type KanbanProject,
  type KanbanStatus,
} from '@/lib/supabase';

type KanbanBoardModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isEditMode: boolean;
  onLogActivity?: (action: string, details: string) => void | Promise<void>;
};

type ProjectWithCount = KanbanProject & { card_count: number };

const STATUSES: Array<{ id: KanbanStatus; label: string; accent: string }> = [
  { id: 'todo', label: 'TODO', accent: 'bg-amber-300' },
  { id: 'in_progress', label: 'IN PROGRESS', accent: 'bg-sky-300' },
  { id: 'done', label: 'DONE', accent: 'bg-emerald-300' },
  { id: 'later', label: 'LATER', accent: 'bg-violet-300' },
];

const COLORS: Array<{ id: KanbanColor; label: string; className: string }> = [
  { id: 'yellow', label: 'Yellow', className: 'bg-yellow-200' },
  { id: 'pink', label: 'Pink', className: 'bg-pink-200' },
  { id: 'blue', label: 'Blue', className: 'bg-blue-200' },
  { id: 'green', label: 'Green', className: 'bg-green-200' },
];

const STATUS_LABELS = Object.fromEntries(
  STATUSES.map((status) => [status.id, status.label])
) as Record<KanbanStatus, string>;

const CARD_COLORS = Object.fromEntries(
  COLORS.map((color) => [color.id, color.className])
) as Record<KanbanColor, string>;

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String(error.message);
  }
  return 'Something went wrong. Please try again.';
}

function formatUpdatedAt(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestamp));
}

function getLineItems(notes: string | null) {
  return (notes || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function KanbanBoardModal({
  isOpen,
  onClose,
  isEditMode,
  onLogActivity,
}: KanbanBoardModalProps) {
  const [projects, setProjects] = useState<ProjectWithCount[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectWithCount | null>(null);
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);
  const [saving, setSaving] = useState(false);
  const [movingCardId, setMovingCardId] = useState<string | null>(null);
  const [togglingLineItem, setTogglingLineItem] = useState<string | null>(null);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectWithCount | null>(null);
  const [projectTitle, setProjectTitle] = useState('');

  const [showCardForm, setShowCardForm] = useState(false);
  const [editingCard, setEditingCard] = useState<KanbanCard | null>(null);
  const [cardTitle, setCardTitle] = useState('');
  const [cardNotes, setCardNotes] = useState('');
  const [cardColor, setCardColor] = useState<KanbanColor>('yellow');

  const logActivity = useCallback(
    (action: string, details: string) => {
      void Promise.resolve(onLogActivity?.(action, details)).catch((logError) => {
        console.warn('Could not record Kanban activity:', logError);
      });
    },
    [onLogActivity]
  );

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('kanban_projects')
        .select('*, kanban_cards(count)')
        .order('updated_at', { ascending: false });

      if (fetchError) throw fetchError;

      const rows = (data || []) as Array<
        KanbanProject & { kanban_cards?: Array<{ count: number }> }
      >;
      const nextProjects = rows.map(({ kanban_cards: cardCounts, ...project }) => ({
          ...project,
          card_count: cardCounts?.[0]?.count || 0,
        }));
      setProjects(nextProjects);
      setCurrentProject((current) =>
        current ? nextProjects.find((project) => project.id === current.id) || current : current
      );
    } catch (fetchError) {
      console.error('Could not load Kanban projects:', fetchError);
      setError(`Could not load projects: ${errorMessage(fetchError)}`);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const fetchCards = useCallback(async (projectId: string) => {
    setLoadingCards(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('kanban_cards')
        .select('*')
        .eq('project_id', projectId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      setCards((data || []) as KanbanCard[]);
    } catch (fetchError) {
      console.error('Could not load Kanban cards:', fetchError);
      setError(`Could not load this board: ${errorMessage(fetchError)}`);
    } finally {
      setLoadingCards(false);
    }
  }, []);

  const resetProjectForm = useCallback(() => {
    setShowProjectForm(false);
    setEditingProject(null);
    setProjectTitle('');
  }, []);

  const resetCardForm = useCallback(() => {
    setShowCardForm(false);
    setEditingCard(null);
    setCardTitle('');
    setCardNotes('');
    setCardColor('yellow');
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setCurrentProject(null);
    setCards([]);
    setError('');
    resetProjectForm();
    resetCardForm();
    void fetchProjects();
  }, [fetchProjects, isOpen, resetCardForm, resetProjectForm]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const cardsByStatus = useMemo(() => {
    const grouped: Record<KanbanStatus, KanbanCard[]> = {
      todo: [],
      in_progress: [],
      done: [],
      later: [],
    };
    cards.forEach((card) => grouped[card.status].push(card));
    Object.values(grouped).forEach((column) =>
      column.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
    );
    return grouped;
  }, [cards]);

  const openProject = (project: ProjectWithCount) => {
    setCurrentProject(project);
    setCards([]);
    setError('');
    resetProjectForm();
    resetCardForm();
    void fetchCards(project.id);
    logActivity('Opened Kanban project', `Viewed “${project.title}”`);
  };

  const backToProjects = () => {
    setCurrentProject(null);
    setCards([]);
    setError('');
    resetCardForm();
    void fetchProjects();
  };

  const startCreateProject = () => {
    setEditingProject(null);
    setProjectTitle('');
    setShowProjectForm(true);
    setError('');
  };

  const startEditProject = (project: ProjectWithCount) => {
    setEditingProject(project);
    setProjectTitle(project.title);
    setShowProjectForm(true);
    setError('');
  };

  const saveProject = async (event: FormEvent) => {
    event.preventDefault();
    const title = projectTitle.trim();
    if (!title) {
      setError('Project title is required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (editingProject) {
        const { data, error: updateError } = await supabase
          .from('kanban_projects')
          .update({ title })
          .eq('id', editingProject.id)
          .select()
          .single();
        if (updateError) throw updateError;

        const updated = { ...(data as KanbanProject), card_count: editingProject.card_count };
        setProjects((current) =>
          current.map((project) => (project.id === updated.id ? updated : project))
        );
        if (currentProject?.id === updated.id) setCurrentProject(updated);
        logActivity(
          'Updated Kanban project',
          `Renamed “${editingProject.title}” to “${title}”`
        );
      } else {
        const { data, error: insertError } = await supabase
          .from('kanban_projects')
          .insert({ title })
          .select()
          .single();
        if (insertError) throw insertError;

        setProjects((current) => [
          { ...(data as KanbanProject), card_count: 0 },
          ...current,
        ]);
        logActivity('Created Kanban project', `Created “${title}”`);
      }
      resetProjectForm();
    } catch (saveError) {
      console.error('Could not save Kanban project:', saveError);
      setError(`Could not save the project: ${errorMessage(saveError)}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = async (project: ProjectWithCount) => {
    if (!window.confirm(`Delete “${project.title}” and all ${project.card_count} cards?`)) return;

    setSaving(true);
    setError('');
    try {
      const { error: deleteError } = await supabase
        .from('kanban_projects')
        .delete()
        .eq('id', project.id);
      if (deleteError) throw deleteError;

      setProjects((current) => current.filter((item) => item.id !== project.id));
      if (currentProject?.id === project.id) {
        setCurrentProject(null);
        setCards([]);
      }
      logActivity(
        'Deleted Kanban project',
        `Deleted “${project.title}” with ${project.card_count} card${project.card_count === 1 ? '' : 's'}`
      );
    } catch (deleteError) {
      console.error('Could not delete Kanban project:', deleteError);
      setError(`Could not delete the project: ${errorMessage(deleteError)}`);
    } finally {
      setSaving(false);
    }
  };

  const startCreateCard = () => {
    setEditingCard(null);
    setCardTitle('');
    setCardNotes('');
    setCardColor('yellow');
    setShowCardForm(true);
    setError('');
  };

  const startEditCard = (card: KanbanCard) => {
    setEditingCard(card);
    setCardTitle(card.title);
    setCardNotes(card.notes || '');
    setCardColor(card.color);
    setShowCardForm(true);
    setError('');
  };

  const saveCard = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentProject) return;

    const title = cardTitle.trim();
    if (!title) {
      setError('Card title is required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (editingCard) {
        const notes = cardNotes.trim() || null;
        const lineItemCount = getLineItems(notes).length;
        const completedLineItems = (editingCard.completed_line_items || []).filter(
          (itemIndex) => itemIndex < lineItemCount
        );
        const { error: updateError } = await supabase
          .from('kanban_cards')
          .update({
            title,
            notes,
            completed_line_items: completedLineItems,
            color: cardColor,
          })
          .eq('id', editingCard.id);
        if (updateError) throw updateError;
        logActivity(
          'Updated Kanban card',
          `Updated “${title}” in “${currentProject.title}”`
        );
      } else {
        const nextPosition =
          Math.max(-1, ...cardsByStatus.todo.map((card) => card.position)) + 1;
        const { error: insertError } = await supabase.from('kanban_cards').insert({
          project_id: currentProject.id,
          title,
          notes: cardNotes.trim() || null,
          completed_line_items: [],
          color: cardColor,
          status: 'todo',
          position: nextPosition,
        });
        if (insertError) throw insertError;
        logActivity(
          'Created Kanban card',
          `Added “${title}” to TODO in “${currentProject.title}”`
        );
      }

      resetCardForm();
      await Promise.all([fetchCards(currentProject.id), fetchProjects()]);
    } catch (saveError) {
      console.error('Could not save Kanban card:', saveError);
      setError(`Could not save the card: ${errorMessage(saveError)}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteCard = async (card: KanbanCard) => {
    if (!currentProject || !window.confirm(`Delete the card “${card.title}”?`)) return;

    setSaving(true);
    setError('');
    try {
      const { error: deleteError } = await supabase
        .from('kanban_cards')
        .delete()
        .eq('id', card.id);
      if (deleteError) throw deleteError;

      setCards((current) => current.filter((item) => item.id !== card.id));
      setProjects((current) =>
        current.map((project) =>
          project.id === currentProject.id
            ? { ...project, card_count: Math.max(0, project.card_count - 1) }
            : project
        )
      );
      setCurrentProject((project) =>
        project ? { ...project, card_count: Math.max(0, project.card_count - 1) } : project
      );
      logActivity(
        'Deleted Kanban card',
        `Deleted “${card.title}” from “${currentProject.title}”`
      );
    } catch (deleteError) {
      console.error('Could not delete Kanban card:', deleteError);
      setError(`Could not delete the card: ${errorMessage(deleteError)}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleLineItem = async (card: KanbanCard, itemIndex: number, itemText: string) => {
    if (!currentProject || !isEditMode) return;

    const toggleKey = `${card.id}:${itemIndex}`;
    const completedItems = card.completed_line_items || [];
    const wasCompleted = completedItems.includes(itemIndex);
    const nextCompletedItems = wasCompleted
      ? completedItems.filter((index) => index !== itemIndex)
      : [...completedItems, itemIndex].sort((a, b) => a - b);

    setTogglingLineItem(toggleKey);
    setError('');
    try {
      const { error: updateError } = await supabase
        .from('kanban_cards')
        .update({ completed_line_items: nextCompletedItems })
        .eq('id', card.id);
      if (updateError) throw updateError;

      setCards((current) =>
        current.map((item) =>
          item.id === card.id
            ? { ...item, completed_line_items: nextCompletedItems }
            : item
        )
      );
      logActivity(
        wasCompleted ? 'Reopened Kanban line item' : 'Completed Kanban line item',
        `${wasCompleted ? 'Reopened' : 'Completed'} “${itemText}” on “${card.title}” in “${currentProject.title}”`
      );
    } catch (toggleError) {
      console.error('Could not update Kanban line item:', toggleError);
      setError(`Could not update the checkbox: ${errorMessage(toggleError)}`);
    } finally {
      setTogglingLineItem(null);
    }
  };

  const moveCard = async (
    card: KanbanCard,
    toStatus: KanbanStatus,
    toPosition: number
  ) => {
    if (!currentProject || movingCardId) return;

    const sourceCards = cardsByStatus[card.status];
    const sourceIndex = sourceCards.findIndex((item) => item.id === card.id);
    if (card.status === toStatus && sourceIndex === toPosition) return;

    setMovingCardId(card.id);
    setError('');
    try {
      const { error: moveError } = await supabase.rpc('move_kanban_card', {
        p_card_id: card.id,
        p_to_status: toStatus,
        p_to_position: toPosition,
      });
      if (moveError) throw moveError;

      await fetchCards(currentProject.id);
      if (card.status === toStatus) {
        logActivity(
          'Reordered Kanban card',
          `Reordered “${card.title}” in ${STATUS_LABELS[toStatus]} for “${currentProject.title}”`
        );
      } else {
        logActivity(
          'Moved Kanban card',
          `Moved “${card.title}” in “${currentProject.title}”: ${STATUS_LABELS[card.status]} → ${STATUS_LABELS[toStatus]}`
        );
      }
    } catch (moveError) {
      console.error('Could not move Kanban card:', moveError);
      setError(`Could not move the card: ${errorMessage(moveError)}`);
    } finally {
      setMovingCardId(null);
      setDraggedCardId(null);
    }
  };

  const handleDragStart = (event: DragEvent, card: KanbanCard) => {
    setDraggedCardId(card.id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.id);
  };

  const handleDrop = (event: DragEvent, status: KanbanStatus, position: number) => {
    event.preventDefault();
    event.stopPropagation();
    const cardId = draggedCardId || event.dataTransfer.getData('text/plain');
    const card = cards.find((item) => item.id === cardId);
    if (card) void moveCard(card, status, position);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="kanban-title"
          className="bg-white w-full max-w-[96rem] h-[92vh] flex flex-col border-4 border-gray-900 shadow-[8px_8px_0_0_#000]"
        >
          <header className="flex items-center justify-between gap-4 border-b-4 border-gray-900 p-3 sm:p-4">
            <div className="flex min-w-0 items-center gap-3">
              {currentProject && (
                <button
                  type="button"
                  onClick={backToProjects}
                  className="shrink-0 border-2 border-gray-900 bg-white px-2 py-1 font-bold hover:bg-gray-100"
                  aria-label="Back to Kanban projects"
                >
                  ←
                </button>
              )}
              <span className="text-3xl" aria-hidden="true">🗂️</span>
              <div className="min-w-0">
                <h2 id="kanban-title" className="truncate text-xl font-bold sm:text-2xl">
                  {currentProject ? currentProject.title.toUpperCase() : 'KANBAN BOARD'}
                </h2>
                {currentProject && (
                  <div className="text-xs text-gray-500">
                    {cards.length} card{cards.length === 1 ? '' : 's'}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-2xl font-bold hover:text-red-500"
              aria-label="Close Kanban Board"
            >
              ×
            </button>
          </header>

          {error && (
            <div role="alert" className="border-b-2 border-red-700 bg-red-50 px-4 py-2 text-sm text-red-800">
              <div className="flex items-start justify-between gap-4">
                <span>{error}</span>
                <button type="button" onClick={() => setError('')} className="font-bold" aria-label="Dismiss error">×</button>
              </div>
            </div>
          )}

          {!currentProject ? (
            <main className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold">PROJECTS</h3>
                  <p className="text-sm text-gray-500">Choose a project to open its board.</p>
                </div>
                {isEditMode && !showProjectForm && (
                  <button
                    type="button"
                    onClick={startCreateProject}
                    className="bg-black px-4 py-2 font-bold text-white hover:bg-violet-600"
                  >
                    + New Project
                  </button>
                )}
              </div>

              {showProjectForm && isEditMode && (
                <form onSubmit={saveProject} className="mb-6 border-2 border-gray-900 bg-violet-50 p-4">
                  <label htmlFor="kanban-project-title" className="mb-2 block text-sm font-bold">
                    {editingProject ? 'RENAME PROJECT' : 'PROJECT TITLE'}
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id="kanban-project-title"
                      value={projectTitle}
                      onChange={(event) => setProjectTitle(event.target.value)}
                      maxLength={120}
                      autoFocus
                      disabled={saving}
                      className="min-w-0 flex-1 border-2 border-gray-900 bg-white px-3 py-2 outline-none focus:border-violet-600"
                      placeholder="Website redesign"
                    />
                    <button type="submit" disabled={saving} className="bg-black px-4 py-2 font-bold text-white disabled:opacity-50">
                      {saving ? 'Saving…' : editingProject ? 'Save' : 'Create'}
                    </button>
                    <button type="button" onClick={resetProjectForm} disabled={saving} className="border-2 border-gray-900 bg-white px-4 py-2 font-bold">
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {loadingProjects ? (
                <div className="py-16 text-center text-gray-500">Loading projects…</div>
              ) : projects.length === 0 ? (
                <div className="border-2 border-dashed border-gray-400 py-16 text-center text-gray-500">
                  No projects yet.{isEditMode ? ' Create the first one!' : ''}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {projects.map((project, index) => {
                    const color = COLORS[index % COLORS.length];
                    return (
                      <article
                        key={project.id}
                        className={`${color.className} group relative min-h-44 border-2 border-gray-900 p-5 shadow-[5px_5px_0_0_#000] transition-transform hover:-translate-y-1`}
                      >
                        <button type="button" onClick={() => openProject(project)} className="absolute inset-0 text-left" aria-label={`Open ${project.title}`} />
                        <div className="pointer-events-none relative">
                          <div className="mb-8 break-words text-xl font-bold">{project.title}</div>
                          <div className="text-sm font-bold">{project.card_count} CARD{project.card_count === 1 ? '' : 'S'}</div>
                          <div className="mt-1 text-xs text-gray-600">Updated {formatUpdatedAt(project.updated_at)}</div>
                        </div>
                        {isEditMode && (
                          <div className="absolute right-2 top-2 flex gap-1">
                            <button type="button" onClick={() => startEditProject(project)} className="relative border-2 border-gray-900 bg-white px-2 py-1 text-xs font-bold hover:bg-blue-200">Edit</button>
                            <button type="button" onClick={() => void deleteProject(project)} className="relative border-2 border-gray-900 bg-white px-2 py-1 text-xs font-bold hover:bg-red-300">Del</button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </main>
          ) : (
            <main className="flex min-h-0 flex-1 flex-col">
              {isEditMode && (
                <div className="flex flex-wrap items-center gap-2 border-b-2 border-gray-900 bg-gray-50 p-3">
                  {!showCardForm && (
                    <button type="button" onClick={startCreateCard} className="bg-black px-4 py-2 font-bold text-white hover:bg-amber-500">
                      + New Card
                    </button>
                  )}
                  <button type="button" onClick={() => startEditProject(currentProject)} className="border-2 border-gray-900 bg-white px-3 py-1.5 font-bold hover:bg-blue-100">
                    Rename Project
                  </button>
                  <button type="button" onClick={() => void deleteProject(currentProject)} className="border-2 border-gray-900 bg-white px-3 py-1.5 font-bold hover:bg-red-200">
                    Delete Project
                  </button>
                </div>
              )}

              {showProjectForm && editingProject && isEditMode && (
                <form onSubmit={saveProject} className="border-b-2 border-gray-900 bg-violet-50 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} maxLength={120} autoFocus disabled={saving} aria-label="Project title" className="min-w-0 flex-1 border-2 border-gray-900 bg-white px-3 py-2 outline-none focus:border-violet-600" />
                    <button type="submit" disabled={saving} className="bg-black px-4 py-2 font-bold text-white disabled:opacity-50">Save</button>
                    <button type="button" onClick={resetProjectForm} disabled={saving} className="border-2 border-gray-900 bg-white px-4 py-2 font-bold">Cancel</button>
                  </div>
                </form>
              )}

              {showCardForm && isEditMode && (
                <form onSubmit={saveCard} className="border-b-2 border-gray-900 bg-amber-50 p-3 sm:p-4">
                  <div className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(16rem,2fr)_auto]">
                    <div>
                      <label htmlFor="kanban-card-title" className="mb-1 block text-xs font-bold">TITLE *</label>
                      <input id="kanban-card-title" value={cardTitle} onChange={(event) => setCardTitle(event.target.value)} maxLength={160} autoFocus disabled={saving} className="w-full border-2 border-gray-900 bg-white px-3 py-2 outline-none focus:border-amber-600" placeholder="Write the launch copy" />
                    </div>
                    <div>
                      <label htmlFor="kanban-card-notes" className="mb-1 block text-xs font-bold">LINE ITEMS · ONE PER LINE</label>
                      <textarea id="kanban-card-notes" value={cardNotes} onChange={(event) => setCardNotes(event.target.value)} maxLength={2000} rows={3} disabled={saving} className="w-full resize-y border-2 border-gray-900 bg-white px-3 py-2 outline-none focus:border-amber-600" placeholder={'First task\nSecond task\nThird task'} />
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-bold">COLOR</div>
                      <div className="mb-2 flex gap-2">
                        {COLORS.map((color) => (
                          <button key={color.id} type="button" onClick={() => setCardColor(color.id)} disabled={saving} aria-label={`${color.label} card`} aria-pressed={cardColor === color.id} className={`${color.className} h-8 w-8 border-2 border-gray-900 ${cardColor === color.id ? 'ring-2 ring-black ring-offset-2' : ''}`} />
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" disabled={saving} className="bg-black px-3 py-1.5 font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : editingCard ? 'Save' : 'Add'}</button>
                        <button type="button" onClick={resetCardForm} disabled={saving} className="border-2 border-gray-900 bg-white px-3 py-1.5 font-bold">Cancel</button>
                      </div>
                    </div>
                  </div>
                </form>
              )}

              {loadingCards ? (
                <div className="flex flex-1 items-center justify-center text-gray-500">Loading board…</div>
              ) : (
                <div className="flex min-h-0 flex-1 items-stretch gap-4 overflow-x-auto overflow-y-hidden p-4 sm:p-5">
                  {STATUSES.map((status) => {
                    const columnCards = cardsByStatus[status.id];
                    return (
                      <section
                        key={status.id}
                        className="flex h-full min-h-0 w-[82vw] max-w-sm shrink-0 flex-col overflow-hidden border-2 border-gray-900 bg-gray-50 sm:w-80 lg:min-w-64 lg:flex-1"
                        onDragOver={(event) => {
                          if (isEditMode) event.preventDefault();
                        }}
                        onDrop={(event) => handleDrop(event, status.id, columnCards.length)}
                      >
                        <header className={`${status.accent} flex shrink-0 items-center justify-between border-b-2 border-gray-900 px-3 py-2`}>
                          <h3 className="font-bold">{status.label}</h3>
                          <span className="flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-gray-900 bg-white px-1 text-xs font-bold">{columnCards.length}</span>
                        </header>
                        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-3">
                          {columnCards.length === 0 && (
                            <div className="flex min-h-24 items-center justify-center border-2 border-dashed border-gray-300 p-3 text-center text-sm text-gray-400">
                              {isEditMode ? 'Drop a card here' : 'No cards'}
                            </div>
                          )}
                          {columnCards.map((card, index) => {
                            const lineItems = getLineItems(card.notes);
                            return (
                            <article
                              key={card.id}
                              draggable={isEditMode && !movingCardId}
                              onDragStart={(event) => handleDragStart(event, card)}
                              onDragEnd={() => setDraggedCardId(null)}
                              onDragOver={(event) => {
                                if (isEditMode) event.preventDefault();
                              }}
                              onDrop={(event) => handleDrop(event, status.id, index)}
                              className={`${CARD_COLORS[card.color]} group relative border-2 border-gray-900 p-3 pb-4 shadow-[4px_4px_0_0_#000] ${isEditMode ? 'cursor-grab active:cursor-grabbing' : ''} ${movingCardId === card.id ? 'opacity-50' : ''}`}
                            >
                              <div className="break-words pr-12 text-base font-bold">{card.title}</div>
                              {lineItems.length > 0 && (
                                <div className="mt-3 space-y-2">
                                  {lineItems.map((item, itemIndex) => {
                                    const isCompleted = (card.completed_line_items || []).includes(itemIndex);
                                    const toggleKey = `${card.id}:${itemIndex}`;
                                    return (
                                      <label
                                        key={`${itemIndex}-${item}`}
                                        className={`flex items-start gap-2 text-sm leading-snug ${isEditMode ? 'cursor-pointer' : 'cursor-default'}`}
                                        onPointerDown={(event) => event.stopPropagation()}
                                        onDragStart={(event) => event.stopPropagation()}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isCompleted}
                                          disabled={!isEditMode || togglingLineItem === toggleKey}
                                          onChange={() => void toggleLineItem(card, itemIndex, item)}
                                          className="mt-0.5 h-4 w-4 shrink-0 accent-black disabled:cursor-not-allowed"
                                        />
                                        <span className={`break-words ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
                                          {item}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                              {isEditMode && (
                                <>
                                  <div className="absolute right-1 top-1 flex gap-1">
                                    <button type="button" onClick={() => startEditCard(card)} className="bg-white px-1.5 py-0.5 text-xs font-bold hover:bg-blue-200">Edit</button>
                                    <button type="button" onClick={() => void deleteCard(card)} className="bg-white px-1.5 py-0.5 text-xs font-bold hover:bg-red-300">Del</button>
                                  </div>
                                  <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-black/20 pt-2">
                                    <label className="sr-only" htmlFor={`move-card-${card.id}`}>Move {card.title}</label>
                                    <select
                                      id={`move-card-${card.id}`}
                                      value={card.status}
                                      disabled={Boolean(movingCardId)}
                                      onChange={(event) => {
                                        const target = event.target.value as KanbanStatus;
                                        void moveCard(card, target, cardsByStatus[target].length);
                                      }}
                                      className="min-w-0 flex-1 border border-gray-900 bg-white px-1 py-0.5 text-xs"
                                    >
                                      {STATUSES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                                    </select>
                                    <button type="button" aria-label={`Move ${card.title} up`} disabled={Boolean(movingCardId) || index === 0} onClick={() => void moveCard(card, status.id, index - 1)} className="border border-gray-900 bg-white px-1.5 py-0.5 text-xs font-bold disabled:opacity-30">↑</button>
                                    <button type="button" aria-label={`Move ${card.title} down`} disabled={Boolean(movingCardId) || index === columnCards.length - 1} onClick={() => void moveCard(card, status.id, index + 1)} className="border border-gray-900 bg-white px-1.5 py-0.5 text-xs font-bold disabled:opacity-30">↓</button>
                                  </div>
                                </>
                              )}
                            </article>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </main>
          )}
        </div>
      </div>
    </>
  );
}
