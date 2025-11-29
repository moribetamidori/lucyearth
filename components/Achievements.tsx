'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Achievement {
  id: string;
  title: string;
  description: string;
  emoji: string;
  isUnlocked: boolean;
}

interface AchievementsProps {
  isOpen: boolean;
  onClose: () => void;
  catClicks: number;
  anonId?: string;
}

export default function Achievements({ isOpen, onClose, catClicks, anonId }: AchievementsProps) {
  const [doomscrollUnlocked, setDoomscrollUnlocked] = useState(false);
  const [likeUnlocked, setLikeUnlocked] = useState(false);
  const [loadingSocial, setLoadingSocial] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setDoomscrollUnlocked(false);
    setLikeUnlocked(false);
  }, [anonId]);

  useEffect(() => {
    if (!isOpen || !anonId) return;
    let isMounted = true;
    const fetchSocialAchievements = async () => {
      setLoadingSocial(true);
      setLoadError(null);
      const { data, error } = await supabase
        .from('activity_logs')
        .select('action')
        .eq('anon_id', anonId)
        .in('action', ['Achievement: Doomscroll', 'Liked feed post'])
        .limit(200);

      if (!isMounted) return;

      if (error) {
        console.error('Failed to load achievement actions', error);
        setLoadError('Could not fetch activity-based achievements.');
      } else {
        const actions = new Set((data || []).map((row) => row.action));
        setDoomscrollUnlocked(actions.has('Achievement: Doomscroll'));
        setLikeUnlocked(actions.has('Liked feed post'));
      }
      setLoadingSocial(false);
    };

    fetchSocialAchievements();

    return () => {
      isMounted = false;
    };
  }, [anonId, isOpen]);

  if (!isOpen) return null;

  const achievements: Achievement[] = [
    {
      id: 'cat_lover',
      title: 'Cat Lover',
      description: 'Pet the cat 10+ times',
      emoji: '🐱',
      isUnlocked: catClicks >= 10,
    },
    {
      id: 'doomscroll',
      title: 'Social Media Doomscroller',
      description: 'Scroll 10+ posts inside Scroll Mode',
      emoji: '📱',
      isUnlocked: doomscrollUnlocked,
    },
    {
      id: 'feed_romantic',
      title: 'Feed Romantic',
      description: 'Like any Scroll Mode post',
      emoji: '💖',
      isUnlocked: likeUnlocked,
    },
  ];

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="bg-white border-4 border-gray-900 w-full max-w-2xl max-h-[80vh] flex flex-col"
        style={{
          boxShadow: '8px 8px 0 0 #000',
        }}
      >
        {/* Header */}
        <div className="p-4 border-b-4 border-gray-900">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">🏆 ACHIEVEMENTS</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 border-2 border-gray-900 hover:bg-red-500 hover:text-white flex items-center justify-center text-lg"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            {achievements.map((achievement) => (
              <div
                key={achievement.id}
                className={`p-4 border-4 border-gray-900 transition-all ${
                  achievement.isUnlocked
                    ? 'bg-gradient-to-r from-yellow-100 to-amber-100'
                    : 'bg-gray-100 opacity-60'
                }`}
                style={{
                  boxShadow: '4px 4px 0 0 #000',
                }}
              >
                <div className="flex items-center gap-4">
                  <div className="text-4xl">{achievement.emoji}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold">{achievement.title}</h3>
                      {achievement.isUnlocked && (
                        <span className="text-green-600 text-xl">✓</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {achievement.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Stats Section */}
          <div className="mt-6 p-4 bg-blue-50 border-4 border-gray-900">
            <h3 className="font-bold mb-2">Your Progress:</h3>
            <div className="text-sm space-y-1">
              <div>Cat pets: {catClicks}</div>
              <div>
                Achievements unlocked:{' '}
                {achievements.filter((a) => a.isUnlocked).length} /{' '}
                {achievements.length}
              </div>
              {loadingSocial && <div>Checking Scroll Mode rituals...</div>}
              {loadError && <div className="text-red-600">{loadError}</div>}
              {!anonId && (
                <div className="text-gray-600">
                  Scroll achievements activate once your anon ID is ready.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
