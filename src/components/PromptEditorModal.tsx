import React, { useState, useEffect } from 'react';
import { X, Sparkles, AlertCircle, Wand2, Trash2, Check } from 'lucide-react';
import {
  PROMPT_CATEGORIES,
  BLUEPRINT_LIMITS,
  validatePromptDraft,
  type PromptCategory,
  type PromptDraftInput,
  type PromptRecord,
} from '../utils/promptLogic';
import { generatePromptMetadataWithGemini } from '../utils/geminiClient';

interface PromptEditorModalProps {
  isOpen: boolean;
  initialPrompt: PromptRecord | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (draft: PromptDraftInput, existingId?: string) => Promise<void>;
  onDelete?: (promptId: string) => Promise<void>;
}

export const PromptEditorModal: React.FC<PromptEditorModalProps> = ({
  isOpen,
  initialPrompt,
  isSaving,
  onClose,
  onSave,
  onDelete,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<string>('Coding');
  const [tagsInput, setTagsInput] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isNamingWithGemini, setIsNamingWithGemini] = useState(false);
  const [geminiSuccessNotice, setGeminiSuccessNotice] = useState<string | null>(null);
  const [confirmingModalDelete, setConfirmingModalDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialPrompt) {
        setTitle(initialPrompt.title);
        setDescription(initialPrompt.description);
        setContent(initialPrompt.content);
        setCategory(initialPrompt.category);
        setTagsInput(initialPrompt.tags.join(', '));
        setIsPinned(initialPrompt.isPinned);
      } else {
        setTitle('');
        setDescription('');
        setContent('');
        setCategory('Coding');
        setTagsInput('');
        setIsPinned(false);
      }
      setErrors({});
      setSubmitError(null);
      setGeminiSuccessNotice(null);
      setIsNamingWithGemini(false);
      setConfirmingModalDelete(false);
      setIsDeleting(false);
    }
  }, [isOpen, initialPrompt]);

  if (!isOpen) return null;

  const handleAutoNameWithGemini = async () => {
    setSubmitError(null);
    setGeminiSuccessNotice(null);

    if (!content.trim()) {
      setErrors((prev) => ({
        ...prev,
        content: 'Paste or write your prompt below first so Gemini can name it.',
      }));
      return;
    }

    setIsNamingWithGemini(true);
    try {
      const suggestion = await generatePromptMetadataWithGemini(
        content,
        (category as PromptCategory) || 'Coding'
      );
      setTitle(suggestion.title);
      if (suggestion.description) {
        setDescription(suggestion.description);
      }
      setCategory(suggestion.category);
      if (suggestion.tags.length > 0) {
        setTagsInput(suggestion.tags.join(', '));
      }
      setErrors((prev) => ({ ...prev, title: '', content: '' }));
      setGeminiSuccessNotice('Heading and category generated with Gemini.');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsNamingWithGemini(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const draft: PromptDraftInput = {
      title,
      description,
      content,
      category,
      targetModel: initialPrompt?.targetModel || 'Gemini 2.5 Pro',
      collectionName: initialPrompt?.collectionName || 'Core Library',
      tagsInput,
      isPinned,
    };

    const validation = validatePromptDraft(draft);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    try {
      await onSave(draft, initialPrompt?.id);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleModalDelete = async () => {
    if (!initialPrompt || !onDelete) return;
    if (!confirmingModalDelete) {
      setConfirmingModalDelete(true);
      return;
    }

    setIsDeleting(true);
    setSubmitError(null);
    try {
      await onDelete(initialPrompt.id);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-editor-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2
              id="prompt-editor-modal-title"
              className="font-display text-lg font-bold text-slate-900 tracking-tight"
            >
              {initialPrompt ? 'Edit Prompt Square' : 'New Prompt Square'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {initialPrompt
                ? 'Update your prompt heading, category, or full prompt text.'
                : 'Paste your prompt and let Gemini generate a clean heading.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close prompt editor"
            className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-5">
          {submitError && (
            <div
              role="alert"
              className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-800"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="break-all">{submitError}</div>
            </div>
          )}

          {geminiSuccessNotice && (
            <div
              role="status"
              className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900"
            >
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Check className="w-3.5 h-3.5 text-blue-600" />
                {geminiSuccessNotice}
              </span>
              <button
                type="button"
                onClick={() => setGeminiSuccessNotice(null)}
                className="text-blue-700 hover:text-blue-950 font-semibold ml-3 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Prompt Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="prompt-content-textarea"
                className="block text-xs font-semibold text-slate-700"
              >
                Prompt Text <span className="text-red-600">*</span>
              </label>
              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                {content.length}/{BLUEPRINT_LIMITS.CONTENT_MAX_LENGTH}
              </span>
            </div>
            <textarea
              id="prompt-content-textarea"
              rows={7}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (errors.content) setErrors((prev) => ({ ...prev, content: '' }));
              }}
              maxLength={BLUEPRINT_LIMITS.CONTENT_MAX_LENGTH}
              placeholder="Paste or type the full prompt that will be copied when you click this square..."
              className="w-full px-3.5 py-3 text-sm font-mono bg-[#FAF9F6] border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-slate-900 transition-colors leading-relaxed"
            />
            {errors.content && (
              <p className="text-xs text-red-600 mt-1">{errors.content}</p>
            )}
          </div>

          {/* Square Heading + Auto-Name with Gemini */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="prompt-title-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Square Heading <span className="text-red-600">*</span>
                </label>
                <button
                  type="button"
                  disabled={isNamingWithGemini}
                  onClick={handleAutoNameWithGemini}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  {isNamingWithGemini ? 'Naming...' : 'Auto-Name with Gemini'}
                </button>
              </div>
              <input
                id="prompt-title-input"
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (errors.title) setErrors((prev) => ({ ...prev, title: '' }));
                }}
                maxLength={BLUEPRINT_LIMITS.TITLE_MAX_LENGTH}
                placeholder="e.g. TypeScript API Endpoint Architect"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 transition-colors"
              />
              {errors.title && (
                <p className="text-xs text-red-600 mt-1">{errors.title}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="prompt-category-select"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Category
              </label>
              <select
                id="prompt-category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-slate-900 transition-colors"
              >
                {PROMPT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Pin Toggle */}
          <div className="flex items-center justify-between pt-1">
            <label className="inline-flex items-center gap-2.5 text-xs font-medium text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span>Pin this square to the top of the grid</span>
            </label>
          </div>

          {/* Footer with Delete (when editing) and Save */}
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <div>
              {initialPrompt && onDelete && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isDeleting || isSaving}
                    onClick={handleModalDelete}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      confirmingModalDelete
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'text-red-600 bg-red-50 hover:bg-red-100'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {isDeleting
                        ? 'Deleting...'
                        : confirmingModalDelete
                        ? 'Confirm Delete'
                        : 'Delete Prompt'}
                    </span>
                  </button>
                  {confirmingModalDelete && (
                    <button
                      type="button"
                      onClick={() => setConfirmingModalDelete(false)}
                      className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {isSaving
                    ? 'Saving...'
                    : initialPrompt
                    ? 'Save Changes'
                    : 'Create Square'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
