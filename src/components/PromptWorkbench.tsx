import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Edit3,
  Trash2,
  Bookmark,
  RotateCcw,
  Wand2,
  Sliders,
} from 'lucide-react';
import {
  extractTemplateVariables,
  interpolatePromptTemplate,
  calculatePromptMetrics,
  type PromptRecord,
} from '../utils/promptLogic';

interface PromptWorkbenchProps {
  prompt: PromptRecord | null;
  onEdit: (prompt: PromptRecord) => void;
  onTogglePin: (prompt: PromptRecord) => void;
  onDelete: (prompt: PromptRecord) => void;
  onRecordCopy: (prompt: PromptRecord, compiledText: string) => void;
}

export const PromptWorkbench: React.FC<PromptWorkbenchProps> = ({
  prompt,
  onEdit,
  onTogglePin,
  onDelete,
  onRecordCopy,
}) => {
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [copiedMode, setCopiedMode] = useState<'compiled' | 'raw' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setVariableValues({});
    setCopiedMode(null);
    setConfirmDelete(false);
  }, [prompt?.id]);

  if (!prompt) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <p className="text-sm font-medium text-slate-700">No prompt selected</p>
        <p className="text-xs text-slate-500 mt-1">
          Select any prompt from the library to inspect its template, interpolate variables, or copy it.
        </p>
      </div>
    );
  }

  const variables = extractTemplateVariables(prompt.content);
  const compiledContent = interpolatePromptTemplate(prompt.content, variableValues);
  const metrics = calculatePromptMetrics(compiledContent);

  const handleCopy = async (mode: 'compiled' | 'raw') => {
    const textToCopy = mode === 'compiled' ? compiledContent : prompt.content;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      }
    } catch {
      // Fallback if clipboard permission denied in headless browser
    }
    setCopiedMode(mode);
    onRecordCopy(prompt, textToCopy);
    setTimeout(() => {
      setCopiedMode((prev) => (prev === mode ? null : prev));
    }, 2000);
  };

  const handleFillSampleValues = () => {
    const samples: Record<string, string> = {};
    for (const v of variables) {
      const lower = v.toLowerCase();
      if (lower.includes('framework')) samples[v] = 'Express + TypeScript';
      else if (lower.includes('resource')) samples[v] = 'PromptCollection';
      else if (lower.includes('validation')) samples[v] = 'Zod v3';
      else if (lower.includes('traffic')) samples[v] = '10,000 req/min multi-region';
      else if (lower.includes('collection')) samples[v] = '/prompts/{promptId}';
      else if (lower.includes('entity')) samples[v] = 'Prompt';
      else if (lower.includes('owner')) samples[v] = 'ownerId';
      else if (lower.includes('table')) samples[v] = 'prompt_executions';
      else if (lower.includes('sql') || lower.includes('query'))
        samples[v] = 'SELECT * FROM prompts WHERE owner_id = $1 ORDER BY updated_at DESC;';
      else if (lower.includes('service')) samples[v] = 'Realtime Sync Gateway';
      else if (lower.includes('severity')) samples[v] = 'SEV-2';
      else samples[v] = `Sample ${v.replace(/_/g, ' ')}`;
    }
    setVariableValues(samples);
  };

  const formattedUpdated = new Date(prompt.updatedAtMs).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5">
              <span className="font-medium text-slate-700">{prompt.category}</span>
              <span aria-hidden="true">·</span>
              <span>{prompt.collectionName}</span>
              <span aria-hidden="true">·</span>
              <span>{prompt.targetModel}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {prompt.source === 'cloud' ? 'Saved on Firebase' : 'Local Workspace'}
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight break-words">
              {prompt.title}
            </h2>
            {prompt.description && (
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                {prompt.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onTogglePin(prompt)}
              aria-label={prompt.isPinned ? `Unpin ${prompt.title}` : `Pin ${prompt.title}`}
              className={`p-2 rounded-lg border transition-colors ${
                prompt.isPinned
                  ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                  : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Bookmark className="w-4 h-4 fill-current" />
            </button>
            <button
              type="button"
              onClick={() => onEdit(prompt)}
              aria-label={`Edit ${prompt.title}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </button>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label={`Delete ${prompt.title}`}
                className="p-2 text-slate-500 hover:text-red-600 bg-white border border-slate-200 hover:border-red-200 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                <button
                  type="button"
                  onClick={() => {
                    onDelete(prompt);
                    setConfirmDelete(false);
                  }}
                  className="px-2 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded transition-colors whitespace-nowrap"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Unboxed Metadata Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono tabular-nums">{metrics.characters} chars</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">~{metrics.estimatedTokens} tokens</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{variables.length} parameters</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">Used {prompt.usageCount} times</span>
            <span aria-hidden="true">·</span>
            <span>Updated {formattedUpdated}</span>
          </div>
          {prompt.tags.length > 0 && (
            <div className="text-xs text-slate-500 font-mono">
              Tags: {prompt.tags.join(' / ')}
            </div>
          )}
        </div>
      </div>

      {/* Variable Interpolation Workbench */}
      {variables.length > 0 && (
        <div className="p-6 bg-slate-50/80 border-b border-slate-200">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-semibold text-slate-900">
                Template Parameters ({variables.length})
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleFillSampleValues}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Wand2 className="w-3.5 h-3.5" />
                Fill Sample Values
              </button>
              <button
                type="button"
                onClick={() => setVariableValues({})}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {variables.map((varName) => (
              <div key={varName}>
                <label
                  htmlFor={`var-input-${varName}`}
                  className="block text-xs font-mono text-slate-700 mb-1"
                >
                  {`{{${varName}}}`}
                </label>
                <input
                  id={`var-input-${varName}`}
                  type="text"
                  value={variableValues[varName] ?? ''}
                  onChange={(e) =>
                    setVariableValues((prev) => ({
                      ...prev,
                      [varName]: e.target.value,
                    }))
                  }
                  placeholder={`Enter value for ${varName}...`}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compiled Output Preview */}
      <div className="p-6 flex-1 flex flex-col justify-between gap-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-700">
              {variables.length > 0 ? 'Compiled Prompt Output' : 'Prompt Body'}
            </span>
            <div className="flex items-center gap-2">
              {variables.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleCopy('raw')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                >
                  {copiedMode === 'raw' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      Copied Raw Template
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Raw Template
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleCopy('compiled')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedMode === 'compiled' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copied to Clipboard
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Prompt
                  </>
                )}
              </button>
            </div>
          </div>

          <pre className="w-full p-4 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono leading-relaxed whitespace-pre-wrap break-words overflow-x-auto max-h-96">
            {compiledContent}
          </pre>
        </div>
      </div>
    </div>
  );
};
