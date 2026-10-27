import { useRef, useState, type ChangeEvent } from 'react';
import { Download, Upload } from 'lucide-react';
import {
  importLibraryBackupJson,
  triggerLibraryBackupDownload,
} from '../../services/storage/libraryBackup';

export interface LibraryBackupControlsProps {
  hasEntries?: boolean;
}

export function LibraryBackupControls({ hasEntries = true }: LibraryBackupControlsProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: 'ok' | 'error';
    text: string;
  } | null>(null);

  const handleExport = () => {
    try {
      triggerLibraryBackupDownload();
      setFeedback({
        tone: 'ok',
        text: 'Library backup downloaded.',
      });
    } catch {
      setFeedback({
        tone: 'error',
        text: 'Unable to export backup file in this browser.',
      });
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.size > 1_048_576) {
      setFeedback({
        tone: 'error',
        text: 'Backup file exceeds the 1 MB maximum size limit.',
      });
      return;
    }

    try {
      const text = await file.text();
      const summary = importLibraryBackupJson(text);
      const parts: string[] = [];
      if (summary.importedFavorites > 0) {
        parts.push(
          `${summary.importedFavorites} favorite${summary.importedFavorites === 1 ? '' : 's'}`,
        );
      }
      if (summary.importedWatchlist > 0) {
        parts.push(
          `${summary.importedWatchlist} watchlist item${
            summary.importedWatchlist === 1 ? '' : 's'
          }`,
        );
      }
      if (summary.importedHistory > 0) {
        parts.push(
          `${summary.importedHistory} history entr${summary.importedHistory === 1 ? 'y' : 'ies'}`,
        );
      }
      if (summary.importedWatchedSeries > 0) {
        parts.push(
          `${summary.importedWatchedSeries} episode progress log${
            summary.importedWatchedSeries === 1 ? '' : 's'
          }`,
        );
      }
      setFeedback({
        tone: 'ok',
        text:
          parts.length > 0
            ? `Imported ${parts.join(', ')}.`
            : 'Backup verified — all entries are already up to date.',
      });
    } catch (err) {
      setFeedback({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Could not parse backup file.',
      });
    }
  };

  return (
    <div className="library-backup-bar">
      <div className="library-backup-bar__actions">
        <button
          type="button"
          className="btn btn--secondary btn--compact"
          disabled={!hasEntries}
          onClick={handleExport}
        >
          <Download size={14} aria-hidden="true" />
          <span>Export Backup</span>
        </button>

        <button
          type="button"
          className="btn btn--ghost btn--compact"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={14} aria-hidden="true" />
          <span>Import JSON</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          aria-label="Import Solfain library backup JSON"
          style={{ display: 'none' }}
          onChange={(e) => void handleFileChange(e)}
        />
      </div>

      {feedback && (
        <p
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={`library-backup-bar__feedback${
            feedback.tone === 'error' ? ' library-backup-bar__feedback--error' : ''
          }`}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
