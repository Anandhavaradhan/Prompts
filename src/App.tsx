import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Plus,
  Copy,
  Check,
  Sparkles,
  Cloud,
  CloudOff,
  LogIn,
  LogOut,
  Pin,
  Edit3,
  Trash2,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  auth,
  signInWithGoogle,
  signOutUser,
  subscribeToUserPrompts,
  createCloudPrompt,
  updateCloudPrompt,
  toggleCloudPromptPin,
  incrementCloudPromptUsage,
  deleteCloudPrompt,
  onAuthStateChanged,
  type User,
} from './firebase';
import {
  PROMPT_CATEGORIES,
  filterAndSortPrompts,
  rankPromptsBySemanticMatches,
  validatePromptDraft,
  type PromptRecord,
  type PromptDraftInput,
  type PromptCategory,
  type SemanticMatchItem,
} from './utils/promptLogic';
import { SEED_PROMPTS } from './data/seedPrompts';
import { semanticSearchPromptsWithGemini } from './utils/geminiClient';
import { PromptEditorModal } from './components/PromptEditorModal';

const LOCAL_STORAGE_KEY = 'promptvault_local_prompts_v1';

const CATEGORY_ACCENTS: Record<
  PromptCategory,
  { dot: string; borderHover: string }
> = {
  Coding: {
    dot: 'bg-blue-600',
    borderHover: 'hover:border-blue-600/60',
  },
  Writing: {
    dot: 'bg-amber-600',
    borderHover: 'hover:border-amber-600/60',
  },
  Analysis: {
    dot: 'bg-emerald-600',
    borderHover: 'hover:border-emerald-600/60',
  },
  System: {
    dot: 'bg-slate-800',
    borderHover: 'hover:border-slate-800/60',
  },
  Research: {
    dot: 'bg-indigo-600',
    borderHover: 'hover:border-indigo-600/60',
  },
  Creative: {
    dot: 'bg-rose-600',
    borderHover: 'hover:border-rose-600/60',
  },
};

