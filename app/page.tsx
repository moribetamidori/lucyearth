'use client';

import { useState, useEffect } from 'react';
import PoopCalendar from '@/components/PoopCalendar';
import CatProfile from '@/components/CatProfile';
import ActivityLog from '@/components/ActivityLog';
import ArenaModal from '@/components/ArenaModal';
import Journal from '@/components/Journal';
import Achievements from '@/components/Achievements';
import DoubanModal from '@/components/DoubanModal';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [score, setScore] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [showPoopCalendar, setShowPoopCalendar] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [orbs, setOrbs] = useState<Array<{
    size: number;
    left: number;
    top: number;
    duration: number;
    delay: number;
  }>>([]);
  const [pets, setPets] = useState<Array<{
    id: number;
    x: number;
    y: number;
  }>>([]);
  const [anonId, setAnonId] = useState<string>('');
  const [catClicks, setCatClicks] = useState<number>(0);
  const [showCatIcon, setShowCatIcon] = useState<boolean>(false);
  const [showCatProfile, setShowCatProfile] = useState<boolean>(false);
  const [catMessage, setCatMessage] = useState<string>('');
  const [messageTimeoutId, setMessageTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const [showActivityLog, setShowActivityLog] = useState<boolean>(false);
  const [showArenaModal, setShowArenaModal] = useState<boolean>(false);
  const [showJournal, setShowJournal] = useState<boolean>(false);
  const [userNumber, setUserNumber] = useState<number>(0);
  const [showAchievements, setShowAchievements] = useState<boolean>(false);
  const [showDoubanModal, setShowDoubanModal] = useState<boolean>(false);

  // Helper function to log activities
  const logActivity = async (action: string, details?: string) => {
    if (anonId) {
      await supabase
        .from('activity_logs')
        .insert({ anon_id: anonId, action, details: details || null });
    }
  };

  // Initialize anonymous user
  useEffect(() => {
    const initAnonUser = async () => {
      // Get or create anonymous user ID
      let storedAnonId = localStorage.getItem('lucyearth_anon_id');

      if (!storedAnonId) {
        // Generate a new anonymous ID
        storedAnonId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        localStorage.setItem('lucyearth_anon_id', storedAnonId);
      }

      setAnonId(storedAnonId);

      // Check if user exists in database
      const { data: existingUser } = await supabase
        .from('anon_users')
        .select('*')
        .eq('anon_id', storedAnonId)
        .single();

      if (existingUser) {
        setCatClicks(existingUser.cat_clicks);
        setShowCatIcon(existingUser.cat_clicks > 10);
        setUserNumber(existingUser.user_number || 0);
      } else {
        // Create new anonymous user record
        const { data: newUser } = await supabase
          .from('anon_users')
          .insert({ anon_id: storedAnonId, cat_clicks: 0 })
          .select()
          .single();

        if (newUser) {
          setUserNumber(newUser.user_number || 0);
        }
      }
    };

    initAnonUser();
  }, []);

  useEffect(() => {
    setMounted(true);

    // Check if user is logged in
    const isLoggedIn = localStorage.getItem('lucyearth_edit_mode') === 'true';
    setIsEditMode(isLoggedIn);

    // Generate stable orb positions once
    const generatedOrbs = [...Array(8)].map(() => ({
      size: 100 + Math.random() * 200,
      left: Math.random() * 100,
      top: Math.random() * 100,
      duration: 8 + Math.random() * 4,
      delay: Math.random() * 2,
    }));
    setOrbs(generatedOrbs);

    const interval = setInterval(() => {
      setScore((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-white overflow-hidden flex flex-col">
      {/* Floating orbs background */}
      {mounted && orbs.length > 0 && (
        <div className="fixed inset-0 pointer-events-none opacity-20">
          {orbs.map((orb, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-gradient-to-br from-blue-400 to-purple-400 blur-3xl"
              style={{
                width: `${orb.size}px`,
                height: `${orb.size}px`,
                left: `${orb.left}%`,
                top: `${orb.top}%`,
                animation: `float ${orb.duration}s ease-in-out infinite`,
                animationDelay: `${orb.delay}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Left sidebar icons */}
      <div className="fixed left-6 top-1/2 transform -translate-y-1/2 z-20 grid grid-cols-2 gap-4 gap-x-6 max-sm:left-auto max-sm:top-auto max-sm:bottom-4 max-sm:right-0 max-sm:transform-none max-sm:flex max-sm:flex-row max-sm:gap-4 max-sm:w-full max-sm:justify-center max-sm:px-4">
        {/* Poop Cal icon - first position on desktop */}
        <div className="flex flex-col items-center gap-2 max-sm:flex-col max-sm:gap-2">
          {/* Poop Cal icon */}
          <div className="flex flex-col items-center gap-2 max-sm:gap-0">
            <div
              onClick={() => {
                setShowPoopCalendar(true);
                logActivity('Opened Poop Calendar', 'Viewed poop tracking calendar');
              }}
              className="w-[51px] h-[51px] bg-white flex items-center justify-center text-2xl cursor-pointer hover:bg-blue-500 hover:translate-x-1 hover:translate-y-1 transition-all max-sm:w-12 max-sm:h-12 max-sm:text-2xl max-sm:flex-col max-sm:pt-1"
              style={{
                boxShadow: '0 0 0 4px #000, 4px 4px 0 4px #000',
                imageRendering: 'pixelated',
              }}
            >
              <span className="max-sm:text-lg">💩</span>
              <span className="hidden max-sm:block max-sm:text-[8px] max-sm:leading-none max-sm:mt-0.5">POOP.CAL</span>
            </div>
            <div className="text-[15px] text-gray-900 max-sm:hidden">POOP.CAL</div>
          </div>

          {/* Douban icon - only visible on mobile, appears below Poop Cal */}
          <div className="hidden max-sm:flex max-sm:flex-col max-sm:items-center max-sm:gap-0">
            <div
              onClick={() => {
                setShowDoubanModal(true);
                logActivity('Opened Douban', 'Viewed Douban ratings');
              }}
              className="w-12 h-12 bg-white flex items-center justify-center text-2xl cursor-pointer hover:bg-green-500 transition-all flex-col pt-1"
              style={{
                boxShadow: '0 0 0 4px #000, 4px 4px 0 4px #000',
                imageRendering: 'pixelated',
              }}
            >
              <span className="text-green-600 font-bold text-lg">豆</span>
              <span className="text-[8px] leading-none mt-0.5">DOUBAN</span>
            </div>
          </div>
        </div>

        {/* Douban icon - second position on desktop (right of POOP.CAL) */}
        <div className="flex flex-col items-center gap-2 max-sm:hidden">
          <div
            onClick={() => {
              setShowDoubanModal(true);
              logActivity('Opened Douban', 'Viewed Douban ratings');
            }}
            className="w-[51px] h-[51px] bg-white flex items-center justify-center text-2xl cursor-pointer hover:bg-green-500 hover:translate-x-1 hover:translate-y-1 transition-all"
            style={{
              boxShadow: '0 0 0 4px #000, 4px 4px 0 4px #000',
              imageRendering: 'pixelated',
            }}
          >
            <span className="text-green-600 font-bold">豆</span>
          </div>
          <div className="text-[15px] text-gray-900">DOUBAN</div>
        </div>

        {/* Are.na icon */}
        <div className="flex flex-col items-center gap-2 max-sm:gap-0">
          <div
            onClick={() => {
              setShowArenaModal(true);
              logActivity('Opened Are.na', 'Viewed Arena collections');
            }}
            className="w-[51px] h-[51px] bg-white flex items-center justify-center text-xl cursor-pointer hover:bg-blue-500 hover:translate-x-1 hover:translate-y-1 transition-all max-sm:w-12 max-sm:h-12 max-sm:text-xl max-sm:flex-col max-sm:pt-1"
            style={{
              boxShadow: '0 0 0 4px #000, 4px 4px 0 4px #000',
              imageRendering: 'pixelated',
            }}
          >
            <span className="max-sm:text-sm">**</span>
            <span className="hidden max-sm:block max-sm:text-[8px] max-sm:leading-none max-sm:mt-0.5">ARE.NA</span>
          </div>
          <div className="text-[15px] text-gray-900 max-sm:hidden">ARE.NA</div>
        </div>

        {/* Empty space */}
        <div className="max-sm:hidden"></div>

        {/* Hidden cat icon - only shows after 10+ clicks */}
        {showCatIcon && (
          <div className="flex flex-col items-center gap-2 animate-fadeIn max-sm:gap-0">
            <div
              onClick={() => {
                setShowCatProfile(true);
                logActivity('Opened Cat Profile', 'Clicked on the Cat app icon');
              }}
              className="w-[51px] h-[51px] bg-white flex items-center justify-center text-2xl cursor-pointer hover:bg-orange-400 hover:translate-x-1 hover:translate-y-1 transition-all max-sm:w-12 max-sm:h-12 max-sm:text-2xl max-sm:flex-col max-sm:pt-1"
              style={{
                boxShadow: '0 0 0 4px #000, 4px 4px 0 4px #000',
                imageRendering: 'pixelated',
              }}
            >
              <span className="max-sm:text-lg">🐱</span>
              <span className="hidden max-sm:block max-sm:text-[8px] max-sm:leading-none max-sm:mt-0.5">CATS</span>
            </div>
            <div className="text-[15px] text-gray-900 max-sm:hidden">CATS</div>
          </div>
        )}

        {/* Empty space - only when cats is showing */}
        {showCatIcon && (
          <div className="max-sm:hidden"></div>
        )}

        {/* Journal icon - always visible */}
        <div className="flex flex-col items-center gap-2 max-sm:gap-0">
          <div
            onClick={() => {
              setShowJournal(true);
              logActivity('Opened Journal', 'Viewing journal entries');
            }}
            className="w-[51px] h-[51px] bg-white flex items-center justify-center text-xl cursor-pointer hover:bg-amber-200 hover:translate-x-1 hover:translate-y-1 transition-all max-sm:w-12 max-sm:h-12 max-sm:text-xl max-sm:flex-col max-sm:pt-1"
            style={{
              boxShadow: '0 0 0 4px #000, 4px 4px 0 4px #000',
              imageRendering: 'pixelated',
            }}
          >
            <span className="max-sm:text-base">📘</span>
            <span className="hidden max-sm:block max-sm:text-[8px] max-sm:leading-none max-sm:mt-0.5">JOUR</span>
          </div>
          <div className="text-[15px] text-gray-900 max-sm:hidden">JOURNAL</div>
        </div>

        {/* Empty space */}
        <div className="max-sm:hidden"></div>

        {/* Activity Log icon - always visible */}
        <div className="flex flex-col items-center gap-2 max-sm:gap-0">
          <div
            onClick={() => {
              setShowActivityLog(true);
              logActivity('Opened Activity Log', 'Viewed activity history');
            }}
            className="w-[51px] h-[51px] bg-white flex items-center justify-center text-xl cursor-pointer hover:bg-purple-400 hover:translate-x-1 hover:translate-y-1 transition-all max-sm:w-12 max-sm:h-12 max-sm:text-xl max-sm:flex-col max-sm:pt-1"
            style={{
              boxShadow: '0 0 0 4px #000, 4px 4px 0 4px #000',
              imageRendering: 'pixelated',
            }}
          >
            <span className="max-sm:text-base">📋</span>
            <span className="hidden max-sm:block max-sm:text-[8px] max-sm:leading-none max-sm:mt-0.5">LOG</span>
          </div>
          <div className="text-[15px] text-gray-900 max-sm:hidden">LOG</div>
        </div>

        {/* Empty space */}
        <div className="max-sm:hidden"></div>

        {/* Lock icon */}
        <div className="flex flex-col items-center gap-2 max-sm:gap-0">
          <div
            onClick={() => {
              if (isEditMode) {
                // Logout
                localStorage.removeItem('lucyearth_edit_mode');
                setIsEditMode(false);
              } else {
                // Show login modal
                setShowLoginModal(true);
              }
            }}
            className={`w-[51px] h-[51px] bg-white flex items-center justify-center text-xl cursor-pointer hover:translate-x-1 hover:translate-y-1 transition-all max-sm:w-12 max-sm:h-12 max-sm:text-xl max-sm:flex-col max-sm:pt-1 ${
              isEditMode ? 'hover:bg-red-500' : 'hover:bg-green-500'
            }`}
            style={{
              boxShadow: '0 0 0 4px #000, 4px 4px 0 4px #000',
              imageRendering: 'pixelated',
            }}
          >
            <span className="max-sm:text-base">{isEditMode ? '🔓' : '🔒'}</span>
            <span className="hidden max-sm:block max-sm:text-[8px] max-sm:leading-none max-sm:mt-0.5">
              {isEditMode ? 'LOCK' : 'LOGIN'}
            </span>
          </div>
          <div className="text-[15px] text-gray-900 max-sm:hidden">
            {isEditMode ? 'LOCK' : 'LOGIN'}
          </div>
        </div>

        {/* Empty space */}
        <div className="max-sm:hidden"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 p-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 animate-pulse" />
          <div className="text-base">lucyearth.system</div>
        </div>
        <div className="flex gap-4 text-sm text-gray-500 items-center">
          <button
            onClick={() => {
              setShowAchievements(true);
              logActivity('Opened Achievements', 'Viewing achievements');
            }}
            className="text-2xl hover:scale-110 transition-transform cursor-pointer"
          >
            🏆
          </button>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-blue-500" />
            <span>{String(score).padStart(4, '0')}</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 container mx-auto px-6 py-20 max-w-5xl flex-grow flex items-center justify-center">
        <div className="relative flex flex-col items-center w-full">
          <img
            src="/gifs/oranges.gif"
            alt="Orange cats"
            className="h-auto cursor-pointer hover:scale-105 transition-transform max-sm:w-[80%]"
            style={{ imageRendering: 'pixelated', width: '50%' }}
            onClick={async (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              const id = Date.now();

              setPets(prev => [...prev, { id, x, y }]);

              setTimeout(() => {
                setPets(prev => prev.filter(pet => pet.id !== id));
              }, 1000);

              // Update click count in database
              if (anonId) {
                const newClickCount = catClicks + 1;
                setCatClicks(newClickCount);

                // Log the cat pat
                logActivity('Petted the cat', `Cat pat #${newClickCount}`);

                await supabase
                  .from('anon_users')
                  .update({ cat_clicks: newClickCount })
                  .eq('anon_id', anonId);

                // Show cat icon if clicks > 10
                if (newClickCount === 10) {
                  setShowCatIcon(true);
                  logActivity('Discovered hidden Cat app', 'Unlocked the secret Cat profile after 10 pats!');
                } else if (newClickCount > 10 && !showCatIcon) {
                  setShowCatIcon(true);
                }

                // Show progressive messages - don't let clicks override the message timer
                let message = '';
                let duration = 2000; // Default 2 seconds

                if (newClickCount === 3) {
                  message = '😽 Meow~';
                } else if (newClickCount === 5) {
                  message = '😻 Keep Going';
                } else if (newClickCount === 8) {
                  message = '😼 Almost There!';
                } else if (newClickCount === 10) {
                  message = "🎁 I think we're friends now! Check out the Cat app.";
                  duration = 10000; // 10 seconds for the final message
                }

                if (message) {
                  // Clear any existing timeout to start fresh
                  if (messageTimeoutId) {
                    clearTimeout(messageTimeoutId);
                  }

                  setCatMessage(message);
                  const newTimeoutId = setTimeout(() => {
                    setCatMessage('');
                    setMessageTimeoutId(null);
                  }, duration);
                  setMessageTimeoutId(newTimeoutId);
                }
              }
            }}
          />
          {pets.map(pet => (
            <div
              key={pet.id}
              className="absolute pointer-events-none text-2xl font-bold"
              style={{
                left: `${pet.x}px`,
                top: `${pet.y}px`,
                animation: 'float-up 1s ease-out forwards',
              }}
            >
              ❤️ +1
            </div>
          ))}
          {catMessage && (
            <div className="mt-4 text-2xl font-bold text-center animate-fadeIn max-sm:text-lg max-sm:px-4">
              {catMessage}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 p-8 mt-auto">
        <div className="text-center">
          <div className="text-sm text-gray-400">
            © 2025 LUCYEARTH
          </div>
        </div>
      </footer>

      {/* Poop Calendar Modal */}
      <PoopCalendar
        isOpen={showPoopCalendar}
        onClose={() => setShowPoopCalendar(false)}
        isEditMode={isEditMode}
        anonId={anonId}
        onLogActivity={logActivity}
      />

      {/* Login Modal */}
      {showLoginModal && (
        <LoginModal
          onSuccess={() => {
            localStorage.setItem('lucyearth_edit_mode', 'true');
            setIsEditMode(true);
            setShowLoginModal(false);
            logActivity('Successful login', 'User logged in as admin');
          }}
          onClose={() => setShowLoginModal(false)}
          onFailedAttempt={() => logActivity('Failed login attempt', 'Incorrect password entered')}
        />
      )}

      {/* Cat Profile Modal */}
      <CatProfile
        isOpen={showCatProfile}
        onClose={() => setShowCatProfile(false)}
        anonId={anonId}
        isEditMode={isEditMode}
      />

      {/* Activity Log Modal */}
      <ActivityLog
        isOpen={showActivityLog}
        onClose={() => setShowActivityLog(false)}
        anonId={anonId}
        userNumber={userNumber}
      />

      {/* Arena Modal */}
      <ArenaModal
        isOpen={showArenaModal}
        onClose={() => setShowArenaModal(false)}
        isEditMode={isEditMode}
        anonId={anonId}
        onLogActivity={logActivity}
      />

      {/* Journal Modal */}
      <Journal
        isOpen={showJournal}
        onClose={() => setShowJournal(false)}
        isEditMode={isEditMode}
        anonId={anonId}
        onLogActivity={logActivity}
      />

      {/* Achievements Modal */}
      <Achievements
        isOpen={showAchievements}
        onClose={() => setShowAchievements(false)}
        catClicks={catClicks}
      />

      {/* Douban Modal */}
      <DoubanModal
        isOpen={showDoubanModal}
        onClose={() => setShowDoubanModal(false)}
        anonId={anonId}
        isEditMode={isEditMode}
        onLogActivity={logActivity}
      />
    </div>
  );
}

// Login Modal Component
function LoginModal({
  onSuccess,
  onClose,
  onFailedAttempt
}: {
  onSuccess: () => void;
  onClose: () => void;
  onFailedAttempt: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Simple password check - you can change this password
    // For better security, we're using a hash comparison
    const correctPasswordHash = 'le25'; // Change this to your desired password

    if (password === correctPasswordHash) {
      onSuccess();
    } else {
      setError('Incorrect password');
      setPassword('');
      onFailedAttempt();
    }
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border-4 border-gray-900 max-w-md w-full p-6">
        <h2 className="text-xl mb-4">ENTER PASSWORD</h2>
        <p className="text-sm text-gray-600 mb-4">
          If you don&apos;t know the password, you&apos;re not admin. Please exit.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            placeholder="Password"
            className="w-full px-3 py-2 border-2 border-gray-900 text-sm mb-2"
            autoFocus
          />
          {error && (
            <div className="text-red-500 text-xs mb-4">{error}</div>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 px-4 py-2 border-2 border-gray-900 hover:bg-green-500 hover:text-white text-xs cursor-pointer"
            >
              LOGIN
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border-2 border-gray-900 hover:bg-red-500 hover:text-white text-xs cursor-pointer"
            >
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
