'use client';

import React from 'react';

interface SubstackModalProps {
  isOpen: boolean;
  onClose: () => void;
  anonId: string;
  isEditMode: boolean;
  onLogActivity: (action: string, details?: string) => void;
}

// Placeholder links - will be replaced with actual data later
const substackLinks = [
  { id: 1, title: 'Example Substack 1', url: 'https://example.substack.com' },
  { id: 2, title: 'Example Substack 2', url: 'https://example2.substack.com' },
];

export default function SubstackModal({
  isOpen,
  onClose,
  anonId,
  isEditMode,
  onLogActivity
}: SubstackModalProps) {
  if (!isOpen) return null;

  const handleLinkClick = (title: string, url: string) => {
    onLogActivity('Opened Substack Link', `Clicked: ${title}`);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div
          className="bg-white w-full max-w-2xl max-h-[80vh] flex flex-col"
          style={{
            border: '4px solid #000',
            boxShadow: '8px 8px 0 0 #000',
          }}
        >
          {/* Header */}
          <div
            style={{ borderBottom: '4px solid #000' }}
            className="p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">📰</span>
              <h2 className="text-2xl font-bold text-gray-900">SUBSTACK</h2>
            </div>
            <button
              onClick={onClose}
              className="text-2xl hover:text-red-500 font-bold transition-colors"
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              {substackLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => handleLinkClick(link.title, link.url)}
                  className="w-full p-4 bg-white border-4 border-gray-900 hover:bg-orange-100 hover:translate-x-1 hover:translate-y-1 transition-all text-left"
                  style={{
                    boxShadow: '4px 4px 0 0 #000',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900">{link.title}</span>
                    <span className="text-gray-600">→</span>
                  </div>
                </button>
              ))}
            </div>

            {substackLinks.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg">No Substack links yet.</p>
                <p className="text-sm mt-2">Links will be added here soon!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
