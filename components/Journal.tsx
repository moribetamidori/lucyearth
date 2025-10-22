'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface JournalEntry {
  id: string;
  anon_id: string;
  entry_text: string;
  created_at: string;
  updated_at: string;
}

interface JournalProps {
  isOpen: boolean;
  onClose: () => void;
  isEditMode: boolean;
  anonId: string;
  onLogActivity: (action: string, details?: string) => void;
}

export default function Journal({ isOpen, onClose, isEditMode, anonId, onLogActivity }: JournalProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [newEntryText, setNewEntryText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');


  useEffect(() => {
    if (isOpen) {
      fetchEntries();
      onLogActivity('Opened Journal', 'Viewing journal entries');
    }
  }, [isOpen]);

  const fetchEntries = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error fetching journal entries:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEntry = async () => {
    if (!newEntryText.trim()) return;

    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from('journal_entries')
        .insert([
          {
            anon_id: anonId,
            entry_text: newEntryText.trim()
          }
        ])
        .select()
        .single();

      if (error) throw error;

      setEntries([data, ...entries]);
      setNewEntryText('');
      onLogActivity('Added Journal Entry', 'Created a new journal entry');
    } catch (error) {
      console.error('Error adding journal entry:', error);
      alert('Failed to add journal entry');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateEntry = async (entryId: string) => {
    if (!editText.trim()) return;

    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from('journal_entries')
        .update({ entry_text: editText.trim() })
        .eq('id', entryId)
        .select()
        .single();

      if (error) throw error;

      setEntries(entries.map(e => e.id === entryId ? data : e));
      setEditingEntryId(null);
      setEditText('');
      onLogActivity('Updated Journal Entry', 'Edited an existing journal entry');
    } catch (error) {
      console.error('Error updating journal entry:', error);
      alert('Failed to update journal entry');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm('Are you sure you want to delete this journal entry?')) return;

    try {
      const { error } = await supabase
        .from('journal_entries')
        .delete()
        .eq('id', entryId);

      if (error) throw error;

      setEntries(entries.filter(e => e.id !== entryId));
      onLogActivity('Deleted Journal Entry', 'Removed a journal entry');
    } catch (error) {
      console.error('Error deleting journal entry:', error);
      alert('Failed to delete journal entry');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center p-4 z-50">
      <div
        className="bg-white w-full max-w-4xl h-[90vh] flex flex-col"
        style={{
          border: '4px solid #000',
          boxShadow: '8px 8px 0 0 #000'
        }}
      >
        {/* Header */}
        <div
          className="p-4 flex items-center justify-between bg-white"
          style={{
            borderBottom: '4px solid #000'
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">📔</span>
            <h2
              className="text-2xl font-bold text-gray-900"
              style={{ fontFamily: "var(--font-courier), 'Courier New', monospace" }}
            >
              JOURNAL
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 bg-red-500 hover:bg-red-600 text-white font-bold text-xl transition-colors"
            style={{
              border: '3px solid #000',
              boxShadow: '3px 3px 0 0 #000'
            }}
          >
            ×
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {/* New Entry Form - Only show in edit mode */}
          {isEditMode && (
            <div
              className="mb-6 p-4 bg-white"
              style={{
                border: '3px solid #000',
                boxShadow: '4px 4px 0 0 #000'
              }}
            >
              <div className="mb-3 text-sm text-gray-600" style={{ fontFamily: "'Courier Prime', 'Courier New', monospace" }}>
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })} — {new Date().toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                })}
              </div>
              <textarea
                value={newEntryText}
                onChange={(e) => setNewEntryText(e.target.value)}
                placeholder="Dear diary..."
                className="w-full p-3 border-2 border-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                style={{
                  fontFamily: "'Courier Prime', 'Courier New', monospace",
                  fontSize: '16px',
                  lineHeight: '1.6',
                  minHeight: '150px'
                }}
                disabled={isSaving}
              />
              <button
                onClick={handleAddEntry}
                disabled={!newEntryText.trim() || isSaving}
                className="mt-3 px-6 py-2 bg-gray-900 hover:bg-gray-700 text-white font-bold disabled:bg-gray-300 disabled:cursor-not-allowed transition-all"
                style={{
                  border: '3px solid #000',
                  boxShadow: '3px 3px 0 0 #000',
                  fontFamily: "'Courier Prime', 'Courier New', monospace"
                }}
              >
                {isSaving ? 'SAVING...' : 'ADD ENTRY'}
              </button>
            </div>
          )}

          {/* Entries List */}
          {isLoading ? (
            <div className="text-center py-8" style={{ fontFamily: "'Courier Prime', 'Courier New', monospace" }}>
              Loading entries...
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-gray-600" style={{ fontFamily: "'Courier Prime', 'Courier New', monospace" }}>
              No journal entries yet. Start writing your thoughts above!
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="p-4 bg-white"
                  style={{
                    border: '3px solid #000',
                    boxShadow: '4px 4px 0 0 #000'
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm text-gray-600" style={{ fontFamily: "'Courier Prime', 'Courier New', monospace" }}>
                      <div>{formatDate(entry.created_at)}</div>
                      <div>{formatTime(entry.created_at)}</div>
                      {entry.updated_at !== entry.created_at && (
                        <div className="text-xs italic mt-1">
                          (edited {formatTime(entry.updated_at)})
                        </div>
                      )}
                    </div>
                    {isEditMode && (
                      <div className="flex gap-2">
                        {editingEntryId === entry.id ? (
                          <>
                            <button
                              onClick={() => handleUpdateEntry(entry.id)}
                              disabled={isSaving}
                              className="px-3 py-1 bg-gray-900 hover:bg-gray-700 text-white text-sm font-bold disabled:bg-gray-300 transition-colors"
                              style={{
                                border: '2px solid #000',
                                boxShadow: '2px 2px 0 0 #000',
                                fontFamily: "'Courier Prime', 'Courier New', monospace"
                              }}
                            >
                              SAVE
                            </button>
                            <button
                              onClick={() => {
                                setEditingEntryId(null);
                                setEditText('');
                              }}
                              className="px-3 py-1 bg-white hover:bg-gray-100 text-gray-900 text-sm font-bold transition-colors"
                              style={{
                                border: '2px solid #000',
                                boxShadow: '2px 2px 0 0 #000',
                                fontFamily: "'Courier Prime', 'Courier New', monospace"
                              }}
                            >
                              CANCEL
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingEntryId(entry.id);
                                setEditText(entry.entry_text);
                              }}
                              className="px-3 py-1 bg-gray-900 hover:bg-gray-700 text-white text-sm font-bold transition-colors"
                              style={{
                                border: '2px solid #000',
                                boxShadow: '2px 2px 0 0 #000',
                                fontFamily: "'Courier Prime', 'Courier New', monospace"
                              }}
                            >
                              EDIT
                            </button>
                            <button
                              onClick={() => handleDeleteEntry(entry.id)}
                              className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors"
                              style={{
                                border: '2px solid #000',
                                boxShadow: '2px 2px 0 0 #000',
                                fontFamily: "'Courier Prime', 'Courier New', monospace"
                              }}
                            >
                              DELETE
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {editingEntryId === entry.id ? (
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full p-3 border-2 border-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                      style={{
                        fontFamily: "'Courier Prime', 'Courier New', monospace",
                        fontSize: '16px',
                        lineHeight: '1.6',
                        minHeight: '100px'
                      }}
                      disabled={isSaving}
                    />
                  ) : (
                    <div
                      className="whitespace-pre-wrap"
                      style={{
                        fontFamily: "'Courier Prime', 'Courier New', monospace",
                        fontSize: '16px',
                        lineHeight: '1.6',
                        color: '#1a1a1a'
                      }}
                    >
                      {entry.entry_text}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
