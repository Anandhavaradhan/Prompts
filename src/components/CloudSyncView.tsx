import React from 'react';
import {
  Cloud,
  ShieldCheck,
  UploadCloud,
  LogIn,
  LogOut,
  Download,
  Database,
  CheckCircle2,
} from 'lucide-react';
import {
  FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  type User,
} from '../firebase';
import type { PromptRecord } from '../utils/promptLogic';

interface CloudSyncViewProps {
  user: User | null;
  cloudPromptsCount: number;
  localPromptsCount: number;
  isSyncing: boolean;
  syncStatusMessage: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onSyncLocalToCloud: () => void;
  onSeedStarterPromptsToCloud: () => void;
  onExportJson: () => void;
  prompts: PromptRecord[];
}

export const CloudSyncView: React.FC<CloudSyncViewProps> = ({
  user,
  cloudPromptsCount,
  localPromptsCount,
  isSyncing,
  syncStatusMessage,
  onSignIn,
  onSignOut,
  onSyncLocalToCloud,
  onSeedStarterPromptsToCloud,
  onExportJson,
}) => {
  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Firebase Cloud Firestore Repository
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Prompts are persisted in Google Cloud Firestore with zero-trust attribute-based access control rules isolating each user’s vault.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out ({user.email || user.displayName || 'Connected'})
              </button>
            ) : (
              <button
                type="button"
                onClick={onSignIn}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign in with Google to Sync Cloud
              </button>
            )}
          </div>
        </div>

        {syncStatusMessage && (
          <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{syncStatusMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 mt-6 pt-6 border-t border-slate-200">
          <div className="pb-4 md:pb-0 md:pr-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 mb-3">
              <Database className="w-4 h-4 text-indigo-600" />
              Firestore Instance
            </div>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Project ID</dt>
                <dd className="font-mono text-slate-900 truncate">{FIREBASE_PROJECT_ID}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Database</dt>
                <dd className="font-mono text-slate-900 truncate max-w-[180px]" title={FIRESTORE_DATABASE_ID}>
                  {FIRESTORE_DATABASE_ID}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Collection Path</dt>
                <dd className="font-mono text-slate-900">/prompts/{'{promptId}'}</dd>
              </div>
            </dl>
          </div>

          <div className="py-4 md:py-0 md:px-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 mb-3">
              <Cloud className="w-4 h-4 text-indigo-600" />
              Vault Storage Telemetry
            </div>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Auth State</dt>
                <dd className="font-medium text-slate-900">
                  {user ? 'Authenticated (Google)' : 'Local Staging Mode'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Cloud Prompts</dt>
                <dd className="font-mono text-slate-900 tabular-nums">{cloudPromptsCount}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Local Prompts</dt>
                <dd className="font-mono text-slate-900 tabular-nums">{localPromptsCount}</dd>
              </div>
            </dl>
          </div>

          <div className="pt-4 md:pt-0 md:pl-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 mb-3">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              Security Rules Contract
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Enforces <code className="font-mono text-slate-800">ownerId == request.auth.uid</code>, verified email checks, strict field allowlists, and server timestamp integrity.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 mt-6 pt-6 border-t border-slate-200">
          <div className="flex flex-wrap items-center gap-3">
            {user && (
              <>
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={onSyncLocalToCloud}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  {isSyncing ? 'Uploading to Firestore...' : `Upload Local Prompts to Cloud (${localPromptsCount})`}
                </button>
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={onSeedStarterPromptsToCloud}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  Seed Starter Library to Firestore
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onExportJson}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export Vault JSON
          </button>
        </div>
      </div>
    </div>
  );
};
