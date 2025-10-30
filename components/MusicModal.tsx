'use client';

import { useState, useEffect, RefObject } from 'react';
import { supabase } from '@/lib/supabase';
import { ActionButton } from './ActionButtons';
import { convertToWebP } from '@/lib/imageUpload';

interface Song {
  id: number;
  anon_id: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  file_url: string;
  cover_url: string | null;
  created_at: string;
}

interface MusicModalProps {
  isOpen: boolean;
  onClose: () => void;
  anonId: string;
  isEditMode: boolean;
  onLogActivity: (action: string, details?: string) => void;
  audioRef: RefObject<HTMLAudioElement | null>;
}

export default function MusicModal({ isOpen, onClose, anonId, isEditMode, onLogActivity, audioRef }: MusicModalProps) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentSongIndex, setCurrentSongIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Upload form state
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadArtist, setUploadArtist] = useState('');
  const [uploadAlbum, setUploadAlbum] = useState('');
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [selectedCoverFile, setSelectedCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);

  // Edit form state
  const [editingSongId, setEditingSongId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editAlbum, setEditAlbum] = useState('');
  const [editSelectedCoverFile, setEditSelectedCoverFile] = useState<File | null>(null);
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && anonId) {
      fetchSongs();
    }
  }, [isOpen, anonId]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration);
    const handleEnded = () => handleSongEnd();

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentSongIndex, repeatMode, isShuffle, songs]);

  const fetchSongs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setSongs(data);
    }
    setLoading(false);
  };

  const handleSongEnd = () => {
    if (repeatMode === 'one') {
      audioRef.current?.play();
    } else if (repeatMode === 'all' || isShuffle) {
      playNext();
    } else {
      setIsPlaying(false);
    }
  };

  const playSong = (index: number) => {
    setCurrentSongIndex(index);
    setIsPlaying(true);
    const song = songs[index];
    if (audioRef.current) {
      audioRef.current.src = song.file_url;
      audioRef.current.play();
    }
    onLogActivity('Played song', `Playing ${song.title}`);
  };

  const togglePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const playNext = () => {
    if (songs.length === 0 || currentSongIndex === null) return;

    let nextIndex: number;
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * songs.length);
    } else {
      nextIndex = (currentSongIndex + 1) % songs.length;
    }
    playSong(nextIndex);
  };

  const playPrevious = () => {
    if (songs.length === 0 || currentSongIndex === null) return;

    if (currentTime > 3) {
      // If more than 3 seconds in, restart current song
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
    } else {
      const prevIndex = currentSongIndex === 0 ? songs.length - 1 : currentSongIndex - 1;
      playSong(prevIndex);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const toggleShuffle = () => {
    setIsShuffle(!isShuffle);
  };

  const toggleRepeat = () => {
    const modes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one'];
    const currentIndex = modes.indexOf(repeatMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    setRepeatMode(nextMode);
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedCoverFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setCoverPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadSong = async () => {
    if (!uploadTitle.trim() || !selectedAudioFile) return;

    setIsUploading(true);

    // Upload audio file
    const audioExt = selectedAudioFile.name.split('.').pop();
    const audioFileName = `${anonId}/${Date.now()}.${audioExt}`;

    const { error: audioError } = await supabase.storage
      .from('songs')
      .upload(audioFileName, selectedAudioFile);

    if (audioError) {
      console.error('Audio upload error:', audioError);
      setIsUploading(false);
      return;
    }

    const { data: audioUrlData } = supabase.storage
      .from('songs')
      .getPublicUrl(audioFileName);

    // Upload cover if provided
    let coverUrl = null;
    if (selectedCoverFile) {
      // Convert to WebP
      const webpBlob = await convertToWebP(selectedCoverFile, 0.8);
      const coverFileName = `${anonId}/${Date.now()}.webp`;

      const { error: coverError } = await supabase.storage
        .from('song-covers')
        .upload(coverFileName, webpBlob, {
          contentType: 'image/webp',
        });

      if (!coverError) {
        const { data: coverUrlData } = supabase.storage
          .from('song-covers')
          .getPublicUrl(coverFileName);
        coverUrl = coverUrlData.publicUrl;
      }
    }

    // Get audio duration
    const audio = new Audio(URL.createObjectURL(selectedAudioFile));
    await new Promise((resolve) => {
      audio.addEventListener('loadedmetadata', resolve);
    });

    const { data, error } = await supabase
      .from('songs')
      .insert({
        anon_id: anonId,
        title: uploadTitle.trim(),
        artist: uploadArtist.trim() || null,
        album: uploadAlbum.trim() || null,
        duration: audio.duration,
        file_url: audioUrlData.publicUrl,
        cover_url: coverUrl,
      })
      .select()
      .single();

    if (!error && data) {
      setSongs([data, ...songs]);
      handleCancelUpload();
      onLogActivity('Uploaded song', `Uploaded ${uploadTitle}`);
    }

    setIsUploading(false);
  };

  const handleCancelUpload = () => {
    setShowUploadForm(false);
    setUploadTitle('');
    setUploadArtist('');
    setUploadAlbum('');
    setSelectedAudioFile(null);
    setSelectedCoverFile(null);
    setCoverPreview(null);
  };

  const handleDeleteSong = async (id: number) => {
    const { error } = await supabase
      .from('songs')
      .delete()
      .eq('id', id)
      .eq('anon_id', anonId);

    if (!error) {
      setSongs(songs.filter(song => song.id !== id));
      if (currentSongIndex !== null && songs[currentSongIndex]?.id === id) {
        setCurrentSongIndex(null);
        setIsPlaying(false);
      }
      onLogActivity('Deleted song', 'Removed a song');
    }
  };

  const handleEditSong = (song: Song) => {
    setEditingSongId(song.id);
    setEditTitle(song.title);
    setEditArtist(song.artist || '');
    setEditAlbum(song.album || '');
    setEditCoverPreview(song.cover_url);
    setEditSelectedCoverFile(null);
  };

  const handleEditCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEditSelectedCoverFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditCoverPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateSong = async () => {
    if (!editTitle.trim() || !editingSongId) return;

    setLoading(true);

    const existingSong = songs.find(s => s.id === editingSongId);
    let coverUrl = existingSong?.cover_url || null;

    // Upload new cover if selected
    if (editSelectedCoverFile) {
      // Convert to WebP
      const webpBlob = await convertToWebP(editSelectedCoverFile, 0.8);
      const coverFileName = `${anonId}/${Date.now()}.webp`;

      const { error: coverError } = await supabase.storage
        .from('song-covers')
        .upload(coverFileName, webpBlob, {
          contentType: 'image/webp',
        });

      if (!coverError) {
        const { data: coverUrlData } = supabase.storage
          .from('song-covers')
          .getPublicUrl(coverFileName);
        coverUrl = coverUrlData.publicUrl;

        // Delete old cover if it exists
        if (existingSong?.cover_url) {
          const oldFileName = existingSong.cover_url.split('/').pop();
          if (oldFileName) {
            await supabase.storage
              .from('song-covers')
              .remove([`${anonId}/${oldFileName}`]);
          }
        }
      }
    }

    const { data, error } = await supabase
      .from('songs')
      .update({
        title: editTitle.trim(),
        artist: editArtist.trim() || null,
        album: editAlbum.trim() || null,
        cover_url: coverUrl,
      })
      .eq('id', editingSongId)
      .eq('anon_id', anonId)
      .select()
      .single();

    if (!error && data) {
      setSongs(songs.map(song => song.id === editingSongId ? data : song));
      handleCancelEdit();
      onLogActivity('Updated song', `Updated ${editTitle}`);
    }

    setLoading(false);
  };

  const handleCancelEdit = () => {
    setEditingSongId(null);
    setEditTitle('');
    setEditArtist('');
    setEditAlbum('');
    setEditSelectedCoverFile(null);
    setEditCoverPreview(null);
  };

  if (!isOpen) return null;

  const currentSong = currentSongIndex !== null ? songs[currentSongIndex] : null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-b from-green-900 via-gray-900 to-black border-4 border-gray-900 w-full max-w-[95vw] h-[90vh] flex flex-col text-white">
        {/* Header */}
        <div className="border-b-4 border-gray-900 p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">MUSIC PLAYER</h2>
          <div className="flex items-center gap-3">
            {/* Upload Button */}
            {isEditMode && !showUploadForm && (
              <button
                onClick={() => setShowUploadForm(true)}
                className="px-3 py-1.5 bg-green-600 text-white hover:bg-green-500 transition-colors border-2 border-green-500 text-sm"
              >
                + Upload Song
              </button>
            )}
            <button
              onClick={onClose}
              className="text-2xl hover:text-green-400 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Songs List */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {/* Upload Form */}
            {isEditMode && showUploadForm && (
              <div className="mb-4 p-4 border-4 border-green-600 bg-gray-800">
                <h3 className="text-lg font-bold mb-3">UPLOAD SONG</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm mb-1">Title *</label>
                    <input
                      type="text"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      placeholder="Song title..."
                      className="w-full px-3 py-2 bg-gray-900 border-2 border-gray-700 text-sm text-white placeholder-gray-500"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Artist</label>
                    <input
                      type="text"
                      value={uploadArtist}
                      onChange={(e) => setUploadArtist(e.target.value)}
                      placeholder="Artist name..."
                      className="w-full px-3 py-2 bg-gray-900 border-2 border-gray-700 text-sm text-white placeholder-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Album</label>
                    <input
                      type="text"
                      value={uploadAlbum}
                      onChange={(e) => setUploadAlbum(e.target.value)}
                      placeholder="Album name..."
                      className="w-full px-3 py-2 bg-gray-900 border-2 border-gray-700 text-sm text-white placeholder-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Audio File *</label>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => setSelectedAudioFile(e.target.files?.[0] || null)}
                      className="w-full px-3 py-2 bg-gray-900 border-2 border-gray-700 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Cover Image</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleCoverSelect}
                      className="w-full px-3 py-2 bg-gray-900 border-2 border-gray-700 text-sm text-white"
                    />
                    {coverPreview && (
                      <div className="mt-2 relative inline-block">
                        <img
                          src={coverPreview}
                          alt="Cover preview"
                          className="w-32 h-32 object-cover border-2 border-gray-700"
                        />
                        <button
                          onClick={() => {
                            setSelectedCoverFile(null);
                            setCoverPreview(null);
                          }}
                          className="absolute top-1 right-1 bg-red-600 text-white px-2 py-1 text-xs hover:bg-red-500 border border-gray-900"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleUploadSong}
                      disabled={isUploading || !uploadTitle.trim() || !selectedAudioFile}
                      className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all border-2 border-green-500"
                    >
                      {isUploading ? 'UPLOADING...' : 'UPLOAD'}
                    </button>
                    <button
                      onClick={handleCancelUpload}
                      className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white transition-all border-2 border-gray-600"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Songs List */}
            <div className="space-y-2">
              <h3 className="text-lg font-bold mb-2">Library ({songs.length})</h3>
              {loading && songs.length === 0 && (
                <div className="text-center py-8 text-gray-400">Loading...</div>
              )}
              {!loading && songs.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  No songs yet. {isEditMode ? 'Upload your first song!' : ''}
                </div>
              )}
              {songs.map((song, index) => (
                editingSongId === song.id ? (
                  // Edit Form
                  <div key={song.id} className="mb-4 p-4 border-4 border-blue-500 bg-gray-800">
                    <h3 className="text-lg font-bold mb-3">EDIT SONG</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm mb-1">Title *</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-900 border-2 border-gray-700 text-sm text-white placeholder-gray-500"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Artist</label>
                        <input
                          type="text"
                          value={editArtist}
                          onChange={(e) => setEditArtist(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-900 border-2 border-gray-700 text-sm text-white placeholder-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Album</label>
                        <input
                          type="text"
                          value={editAlbum}
                          onChange={(e) => setEditAlbum(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-900 border-2 border-gray-700 text-sm text-white placeholder-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Cover Image</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleEditCoverSelect}
                          className="w-full px-3 py-2 bg-gray-900 border-2 border-gray-700 text-sm text-white"
                        />
                        {editCoverPreview && (
                          <div className="mt-2 relative inline-block">
                            <img
                              src={editCoverPreview}
                              alt="Cover preview"
                              className="w-32 h-32 object-cover border-2 border-gray-700"
                            />
                            <button
                              onClick={() => {
                                setEditSelectedCoverFile(null);
                                setEditCoverPreview(null);
                              }}
                              className="absolute top-1 right-1 bg-red-600 text-white px-2 py-1 text-xs hover:bg-red-500 border border-gray-900"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleUpdateSong}
                          disabled={loading || !editTitle.trim()}
                          className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all border-2 border-green-500"
                        >
                          {loading ? 'UPDATING...' : 'UPDATE'}
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white transition-all border-2 border-gray-600"
                        >
                          CANCEL
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Display Mode
                  <div
                    key={song.id}
                    className={`flex items-center gap-3 p-3 border-2 transition-colors cursor-pointer ${
                      currentSongIndex === index
                        ? 'bg-green-800 border-green-600'
                        : 'bg-gray-800/50 border-gray-700 hover:bg-gray-700/50'
                    }`}
                    onClick={() => playSong(index)}
                  >
                    {song.cover_url ? (
                      <img
                        src={song.cover_url}
                        alt={song.title}
                        className="w-12 h-12 object-cover border-2 border-gray-600 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-700 border-2 border-gray-600 flex items-center justify-center flex-shrink-0">
                        🎵
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{song.title}</div>
                      {song.artist && (
                        <div className="text-xs text-gray-400 truncate">{song.artist}</div>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatTime(song.duration || 0)}
                    </div>
                    {isEditMode && (
                      <div className="flex gap-1">
                        <ActionButton
                          variant="edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditSong(song);
                          }}
                        />
                        <ActionButton
                          variant="delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSong(song.id);
                          }}
                        />
                      </div>
                    )}
                  </div>
                )
              ))}
            </div>
          </div>

          {/* Player Controls */}
          {currentSong && (
            <div className="border-t-4 border-gray-900 bg-black/90 py-3 px-4">
              {/* Desktop Layout */}
              <div className="hidden md:grid grid-cols-[1fr_2fr_1fr] items-center gap-4 max-w-screen-2xl mx-auto">
                {/* Now Playing Info - Left Side */}
                <div className="flex items-center gap-3 min-w-0">
                  {currentSong.cover_url ? (
                    <img
                      src={currentSong.cover_url}
                      alt={currentSong.title}
                      className="w-14 h-14 object-cover border-2 border-gray-700 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 bg-gray-800 border-2 border-gray-700 flex items-center justify-center flex-shrink-0">
                      🎵
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate text-white">{currentSong.title}</div>
                    {currentSong.artist && (
                      <div className="text-xs text-gray-400 truncate">{currentSong.artist}</div>
                    )}
                  </div>
                </div>

                {/* Center - Controls and Progress */}
                <div className="flex flex-col items-center gap-1.5">
                  {/* Controls */}
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={toggleShuffle}
                      className={`text-base transition-colors ${
                        isShuffle ? 'text-green-500' : 'text-gray-500 hover:text-white'
                      }`}
                    >
                      🔀
                    </button>
                    <button
                      onClick={playPrevious}
                      className="text-xl text-white hover:scale-110 transition-transform"
                    >
                      ⏮
                    </button>
                    <button
                      onClick={togglePlayPause}
                      className="w-9 h-9 rounded-full border-2 border-white bg-white hover:scale-105 flex items-center justify-center text-lg transition-all text-black"
                    >
                      {isPlaying ? '⏸' : '▶'}
                    </button>
                    <button
                      onClick={playNext}
                      className="text-xl text-white hover:scale-110 transition-transform"
                    >
                      ⏭
                    </button>
                    <button
                      onClick={toggleRepeat}
                      className={`text-base transition-colors ${
                        repeatMode !== 'off' ? 'text-green-500' : 'text-gray-500 hover:text-white'
                      }`}
                    >
                      {repeatMode === 'one' ? '🔂' : '🔁'}
                    </button>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-10 text-right">{formatTime(currentTime)}</span>
                    <input
                      type="range"
                      min="0"
                      max={duration || 0}
                      value={currentTime}
                      onChange={handleSeek}
                      className="flex-1 h-1 bg-gray-700 appearance-none cursor-pointer slider"
                    />
                    <span className="text-xs text-gray-400 w-10">{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Right Side - Volume Control */}
                <div className="flex items-center gap-2 justify-end">
                  <span className="text-sm">🔊</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="w-24 h-1 bg-gray-700 appearance-none cursor-pointer slider"
                  />
                </div>
              </div>

              {/* Mobile Layout */}
              <div className="md:hidden flex items-center gap-3">
                {/* Album Cover */}
                {currentSong.cover_url ? (
                  <img
                    src={currentSong.cover_url}
                    alt={currentSong.title}
                    className="w-12 h-12 object-cover border-2 border-gray-700 flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 bg-gray-800 border-2 border-gray-700 flex items-center justify-center flex-shrink-0">
                    🎵
                  </div>
                )}

                {/* Song Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate text-white">{currentSong.title}</div>
                  {currentSong.artist && (
                    <div className="text-xs text-gray-400 truncate">{currentSong.artist}</div>
                  )}
                </div>

                {/* Play Button */}
                <button
                  onClick={togglePlayPause}
                  className="w-12 h-12 rounded-full bg-white hover:scale-105 flex items-center justify-center text-2xl transition-all text-black flex-shrink-0"
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #22c55e;
          cursor: pointer;
        }
        .slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #22c55e;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}
