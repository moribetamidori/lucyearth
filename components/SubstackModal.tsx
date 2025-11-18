'use client';

import { useEffect, useState } from 'react';
import { supabase, type SubstackArticle } from '@/lib/supabase';
import { ActionButton } from './ActionButtons';

type SubstackModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isEditMode: boolean;
  onLogActivity: (action: string, details?: string) => void;
};

export default function SubstackModal({
  isOpen,
  onClose,
  isEditMode,
  onLogActivity,
}: SubstackModalProps) {
  const [articles, setArticles] = useState<SubstackArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [editingArticleId, setEditingArticleId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchArticles();
      onLogActivity('Opened Substack articles', 'Viewed Substack reading list');
    }
  }, [isOpen, onLogActivity]);

  const fetchArticles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('substack_articles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load Substack articles', error);
    } else {
      setArticles(data || []);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setTitle('');
    setLink('');
    setEditingArticleId(null);
  };

  const normalizeLink = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const titleValue = title.trim();
    const linkValue = normalizeLink(link);

    if (!titleValue || !linkValue) {
      alert('Please provide both a title and a valid link.');
      return;
    }

    setIsSaving(true);
    if (editingArticleId) {
      const { data, error } = await supabase
        .from('substack_articles')
        .update({ title: titleValue, link: linkValue })
        .eq('id', editingArticleId)
        .select()
        .single();

      if (error) {
        console.error('Failed to update article', error);
        alert('Could not update this article. Please try again.');
      } else if (data) {
        setArticles((prev) =>
          prev.map((article) => (article.id === editingArticleId ? data : article))
        );
        onLogActivity('Updated Substack article', `Edited "${titleValue}"`);
        resetForm();
      }
    } else {
      const { data, error } = await supabase
        .from('substack_articles')
        .insert({ title: titleValue, link: linkValue })
        .select()
        .single();

      if (error) {
        console.error('Failed to add article', error);
        alert('Could not add this article. Please try again.');
      } else if (data) {
        setArticles((prev) => [data, ...prev]);
        onLogActivity('Added Substack article', `Saved "${titleValue}"`);
        resetForm();
      }
    }
    setIsSaving(false);
  };

  const handleEdit = (article: SubstackArticle) => {
    setTitle(article.title);
    setLink(article.link);
    setEditingArticleId(article.id);
  };

  const handleDelete = async (article: SubstackArticle) => {
    const confirmed = confirm(`Remove "${article.title}" from the list?`);
    if (!confirmed) return;

    const { error } = await supabase
      .from('substack_articles')
      .delete()
      .eq('id', article.id);

    if (error) {
      console.error('Failed to delete article', error);
      alert('Could not delete this article. Please try again.');
      return;
    }

    setArticles((prev) => prev.filter((item) => item.id !== article.id));
    onLogActivity('Deleted Substack article', `Removed "${article.title}"`);

    if (editingArticleId === article.id) {
      resetForm();
    }
  };

  const formatDate = (value: string) => {
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDomain = (value: string) => {
    try {
      const { hostname } = new URL(value);
      return hostname.replace(/^www\./, '');
    } catch {
      return value;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div
        className="bg-white w-full max-w-3xl h-[90vh] flex flex-col"
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
            <span className="text-3xl">📰</span>
            <h2
              className="text-2xl font-bold text-gray-900"
              style={{ fontFamily: "var(--font-courier), 'Courier New', monospace" }}
            >
              SUBSTACK
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 bg-red-500 hover:bg-red-600 text-white font-bold text-xl transition-colors"
            style={{
              border: '3px solid #000',
              boxShadow: '3px 3px 0 0 #000',
            }}
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-white space-y-6">
          {isEditMode && (
            <form
              onSubmit={handleSubmit}
              className="border-4 border-dashed border-gray-900 p-4 space-y-4"
            >
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">TITLE</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex. Morning Pages #12"
                  className="border-2 border-gray-900 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">LINK</label>
                <input
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://substack.com/..."
                  className="border-2 border-gray-900 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 text-white text-xs font-semibold tracking-wide"
                  style={{
                    border: '2px solid #000',
                    boxShadow: '3px 3px 0 0 #000',
                  }}
                  disabled={isSaving}
                >
                  {editingArticleId ? 'UPDATE ARTICLE' : 'ADD ARTICLE'}
                </button>
                {editingArticleId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 bg-gray-200 text-gray-900 text-xs font-semibold tracking-wide"
                    style={{
                      border: '2px solid #000',
                      boxShadow: '3px 3px 0 0 #000',
                    }}
                  >
                    CANCEL
                  </button>
                )}
              </div>
            </form>
          )}

          <div className="space-y-4">
            {loading && <div className="text-sm text-gray-500">Loading articles...</div>}
            {!loading && articles.length === 0 && (
              <div className="text-sm text-gray-500 border-2 border-dashed border-gray-400 p-4 text-center">
                No Substack posts saved yet.
              </div>
            )}
            {articles.map((article) => (
              <article
                key={article.id}
                className="border-4 border-gray-900 p-4 relative group bg-white hover:-translate-y-0.5 transition-transform"
              >
                {isEditMode && (
                  <div className="absolute top-3 right-3 flex gap-2">
                    <ActionButton
                      variant="edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(article);
                      }}
                    />
                    <ActionButton
                      variant="delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(article);
                      }}
                    />
                  </div>
                )}
                <div className="flex flex-col gap-2 pr-20">
                  <a
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xl font-semibold underline decoration-dotted underline-offset-4 hover:text-orange-500 flex items-center gap-2"
                  >
                    {article.title}
                    <span className="text-base">↗</span>
                  </a>
                  <div className="text-xs uppercase tracking-wide text-gray-500 flex gap-4">
                    <span>{getDomain(article.link)}</span>
                    <span>{formatDate(article.created_at)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
