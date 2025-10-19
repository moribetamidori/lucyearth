'use client';

import { useState, useEffect } from 'react';
import PoopCalendar from '@/components/PoopCalendar';

export default function Home() {
  const [score, setScore] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
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
    <div className="min-h-screen bg-white overflow-hidden">
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
      <main className="relative z-10 container mx-auto px-6 py-20 max-w-5xl">
        {/* Animated Wireframe Airplane */}
        <div className="flex justify-center mb-32 mt-20">
          <div
            className="relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
              animation: 'float 4s ease-in-out infinite',
            }}
          >
            <svg
              width="400"
              height="300"
              viewBox="0 0 400 300"
              className={`transition-all duration-500 ${isHovered ? 'scale-110' : ''}`}
              style={{
                filter: isHovered ? 'drop-shadow(0 0 20px rgba(59, 130, 246, 0.5))' : 'none',
              }}
            >
              {/* Airplane body */}
              <path
                d="M 200 100 L 280 140 L 200 180 L 120 140 Z"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                className="animate-pulse"
              />

              {/* Wings */}
              <line x1="140" y1="140" x2="60" y2="120" stroke="#8b5cf6" strokeWidth="2" />
              <line x1="260" y1="140" x2="340" y2="120" stroke="#8b5cf6" strokeWidth="2" />
              <line x1="60" y1="120" x2="80" y2="160" stroke="#8b5cf6" strokeWidth="2" />
              <line x1="340" y1="120" x2="320" y2="160" stroke="#8b5cf6" strokeWidth="2" />
              <line x1="80" y1="160" x2="140" y2="140" stroke="#8b5cf6" strokeWidth="2" />
              <line x1="320" y1="160" x2="260" y2="140" stroke="#8b5cf6" strokeWidth="2" />

              {/* Tail */}
              <line x1="120" y1="140" x2="100" y2="100" stroke="#3b82f6" strokeWidth="2" />
              <line x1="100" y1="100" x2="110" y2="80" stroke="#3b82f6" strokeWidth="2" />
              <line x1="110" y1="80" x2="130" y2="130" stroke="#3b82f6" strokeWidth="2" />

              {/* Nose */}
              <line x1="280" y1="140" x2="320" y2="140" stroke="#3b82f6" strokeWidth="3" />

              {/* Interior lines */}
              <line x1="200" y1="100" x2="200" y2="180" stroke="#93c5fd" strokeWidth="1" opacity="0.5" />
              <line x1="160" y1="120" x2="240" y2="160" stroke="#93c5fd" strokeWidth="1" opacity="0.5" />
              <line x1="160" y1="160" x2="240" y2="120" stroke="#93c5fd" strokeWidth="1" opacity="0.5" />

              {/* Cockpit */}
              <circle cx="260" cy="140" r="8" fill="none" stroke="#3b82f6" strokeWidth="2" />

              {/* Engine details */}
              <circle cx="180" cy="120" r="4" fill="none" stroke="#8b5cf6" strokeWidth="1.5" />
              <circle cx="180" cy="160" r="4" fill="none" stroke="#8b5cf6" strokeWidth="1.5" />

              {/* Motion lines */}
              <line
                x1="100"
                y1="140"
                x2="60"
                y2="140"
                stroke="#93c5fd"
                strokeWidth="1"
                opacity="0.3"
                strokeDasharray="5,5"
              >
                <animate
                  attributeName="x1"
                  values="100;80;100"
                  dur="1s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="x2"
                  values="60;40;60"
                  dur="1s"
                  repeatCount="indefinite"
                />
              </line>
              <line
                x1="110"
                y1="150"
                x2="70"
                y2="150"
                stroke="#93c5fd"
                strokeWidth="1"
                opacity="0.2"
                strokeDasharray="5,5"
              >
                <animate
                  attributeName="x1"
                  values="110;90;110"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="x2"
                  values="70;50;70"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
              </line>
            </svg>
            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-sm text-gray-400 whitespace-nowrap">
              FLIGHT MODE ACTIVE
            </div>
          </div>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-32">
          <div className="glass-card p-8 text-center border-2 border-gray-900">
            <div className="text-4xl mb-4">◇</div>
            <div className="text-sm text-gray-400 mb-3">VELOCITY</div>
            <div className="text-2xl">0.99c</div>
          </div>
          <div className="glass-card p-8 text-center border-2 border-gray-900">
            <div className="text-4xl mb-4">◯</div>
            <div className="text-sm text-gray-400 mb-3">EFFICIENCY</div>
            <div className="text-2xl">99.9%</div>
          </div>
          <div className="glass-card p-8 text-center border-2 border-gray-900">
            <div className="text-4xl mb-4">△</div>
            <div className="text-sm text-gray-400 mb-3">PRECISION</div>
            <div className="text-2xl">∞</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap justify-center gap-4 mb-32">
          <button className="neo-button px-8 py-4 border-2 border-gray-900 text-base cursor-pointer hover:bg-blue-500 hover:text-white transition-colors">
            LAUNCH
          </button>
          <button className="neo-button px-8 py-4 border-2 border-gray-900 text-base cursor-pointer hover:bg-blue-500 hover:text-white transition-colors">
            EXPLORE
          </button>
          <button className="neo-button px-8 py-4 border-2 border-gray-900 text-base cursor-pointer hover:bg-blue-500 hover:text-white transition-colors">
            CONNECT
          </button>
        </div>

        {/* Timeline / Status */}
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="shimmer-line pb-6">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-400">SYSTEM</div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-500 animate-pulse" />
                <div className="text-sm text-gray-500">ONLINE</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-xl mb-2">247</div>
              <div className="text-sm text-gray-400">NODES</div>
            </div>
            <div>
              <div className="text-xl mb-2">1.2M</div>
              <div className="text-sm text-gray-400">TRANS</div>
            </div>
            <div>
              <div className="text-xl mb-2">∞</div>
              <div className="text-sm text-gray-400">POSSIBLE</div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-20 p-8 border-t-2 border-gray-900">
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
