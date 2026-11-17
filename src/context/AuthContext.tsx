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

export interface AppAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  provider: 'password' | 'google';
  getIdToken?: () => Promise<string>;
}

interface AuthContextType {
  user: AppAuthUser | null;
  firebaseUser: User | null;
  loading: boolean;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  authModalOpen: boolean;
  authModalMode: 'login' | 'signup';
  openAuthModal: (mode?: 'login' | 'signup') => void;
  closeAuthModal: () => void;
  saveChatToFirestore: (session: SavedChatSession) => Promise<void>;
  savedChats: SavedChatSession[];
  saveStrategyToFirestore: (strategyData: Record<string, unknown>) => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [passwordUser, setPasswordUser] = useState<AppAuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [savedChats, setSavedChats] = useState<SavedChatSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');

  // Hydrate email/password server session on mount
  useEffect(() => {
    let mounted = true;
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        if (data?.authenticated && data.user) {
          setPasswordUser({
            uid: data.user.uid,
            email: data.user.email,
            displayName: data.user.displayName || data.user.email,
            photoURL: null,
            provider: 'password',
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Monitor Firebase Auth State (Google OAuth optional)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setFirebaseUser(currentUser);
      setLoading(false);

      if (currentUser) {
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

  const user: AppAuthUser | null = firebaseUser
    ? {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
        provider: 'google',
        getIdToken: () => firebaseUser.getIdToken(),
      }
    : passwordUser;

  // Listen to User Saved Chats from Firestore (when authenticated with Firebase)
  useEffect(() => {
    if (!firebaseUser) {
      setSavedChats([]);
      return;
    }

    try {
      const chatsRef = collection(db, 'users', firebaseUser.uid, 'chats');
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
              modelUsed: data.modelUsed || 'gemini-4-hydrogen',
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
  }, [firebaseUser]);

  const signUpWithEmail = async (email: string, password: string, displayName?: string) => {
    setError(null);
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, displayName }),
    });
    const data = await res.json();
    if (!res.ok || !data.success || !data.user) {
      const msg = data?.error || 'Sign up failed';
      setError(msg);
      throw new Error(msg);
    }
    setPasswordUser({
      uid: data.user.uid,
      email: data.user.email,
      displayName: data.user.displayName || data.user.email,
      photoURL: null,
      provider: 'password',
    });
    setAuthModalOpen(false);
  };

  const signInWithEmail = async (email: string, password: string) => {
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok || !data.success || !data.user) {
      const msg = data?.error || 'Invalid email or password';
      setError(msg);
      throw new Error(msg);
    }
    setPasswordUser({
      uid: data.user.uid,
      email: data.user.email,
      displayName: data.user.displayName || data.user.email,
      photoURL: null,
      provider: 'password',
    });
    setAuthModalOpen(false);
  };

  // Sign In with Google Popup
  const signInWithGoogle = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      setAuthModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed';
      console.error('Google Sign-In Error:', err);
      setError(msg);
      throw err;
    }
  };

  // Sign Out (both password session & Firebase auth)
  const signOutUser = async () => {
    setError(null);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    setPasswordUser(null);
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Firebase sign-out error:', err);
    }
  };

  const openAuthModal = (mode: 'login' | 'signup' = 'login') => {
    setError(null);
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setError(null);
    setAuthModalOpen(false);
  };

  // Save Chat Session to Firestore
  const saveChatToFirestore = async (session: SavedChatSession) => {
    if (!firebaseUser) return;
    try {
      const chatDocRef = doc(db, 'users', firebaseUser.uid, 'chats', session.id);
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
    if (!firebaseUser) return;
    try {
      const strategyId = (strategyData.id as string) || 'default-strategy';
      const stratDocRef = doc(db, 'users', firebaseUser.uid, 'strategies', strategyId);
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
        firebaseUser,
        loading,
        signUpWithEmail,
        signInWithEmail,
        signInWithGoogle,
        signOutUser,
        authModalOpen,
        authModalMode,
        openAuthModal,
        closeAuthModal,
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