export default function App() {
  // Auth & Firebase Sync State
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudPrompts, setCloudPrompts] = useState<PromptRecord[]>([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Local Prompts (used before sign-in or as immediate workspace)
  const [localPrompts, setLocalPrompts] = useState<PromptRecord[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return SEED_PROMPTS;
  });

  // Save local prompts to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localPrompts));
    } catch {
      // ignore
    }
  }, [localPrompts]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Gemini Semantic Search State
  const [geminiMatches, setGeminiMatches] = useState<SemanticMatchItem[] | null>(null);
  const [isGeminiSearching, setIsGeminiSearching] = useState(false);
  const [geminiSearchError, setGeminiSearchError] = useState<string | null>(null);

  // UI Feedback & Modal State
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PromptRecord | null>(null);
  const [deletingPromptId, setDeletingPromptId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2200);
  };

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      setAuthError(null);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to Firestore prompts when user is signed in
  useEffect(() => {
    if (!authReady || !user) {
      setCloudPrompts([]);
      setIsLoadingCloud(false);
      return;
    }

    setIsLoadingCloud(true);
    const unsubscribe = subscribeToUserPrompts(
      user.uid,
      (records) => {
        setCloudPrompts(records);
        setIsLoadingCloud(false);
      },
      (err) => {
        setAuthError(err.message);
        setIsLoadingCloud(false);
      }
    );

    return () => unsubscribe();
  }, [authReady, user]);

  // Active dataset: Cloud Firestore if signed in, otherwise Local Workspace
  const activePrompts = user ? cloudPrompts : localPrompts;

  // Clear Gemini semantic search results when search input is emptied
  useEffect(() => {
    if (!searchQuery.trim()) {
      setGeminiMatches(null);
      setGeminiSearchError(null);
    }
  }, [searchQuery]);

  // Filtered prompts and Gemini match reasons for the square grid
  const { filteredPrompts, geminiReasonsById } = useMemo(() => {
    if (geminiMatches !== null && searchQuery.trim().length > 0) {
      const categoryScoped =
        selectedCategory === 'All'
          ? activePrompts
          : activePrompts.filter((p) => p.category === selectedCategory);
      const { rankedPrompts, reasonsById } = rankPromptsBySemanticMatches(
        categoryScoped,
        geminiMatches
      );
      if (rankedPrompts.length > 0) {
        return { filteredPrompts: rankedPrompts, geminiReasonsById: reasonsById };
      }
    }

    return {
      filteredPrompts: filterAndSortPrompts(activePrompts, {
        searchQuery,
        category: selectedCategory,
        collectionName: 'All',
        pinnedOnly: false,
        sortBy: 'updated',
      }),
      geminiReasonsById: {} as Record<string, { score: number; reason: string }>,
    };
  }, [activePrompts, searchQuery, selectedCategory, geminiMatches]);

  // Sign in with Google
  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in could not be completed.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError('Sign-in popup was blocked or closed. Local prompts remain available.');
      }
    }
  };

  // Seed starter prompts to Firebase if cloud vault is empty
  const handleImportStartersToCloud = async () => {
    if (!user) return;
    setIsLoadingCloud(true);
    try {
      for (const starter of SEED_PROMPTS) {
        await createCloudPrompt(user.uid, {
          title: starter.title,
          description: starter.description,
          content: starter.content,
          category: starter.category,
          targetModel: starter.targetModel,
          collectionName: starter.collectionName,
          tagsInput: starter.tags,
          isPinned: starter.isPinned,
        });
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to import starter prompts.');
    } finally {
      setIsLoadingCloud(false);
    }
  };

  // Run Gemini AI Semantic Search
  const handleGeminiSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim();
    if (!q || activePrompts.length === 0) return;

    setIsGeminiSearching(true);
    setGeminiSearchError(null);
    try {
      const matches = await semanticSearchPromptsWithGemini(q, activePrompts);
      setGeminiMatches(matches);
    } catch (err) {
      setGeminiSearchError(
        err instanceof Error ? err.message : 'Gemini search encountered an error.'
      );
    } finally {
      setIsGeminiSearching(false);
    }
  };

  // Click Square -> Immediately copy entire prompt inside
  const handleSquareClick = async (prompt: PromptRecord) => {
    try {
      await navigator.clipboard.writeText(prompt.content);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = prompt.content;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setCopiedId(prompt.id);
    showToast(`Copied "${prompt.title}" to clipboard`);
    setTimeout(() => {
      setCopiedId((prev) => (prev === prompt.id ? null : prev));
    }, 2000);

    // Increment usage count
    if (user) {
      try {
        await incrementCloudPromptUsage(prompt.id, prompt.usageCount);
      } catch {
        // ignore
      }
    } else {
      setLocalPrompts((prev) =>
        prev.map((p) =>
          p.id === prompt.id
            ? { ...p, usageCount: p.usageCount + 1, updatedAtMs: Date.now() }
            : p
        )
      );
    }
  };

  // Save new or edited prompt
  const handleSavePrompt = async (draft: PromptDraftInput, existingId?: string) => {
    setIsSaving(true);
    try {
      if (user) {
        if (existingId) {
          await updateCloudPrompt(existingId, draft);
        } else {
          await createCloudPrompt(user.uid, draft);
        }
      } else {
        const validation = validatePromptDraft(draft);
        if (!validation.valid || !validation.sanitized) {
          throw new Error(Object.values(validation.errors).join(' '));
        }
        const now = Date.now();
        if (existingId) {
          setLocalPrompts((prev) =>
            prev.map((p) =>
              p.id === existingId
                ? {
                    ...p,
                    ...validation.sanitized!,
                    updatedAtMs: now,
                  }
                : p
            )
          );
        } else {
          const newRecord: PromptRecord = {
            id: `local_${now}`,
            ...validation.sanitized,
            usageCount: 0,
            ownerId: 'local_workspace',
            createdAtMs: now,
            updatedAtMs: now,
            source: 'local',
          };
          setLocalPrompts((prev) => [newRecord, ...prev]);
        }
      }
      showToast(existingId ? `Updated "${draft.title.trim()}"` : `Created "${draft.title.trim()}"`);
      setEditingPrompt(null);
      setIsEditorOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete prompt by ID (called from square or modal)
  const executeDeletePrompt = async (promptId: string) => {
    const target = activePrompts.find((p) => p.id === promptId);
    setDeletingPromptId(null);
    if (user) {
      await deleteCloudPrompt(promptId);
    } else {
      setLocalPrompts((prev) => prev.filter((p) => p.id !== promptId));
    }
    if (target) {
      showToast(`Deleted "${target.title}"`);
    }
  };

  // Toggle pin on a square
  const handleTogglePin = async (e: React.MouseEvent, prompt: PromptRecord) => {
    e.stopPropagation();
    if (user) {
      await toggleCloudPromptPin(prompt.id, !prompt.isPinned);
    } else {
      setLocalPrompts((prev) =>
        prev.map((p) => (p.id === prompt.id ? { ...p, isPinned: !p.isPinned } : p))
      );
    }
  };

  // Open edit modal for a square
  const handleEditSquare = (e: React.MouseEvent, prompt: PromptRecord) => {
    e.stopPropagation();
    setDeletingPromptId(null);
    setEditingPrompt(prompt);
    setIsEditorOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-slate-900 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Minimal Header */}
      <header className="border-b border-slate-200/80 bg-[#FAF9F6]/90 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-display font-bold text-sm tracking-tight shadow-xs">
              PV
            </div>
            <div>
              <span className="font-display font-bold text-lg tracking-tight text-slate-900">
                PromptVault
              </span>
              <span className="hidden sm:inline-block ml-2.5 text-xs text-slate-400 font-medium">
                Click any square to copy prompt
              </span>
            </div>
          </div>

          {/* Right Actions: Cloud Status + New Prompt */}
          <div className="flex items-center gap-2.5">
            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 px-2.5 py-1.5 rounded-lg bg-emerald-50/80 border border-emerald-200/60">
                  <Cloud className="w-3.5 h-3.5" />
                  Firebase Synced
                </span>
                <button
                  onClick={() => signOutUser()}
                  title="Sign out of Firebase"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50 transition-all shadow-2xs cursor-pointer"
              >
                <CloudOff className="w-3.5 h-3.5 text-slate-400" />
                <span>Sync with Firebase</span>
                <LogIn className="w-3 h-3 ml-0.5 text-slate-500" />
              </button>
            )}

            <button
              onClick={() => {
                setEditingPrompt(null);
                setIsEditorOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Prompt</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 pt-8 pb-20">
        {/* Top Search Bar Section */}
        <section className="max-w-3xl mx-auto mb-10">
          <form onSubmit={handleGeminiSearch} className="relative group">
            <div className="relative flex items-center bg-white rounded-2xl border border-slate-200/90 shadow-xs focus-within:border-slate-900 focus-within:ring-4 focus-within:ring-slate-900/5 transition-all">
              <Search className="w-5 h-5 text-slate-400 ml-4 shrink-0 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search headings, keywords, or describe what you need..."
                aria-label="Search prompts"
                className="w-full py-4 pl-3 pr-36 bg-transparent text-sm sm:text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setGeminiMatches(null);
                    setGeminiSearchError(null);
                  }}
                  aria-label="Clear search"
                  className="p-1.5 text-slate-400 hover:text-slate-700 mr-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                disabled={!searchQuery.trim() || isGeminiSearching}
                title="Semantic search across your library using Gemini"
                className="mr-2 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-blue-600 disabled:opacity-40 disabled:hover:bg-slate-900 transition-colors shrink-0 cursor-pointer"
              >
                {isGeminiSearching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Gemini Search</span>
              </button>
            </div>
          </form>

          {/* Subtle Category Filter Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2 mt-4 px-1">
            <div className="flex items-center gap-1 flex-wrap">
              {['All', ...PROMPT_CATEGORIES].map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            <div className="text-xs text-slate-400 font-mono tabular-nums">
              {filteredPrompts.length} {filteredPrompts.length === 1 ? 'square' : 'squares'}
            </div>
          </div>

          {/* Gemini Search Active Status */}
          {geminiMatches !== null && (
            <div className="mt-3 flex items-center justify-between px-3.5 py-2 rounded-xl bg-blue-50/80 border border-blue-200/70 text-xs text-blue-900">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>
                  Ranked by <strong>Gemini Semantic Search</strong> ({geminiMatches.length}{' '}
                  {geminiMatches.length === 1 ? 'match' : 'matches'} for "{searchQuery}")
                </span>
              </div>
              <button
                type="button"
                onClick={() => setGeminiMatches(null)}
                className="font-semibold text-blue-700 hover:text-blue-950 underline underline-offset-2 ml-3 cursor-pointer"
              >
                Reset
              </button>
            </div>
          )}

          {/* Error Notice */}
          {(authError || geminiSearchError) && (
            <div className="mt-3 flex items-center justify-between px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{authError || geminiSearchError}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAuthError(null);
                  setGeminiSearchError(null);
                }}
                className="text-amber-700 hover:text-amber-950 font-medium ml-3 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}
        </section>

        {/* Square Grid */}
        {isLoadingCloud ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div
                key={n}
                className="aspect-square rounded-2xl bg-white border border-slate-200/70 p-6 animate-pulse flex flex-col justify-between"
              >
                <div className="h-3 w-16 bg-slate-200 rounded" />
                <div className="space-y-2">
                  <div className="h-6 w-3/4 bg-slate-200 rounded" />
                  <div className="h-4 w-full bg-slate-100 rounded" />
                  <div className="h-4 w-2/3 bg-slate-100 rounded" />
                </div>
                <div className="h-3 w-24 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : filteredPrompts.length === 0 ? (
          <div className="max-w-md mx-auto text-center py-16 px-6 bg-white rounded-2xl border border-slate-200/80">
            <p className="font-display font-bold text-lg text-slate-900 mb-1">
              {user && activePrompts.length === 0
                ? 'Your Firebase Vault is empty'
                : 'No matching prompt squares'}
            </p>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              {user && activePrompts.length === 0
                ? 'Create your first prompt square or load starter prompts into your cloud library.'
                : 'Try another search term, click Gemini Search for semantic matching, or create a new prompt.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              {user && activePrompts.length === 0 && (
                <button
                  type="button"
                  onClick={handleImportStartersToCloud}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Load Starter Prompts
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setEditingPrompt(null);
                  setIsEditorOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Prompt Square</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredPrompts.map((prompt) => {
              const isCopied = copiedId === prompt.id;
              const isConfirmingDelete = deletingPromptId === prompt.id;
              const accent = CATEGORY_ACCENTS[prompt.category] || CATEGORY_ACCENTS.Coding;
              const geminiReason = geminiReasonsById[prompt.id];

              return (
                <div
                  key={prompt.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Copy prompt: ${prompt.title}`}
                  onClick={() => handleSquareClick(prompt)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSquareClick(prompt);
                    }
                  }}
                  className={`group relative aspect-square rounded-2xl p-6 flex flex-col justify-between text-left transition-all duration-200 cursor-pointer select-none border ${
                    isCopied
                      ? 'bg-emerald-950 text-white border-emerald-600 shadow-md -translate-y-0.5'
                      : `bg-white text-slate-900 border-slate-200/90 ${accent.borderHover} hover:shadow-md hover:-translate-y-0.5`
                  }`}
                >
                  {/* Top Bar inside Square: Category & Always-Visible Edit/Delete Controls */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isCopied ? 'bg-emerald-400' : accent.dot
                        }`}
                      />
                      <span
                        className={`text-[11px] font-semibold uppercase tracking-wider truncate ${
                          isCopied ? 'text-emerald-300' : 'text-slate-400'
                        }`}
                      >
                        {prompt.category}
                      </span>
                      {prompt.isPinned && (
                        <span
                          className={`text-[11px] ${
                            isCopied ? 'text-emerald-300' : 'text-amber-600'
                          }`}
                          title="Pinned square"
                        >
                          · Pinned
                        </span>
                      )}
                    </div>

                    {/* Action Controls (Pin, Edit, Delete) — Always visible so users can effortlessly edit or delete */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className={`flex items-center gap-1 shrink-0 ${
                        isCopied ? 'opacity-0 pointer-events-none' : 'opacity-100'
                      }`}
                    >
                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-1.5 py-0.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void executeDeletePrompt(prompt.id);
                            }}
                            aria-label={`Confirm delete ${prompt.title}`}
                            className="px-1.5 py-0.5 text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingPromptId(null);
                            }}
                            aria-label="Cancel delete"
                            className="p-0.5 text-slate-500 hover:text-slate-800 rounded cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={(e) => handleTogglePin(e, prompt)}
                            title={prompt.isPinned ? 'Unpin square' : 'Pin square to top'}
                            aria-label={prompt.isPinned ? `Unpin ${prompt.title}` : `Pin ${prompt.title}`}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              prompt.isPinned
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleEditSquare(e, prompt)}
                            title="Edit prompt"
                            aria-label={`Edit ${prompt.title}`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingPromptId(prompt.id);
                            }}
                            title="Delete prompt"
                            aria-label={`Delete ${prompt.title}`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Center of Square: Prominent Heading & Subtle Prompt Snippet */}
                  <div className="my-auto py-2">
                    <h2
                      className={`font-display font-bold text-xl sm:text-2xl leading-snug tracking-tight line-clamp-3 transition-colors ${
                        isCopied
                          ? 'text-white'
                          : 'text-slate-900 group-hover:text-slate-950'
                      }`}
                    >
                      {prompt.title}
                    </h2>

                    {geminiReason ? (
                      <p
                        className={`mt-2.5 text-xs leading-relaxed line-clamp-2 ${
                          isCopied ? 'text-emerald-200' : 'text-blue-700 font-medium'
                        }`}
                      >
                        <Sparkles className="w-3 h-3 inline mr-1 -mt-0.5" />
                        {geminiReason.reason}
                      </p>
                    ) : (
                      <p
                        className={`mt-2.5 text-xs leading-relaxed line-clamp-2 font-mono ${
                          isCopied ? 'text-emerald-200/90' : 'text-slate-400'
                        }`}
                      >
                        {prompt.content}
                      </p>
                    )}
                  </div>

                  {/* Bottom Footer of Square: Copy Action Feedback */}
                  <div
                    className={`pt-3 border-t flex items-center justify-between text-xs transition-colors ${
                      isCopied
                        ? 'border-emerald-800 text-emerald-300'
                        : 'border-slate-100 text-slate-400 group-hover:text-slate-700'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-white font-semibold">Copied prompt!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                          <span>Click to copy</span>
                        </>
                      )}
                    </span>

                    <span className="font-mono text-[11px] tabular-nums">
                      {prompt.usageCount} {prompt.usageCount === 1 ? 'copy' : 'copies'}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Add New Prompt Square Tile */}
            <button
              type="button"
              onClick={() => {
                setEditingPrompt(null);
                setIsEditorOpen(true);
              }}
              className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 hover:border-slate-900 bg-transparent hover:bg-white/70 p-6 flex flex-col items-center justify-center gap-3 text-slate-400 hover:text-slate-900 transition-all duration-200 cursor-pointer group"
            >
              <div className="w-11 h-11 rounded-full bg-slate-100 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center transition-colors">
                <Plus className="w-5 h-5" />
              </div>
              <div className="text-center">
                <span className="block font-display font-bold text-sm text-slate-700 group-hover:text-slate-900">
                  New Prompt Square
                </span>
                <span className="block text-xs text-slate-400 mt-0.5">
                  Auto-name with Gemini
                </span>
              </div>
            </button>
          </div>
        )}
      </main>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-lg border border-slate-700"
        >
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Create / Edit Prompt Modal (with Gemini Auto-Naming & Delete) */}
      <PromptEditorModal
        isOpen={isEditorOpen}
        initialPrompt={editingPrompt}
        isSaving={isSaving}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingPrompt(null);
        }}
        onSave={handleSavePrompt}
        onDelete={executeDeletePrompt}
      />
    </div>
  );
}
