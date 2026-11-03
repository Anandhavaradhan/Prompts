import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTemplateVariables,
  interpolatePromptTemplate,
  calculatePromptMetrics,
  validatePromptDraft,
  filterAndSortPrompts,
  evaluatePromptSecurityRule,
  sanitizeGeminiNamingSuggestion,
  rankPromptsBySemanticMatches,
  type PromptRecord,
} from './src/utils/promptLogic';

const NOW = 1762075996000;

function makeValidPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'TypeScript API Endpoint Architect',
    description: 'Generates type-safe Express routes with Zod validation.',
    content: 'Design an endpoint for {{resource}} supporting {{methods}}.',
    category: 'Coding',
    targetModel: 'Gemini 2.5 Pro',
    collectionName: 'Core Library',
    tags: ['typescript', 'backend'],
    isPinned: true,
    usageCount: 0,
    ownerId: 'user_alpha',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

test('Dirty Dozen Payload 1: Identity Spoofing on Create returns PERMISSION_DENIED', () => {
  const res = evaluatePromptSecurityRule({
    auth: { uid: 'user_alpha', email_verified: true },
    requestTimeMs: NOW,
    promptId: 'prompt_01',
    operation: 'create',
    incomingData: makeValidPayload({ ownerId: 'user_beta' }),
  });
  assert.equal(res.allowed, false);
});

test('Dirty Dozen Payload 2: Unverified Email Write returns PERMISSION_DENIED', () => {
  const res = evaluatePromptSecurityRule({
    auth: { uid: 'user_alpha', email_verified: false },
    requestTimeMs: NOW,
    promptId: 'prompt_01',
    operation: 'create',
    incomingData: makeValidPayload(),
  });
  assert.equal(res.allowed, false);
});

test('Dirty Dozen Payload 3: Shadow Field Injection returns PERMISSION_DENIED', () => {
  const res = evaluatePromptSecurityRule({
    auth: { uid: 'user_alpha', email_verified: true },
    requestTimeMs: NOW,
    promptId: 'prompt_01',
    operation: 'create',
    incomingData: makeValidPayload({ isAdmin: true }),
  });
  assert.equal(res.allowed, false);
});

test('Dirty Dozen Payload 4: Title Boundary Overflow (>120 chars) returns PERMISSION_DENIED', () => {
  const res = evaluatePromptSecurityRule({
    auth: { uid: 'user_alpha', email_verified: true },
    requestTimeMs: NOW,
    promptId: 'prompt_01',
    operation: 'create',
    incomingData: makeValidPayload({ title: 'A'.repeat(250) }),
  });
  assert.equal(res.allowed, false);
});

test('Dirty Dozen Payload 5: Invalid Category Enum returns PERMISSION_DENIED', () => {
  const res = evaluatePromptSecurityRule({
    auth: { uid: 'user_alpha', email_verified: true },
    requestTimeMs: NOW,
    promptId: 'prompt_01',
    operation: 'create',
    incomingData: makeValidPayload({ category: 'Hacking' }),
  });
  assert.equal(res.allowed, false);
});

test('Dirty Dozen Payload 6: Tag Array Exhaustion (>8 tags) returns PERMISSION_DENIED', () => {
  const res = evaluatePromptSecurityRule({
    auth: { uid: 'user_alpha', email_verified: true },
    requestTimeMs: NOW,
    promptId: 'prompt_01',
    operation: 'create',
    incomingData: makeValidPayload({
      tags: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10'],
    }),
  });
  assert.equal(res.allowed, false);
});

test('Dirty Dozen Payload 7: Non-String Tag Element returns PERMISSION_DENIED', () => {
  const res = evaluatePromptSecurityRule({
    auth: { uid: 'user_alpha', email_verified: true },
    requestTimeMs: NOW,
    promptId: 'prompt_01',
    operation: 'create',
    incomingData: makeValidPayload({ tags: [12345] }),
  });
  assert.equal(res.allowed, false);
});

