# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Ownership & Isolation (`ownerId`)**: Every document in `/prompts/{promptId}` belongs exclusively to a single authenticated user (`ownerId == request.auth.uid`). No user may read (`get` or `list`), create, update, or delete another user's prompts.
2. **Verified Identity**: All write operations (`create`, `update`, `delete`) require an authenticated user with a verified email (`request.auth != null && request.auth.token.email_verified == true`).
3. **Path Variable Hardening**: Every single-document operation (`get`, `create`, `update`, `delete`) validates `promptId` via `isValidId(promptId)` (`1..128` chars matching `^[a-zA-Z0-9_\-]+$`).
4. **Strict Schema & Shadow-Field Prevention**: `isValidPrompt(data)` enforces exact required and allowed keys via `hasAll` and `hasOnly` on every `create` and `update`.
5. **Volumetric & Boundary Enforcement**:
   - `title`: string, `1..120` chars
   - `description`: string, `0..500` chars
   - `content`: string, `1..10000` chars
   - `category`: string, `1..40` chars, strictly in `['Coding', 'Writing', 'Analysis', 'System', 'Research', 'Creative']`
   - `targetModel`: string, `1..60` chars
   - `collectionName`: string, `1..60` chars
   - `tags`: list, `size() <= 8`, and if non-empty, `tags[0]` is a string of `1..32` chars
   - `isPinned`: boolean
   - `usageCount`: integer, `0..1000000` (must start at `0` on `create` and only increment by `+1` on usage update action)
6. **Temporal & Immutable Integrity**:
   - `createdAt` must equal `request.time` on `create` and remain strictly equal to `resource.data.createdAt` on `update`.
   - `updatedAt` must equal `request.time` on both `create` and `update`.
   - `ownerId` must remain strictly equal to `resource.data.ownerId` on `update`.

---

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 — Identity Spoofing on Create**: Authenticated user `user_alpha` sends `ownerId: "user_beta"` when creating a prompt.
2. **Payload 2 — Unverified Email Write**: Authenticated user with `email_verified: false` attempts to create a valid prompt.
3. **Payload 3 — Shadow Field Injection**: Payload includes all required keys plus an undeclared `"isAdmin": true` ghost property.
4. **Payload 4 — Title Boundary Overflow**: `title` contains a 250-character string (exceeding `maxLength: 120`).
5. **Payload 5 — Invalid Category Enum**: `category` is set to `"Hacking"` (outside the allowed 6-category allowlist).
6. **Payload 6 — Tag Array Exhaustion**: `tags` contains 15 elements (exceeding the maximum of 8 tags).
7. **Payload 7 — Non-String Tag Element**: `tags` contains `[12345]` instead of a string.
8. **Payload 8 — Forged Client Timestamp**: `createdAt` is set to a past timestamp (`request.time - 86400s`) instead of `request.time`.
9. **Payload 9 — Ownership Transfer on Update**: Owner attempts an update that changes `ownerId` from `"user_alpha"` to `"user_beta"`.
10. **Payload 10 — Immutable `createdAt` Mutation on Update**: Owner attempts an update that modifies `createdAt` to `request.time`.
11. **Payload 11 — Arbitrary Usage Count Jump**: Owner attempts to update `usageCount` from `0` directly to `9999` instead of incrementing by `+1`.
12. **Payload 12 — Cross-Tenant List / Read Scraping**: User `user_beta` attempts to `get` or `list` prompts where `ownerId == "user_alpha"`.
