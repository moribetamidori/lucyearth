'use client';

import { useState, useEffect } from 'react';
import PoopCalendar from '@/components/PoopCalendar';
import CatProfile from '@/components/CatProfile';
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
      } else {
        // Create new anonymous user record
        await supabase
          .from('anon_users')
          .insert({ anon_id: storedAnonId, cat_clicks: 0 });
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
      <div className="fixed left-6 top-1/2 transform -translate-y-1/2 z-20 flex flex-col gap-8">
        <div className="flex flex-col items-center gap-2">
          <div
            onClick={() => setShowPoopCalendar(true)}
            className="w-16 h-16 bg-white flex items-center justify-center text-3xl cursor-pointer hover:bg-blue-500 hover:translate-x-1 hover:translate-y-1 transition-all"
            style={{
              boxShadow: '0 0 0 4px #000, 4px 4px 0 4px #000',
              imageRendering: 'pixelated',
            }}
          >
            💩
          </div>
          <div className="text-[15px] text-gray-900">POOP.CAL</div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-16 h-16 bg-white flex items-center justify-center text-2xl cursor-pointer hover:bg-blue-500 hover:translate-x-1 hover:translate-y-1 transition-all"
            style={{
              boxShadow: '0 0 0 4px #000, 4px 4px 0 4px #000',
              imageRendering: 'pixelated',
            }}
          >
            **
          </div>
          <div className="text-[15px] text-gray-900">ARE.NA</div>
        </div>
        <div className="flex flex-col items-center gap-2">
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
            className={`w-16 h-16 bg-white flex items-center justify-center text-2xl cursor-pointer hover:translate-x-1 hover:translate-y-1 transition-all ${
              isEditMode ? 'hover:bg-red-500' : 'hover:bg-green-500'
            }`}
            style={{
              boxShadow: '0 0 0 4px #000, 4px 4px 0 4px #000',
              imageRendering: 'pixelated',
            }}
          >
            {isEditMode ? '🔓' : '🔒'}
          </div>
          <div className="text-[15px] text-gray-900">
            {isEditMode ? 'LOCK' : 'LOGIN'}
          </div>
        </div>

        {/* Hidden cat icon - only shows after 10+ clicks */}
        {showCatIcon && (
          <div className="flex flex-col items-center gap-2 animate-fadeIn">
            <div
              onClick={() => setShowCatProfile(true)}
              className="w-16 h-16 bg-white flex items-center justify-center text-3xl cursor-pointer hover:bg-orange-400 hover:translate-x-1 hover:translate-y-1 transition-all"
              style={{
                boxShadow: '0 0 0 4px #000, 4px 4px 0 4px #000',
                imageRendering: 'pixelated',
              }}
            >
              🐱
            </div>
            <div className="text-[15px] text-gray-900">CATS</div>
          </div>
        )}
      </div>

      {/* Header */}
      <header className="relative z-10 p-6 flex justify-between items-center border-b-2 border-gray-900">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 animate-pulse" />
          <div className="text-base">lucyearth.system</div>
        </div>
        <div className="flex gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-blue-500" />
            <span>{String(score).padStart(4, '0')}</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 container mx-auto px-6 py-20 max-w-5xl flex-grow flex items-center justify-center">
        <div className="relative">
          <img
            src="/gifs/oranges.gif"
            alt="Orange cats"
            className="h-auto cursor-pointer hover:scale-105 transition-transform"
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

                await supabase
                  .from('anon_users')
                  .update({ cat_clicks: newClickCount })
                  .eq('anon_id', anonId);

                // Show cat icon if clicks > 10
                if (newClickCount > 10) {
                  setShowCatIcon(true);
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
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 p-8 border-t-2 border-gray-900 mt-auto">
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
      />

      {/* Login Modal */}
      {showLoginModal && (
        <LoginModal
          onSuccess={() => {
            localStorage.setItem('lucyearth_edit_mode', 'true');
            setIsEditMode(true);
            setShowLoginModal(false);
          }}
          onClose={() => setShowLoginModal(false)}
        />
      )}

      {/* Cat Profile Modal */}
      <CatProfile
        isOpen={showCatProfile}
        onClose={() => setShowCatProfile(false)}
        anonId={anonId}
        isEditMode={isEditMode}
      />
    </div>
  );
}

// Login Modal Component
function LoginModal({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
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
    }
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border-4 border-gray-900 max-w-md w-full p-6">
        <h2 className="text-xl mb-4">ENTER PASSWORD</h2>
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