test('Dirty Dozen Payload 8: Forged Client Timestamp returns PERMISSION_DENIED', () => {
  const res = evaluatePromptSecurityRule({
    auth: { uid: 'user_alpha', email_verified: true },
    requestTimeMs: NOW,
    promptId: 'prompt_01',
    operation: 'create',
    incomingData: makeValidPayload({ createdAt: NOW - 86400000 }),
  });
  assert.equal(res.allowed, false);
});

test('Dirty Dozen Payload 9: Ownership Transfer on Update returns PERMISSION_DENIED', () => {
  const existing = makeValidPayload();
  const res = evaluatePromptSecurityRule({
    auth: { uid: 'user_alpha', email_verified: true },
    requestTimeMs: NOW + 5000,
    promptId: 'prompt_01',
    operation: 'update',
    existingData: existing,
    incomingData: makeValidPayload({ ownerId: 'user_beta', updatedAt: NOW + 5000 }),
  });
  assert.equal(res.allowed, false);
});

test('Dirty Dozen Payload 10: Immutable createdAt Mutation on Update returns PERMISSION_DENIED', () => {
  const existing = makeValidPayload();
  const res = evaluatePromptSecurityRule({
    auth: { uid: 'user_alpha', email_verified: true },
    requestTimeMs: NOW + 5000,
    promptId: 'prompt_01',
    operation: 'update',
    existingData: existing,
    incomingData: makeValidPayload({ createdAt: NOW + 5000, updatedAt: NOW + 5000 }),
  });
  assert.equal(res.allowed, false);
});

test('Dirty Dozen Payload 11: Arbitrary Usage Count Jump returns PERMISSION_DENIED', () => {
  const existing = makeValidPayload();
  const res = evaluatePromptSecurityRule({
    auth: { uid: 'user_alpha', email_verified: true },
    requestTimeMs: NOW + 5000,
    promptId: 'prompt_01',
    operation: 'update',
    existingData: existing,
    incomingData: makeValidPayload({ usageCount: 9999, updatedAt: NOW + 5000 }),
  });
  assert.equal(res.allowed, false);
});

test('Dirty Dozen Payload 12: Cross-Tenant List / Read Scraping returns PERMISSION_DENIED', () => {
  const existing = makeValidPayload({ ownerId: 'user_alpha' });
  const res = evaluatePromptSecurityRule({
    auth: { uid: 'user_beta', email_verified: true },
    requestTimeMs: NOW,
    promptId: 'prompt_01',
    operation: 'list',
    existingData: existing,
  });
  assert.equal(res.allowed, false);
});

test('Template variable extraction and interpolation work accurately', () => {
  const template = 'Write a {{tone}} summary about {{topic}} for {{audience}}. Repeat {{topic}}.';
  const vars = extractTemplateVariables(template);
  assert.deepEqual(vars, ['tone', 'topic', 'audience']);

  const compiled = interpolatePromptTemplate(template, {
    tone: 'concise',
    topic: 'distributed consensus',
  });
  assert.equal(
    compiled,
    'Write a concise summary about distributed consensus for {{audience}}. Repeat distributed consensus.'
  );

  const metrics = calculatePromptMetrics(template);
  assert.equal(metrics.variableCount, 3);
  assert.ok(metrics.estimatedTokens > 0);
});

