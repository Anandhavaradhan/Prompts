import {
  sanitizeGeminiNamingSuggestion,
  type GeminiNamingSuggestion,
  type PromptCategory,
  type PromptRecord,
  type SemanticMatchItem,
} from './promptLogic';

export async function generatePromptMetadataWithGemini(
  content: string,
  fallbackCategory: PromptCategory = 'Coding'
): Promise<GeminiNamingSuggestion> {
  const response = await fetch('/api/gemini/name-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to generate prompt name with Gemini.');
  }

  return sanitizeGeminiNamingSuggestion(data, fallbackCategory);
}

export async function semanticSearchPromptsWithGemini(
  query: string,
  prompts: PromptRecord[]
): Promise<SemanticMatchItem[]> {
  const response = await fetch('/api/gemini/search-prompts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
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
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to run Gemini semantic search.');
  }

  return Array.isArray(data?.matches) ? data.matches : [];
}
