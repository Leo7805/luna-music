import { useState, useEffect } from 'react';
import { Folder, ChevronRight, ChevronDown } from 'lucide-react';
import { FolderNode } from '../types/music';

export interface SubfolderTreeNodeProps {
  node: FolderNode;
  selectedPath: string;
  onSelect: (path: string) => void;
  depth: number;
}

export function SubfolderTreeNode({
  node,
  selectedPath,
  onSelect,
  depth,
}: SubfolderTreeNodeProps) {
  const isInside =
    selectedPath === node.relativePath ||
    selectedPath.startsWith(`${node.relativePath}/`);
  const [isOpen, setIsOpen] = useState<boolean>(isInside);
  const isSelected = selectedPath === node.relativePath;
  const hasSubfolders = node.subfolders.length > 0;

  useEffect(() => {
    if (isInside) {
      setIsOpen(true);
    }
  }, [isInside]);

  return (
    <div className="select-none">
      <div
        tabIndex={0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(node.relativePath);
          }
        }}
        className={`group flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer border transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 focus-visible:border-transparent ${
          isSelected
            ? 'bg-indigo-600/20 dark:bg-indigo-600/25 text-[#565ECF] dark:text-white font-medium border-indigo-500/30 shadow-sm'
            : 'border-transparent text-[#687995] dark:text-slate-300 hover:text-[#182238] dark:hover:text-white hover:bg-[#E9EDF7] dark:hover:bg-white/[0.04]'
        }`}
        style={{ paddingLeft: `${depth * 14 + 10}px` }}
        onClick={() => onSelect(node.relativePath)}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {hasSubfolders ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(!isOpen);
              }}
              aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
              className="p-0.5 rounded hover:bg-slate-300/60 dark:hover:bg-white/[0.1] text-slate-400 hover:text-slate-700 dark:hover:text-white shrink-0 cursor-pointer"
            >
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4.5 shrink-0" />
          )}

          <Folder className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-amber-500 dark:group-hover:text-amber-300" />
          <span className="truncate text-xs" title={node.name}>
            {node.name}
          </span>
        </div>

        {node.totalTrackCount > 0 && (
          <span className="text-[10px] text-[#687995] dark:text-slate-400 px-1.5 py-0.2 rounded bg-[#DDE4EF]/70 dark:bg-white/[0.04] shrink-0 font-medium">
            {node.totalTrackCount}
          </span>
        )}
      </div>

      {hasSubfolders && isOpen && (
        <div className="space-y-0.5 mt-0.5">
          {node.subfolders.map((child) => (
            <SubfolderTreeNode
              key={child.id}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export interface LegacyFolderTreeNodeProps {
  node: FolderNode;
  selectedPath: string;
  onSelect: (path: string) => void;
  depth: number;
  isRoot?: boolean;
}

export function LegacyFolderTreeNode({
  node,
  selectedPath,
  onSelect,
  depth,
  isRoot = false,
}: LegacyFolderTreeNodeProps) {
  const [isOpen, setIsOpen] = useState<boolean>(depth < 2);
  const isSelected = selectedPath === node.relativePath;
  const hasSubfolders = node.subfolders.length > 0;

  if (isRoot && node.id === 'root') {
    return (
      <div className="space-y-0.5">
        {node.subfolders.map((sub) => (
          <LegacyFolderTreeNode
            key={sub.id}
            node={sub}
            selectedPath={selectedPath}
            onSelect={onSelect}
            depth={0}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="select-none">
      <div
        tabIndex={0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(node.relativePath);
          }
        }}
        className={`group flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer border transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 focus-visible:border-transparent ${
          isSelected
            ? 'bg-indigo-600/20 dark:bg-indigo-600/25 text-[#565ECF] dark:text-white font-medium border-indigo-500/30 shadow-sm'
            : 'border-transparent text-[#687995] dark:text-slate-300 hover:text-[#182238] dark:hover:text-white hover:bg-[#E9EDF7] dark:hover:bg-white/[0.04]'
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => onSelect(node.relativePath)}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {hasSubfolders ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(!isOpen);
              }}
              className="p-0.5 rounded hover:bg-slate-300/60 dark:hover:bg-white/[0.1] text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4.5" />
          )}

          <Folder
            className={`w-3.5 h-3.5 shrink-0 ${
              isRoot ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 group-hover:text-amber-500 dark:group-hover:text-amber-300'
            }`}
          />
          <span className="truncate text-xs">{node.name}</span>
        </div>

        {node.totalTrackCount > 0 && (
          <span className="text-[10px] text-slate-500 dark:text-slate-400 px-1.5 py-0.2 rounded bg-slate-200/80 dark:bg-white/[0.04]">
            {node.totalTrackCount}
          </span>
        )}
      </div>

      {hasSubfolders && isOpen && (
        <div className="space-y-0.5">
          {node.subfolders.map((child) => (
            <LegacyFolderTreeNode
              key={child.id}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
