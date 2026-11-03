import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  validatePromptDraft,
  type PromptDraftInput,
  type PromptRecord,
  type PromptCategory,
} from './utils/promptLogic';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot as required by Firebase integration specification
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await firebaseSignOut(auth);
}

export { onAuthStateChanged, type User };

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) {
    return val.toMillis();
  }
  if (val && typeof val === 'object' && 'seconds' in val && typeof (val as { seconds: number }).seconds === 'number') {
    return (val as { seconds: number }).seconds * 1000;
  }
  if (typeof val === 'number') {
    return val;
  }
  return Date.now();
}

export function subscribeToUserPrompts(
  userId: string,
  onData: (prompts: PromptRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = 'prompts';
  const q = query(collection(db, path), where('ownerId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const records: PromptRecord[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: String(data.title ?? ''),
          description: String(data.description ?? ''),
          content: String(data.content ?? ''),
          category: (data.category as PromptCategory) || 'Coding',
          targetModel: String(data.targetModel ?? 'Gemini 2.5 Pro'),
          collectionName: String(data.collectionName ?? 'Core Library'),
          tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
          isPinned: Boolean(data.isPinned),
          usageCount: typeof data.usageCount === 'number' ? data.usageCount : 0,
          ownerId: String(data.ownerId ?? userId),
          createdAtMs: toMillis(data.createdAt),
          updatedAtMs: toMillis(data.updatedAt),
          source: 'cloud',
        };
      });
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (formattedErr) {
        onError(formattedErr instanceof Error ? formattedErr : new Error(String(formattedErr)));
      }
    }
  );
}

export async function createCloudPrompt(
  userId: string,
  draft: PromptDraftInput,
  customId?: string
): Promise<string> {
  const validation = validatePromptDraft(draft);
  if (!validation.valid || !validation.sanitized) {
    throw new Error(Object.values(validation.errors).join(' '));
  }

  const promptId =
    customId && /^[a-zA-Z0-9_-]{1,128}$/.test(customId)
      ? customId
      : `prm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const path = `prompts/${promptId}`;
  const { title, description, content, category, targetModel, collectionName, tags, isPinned } =
    validation.sanitized;

  try {
    await setDoc(doc(db, 'prompts', promptId), {
      title,
      description,
      content,
      category,
      targetModel,
      collectionName,
      tags,
      isPinned,
      usageCount: 0,
      ownerId: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return promptId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCloudPrompt(
  promptId: string,
  draft: PromptDraftInput
): Promise<void> {
  const validation = validatePromptDraft(draft);
  if (!validation.valid || !validation.sanitized) {
    throw new Error(Object.values(validation.errors).join(' '));
  }

  const path = `prompts/${promptId}`;
  const { title, description, content, category, targetModel, collectionName, tags, isPinned } =
    validation.sanitized;

  try {
    await updateDoc(doc(db, 'prompts', promptId), {
      title,
      description,
      content,
      category,
      targetModel,
      collectionName,
      tags,
      isPinned,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleCloudPromptPin(
  promptId: string,
  isPinned: boolean
): Promise<void> {
  const path = `prompts/${promptId}`;
  try {
    await updateDoc(doc(db, 'prompts', promptId), {
      isPinned,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function incrementCloudPromptUsage(
  promptId: string,
  currentUsageCount: number
): Promise<void> {
  const path = `prompts/${promptId}`;
  try {
    await updateDoc(doc(db, 'prompts', promptId), {
      usageCount: currentUsageCount + 1,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCloudPrompt(promptId: string): Promise<void> {
  const path = `prompts/${promptId}`;
  try {
    await deleteDoc(doc(db, 'prompts', promptId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
