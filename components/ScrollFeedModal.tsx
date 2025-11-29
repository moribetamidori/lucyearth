'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type FeedItem = {
  id: string;
  reactKey?: string;
  type: string;
  created_at: string;
  title?: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  thumbnailUrl?: string | null;
  meta?: string;
  link?: string | null;
};

type ScrollFeedModalProps = {
  isOpen: boolean;
  onClose: () => void;
  anonId?: string;
  onLogActivity?: (action: string, details?: string) => void;
};

type CatPictureRow = {
  id: string;
  created_at: string;
  image_url: string;
  media_type?: 'image' | 'video' | null;
  thumbnail_url?: string | null;
  anon_id?: string | null;
};

type ArenaBlockRow = {
  id: string;
  created_at: string;
  image_url: string;
  media_type?: 'image' | 'video' | null;
  thumbnail_url?: string | null;
  collection_id?: string | null;
};

type JournalEntryRow = {
  id: string;
  created_at: string;
  entry_text: string | null;
};

type DoubanRatingRow = {
  id: string;
  created_at: string;
  title?: string | null;
  image_url?: string | null;
  category?: string | null;
  rating?: number | null;
};

type SubstackArticleRow = {
  id: string;
  created_at: string;
  title?: string | null;
  link?: string | null;
};

type GardenSpeciesRow = {
  id: string;
  created_at: string;
  common_name: string;
  image_url?: string | null;
  scientific_name?: string | null;
  status?: string | null;
};

type BookshelfBookRow = {
  id: string;
  created_at: string;
  title: string;
  cover_url?: string | null;
  author?: string | null;
};

type WomenProfileRow = {
  id: string;
  created_at: string;
  name: string;
  image_url?: string | null;
  intro?: string | null;
  accomplishments?: string | null;
  tags?: string[] | null;
};

const INITIAL_BATCH = 10;
const BATCH_SIZE = 8;

const gradients = [
  'linear-gradient(135deg, #7c3aed, #22d3ee)',
  'linear-gradient(135deg, #f97316, #facc15)',
  'linear-gradient(135deg, #0ea5e9, #6366f1)',
  'linear-gradient(135deg, #ef4444, #f97316)',
  'linear-gradient(135deg, #10b981, #14b8a6)',
  'linear-gradient(135deg, #a855f7, #ec4899)',
  'linear-gradient(135deg, #3b82f6, #22d3ee)',
];

