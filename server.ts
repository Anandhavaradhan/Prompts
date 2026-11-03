import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_CATEGORIES = [
  'Coding',
  'Writing',
  'Analysis',
  'System',
  'Research',
  'Creative',
];

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please check your API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  /**
   * POST /api/gemini/name-prompt
   * Generates a concise title, summary description, category, and tags from a raw prompt template.
   */
  app.post('/api/gemini/name-prompt', async (req, res) => {
    try {
      const { content } = req.body ?? {};
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        res.status(400).json({
          error: 'Please enter prompt template content before generating a name.',
        });
        return;
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Analyze the following prompt template and generate a clear title, concise description, best matching category, and tags:\n\n${content.slice(0, 8000)}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are a senior prompt engineering librarian. Given a prompt template, generate: (1) a clear, specific, action-oriented title (3 to 7 words, under 100 characters), (2) a concise 1-sentence summary description of what the prompt does and outputs (under 240 characters), (3) the best matching category strictly chosen from [Coding, Writing, Analysis, System, Research, Creative], and (4) up to 4 relevant lowercase tags.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: {
                type: Type.STRING,
                description: 'Concise, specific title for the prompt (3-7 words, max 100 chars).',
              },
              description: {
                type: Type.STRING,
                description: 'One-sentence description of what the prompt accomplishes.',
              },
              category: {
                type: Type.STRING,
                description: 'Strictly one of: Coding, Writing, Analysis, System, Research, Creative.',
              },
              tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Up to 4 short lowercase descriptive tags.',
              },
            },
            required: ['title', 'description', 'category', 'tags'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);

      const category = ALLOWED_CATEGORIES.includes(parsed.category)
        ? parsed.category
        : 'Coding';

      res.json({
        title: String(parsed.title ?? '').trim().slice(0, 120),
        description: String(parsed.description ?? '').trim().slice(0, 500),
        category,
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.slice(0, 6).map((t: unknown) => String(t).trim().toLowerCase())
          : [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/gemini/search-prompts
   * Performs semantic search & ranking across the user's prompt library using Gemini.
   */
  app.post('/api/gemini/search-prompts', async (req, res) => {
    try {
      const { query, prompts } = req.body ?? {};
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        res.status(400).json({ error: 'Search query is required.' });
        return;
      }
      if (!Array.isArray(prompts) || prompts.length === 0) {
        res.json({ matches: [] });
        return;
      }

      const catalog = prompts.slice(0, 100).map((p: Record<string, unknown>) => ({
        id: String(p.id ?? ''),
        title: String(p.title ?? ''),
        description: String(p.description ?? ''),
        category: String(p.category ?? ''),
        collectionName: String(p.collectionName ?? ''),
        tags: Array.isArray(p.tags) ? p.tags : [],
        contentExcerpt: String(p.content ?? '').slice(0, 600),
      }));

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `User Search Query: "${query.trim()}"\n\nPrompt Catalog JSON:\n${JSON.stringify(catalog)}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are a semantic search engine for a prompt engineering library. Analyze the user search query and the provided prompt catalog. Return all prompts that are semantically relevant to the user query, ranked from highest relevanceScore (1-100) to lowest. Provide a concise 1-sentence matchReason explaining why each returned prompt fits the request. Omit prompts that are not relevant.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: {
                  type: Type.STRING,
                  description: 'The exact ID of the matched prompt from the catalog.',
                },
                relevanceScore: {
                  type: Type.INTEGER,
                  description: 'Semantic relevance score between 1 and 100.',
                },
                matchReason: {
                  type: Type.STRING,
                  description: 'Concise 1-sentence reason why this prompt matches the query.',
                },
              },
              required: ['id', 'relevanceScore', 'matchReason'],
            },
          },
        },
      });

      const rawText = (response.text ?? '[]').trim();
      const matches = JSON.parse(rawText);

      res.json({
        matches: Array.isArray(matches) ? matches : [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PromptVault server listening on http://localhost:${PORT}`);
  });
}

void startServer();