test('Draft validation enforces blueprint limits and sanitizes tags', () => {
  const invalid = validatePromptDraft({
    title: '',
    description: 'desc',
    content: '',
    category: 'InvalidCat',
    targetModel: 'Gemini 2.5 Pro',
    collectionName: 'Core Library',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.title);
  assert.ok(invalid.errors.content);
  assert.ok(invalid.errors.category);

  const valid = validatePromptDraft({
    title: '  SQL Query Optimizer  ',
    description: '  Analyzes query plans  ',
    content: 'Analyze this SQL query: {{sql_query}}',
    category: 'Coding',
    targetModel: 'Gemini 2.5 Pro',
    collectionName: 'Core Library',
    tagsInput: 'SQL, Postgres, sql, performance',
    isPinned: true,
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.sanitized?.tags, ['sql', 'postgres', 'performance']);
});

test('Filtering and sorting prioritizes pinned prompts and matches query', () => {
  const items: PromptRecord[] = [
    {
      id: '1',
      title: 'Alpha Prompt',
      description: 'First item',
      content: 'Hello {{name}}',
      category: 'Writing',
      targetModel: 'Gemini 2.5 Flash',
      collectionName: 'Core Library',
      tags: ['alpha'],
      isPinned: false,
      usageCount: 10,
      ownerId: 'u1',
      createdAtMs: 100,
      updatedAtMs: 100,
    },
    {
      id: '2',
      title: 'Beta System Architect',
      description: 'Second item',
      content: 'Architect {{service}}',
      category: 'Coding',
      targetModel: 'Gemini 2.5 Pro',
      collectionName: 'Production Systems',
      tags: ['architecture'],
      isPinned: true,
      usageCount: 2,
      ownerId: 'u1',
      createdAtMs: 200,
      updatedAtMs: 200,
    },
  ];

  const sorted = filterAndSortPrompts(items, {
    searchQuery: '',
    category: 'All',
    collectionName: 'All',
    pinnedOnly: false,
    sortBy: 'usage',
  });
  assert.equal(sorted[0].id, '2'); // Pinned comes first

  const searched = filterAndSortPrompts(items, {
    searchQuery: 'architect',
    category: 'Coding',
    collectionName: 'All',
    pinnedOnly: false,
    sortBy: 'updated',
  });
  assert.equal(searched.length, 1);
  assert.equal(searched[0].id, '2');
});

test('Gemini naming suggestion sanitizer enforces blueprint limits and valid categories', () => {
  const sanitized = sanitizeGeminiNamingSuggestion(
    {
      title: '  Kubernetes Pod CrashLoopBackOff Diagnostic Assistant  ',
      description: '  Diagnoses pod restart loops from kubectl describe and container logs.  ',
      category: 'System',
      tags: ['Kubernetes', 'K8s', 'Debugging!'],
    },
    'Coding'
  );
  assert.equal(sanitized.title, 'Kubernetes Pod CrashLoopBackOff Diagnostic Assistant');
  assert.equal(sanitized.category, 'System');
  assert.deepEqual(sanitized.tags, ['kubernetes', 'k8s', 'debugging']);

  const fallback = sanitizeGeminiNamingSuggestion(
    {
      title: '',
      description: 'Valid description',
      category: 'NonExistentCategory',
      tags: [],
    },
    'Analysis'
  );
  assert.equal(fallback.title, 'Untitled Prompt Template');
  assert.equal(fallback.category, 'Analysis');
});

test('Gemini semantic search ranking orders prompts by relevance score and attaches match reasons', () => {
  const prompts: PromptRecord[] = [
    {
      id: 'p1',
      title: 'First Prompt',
      description: 'd1',
      content: 'c1',
      category: 'Coding',
      targetModel: 'Gemini 2.5 Pro',
      collectionName: 'Core Library',
      tags: [],
      isPinned: false,
      usageCount: 0,
      ownerId: 'u1',
      createdAtMs: 1,
      updatedAtMs: 1,
    },
    {
      id: 'p2',
      title: 'Second Prompt',
      description: 'd2',
      content: 'c2',
      category: 'System',
      targetModel: 'Gemini 2.5 Pro',
      collectionName: 'Core Library',
      tags: [],
      isPinned: false,
      usageCount: 0,
      ownerId: 'u1',
      createdAtMs: 2,
      updatedAtMs: 2,
    },
  ];

  const { rankedPrompts, reasonsById } = rankPromptsBySemanticMatches(prompts, [
    { id: 'p1', relevanceScore: 65, matchReason: 'Partially relevant to backend code' },
    { id: 'p2', relevanceScore: 94, matchReason: 'Directly addresses system security rules' },
  ]);

  assert.equal(rankedPrompts.length, 2);
  assert.equal(rankedPrompts[0].id, 'p2');
  assert.equal(rankedPrompts[1].id, 'p1');
  assert.equal(reasonsById['p2'].score, 94);
  assert.equal(reasonsById['p2'].reason, 'Directly addresses system security rules');
});

