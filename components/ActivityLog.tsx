'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface ActivityLogProps {
  isOpen: boolean;
  onClose: () => void;
  anonId: string;
  userNumber?: number;
  siteUpdateCount?: number;
  siteUpdateSummaries?: Array<{
    label: string;
    count: number;
  }>;
}

interface LogEntry {
  id: number;
  action: string;
  details: string | null;
  created_at: string;
}

export default function ActivityLog({
  isOpen,
  onClose,
  anonId,
  userNumber,
  siteUpdateCount = 0,
  siteUpdateSummaries = [],
}: ActivityLogProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('anon_id', anonId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error loading logs:', error);
      } else {
        setLogs(data || []);
      }
      setLoading(false);
    };

    if (isOpen && anonId) {
      loadLogs();
    }
  }, [isOpen, anonId]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

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
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-bold">ACTIVITY LOG</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 border-2 border-gray-900 hover:bg-red-500 hover:text-white flex items-center justify-center text-lg"
            >
              ×
            </button>
          </div>
          {userNumber !== undefined && userNumber > 0 && (
            <div className="text-center py-2 px-4 bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-gray-900">
              <div className="text-lg font-bold">
                Welcome, Earthling #{userNumber.toString().padStart(4, '0')}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                You are visitor number {userNumber} to this website
              </div>
            </div>
          )}
          {siteUpdateCount > 0 && (
            <div className="mt-3 border-2 border-gray-900 bg-red-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-bold text-sm">
                  {siteUpdateCount} update{siteUpdateCount === 1 ? '' : 's'} since your last visit
                </div>
                <div className="min-w-7 h-7 px-2 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center border-2 border-gray-900">
                  {siteUpdateCount > 99 ? '99+' : siteUpdateCount}
                </div>
              </div>
              {siteUpdateSummaries.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {siteUpdateSummaries.map((item) => (
                    <span
                      key={item.label}
                      className="inline-flex items-center gap-1 border-2 border-gray-900 bg-white px-2 py-1 text-xs font-semibold"
                    >
                      {item.label}
                      <span className="text-red-600">{item.count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading logs...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No activity yet. Start exploring!
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="border-2 border-gray-900 p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium">{log.action}</div>
                        {log.details && (
                          <div
                            className={`text-sm text-gray-600 ${log.action === 'Spun Slot Machine'
                                ? 'font-mono text-base text-gray-800'
                                : ''
                              }`}
                          >
                            {log.details}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 whitespace-nowrap">
                      {formatTime(log.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t-4 border-gray-900 p-4 text-center text-sm text-gray-600">
          Showing {logs.length} most recent activit{logs.length === 1 ? 'y' : 'ies'}
        </div>
      </div>
    </div>
  );
}
