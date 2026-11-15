import {
  PROMPT_CATEGORIES,
  extractTemplateVariables,
  sanitizeGeminiNamingSuggestion,
  type GeminiNamingSuggestion,
  type PromptCategory,
  type PromptRecord,
  type SemanticMatchItem,
} from './promptLogic';

/**
 * Where the Gemini server (server.ts) lives.
 *  - Running `npm run dev` / `npm start`: the same origin, so this is ''.
 *  - Static builds (GitHub Pages, the Android and Windows apps) have no server of their own.
 *    Set VITE_API_BASE to a hosted copy of the server to give them Gemini; without it they
 *    use the on-device fallbacks below.
 */
const API_BASE = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
const IS_STATIC = import.meta.env.VITE_STATIC === 'true';
const HAS_SERVER = !IS_STATIC || API_BASE !== '';

/** Result of a Gemini call, saying whether Gemini or the on-device fallback produced it. */
export interface WithSource<T> {
  value: T;
  source: 'gemini' | 'device';
}

async function postJson(path: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data: Record<string, unknown> = {};
  try {
    data = await response.json();
  } catch {
    throw new Error('The Gemini server did not answer.');
  }
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'The Gemini server returned an error.');
  }
  return data;
}

/* ------------------------- on-device fallbacks ------------------------- */

const CATEGORY_WORDS: Record<PromptCategory, string[]> = {
  Coding: ['code', 'function', 'typescript', 'javascript', 'python', 'api', 'endpoint', 'bug', 'refactor', 'sql', 'query', 'class', 'test', 'debug', 'compile', 'regex'],
  Writing: ['write', 'essay', 'email', 'blog', 'article', 'tone', 'rewrite', 'draft', 'copy', 'headline', 'release notes', 'postmortem', 'proofread', 'summary'],
  Analysis: ['analyze', 'analyse', 'data', 'metrics', 'compare', 'evaluate', 'trend', 'report', 'explain analyze', 'bottleneck', 'root cause', 'statistics'],
  System: ['you are', 'system prompt', 'act as', 'persona', 'rules', 'policy', 'guardrail', 'security rules', 'always', 'never'],
  Research: ['research', 'sources', 'literature', 'paper', 'citation', 'study', 'survey', 'evidence', 'hypothesis', 'rfc'],
  Creative: ['story', 'poem', 'creative', 'character', 'plot', 'lyrics', 'imagine', 'fiction', 'slogan', 'brainstorm', 'name ideas'],
};

function guessCategory(text: string, fallback: PromptCategory): PromptCategory {
  const lower = text.toLowerCase();
  let best: PromptCategory = fallback;
  let bestScore = 0;
  for (const category of PROMPT_CATEGORIES) {
    const score = CATEGORY_WORDS[category].reduce((n, word) => n + (lower.includes(word) ? 1 : 0), 0);
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best;
}

/** Names a prompt from its own text: first sentence as the title, variables and frequent words as tags. */
export function namePromptOnDevice(content: string, fallbackCategory: PromptCategory): GeminiNamingSuggestion {
  const plain = content
    .replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_m, name: string) => name.replace(/[_-]+/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  const firstSentence = plain.split(/(?<=[.!?:])\s/)[0] || plain;
  const words = firstSentence
    .replace(/^(please|act as|you are)\s+(an?\s+)?/i, '')
    .replace(/[.!?:]+$/, '')
    .split(' ')
    .slice(0, 7);
  const title = words.map((w) => (w.length > 3 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

  const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'into', 'using', 'each', 'following', 'provide', 'include', 'should', 'must', 'will', 'have', 'any']);
  const counts = new Map<string, number>();
  for (const w of plain.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []) {
    if (!stop.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const frequent = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
  const tags = [...new Set([...frequent.slice(0, 4)])].slice(0, 4);
  const variables = extractTemplateVariables(content);

  return sanitizeGeminiNamingSuggestion(
    {
      title,
      description: variables.length
        ? `${firstSentence.slice(0, 160)} Fill in: ${variables.slice(0, 5).join(', ')}.`
        : firstSentence.slice(0, 220),
      category: guessCategory(plain, fallbackCategory),
      tags,
    },
    fallbackCategory
  );
}

/** Ranks prompts by how many of the query's words they contain (title and tags count most). */
export function searchPromptsOnDevice(query: string, prompts: PromptRecord[]): SemanticMatchItem[] {
  const words = [...new Set(query.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) ?? [])].filter((w) => w.length > 1);
  if (words.length === 0) return [];
  const results: SemanticMatchItem[] = [];
  for (const p of prompts) {
    const fields: Array<[string, number, string]> = [
      [p.title.toLowerCase(), 5, 'title'],
      [p.tags.join(' ').toLowerCase(), 4, 'tags'],
      [`${p.category} ${p.collectionName}`.toLowerCase(), 3, 'category'],
      [p.description.toLowerCase(), 2, 'description'],
      [p.content.toLowerCase(), 1, 'prompt text'],
    ];
    let score = 0;
    const hits = new Set<string>();
    const where = new Set<string>();
    for (const word of words) {
      for (const [text, weight, label] of fields) {
        if (text.includes(word)) {
          score += weight;
          hits.add(word);
          where.add(label);
        }
      }
    }
    if (hits.size === 0) continue;
    const coverage = hits.size / words.length;
    results.push({
      id: p.id,
      relevanceScore: Math.max(1, Math.min(100, Math.round(coverage * 70 + Math.min(30, score * 2)))),
      matchReason: `Matches "${[...hits].slice(0, 4).join('", "')}" in the ${[...where].slice(0, 3).join(', ')}`,
    });
  }
  return results.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 20);
}

/* ------------------------------ public API ------------------------------ */

export async function generatePromptMetadataWithGemini(
  content: string,
  fallbackCategory: PromptCategory = 'Coding'
): Promise<WithSource<GeminiNamingSuggestion>> {
  if (HAS_SERVER) {
    try {
      const data = await postJson('/api/gemini/name-prompt', { content });
      return { value: sanitizeGeminiNamingSuggestion(data, fallbackCategory), source: 'gemini' };
    } catch (err) {
      // With a server of our own (dev / hosted), show its error. Static builds fall through to the device.
      if (!IS_STATIC) throw err;
    }
  }
  return { value: namePromptOnDevice(content, fallbackCategory), source: 'device' };
}

export async function semanticSearchPromptsWithGemini(
  query: string,
  prompts: PromptRecord[]
): Promise<WithSource<SemanticMatchItem[]>> {
  if (HAS_SERVER) {
    try {
      const data = await postJson('/api/gemini/search-prompts', {
        query,
        prompts: prompts.map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          category: p.category,
          collectionName: p.collectionName,
          tags: p.tags,
          content: p.content,
        })),
      });
      return { value: Array.isArray(data.matches) ? (data.matches as SemanticMatchItem[]) : [], source: 'gemini' };
    } catch (err) {
      if (!IS_STATIC) throw err;
    }
  }
  return { value: searchPromptsOnDevice(query, prompts), source: 'device' };
}

/** True when this build has no Gemini server (the buttons then use on-device matching). */
export const GEMINI_AVAILABLE = HAS_SERVER;
