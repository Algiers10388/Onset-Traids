import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase/firebaseConfig';

export interface SavedChatSession {
  id: string;
  title: string;
  modelUsed: string;
  messages: Array<{
    id: string;
    role: 'user' | 'model';
    content: string;
    timestamp: number;
    groundingMetadata?: {
      webSearchQueries?: string[];
      sources?: Array<{ uri: string; title: string }>;
    };
  }>;
  createdAt: number;
  updatedAt: number;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  saveChatToFirestore: (session: SavedChatSession) => Promise<void>;
  savedChats: SavedChatSession[];
  saveStrategyToFirestore: (strategyData: Record<string, unknown>) => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [savedChats, setSavedChats] = useState<SavedChatSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Monitor Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (currentUser) {
        // Sync user profile to Firestore
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            await setDoc(userRef, {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || 'Apex Trader',
              photoURL: currentUser.photoURL || '',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.warn('Could not sync user profile to Firestore:', err);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Listen to User Saved Chats from Firestore
  useEffect(() => {
    if (!user) {
      setSavedChats([]);
      return;
    }

    try {
      const chatsRef = collection(db, 'users', user.uid, 'chats');
      const q = query(chatsRef, orderBy('updatedAt', 'desc'));
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const loaded: SavedChatSession[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            loaded.push({
              id: docSnap.id,
              title: data.title || 'Troubleshooting Session',
              modelUsed: data.modelUsed || 'gemini-3.8-flash',
              messages: typeof data.messages === 'string' ? JSON.parse(data.messages) : data.messages || [],
              createdAt: data.createdAt || Date.now(),
              updatedAt: data.updatedAt || Date.now(),
            });
          });
          setSavedChats(loaded);
        },
        (err) => {
          console.warn('Error reading saved chats from Firestore:', err);
        }
      );

      return () => unsub();
    } catch (err) {
      console.warn('Firestore subscription error:', err);
    }
  }, [user]);

  // Sign In with Google Popup
  const signInWithGoogle = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed';
      console.error('Google Sign-In Error:', err);
      setError(msg);
      throw err;
    }
  };

  // Sign Out
  const signOutUser = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  // Save Chat Session to Firestore
  const saveChatToFirestore = async (session: SavedChatSession) => {
    if (!user) return;
    try {
      const chatDocRef = doc(db, 'users', user.uid, 'chats', session.id);
      await setDoc(
        chatDocRef,
        {
          id: session.id,
          title: session.title,
          modelUsed: session.modelUsed,
          messages: JSON.stringify(session.messages),
          createdAt: session.createdAt,
          updatedAt: Date.now(),
          serverTimestamp: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('Failed to save chat to Firestore:', err);
    }
  };

  // Save Strategy to Firestore
  const saveStrategyToFirestore = async (strategyData: Record<string, unknown>) => {
    if (!user) return;
    try {
      const strategyId = (strategyData.id as string) || 'default-strategy';
      const stratDocRef = doc(db, 'users', user.uid, 'strategies', strategyId);
      await setDoc(
        stratDocRef,
        {
          ...strategyData,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('Failed to save strategy to Firestore:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithGoogle,
        signOutUser,
        saveChatToFirestore,
        savedChats,
        saveStrategyToFirestore,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