function shuffle<T>(items: T[]) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function formatDate(ts: string) {
  const date = new Date(ts);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function gradientForId(id: string) {
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

export default function ScrollFeedModal({
  isOpen,
  onClose,
  anonId,
  onLogActivity,
}: ScrollFeedModalProps) {
  const [allItems, setAllItems] = useState<FeedItem[]>([]);
  const [visibleItems, setVisibleItems] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [isToggling, setIsToggling] = useState<string | null>(null);
  const [doomscrollLogged, setDoomscrollLogged] = useState(false);
  const [doomscrollEverLogged, setDoomscrollEverLogged] = useState(false);
  const [likeEverLogged, setLikeEverLogged] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const hasMore = cursor < allItems.length;

  const appendMore = useCallback(() => {
    if (loadingMore) return;
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleItems((prev) => {
        const nextSlice = allItems.slice(cursor, cursor + BATCH_SIZE);
        return [...prev, ...nextSlice];
      });
      setCursor((prev) => Math.min(prev + BATCH_SIZE, allItems.length));
      setLoadingMore(false);
    }, 120);
  }, [allItems, cursor, loadingMore]);

  const toggleLike = async (item: FeedItem) => {
    if (!anonId) {
      alert('Please refresh so we can assign your anon ID before liking.');
      return;
    }
    if (isToggling === item.id) return;
    setIsToggling(item.id);
    const hasVoted = votedIds.has(item.id);
    try {
      if (hasVoted) {
        await supabase
          .from('scroll_feed_votes')
          .delete()
          .eq('item_id', item.id)
          .eq('anon_id', anonId);
        setVotedIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        setVoteCounts((prev) => ({
          ...prev,
          [item.id]: Math.max((prev[item.id] || 1) - 1, 0),
        }));
      } else {
        const { error: insertError } = await supabase
          .from('scroll_feed_votes')
          .insert({ item_id: item.id, anon_id: anonId });

        if (insertError && (insertError as { code?: string }).code !== '23505') {
          throw insertError;
        }

        setVotedIds((prev) => new Set(prev).add(item.id));
        setVoteCounts((prev) => ({
          ...prev,
          [item.id]: (prev[item.id] || 0) + 1,
        }));
        if (!likeEverLogged && onLogActivity) {
          onLogActivity('Liked feed post', `${item.type} ${item.id}`);
          setLikeEverLogged(true);
        }
      }
    } catch (err) {
      const msg =
        (err as { message?: string })?.message ||
        'Unknown error updating like. Ensure the scroll_feed_votes table exists.';
      console.error('Failed to toggle like', err);
      alert(msg);
    } finally {
      setIsToggling(null);
    }
  };

  const loadVotesForItems = useCallback(
    async (items: FeedItem[]) => {
      if (!items.length) return;
      const ids = items.map((i) => i.id);
      try {
        const { data: votesData, error: votesError } = await supabase
          .from('scroll_feed_votes')
          .select('item_id')
          .in('item_id', ids);

        if (votesError) throw votesError;

        const counts: Record<string, number> = {};
        (votesData || []).forEach((row: { item_id: string }) => {
          counts[row.item_id] = (counts[row.item_id] || 0) + 1;
        });
        setVoteCounts(counts);

        if (anonId) {
          const { data: userVotes, error: userVotesError } = await supabase
            .from('scroll_feed_votes')
            .select('item_id')
            .eq('anon_id', anonId)
            .in('item_id', ids);

          if (userVotesError) throw userVotesError;

          const userSet = new Set((userVotes || []).map((v: { item_id: string }) => v.item_id));
          setVotedIds(userSet);
        }
      } catch (err) {
        console.error('Failed to load votes', err);
      }
    },
    [anonId]
  );

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [
        catRes,
        arenaRes,
        journalRes,
        doubanRes,
        articleRes,
        speciesRes,
        bookRes,
        womenRes,
      ] = await Promise.all([
        supabase
          .from('cat_pictures')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('arena_blocks')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('journal_entries')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('douban_ratings')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('substack_articles')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('garden_species')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('bookshelf_books')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('women_profiles')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      const cats = (catRes.data ?? []) as CatPictureRow[];
      const arena = (arenaRes.data ?? []) as ArenaBlockRow[];
      const journals = (journalRes.data ?? []) as JournalEntryRow[];
      const douban = (doubanRes.data ?? []) as DoubanRatingRow[];
      const articles = (articleRes.data ?? []) as SubstackArticleRow[];
      const species = (speciesRes.data ?? []) as GardenSpeciesRow[];
      const books = (bookRes.data ?? []) as BookshelfBookRow[];
      const women = (womenRes.data ?? []) as WomenProfileRow[];

      const merged: FeedItem[] = [];
      const seen = new Set<string>();
      let seq = 0;
      const pushItem = (idBase: string, payload: Omit<FeedItem, 'id'>) => {
        const safeBase = idBase || `item-${payload.type || 'unknown'}-${seq++}`;
        if (seen.has(safeBase)) return;
        seen.add(safeBase);
        merged.push({ id: safeBase, reactKey: safeBase, ...payload });
      };

      cats.forEach((item) => {
        pushItem(`cat-${item.id}`, {
          type: 'CAT',
          created_at: item.created_at,
          title: 'Cat drop',
          mediaUrl: item.image_url,
          mediaType: item.media_type || 'image',
          thumbnailUrl: item.thumbnail_url || null,
          meta: item.anon_id ? `anon ${item.anon_id.slice(-4)}` : 'anon cat',
        });
      });

      arena.forEach((item) => {
        pushItem(`arena-${item.id}`, {
          type: 'ARE.NA',
          created_at: item.created_at,
          title: 'Channel block',
          mediaUrl: item.image_url,
          mediaType: item.media_type || 'image',
          thumbnailUrl: item.thumbnail_url || null,
          meta: item.collection_id ? `collection ${item.collection_id.slice(0, 4)}` : 'random block',
        });
      });

      journals.forEach((item) => {
        pushItem(`journal-${item.id}`, {
          type: 'JOURNAL',
          created_at: item.created_at,
          title: 'Journal entry',
          text: item.entry_text || undefined,
          meta: 'Text-only drop',
        });
      });

      douban.forEach((item) => {
        pushItem(`douban-${item.id}`, {
          type: 'DOUBAN',
          created_at: item.created_at,
          title: item.title || 'Douban pick',
          mediaUrl: item.image_url || undefined,
          meta: `${item.category?.toUpperCase() || ''} · ${item.rating ? `${item.rating}/5` : 'Rating'}`,
        });
      });

      articles.forEach((item) => {
        pushItem(`substack-${item.id}`, {
          type: 'SUBSTACK',
          created_at: item.created_at,
          title: item.title || 'Reading',
          text: item.link || undefined,
          link: item.link || undefined,
          meta: 'Article link',
        });
      });

      species.forEach((item) => {
        pushItem(`garden-${item.id}`, {
          type: 'GARDEN',
          created_at: item.created_at,
          title: item.common_name,
          mediaUrl: item.image_url || undefined,
          meta: item.scientific_name || item.status || 'Backyard notes',
        });
      });

      books.forEach((item) => {
        pushItem(`book-${item.id}`, {
          type: 'BOOKSHELF',
          created_at: item.created_at,
          title: item.title,
          mediaUrl: item.cover_url || undefined,
          text: !item.cover_url ? `${item.title} — ${item.author || 'Unknown author'}` : undefined,
          meta: item.author || 'Book log',
        });
      });

      women.forEach((item) => {
        pushItem(`women-${item.id}`, {
          type: 'WOMEN',
          created_at: item.created_at,
          title: item.name,
          mediaUrl: item.image_url || undefined,
          text: item.intro || item.accomplishments || undefined,
          meta: item.tags && item.tags.length ? item.tags.join(', ') : 'Network',
        });
      });

      const randomized = shuffle(merged);
      const dedupedItems: FeedItem[] = [];
      const seenIds = new Set<string>();
      randomized.forEach((item) => {
        if (!item.id) return;
        if (seenIds.has(item.id)) return;
        seenIds.add(item.id);
        dedupedItems.push(item);
      });
      setAllItems(dedupedItems);
      setVisibleItems(dedupedItems.slice(0, INITIAL_BATCH));
      setCursor(Math.min(INITIAL_BATCH, dedupedItems.length));
      await loadVotesForItems(dedupedItems);
    } catch (err) {
      console.error('Failed to build feed', err);
      setError('Failed to load feed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [loadVotesForItems]);

  useEffect(() => {
    setDoomscrollEverLogged(false);
    setLikeEverLogged(false);
  }, [anonId]);

  useEffect(() => {
    if (isOpen) {
      fetchFeed();
      if (onLogActivity) {
        onLogActivity('Opened Scroll Mode', 'Viewing randomized feed');
      }
    } else {
      setVisibleItems([]);
      setCursor(0);
      setVoteCounts({});
      setVotedIds(new Set());
      setDoomscrollLogged(false);
    }
  }, [fetchFeed, isOpen, onLogActivity]);

  useEffect(() => {
    if (!isOpen || !anonId) return;
    let active = true;
    const loadAchievementFlags = async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('action')
        .eq('anon_id', anonId)
        .in('action', ['Achievement: Doomscroll', 'Liked feed post'])
        .limit(200);
      if (!active) return;
      if (error) {
        console.error('Failed to check existing Scroll Mode achievements', error);
        return;
      }
      const actions = new Set((data || []).map((row) => row.action));
      setDoomscrollEverLogged(actions.has('Achievement: Doomscroll'));
      setLikeEverLogged(actions.has('Liked feed post'));
    };
    loadAchievementFlags();
    return () => {
      active = false;
    };
  }, [anonId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loadingMore) {
          appendMore();
        }
      },
      { root: null, rootMargin: '300px' }
    );

    const target = sentinelRef.current;
    if (target) observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadingMore, appendMore, isOpen]);

  useEffect(() => {
    if (!isOpen || doomscrollLogged || doomscrollEverLogged || !anonId) return;
    if (cursor > 10) {
      setDoomscrollLogged(true);
      if (!doomscrollEverLogged && onLogActivity) {
        onLogActivity(
          'Achievement: Doomscroll',
          'Unlocked Social Media Doomscroller (viewed 10+ posts)'
        );
        setDoomscrollEverLogged(true);
      }
    }
  }, [anonId, cursor, doomscrollEverLogged, doomscrollLogged, isOpen, onLogActivity]);

  const likeCount = (item: FeedItem) =>
    voteCounts[item.id] || 0;

  const cards = visibleItems.map((item, idx) => {
    const liked = votedIds.has(item.id);
    const mediaUrl = item.mediaUrl;
    const hasMedia = Boolean(mediaUrl);

    return (
      <div
        key={item.id}
        className="bg-white border-4 border-gray-900 shadow-[8px_8px_0_0_#000] flex flex-col"
      >
        <div className="relative aspect-square bg-black/5 overflow-hidden">
          {mediaUrl ? (
            item.mediaType === 'video' ? (
              <video
                controls
                poster={item.thumbnailUrl || undefined}
                className="w-full h-full object-cover bg-black"
              >
                <source src={mediaUrl} />
              </video>
            ) : (
              <Image
                src={mediaUrl}
                alt={item.title || item.type}
                fill
                sizes="100vw"
                className="object-cover"
                style={{ imageRendering: 'pixelated' }}
              />
            )
          ) : (
            <div
              className="w-full h-full p-6 text-white flex flex-col justify-end"
              style={{ background: gradientForId(item.id) }}
            >
              <div className="text-xs opacity-80 mb-2">{item.type}</div>
              <div className="text-xl font-bold leading-tight break-words">
                {item.title || 'Text drop'}
              </div>
              {item.text && !item.link && (
                <p className="text-sm leading-relaxed whitespace-pre-line mt-2 max-h-28 overflow-hidden">
                  {item.text}
                </p>
              )}
            </div>
          )}

          <div className="absolute top-3 left-3 px-3 py-1 bg-white/90 border-2 border-gray-900 text-xs font-semibold">
            {item.type}
          </div>
        </div>

        <div className="p-4 flex-1 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 md:gap-3 flex-nowrap">
            <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
              <button
                onClick={() => toggleLike(item)}
                className={`flex items-center gap-1.5 md:gap-2 px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm font-bold border-2 border-gray-900 shadow-[3px_3px_0_0_#000] transition-transform active:translate-y-[2px] ${
                  liked ? 'bg-rose-200' : 'bg-white'
                }`}
              >
                <span className="text-base">{liked ? '💖' : '🤍'}</span>
                {likeCount(item)}
              </button>
              <div className="min-w-0">
                <div className="text-sm md:text-lg font-bold break-words leading-snug">
                  {item.title || item.type}
                </div>
                <div className="text-[10px] md:text-xs text-gray-500">{formatDate(item.created_at)}</div>
              </div>
            </div>
            {item.meta && (
              <div className="text-[10px] md:text-xs text-gray-600 text-right truncate max-w-[40%]">
                {item.meta}
              </div>
            )}
          </div>
          {!hasMedia && item.text && !item.link && (
            <p className="text-sm leading-relaxed whitespace-pre-line text-gray-800">
              {item.text}
            </p>
          )}
          {item.link && (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-blue-100 border-2 border-gray-900 hover:bg-blue-200 transition-colors w-fit"
            >
              Open link ↗
            </a>
          )}
        </div>
      </div>
    );
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl h-[90vh] flex flex-col border-4 border-gray-900 shadow-[10px_10px_0_0_#000]">
        <div className="p-4 border-b-4 border-gray-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌀</span>
            <div>
              <div className="text-xl font-bold">SCROLL MODE</div>
              <div className="text-xs text-gray-600">
                Randomized instagram-ish feed across every table
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchFeed}
              className="px-3 py-2 text-sm font-bold border-2 border-gray-900 bg-yellow-200 hover:bg-yellow-300 shadow-[3px_3px_0_0_#000] transition-colors"
            >
              Shuffle
            </button>
            <button
              onClick={onClose}
              className="w-10 h-10 bg-red-500 hover:bg-red-600 text-white font-bold text-xl"
              style={{ border: '3px solid #000', boxShadow: '3px 3px 0 0 #000' }}
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {error && (
            <div className="mb-4 p-3 border-2 border-red-500 bg-red-50 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center text-sm text-gray-600">Loading feed...</div>
          ) : (
            <div className="grid grid-cols-1 gap-6">{cards}</div>
          )}

          <div ref={sentinelRef} className="h-10" />
          {loadingMore && (
            <div className="text-center text-xs text-gray-500 mt-4">Pulling more posts...</div>
          )}
          {!loading && !hasMore && allItems.length > 0 && (
            <div className="text-center text-xs text-gray-500 mt-6">You reached the end.</div>
          )}
          {!loading && allItems.length === 0 && (
            <div className="text-center text-sm text-gray-500">No posts found yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
