import type { PromptRecord } from '../utils/promptLogic';

export const SEED_PROMPTS: PromptRecord[] = [
  {
    id: 'seed_typescript_api_architect',
    title: 'Type-Safe REST & RPC Endpoint Architect',
    description:
      'Designs production-ready TypeScript endpoints with strict input schema validation, idempotency handling, and structured error envelopes.',
    content: `Act as a Staff Backend Engineer. Design a production-ready {{framework}} endpoint for managing {{resource_name}}.

Requirements:
1. Define strict request body, query parameter, and response schemas using {{validation_library}}.
2. Include explicit HTTP status codes and deterministic error envelopes for validation, authorization, and conflict edge cases.
3. Enforce idempotency and rate-limiting boundaries suitable for {{traffic_tier}} load.
4. Provide clean, copy-pasteable TypeScript implementation code with zero 'any' types.`,
    category: 'Coding',
    targetModel: 'Gemini 2.5 Pro',
    collectionName: 'Code Architecture',
    tags: ['typescript', 'api-design', 'backend', 'validation'],
    isPinned: true,
    usageCount: 42,
    ownerId: 'local_workspace',
    createdAtMs: 1761900000000,
    updatedAtMs: 1762060000000,
    source: 'local',
  },
  {
    id: 'seed_firestore_security_auditor',
    title: 'Zero-Trust Firestore Security Rules Synthesizer',
    description:
      'Generates attribute-based access control (ABAC) Firestore rules with strict key allowlists, size bounds, and immutable timestamp checks.',
    content: `You are a Principal Cloud Security Architect specializing in Firebase Firestore Security Rules v2.

Given the collection path {{collection_path}} and entity fields {{entity_fields}}:
1. Write a standalone isValid{{entity_name}}(data) validation helper that checks data.keys().hasAll(...) and data.keys().hasOnly(...).
2. Enforce explicit .size() upper and lower bounds on every string and list field.
3. Require request.auth.token.email_verified == true on all write operations.
4. Ensure ownerId ({{owner_field}}) matches request.auth.uid on creation and remains immutable during updates.
5. Partition allow update into explicit actions using incoming().diff(existing()).affectedKeys().hasOnly([...]).`,
    category: 'System',
    targetModel: 'Gemini 2.5 Pro',
    collectionName: 'Production Systems',
    tags: ['firebase', 'firestore', 'security-rules', 'abac'],
    isPinned: true,
    usageCount: 31,
    ownerId: 'local_workspace',
    createdAtMs: 1761920000000,
    updatedAtMs: 1762050000000,
    source: 'local',
  },
  {
    id: 'seed_sql_query_diagnostic',
    title: 'PostgreSQL EXPLAIN ANALYZE Bottleneck Profiler',
    description:
      'Diagnoses high-cost sequential scans, index bloat, and join cardinality mismatches from PostgreSQL query execution plans.',
    content: `Analyze the following PostgreSQL query and EXPLAIN (ANALYZE, BUFFERS) output for table {{table_name}}:

Query:
{{sql_query}}

Execution Plan:
{{explain_output}}

Provide:
1. The exact plan node causing the primary latency or buffer read bottleneck.
2. Composite or partial B-Tree / GIN index DDL statements to eliminate sequential scans or sort spills.
3. A rewritten query preserving identical semantics while reducing estimated I/O cost.`,
    category: 'Analysis',
    targetModel: 'Claude 3.7 Sonnet',
    collectionName: 'Code Architecture',
    tags: ['postgresql', 'sql', 'performance', 'indexing'],
    isPinned: false,
    usageCount: 19,
    ownerId: 'local_workspace',
    createdAtMs: 1761850000000,
    updatedAtMs: 1762010000000,
    source: 'local',
  },
  {
    id: 'seed_incident_postmortem',
    title: 'Blameless Production Incident Postmortem Writer',
    description:
      'Transforms raw incident timeline notes into a structured engineering postmortem with root cause analysis and concrete remediation items.',
    content: `Convert the following raw incident log for {{service_name}} (Severity: {{severity_level}}) into a clear, blameless engineering postmortem.

Incident Timeline & Notes:
{{incident_notes}}

Structure the output with:
- Executive Summary (duration, customer impact metric, root trigger)
- Minute-by-Minute UTC Timeline
- Contributing Factors & Detection Gaps
- Actionable Remediation Tasks (categorized into Immediate Mitigation vs. Long-Term Architectural Hardening)`,
    category: 'Writing',
    targetModel: 'Gemini 2.5 Flash',
    collectionName: 'Production Systems',
    tags: ['sre', 'postmortem', 'incident-response', 'documentation'],
    isPinned: false,
    usageCount: 27,
    ownerId: 'local_workspace',
    createdAtMs: 1761800000000,
    updatedAtMs: 1761990000000,
    source: 'local',
  },
  {
    id: 'seed_literature_synthesis',
    title: 'Comparative Technical Paper & RFC Synthesis Matrix',
    description:
      'Extracts methodology trade-offs, empirical benchmarks, and failure modes across multiple technical papers or architecture RFCs.',
    content: `Synthesize a rigorous technical comparison on {{research_topic}} based on the following source material or constraints:

{{source_excerpt}}

Evaluate and compare across these dimensions:
1. Core algorithmic or architectural mechanism
2. Throughput, latency, or memory scaling trade-offs under {{workload_profile}}
3. Known failure modes and operational complexity
4. Recommendation matrix for when a team should adopt vs. avoid this approach.`,
    category: 'Research',
    targetModel: 'Gemini 2.5 Pro',
    collectionName: 'Research & Synthesis',
    tags: ['research', 'rfc', 'benchmarks', 'architecture'],
    isPinned: false,
    usageCount: 15,
    ownerId: 'local_workspace',
    createdAtMs: 1761750000000,
    updatedAtMs: 1761950000000,
    source: 'local',
  },
  {
    id: 'seed_product_release_copy',
    title: 'Developer Changelog & Release Note Distiller',
    description:
      'Turns raw git commit histories and PR descriptions into crisp, developer-focused release notes with migration callouts.',
    content: `Write release notes for version {{release_version}} of {{product_name}} targeted at {{target_audience}}.

Raw PRs & Commits:
{{commit_list}}

Guidelines:
- Lead with the highest-impact workflow improvement and a concrete before/after example.
- Group changes cleanly into New Capabilities, Performance Improvements, and Breaking Changes.
- Avoid marketing fluff or superlatives; state exact technical behavior and upgrade steps.`,
    category: 'Editorial' as unknown as PromptRecord['category'], // wait - let's use 'Writing' so it matches PROMPT_CATEGORIES strictly!
    targetModel: 'GPT-4o',
    collectionName: 'Editorial & Copy',
    tags: ['changelog', 'release-notes', 'developer-experience'],
    isPinned: false,
    usageCount: 23,
    ownerId: 'local_workspace',
    createdAtMs: 1761700000000,
    updatedAtMs: 1761910000000,
    source: 'local',
  },
].map((item) => ({
  ...item,
  category: item.category === ('Editorial' as unknown) ? 'Writing' : item.category,
}));
