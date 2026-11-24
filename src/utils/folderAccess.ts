import { StoredFolderRecord } from '../types/music';
import { promptOpenDirectory, verifyHandlePermission } from '../services/directoryAccess';

/** Requests access on user interaction, retaining the original source namespace. */
export async function restoreFolderHandle(record: Pick<StoredFolderRecord, 'handle' | 'name'>): Promise<FileSystemDirectoryHandle | null> {
  const handle = record.handle || await promptOpenDirectory();
  if (!handle || (!record.handle && handle.name !== record.name)) return null;
  return await verifyHandlePermission(handle, true) ? handle : null;
}
