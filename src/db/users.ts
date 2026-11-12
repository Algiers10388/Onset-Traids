import { db } from './index.ts';
import { users } from './schema.ts';

const inMemoryUsers = new Map<string, any>();

export async function getOrCreateUser(uid: string, email: string) {
  if (process.env.SQL_HOST) {
    try {
      const result = await db
        .insert(users)
        .values({
          uid,
          email,
        })
        .onConflictDoUpdate({
          target: users.uid,
          set: {
            email,
          },
        })
        .returning();

      return result[0];
    } catch (error) {
      console.warn('Failed to get or create user in Cloud SQL, using in-memory store:', error);
    }
  }

  const existing = inMemoryUsers.get(uid);
  if (existing) {
    existing.email = email;
    return existing;
  }
  const newUser = { id: Date.now(), uid, email, createdAt: new Date() };
  inMemoryUsers.set(uid, newUser);
  return newUser;
}
