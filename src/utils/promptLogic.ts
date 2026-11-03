/**
 * Pure domain logic for PromptVault:
 * - Blueprint-synchronized validation (matching firebase-blueprint.json & firestore.rules)
 * - Template variable extraction ({{variable_name}})
 * - Template interpolation & token/character telemetry calculation
 * - Filtering, sorting, and search
 */

export const PROMPT_CATEGORIES = [
  'Coding',
  'Writing',
  'Analysis',
  'System',
  'Research',
  'Creative',
] as const;

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

export const TARGET_MODELS = [
  'Gemini 2.5 Pro',
  'Gemini 2.5 Flash',
  'Claude 3.7 Sonnet',
  'GPT-4o',
  'Universal / Any LLM',
] as const;

export const DEFAULT_COLLECTIONS = [
  'Core Library',
  'Production Systems',
  'Code Architecture',
  'Research & Synthesis',
  'Editorial & Copy',
] as const;

export const BLUEPRINT_LIMITS = {
  ID_MAX_LENGTH: 128,
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  TITLE_MIN_LENGTH: 1,
  TITLE_MAX_LENGTH: 120,
  DESCRIPTION_MAX_LENGTH: 500,
  CONTENT_MIN_LENGTH: 1,
  CONTENT_MAX_LENGTH: 10000,
  CATEGORY_MAX_LENGTH: 40,
  TARGET_MODEL_MAX_LENGTH: 60,
  COLLECTION_NAME_MAX_LENGTH: 60,
  MAX_TAGS: 8,
  TAG_MAX_LENGTH: 32,
  MAX_USAGE_COUNT: 1000000,
} as const;

export interface PromptRecord {
  id: string;
  title: string;
  description: string;
  content: string;
  category: PromptCategory;
  targetModel: string;
  collectionName: string;
  tags: string[];
  isPinned: boolean;
  usageCount: number;
  ownerId: string;
  createdAtMs: number;
  updatedAtMs: number;
  source?: 'cloud' | 'local';
}

export interface PromptDraftInput {
  title: string;
  description: string;
  content: string;
  category: string;
  targetModel: string;
  collectionName: string;
  tagsInput?: string | string[];
  isPinned?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  sanitized?: {
    title: string;
    description: string;
    content: string;
    category: PromptCategory;
    targetModel: string;
    collectionName: string;
    tags: string[];
    isPinned: boolean;
  };
}

/**
 * Extracts unique {{variable}} names in order of appearance.
 */
export function extractTemplateVariables(content: string): string[] {
  if (!content) return [];
  const regex = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  const seen = new Set<string>();
  const result: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const varName = match[1].trim();
    if (varName && !seen.has(varName)) {
      seen.add(varName);
      result.push(varName);
    }
  }
  return result;
}

/**
 * Compiles a prompt template by substituting {{variable}} placeholders with user-supplied values.
 * Unfilled variables remain highlighted as {{variable}} so the user can see what is missing.
 */
export function interpolatePromptTemplate(
  content: string,
  values: Record<string, string>
): string {
  if (!content) return '';
  return content.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (fullMatch, rawName: string) => {
    const key = rawName.trim();
    const replacement = values[key];
    if (typeof replacement === 'string' && replacement.trim().length > 0) {
      return replacement;
    }
    return fullMatch;
  });
}

/**
 * Estimates token count (~4 characters per token, minimum 1 for non-empty text) and word/character stats.
 */
export function calculatePromptMetrics(text: string): {
  characters: number;
  words: number;
  estimatedTokens: number;
  variableCount: number;
} {
  const trimmed = text.trim();
  const characters = text.length;
  const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
  const estimatedTokens = characters === 0 ? 0 : Math.max(1, Math.ceil(characters / 4));
  const variableCount = extractTemplateVariables(text).length;
  return {
    characters,
    words,
    estimatedTokens,
    variableCount,
  };
}

/**
 * Parses and normalizes tags from a comma-separated string or string array.
 */
export function normalizeTags(tagsInput?: string | string[]): string[] {
  if (!tagsInput) return [];
  const rawList = Array.isArray(tagsInput)
    ? tagsInput
    : tagsInput.split(',');
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of rawList) {
    const tag = String(item)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_ ]/g, '')
      .trim()
      .slice(0, BLUEPRINT_LIMITS.TAG_MAX_LENGTH);
    if (tag.length >= 1 && !seen.has(tag)) {
      seen.add(tag);
      cleaned.push(tag);
    }
    if (cleaned.length >= BLUEPRINT_LIMITS.MAX_TAGS) {
      break;
    }
  }
  return cleaned;
}

/**
 * Validates a prompt draft against firebase-blueprint.json & firestore.rules constraints.
 */
