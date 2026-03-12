import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getStoreValue, setStoreValue } from '../utils/tauriStore';

export interface StudyQuestionRef {
  bankId: string;
  questionId: string;
  addedAt: string;
}

export interface LastSession {
  bankId: string;
  bankName?: string;
  updatedAt: string;
}

interface StudyState {
  favorites: StudyQuestionRef[];
  wrongs: StudyQuestionRef[];
  progressByBank: Record<string, string[]>;
  lastSession: LastSession | null;
  isLoaded: boolean;
  loadStudy: () => Promise<void>;
  toggleFavorite: (bankId: string, questionId: string) => void;
  isFavorite: (bankId: string, questionId: string) => boolean;
  markWrong: (bankId: string, questionId: string, isCorrect: boolean) => void;
  isWrong: (bankId: string, questionId: string) => boolean;
  recordProgress: (bankId: string, questionId: string) => void;
  markBankViewed: (bankId: string, questionIds: string[]) => void;
  saveLastSession: (session: LastSession | null) => void;
}

const storeKey = 'study-state';

const saveState = async (state: Pick<StudyState, 'favorites' | 'wrongs' | 'progressByBank' | 'lastSession'>) => {
  await setStoreValue(storeKey, state);
};

const makeKey = (bankId: string, questionId: string) => `${bankId}::${questionId}`;

export const useStudyStore = create<StudyState>()(
  persist(
    (set, get) => ({
      favorites: [],
      wrongs: [],
      progressByBank: {},
      lastSession: null,
      isLoaded: false,

      loadStudy: async () => {
        const saved = await getStoreValue<Pick<StudyState, 'favorites' | 'wrongs' | 'progressByBank' | 'lastSession'>>(
          storeKey,
          { favorites: [], wrongs: [], progressByBank: {}, lastSession: null }
        );
        set({ ...saved, isLoaded: true });
      },

      toggleFavorite: (bankId, questionId) => {
        set((state) => {
          const key = makeKey(bankId, questionId);
          const exists = state.favorites.find((f) => makeKey(f.bankId, f.questionId) === key);
          let favorites = state.favorites;
          if (exists) {
            favorites = state.favorites.filter((f) => makeKey(f.bankId, f.questionId) !== key);
          } else {
            favorites = [{ bankId, questionId, addedAt: new Date().toISOString() }, ...state.favorites];
          }
          saveState({
            favorites,
            wrongs: state.wrongs,
            progressByBank: state.progressByBank,
            lastSession: state.lastSession
          });
          return { favorites };
        });
      },

      isFavorite: (bankId, questionId) => {
        const key = makeKey(bankId, questionId);
        return get().favorites.some((f) => makeKey(f.bankId, f.questionId) === key);
      },

      markWrong: (bankId, questionId, isCorrect) => {
        set((state) => {
          const key = makeKey(bankId, questionId);
          let wrongs = state.wrongs;
          if (isCorrect) {
            wrongs = state.wrongs.filter((w) => makeKey(w.bankId, w.questionId) !== key);
          } else if (!state.wrongs.some((w) => makeKey(w.bankId, w.questionId) === key)) {
            wrongs = [{ bankId, questionId, addedAt: new Date().toISOString() }, ...state.wrongs];
          }
          saveState({
            favorites: state.favorites,
            wrongs,
            progressByBank: state.progressByBank,
            lastSession: state.lastSession
          });
          return { wrongs };
        });
      },

      isWrong: (bankId, questionId) => {
        const key = makeKey(bankId, questionId);
        return get().wrongs.some((w) => makeKey(w.bankId, w.questionId) === key);
      },

      recordProgress: (bankId, questionId) => {
        set((state) => {
          const existing = new Set(state.progressByBank[bankId] || []);
          existing.add(questionId);
          const progressByBank = {
            ...state.progressByBank,
            [bankId]: Array.from(existing)
          };
          saveState({
            favorites: state.favorites,
            wrongs: state.wrongs,
            progressByBank,
            lastSession: state.lastSession
          });
          return { progressByBank };
        });
      },

      markBankViewed: (bankId, questionIds) => {
        set((state) => {
          const progressByBank = {
            ...state.progressByBank,
            [bankId]: Array.from(new Set(questionIds))
          };
          saveState({
            favorites: state.favorites,
            wrongs: state.wrongs,
            progressByBank,
            lastSession: state.lastSession
          });
          return { progressByBank };
        });
      },

      saveLastSession: (session) => {
        set((state) => {
          const prev = state.lastSession;
          const same =
            prev === session ||
            (prev && session && JSON.stringify(prev) === JSON.stringify(session));
          if (same) return state;
          saveState({
            favorites: state.favorites,
            wrongs: state.wrongs,
            progressByBank: state.progressByBank,
            lastSession: session
          });
          return { lastSession: session };
        });
      }
    }),
    {
      name: storeKey,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        favorites: state.favorites,
        wrongs: state.wrongs,
        progressByBank: state.progressByBank,
        lastSession: state.lastSession
      })
    }
  )
);
