import React from 'react';
import {
  ShieldCheck,
  Disc,
  FileText,
  Sliders,
} from 'lucide-react';
import { OpenMusicControl } from './OpenMusicControl';

interface EmptyStateProps {
  isScanning?: boolean;
  scanCount?: number;
  onOpenFolder: () => void;
  onOpenFiles?: () => void;
  onFallbackFolderSelect: (files: FileList | null) => void;
  onOpenFilesSelect: (files: FileList | null) => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  isScanning,
  scanCount,
  onOpenFolder,
  onOpenFiles,
  onFallbackFolderSelect,
  onOpenFilesSelect,
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-4xl mx-auto text-center select-none">
      {/* Decorative Brand Glowing Icon */}
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-[#FF6B6B]/40 via-[#FF8A82]/30 to-[#FF6B6B]/20 p-[1px] shadow-2xl shadow-[#FF6B6B]/20">
          <div className="w-full h-full bg-slate-100 dark:bg-[#071427] rounded-[23px] flex items-center justify-center p-3">
            <img
              src="/favicon.svg"
              alt="Luna Music"
              className="w-14 h-14 object-contain drop-shadow-md"
            />
          </div>
        </div>
        <div className="absolute inset-0 rounded-3xl bg-[#FF6B6B]/20 blur-xl -z-10" />
      </div>

      {/* Main Pitch */}
      <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight sm:text-4xl">
        Your Music, 100% Local & Private
      </h2>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 max-w-lg leading-relaxed">
        Experience your local audio files with Spotify-inspired aesthetics and MusicBee-style folder browsing. No uploads, no streaming limits, and zero tracking.
      </p>

      {/* Prominent Split Button */}
      <div className="mt-8 flex items-center justify-center">
        <OpenMusicControl
          variant="empty-state"
          isScanning={isScanning}
          scanCount={scanCount}
          onOpenFolder={onOpenFolder}
          onOpenFiles={onOpenFiles}
          onFallbackFolderSelect={onFallbackFolderSelect}
          onOpenFilesSelect={onOpenFilesSelect}
        />
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-12 w-full text-left">
        <div className="p-4 rounded-2xl glass-panel space-y-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] dark:text-indigo-400 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Private & Local</h4>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
            Audio stays on your device. Zero server calls or telemetry.
          </p>
        </div>

        <div className="p-4 rounded-2xl glass-panel space-y-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Local LRC Lyrics</h4>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
            Synchronized lyric playback matching your local <code className="text-emerald-600 dark:text-emerald-300 font-semibold">.lrc</code> files.
          </p>
        </div>

        <div className="p-4 rounded-2xl glass-panel space-y-2">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-500 dark:text-sky-400 flex items-center justify-center">
            <Disc className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Hi-Res Ready</h4>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
            Plays FLAC, MP3, M4A/AAC, WAV, and OGG formats with metadata & artwork.
          </p>
        </div>

        <div className="p-4 rounded-2xl glass-panel space-y-2">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 dark:text-purple-400 flex items-center justify-center">
            <Sliders className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Keyboard Driven</h4>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
            Full keyboard shortcuts for playback, seeking, volume, and lyrics.
          </p>
        </div>
      </div>
    </div>
  );
};