export function validatePromptDraft(input: PromptDraftInput): ValidationResult {
  const errors: Record<string, string> = {};

  const title = (input.title ?? '').trim();
  const description = (input.description ?? '').trim();
  const content = (input.content ?? '').trim();
  const category = (input.category ?? '').trim();
  const targetModel = (input.targetModel ?? '').trim() || 'Gemini 2.5 Pro';
  const collectionName = (input.collectionName ?? '').trim() || 'Core Library';

  if (title.length < BLUEPRINT_LIMITS.TITLE_MIN_LENGTH) {
    errors.title = 'Prompt title is required.';
  } else if (title.length > BLUEPRINT_LIMITS.TITLE_MAX_LENGTH) {
    errors.title = `Title must be ${BLUEPRINT_LIMITS.TITLE_MAX_LENGTH} characters or fewer.`;
  }

  if (description.length > BLUEPRINT_LIMITS.DESCRIPTION_MAX_LENGTH) {
    errors.description = `Description must be ${BLUEPRINT_LIMITS.DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }

  if (content.length < BLUEPRINT_LIMITS.CONTENT_MIN_LENGTH) {
    errors.content = 'Prompt template content is required.';
  } else if (content.length > BLUEPRINT_LIMITS.CONTENT_MAX_LENGTH) {
    errors.content = `Prompt content must be ${BLUEPRINT_LIMITS.CONTENT_MAX_LENGTH} characters or fewer.`;
  }

  if (!PROMPT_CATEGORIES.includes(category as PromptCategory)) {
    errors.category = `Category must be one of: ${PROMPT_CATEGORIES.join(', ')}.`;
  }

  if (targetModel.length < 1 || targetModel.length > BLUEPRINT_LIMITS.TARGET_MODEL_MAX_LENGTH) {
    errors.targetModel = `Target model must be between 1 and ${BLUEPRINT_LIMITS.TARGET_MODEL_MAX_LENGTH} characters.`;
  }

  if (collectionName.length < 1 || collectionName.length > BLUEPRINT_LIMITS.COLLECTION_NAME_MAX_LENGTH) {
    errors.collectionName = `Collection name must be between 1 and ${BLUEPRINT_LIMITS.COLLECTION_NAME_MAX_LENGTH} characters.`;
  }

  const tags = normalizeTags(input.tagsInput);

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: {},
    sanitized: {
      title,
      description,
      content,
      category: category as PromptCategory,
      targetModel,
      collectionName,
      tags,
      isPinned: Boolean(input.isPinned),
    },
  };
}

/**
 * Pure simulation of the Firestore Security Rules for `/prompts/{promptId}` to verify
 * the "Dirty Dozen" adversarial payloads and ensure client/server parity.
 */
export interface SimulatedRuleContext {
  auth: { uid: string; email_verified: boolean } | null;
  requestTimeMs: number;
  promptId: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  existingData?: Record<string, unknown> | null;
  incomingData?: Record<string, unknown> | null;
}

export function evaluatePromptSecurityRule(ctx: SimulatedRuleContext): {
  allowed: boolean;
  reason: string;
} {
  const isValidId = (id: string) =>
    typeof id === 'string' &&
    id.length >= 1 &&
    id.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(id);

  const isSignedIn = ctx.auth !== null && typeof ctx.auth.uid === 'string';
  const isVerifiedUser = isSignedIn && ctx.auth?.email_verified === true;

  const requiredKeys = [
    'title',
    'description',
    'content',
    'category',
    'targetModel',
    'collectionName',
    'tags',
    'isPinned',
    'usageCount',
    'ownerId',
    'createdAt',
    'updatedAt',
  ];

  const isValidPrompt = (data: Record<string, unknown> | null | undefined): boolean => {
    if (!data || typeof data !== 'object') return false;
    const keys = Object.keys(data);
    if (!requiredKeys.every((k) => keys.includes(k))) return false;
    if (!keys.every((k) => requiredKeys.includes(k))) return false;

    if (typeof data.title !== 'string' || data.title.length < 1 || data.title.length > 120) return false;
    if (typeof data.description !== 'string' || data.description.length > 500) return false;
    if (typeof data.content !== 'string' || data.content.length < 1 || data.content.length > 10000) return false;
    if (
      typeof data.category !== 'string' ||
      data.category.length < 1 ||
      data.category.length > 40 ||
      !PROMPT_CATEGORIES.includes(data.category as PromptCategory)
    ) {
      return false;
    }
    if (typeof data.targetModel !== 'string' || data.targetModel.length < 1 || data.targetModel.length > 60) return false;
    if (typeof data.collectionName !== 'string' || data.collectionName.length < 1 || data.collectionName.length > 60) return false;
    if (!Array.isArray(data.tags) || data.tags.length > 8) return false;
    if (
      data.tags.length > 0 &&
      (typeof data.tags[0] !== 'string' || data.tags[0].length < 1 || data.tags[0].length > 32)
    ) {
      return false;
    }
    if (typeof data.isPinned !== 'boolean') return false;
    if (
      typeof data.usageCount !== 'number' ||
      !Number.isInteger(data.usageCount) ||
      data.usageCount < 0 ||
      data.usageCount > 1000000
    ) {
      return false;
    }
    if (
      typeof data.ownerId !== 'string' ||
      data.ownerId.length < 1 ||
      data.ownerId.length > 128 ||
      !/^[a-zA-Z0-9_-]+$/.test(data.ownerId) ||
      data.ownerId !== ctx.auth?.uid
    ) {
      return false;
    }
    if (typeof data.createdAt !== 'number' || typeof data.updatedAt !== 'number') return false;
    return true;
  };

  if (ctx.operation === 'get') {
    if (!isSignedIn) return { allowed: false, reason: 'Unauthenticated' };
    if (!isValidId(ctx.promptId)) return { allowed: false, reason: 'Invalid ID' };
    if (ctx.existingData?.ownerId !== ctx.auth?.uid) return { allowed: false, reason: 'Not owner' };
    return { allowed: true, reason: 'OK' };
  }

  if (ctx.operation === 'list') {
    if (!isSignedIn) return { allowed: false, reason: 'Unauthenticated' };
    if (ctx.existingData?.ownerId !== ctx.auth?.uid) return { allowed: false, reason: 'Cross-tenant list blocked' };
    return { allowed: true, reason: 'OK' };
  }

  if (ctx.operation === 'create') {
    if (!isVerifiedUser) return { allowed: false, reason: 'Unverified user' };
    if (!isValidId(ctx.promptId)) return { allowed: false, reason: 'Invalid ID' };
    if (!isValidPrompt(ctx.incomingData)) return { allowed: false, reason: 'Schema validation failed' };
    if (ctx.incomingData?.usageCount !== 0) return { allowed: false, reason: 'Initial usageCount must be 0' };
    if (ctx.incomingData?.createdAt !== ctx.requestTimeMs) return { allowed: false, reason: 'Invalid createdAt' };
    if (ctx.incomingData?.updatedAt !== ctx.requestTimeMs) return { allowed: false, reason: 'Invalid updatedAt' };
    return { allowed: true, reason: 'OK' };
  }

  if (ctx.operation === 'update') {
    if (!isVerifiedUser) return { allowed: false, reason: 'Unverified user' };
    if (!isValidId(ctx.promptId)) return { allowed: false, reason: 'Invalid ID' };
    if (!isValidPrompt(ctx.incomingData)) return { allowed: false, reason: 'Schema validation failed' };
    if (!ctx.existingData || ctx.existingData.ownerId !== ctx.auth?.uid) return { allowed: false, reason: 'Not owner' };
    if (ctx.incomingData?.ownerId !== ctx.existingData.ownerId) return { allowed: false, reason: 'Immutable ownerId' };
    if (ctx.incomingData?.createdAt !== ctx.existingData.createdAt) return { allowed: false, reason: 'Immutable createdAt' };
    if (ctx.incomingData?.updatedAt !== ctx.requestTimeMs) return { allowed: false, reason: 'Invalid updatedAt' };

    const incoming = ctx.incomingData as Record<string, unknown>;
    const existing = ctx.existingData as Record<string, unknown>;
    const affectedKeys = Object.keys(incoming).filter(
      (k) => JSON.stringify(incoming[k]) !== JSON.stringify(existing[k])
    );

    const editAllowedKeys = [
      'title',
      'description',
      'content',
      'category',
      'targetModel',
      'collectionName',
      'tags',
      'isPinned',
      'updatedAt',
    ];
    const pinAllowedKeys = ['isPinned', 'updatedAt'];
    const usageAllowedKeys = ['usageCount', 'updatedAt'];

    const isEditAction = affectedKeys.every((k) => editAllowedKeys.includes(k));
    const isPinAction = affectedKeys.every((k) => pinAllowedKeys.includes(k));
    const isUsageAction =
      affectedKeys.every((k) => usageAllowedKeys.includes(k)) &&
      incoming.usageCount === (existing.usageCount as number) + 1;

    if (!isEditAction && !isPinAction && !isUsageAction) {
      return { allowed: false, reason: 'Disallowed update action' };
    }
    return { allowed: true, reason: 'OK' };
  }

  if (ctx.operation === 'delete') {
    if (!isVerifiedUser) return { allowed: false, reason: 'Unverified user' };
    if (!isValidId(ctx.promptId)) return { allowed: false, reason: 'Invalid ID' };
    if (ctx.existingData?.ownerId !== ctx.auth?.uid) return { allowed: false, reason: 'Not owner' };
    return { allowed: true, reason: 'OK' };
  }

  return { allowed: false, reason: 'Unknown operation' };
}

/**
 * Filters and sorts prompts based on search query, category, collection, and pinned filter.
 */
export function filterAndSortPrompts(
  prompts: PromptRecord[],
  options: {
    searchQuery: string;
    category: string;
    collectionName: string;
    pinnedOnly: boolean;
    sortBy: 'updated' | 'usage' | 'alphabetical';
  }
): PromptRecord[] {
  const q = options.searchQuery.trim().toLowerCase();

  const filtered = prompts.filter((p) => {
    if (options.pinnedOnly && !p.isPinned) return false;
    if (options.category !== 'All' && p.category !== options.category) return false;
    if (options.collectionName !== 'All' && p.collectionName !== options.collectionName) return false;

    if (q.length > 0) {
      const hay = [
        p.title,
        p.description,
        p.content,
        p.category,
        p.targetModel,
        p.collectionName,
        ...p.tags,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) {
        const stopWords = new Set(['help', 'me', 'the', 'and', 'for', 'with', 'how', 'to', 'in', 'of', 'a', 'an', 'find', 'prompt', 'prompts', 'that', 'can']);
        const tokens = q
          .split(/[^a-z0-9]+/i)
          .filter((t) => t.length >= 2 && !stopWords.has(t));
        if (tokens.length === 0 || !tokens.some((token) => hay.includes(token))) {
          return false;
        }
      }
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    if (options.sortBy === 'usage') {
      if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
    } else if (options.sortBy === 'alphabetical') {
      return a.title.localeCompare(b.title);
    }
    return b.updatedAtMs - a.updatedAtMs;
  });
}

export interface GeminiNamingSuggestion {
  title: string;
  description: string;
  category: PromptCategory;
  tags: string[];
}

export interface SemanticMatchItem {
  id: string;
  relevanceScore: number;
  matchReason: string;
}

/**
 * Sanitizes and bounds the response from /api/gemini/name-prompt to guarantee blueprint compliance.
 */
export function sanitizeGeminiNamingSuggestion(
  raw: Record<string, unknown> | null | undefined,
  fallbackCategory: PromptCategory = 'Coding'
): GeminiNamingSuggestion {
  const rawTitle = typeof raw?.title === 'string' ? raw.title.trim() : '';
  const title = (rawTitle || 'Untitled Prompt Template').slice(
    0,
    BLUEPRINT_LIMITS.TITLE_MAX_LENGTH
  );

  const rawDesc = typeof raw?.description === 'string' ? raw.description.trim() : '';
  const description = rawDesc.slice(0, BLUEPRINT_LIMITS.DESCRIPTION_MAX_LENGTH);

  const rawCategory = typeof raw?.category === 'string' ? raw.category.trim() : '';
  const category: PromptCategory = PROMPT_CATEGORIES.includes(rawCategory as PromptCategory)
    ? (rawCategory as PromptCategory)
    : fallbackCategory;

  const rawTags = Array.isArray(raw?.tags) ? raw.tags.map(String) : [];
  const tags = normalizeTags(rawTags);

  return {
    title,
    description,
    category,
    tags,
  };
}

/**
 * Ranks and filters prompts using Gemini semantic search matches.
 */
export function rankPromptsBySemanticMatches(
  prompts: PromptRecord[],
  matches: SemanticMatchItem[]
): {
  rankedPrompts: PromptRecord[];
  reasonsById: Record<string, { score: number; reason: string }>;
} {
  const sortedMatches = [...matches]
    .filter(
      (m) =>
        m &&
        typeof m.id === 'string' &&
        typeof m.relevanceScore === 'number' &&
        m.relevanceScore > 0
    )
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  const byId = new Map<string, PromptRecord>();
  for (const p of prompts) {
    byId.set(p.id, p);
  }

  const rankedPrompts: PromptRecord[] = [];
  const reasonsById: Record<string, { score: number; reason: string }> = {};
  const seen = new Set<string>();

  for (const m of sortedMatches) {
    const prompt = byId.get(m.id);
    if (prompt && !seen.has(m.id)) {
      seen.add(m.id);
      rankedPrompts.push(prompt);
      reasonsById[m.id] = {
        score: Math.min(100, Math.max(1, Math.round(m.relevanceScore))),
        reason: typeof m.matchReason === 'string' ? m.matchReason.trim() : 'Matched by semantic intent',
      };
    }
  }

  return { rankedPrompts, reasonsById };
}

