import { create } from 'zustand';
import { Question, ExamState, UserAnswer, QuestionResult, QuestionStatus, AnswerWithImages } from '../types';
import { calculateSubjectiveScore } from '../utils/similarity';

function isAnswerWithImages(answer: unknown): answer is AnswerWithImages {
  return typeof answer === 'object' && answer !== null && 'text' in answer;
}

function getAnswerTextForComparison(correctAnswer: string | string[] | AnswerWithImages): string {
  if (isAnswerWithImages(correctAnswer)) {
    return correctAnswer.text;
  }
  if (Array.isArray(correctAnswer)) {
    return correctAnswer.join(', ');
  }
  return String(correctAnswer);
}

interface ExamStore {
  examState: ExamState | null;
  startExam: (
    mode: 'bank' | 'favorites' | 'wrong',
    bankId: string,
    bankName: string,
    questions: Question[],
    questionKeys: string[]
  ) => void;
  setAnswer: (questionId: string, answer: string | string[]) => void;
  getAnswer: (questionId: string) => string | string[] | undefined;
  confirmAnswer: (questionId: string) => void;
  setResult: (questionId: string, result: QuestionResult) => void;
  getResult: (questionId: string) => QuestionResult | undefined;
  getQuestionStatus: (questionId: string) => QuestionStatus;
  nextQuestion: () => void;
  prevQuestion: () => void;
  goToQuestion: (index: number) => void;
  finishExam: () => UserAnswer[];
  resetExam: () => void;
  getCurrentQuestion: () => Question | undefined;
  getProgress: () => { answered: number; total: number };
  getStatistics: () => { correct: number; incorrect: number; totalScore: number; maxScore: number };
  isAllConfirmed: () => boolean;
}

const checkAnswer = (question: Question, answer: string | string[]): { isCorrect: boolean; score: number } => {
  if (question.type === 'single-choice') {
    const isCorrect = answer === question.correctAnswer;
    return { isCorrect, score: isCorrect ? question.score : 0 };
  }
  
  if (question.type === 'multiple-choice') {
    const correctSet = new Set(
      (question.correctAnswer as string[]).filter((v) => typeof v === 'string')
    );
    const userSet = new Set(answer as string[]);
    const isCorrect =
      correctSet.size === userSet.size &&
      [...correctSet].every((item) => userSet.has(item));
    return { isCorrect, score: isCorrect ? question.score : 0 };
  }
  
  if (question.type === 'fill-in-blank') {
    const rawCorrectAnswer = question.correctAnswer;
    const correctAnswers: string[] = Array.isArray(rawCorrectAnswer) 
      ? rawCorrectAnswer.filter((a): a is string => typeof a === 'string')
      : (typeof rawCorrectAnswer === 'string' ? [rawCorrectAnswer] : []);
    const userAnswers = Array.isArray(answer) 
      ? answer 
      : [answer];

    const normalizedCorrect = correctAnswers.map(a => a.toLowerCase().trim());
    const normalizedUserFull = userAnswers.map(a => String(a ?? '').toLowerCase().trim());
    const normalizedUser = normalizedUserFull.filter(a => a !== '');
    const allowDisorder = question.allowDisorder ?? false;

    if (allowDisorder) {
      const duplicateSet = new Set<string>();
      const seen = new Set<string>();
      normalizedUser.forEach((a) => {
        if (seen.has(a)) duplicateSet.add(a);
        seen.add(a);
      });
      if (duplicateSet.size > 0) {
        return { isCorrect: false, score: 0 };
      }
    } else {
      const isPositionCorrect = normalizedUserFull.map(
        (value, idx) => Boolean(value) && value === normalizedCorrect[idx]
      );
      const counts = new Map<string, number>();
      normalizedUserFull.forEach((value, idx) => {
        if (!value || isPositionCorrect[idx]) return;
        counts.set(value, (counts.get(value) ?? 0) + 1);
      });
      const hasDuplicates = [...counts.values()].some((count) => count > 1);
      if (hasDuplicates) {
        return { isCorrect: false, score: 0 };
      }
    }
    
    if (correctAnswers.length === 0) {
      return { isCorrect: false, score: 0 };
    }
    
    let correctCount = 0;
    
    if (allowDisorder) {
      const matchedIndices = new Set<number>();
      for (const userAns of normalizedUserFull) {
        for (let i = 0; i < normalizedCorrect.length; i++) {
          if (!matchedIndices.has(i) && normalizedCorrect[i] === userAns) {
            correctCount++;
            matchedIndices.add(i);
            break;
          }
        }
      }
    } else {
      for (let i = 0; i < normalizedCorrect.length; i++) {
        if (normalizedUserFull[i] === normalizedCorrect[i]) {
          correctCount++;
        }
      }
    }
    
    const scorePerBlank = question.score / correctAnswers.length;
    const totalScore = Math.round(correctCount * scorePerBlank);
    const isCorrect = correctCount === correctAnswers.length;
    
    return { isCorrect, score: totalScore };
  }
  
  if (question.type === 'subjective') {
    const result = calculateSubjectiveScore(
      answer as string,
      getAnswerTextForComparison(question.correctAnswer),
      question.score
    );
    const isCorrect = result.similarity >= 0.8;
    return { isCorrect, score: result.score };
  }
  
  return { isCorrect: false, score: 0 };
};

export const useExamStore = create<ExamStore>((set, get) => ({
  examState: null,
  
  startExam: (mode, bankId, bankName, questions, questionKeys) => {
    const answers = new Map();
    const results = new Map();
    const startIndex = 0;
    set({
      examState: {
        bankId,
        bankName,
        mode,
        questions,
        questionKeys,
        currentIndex: startIndex,
        answers,
        results,
        startTime: Date.now(),
        isFinished: false
      }
    });
  },
  
  setAnswer: (questionId, answer) => {
    set((state) => {
      if (!state.examState) return state;
      const newAnswers = new Map(state.examState.answers);
      newAnswers.set(questionId, answer);
      return {
        examState: {
          ...state.examState,
          answers: newAnswers
        }
      };
    });
  },
  
  getAnswer: (questionId) => {
    return get().examState?.answers.get(questionId);
  },
  
  confirmAnswer: (questionId) => {
    const state = get();
    if (!state.examState) return;
    
    const question = state.examState.questions.find(q => q.id === questionId);
    const answer = state.examState.answers.get(questionId);
    
    if (!question || answer === undefined) return;
    
    const { isCorrect, score } = checkAnswer(question, answer);
    
    const result: QuestionResult = {
      answer,
      isConfirmed: true,
      isCorrect,
      score
    };
    
    set((state) => {
      if (!state.examState) return state;
      const newResults = new Map(state.examState.results);
      newResults.set(questionId, result);
      return {
        examState: {
          ...state.examState,
          results: newResults
        }
      };
    });
  },

  setResult: (questionId, result) => {
    set((state) => {
      if (!state.examState) return state;
      const newResults = new Map(state.examState.results);
      newResults.set(questionId, result);
      return {
        examState: {
          ...state.examState,
          results: newResults
        }
      };
    });
  },
  
  getResult: (questionId) => {
    return get().examState?.results.get(questionId);
  },
  
  getQuestionStatus: (questionId) => {
    const state = get();
    if (!state.examState) return 'unanswered';
    
    const result = state.examState.results.get(questionId);
    if (!result) return 'unanswered';
    
    return result.isCorrect ? 'correct' : 'incorrect';
  },
  
  nextQuestion: () => {
    set((state) => {
      if (!state.examState) return state;
      const nextIndex = Math.min(
        state.examState.currentIndex + 1,
        state.examState.questions.length - 1
      );
      return {
        examState: {
          ...state.examState,
          currentIndex: nextIndex
        }
      };
    });
  },
  
  prevQuestion: () => {
    set((state) => {
      if (!state.examState) return state;
      const prevIndex = Math.max(state.examState.currentIndex - 1, 0);
      return {
        examState: {
          ...state.examState,
          currentIndex: prevIndex
        }
      };
    });
  },
  
  goToQuestion: (index) => {
    set((state) => {
      if (!state.examState) return state;
      const clampedIndex = Math.max(0, Math.min(index, state.examState.questions.length - 1));
      return {
        examState: {
          ...state.examState,
          currentIndex: clampedIndex
        }
      };
    });
  },
  
  finishExam: () => {
    const state = get();
    if (!state.examState) return [];
    
    const userAnswers: UserAnswer[] = state.examState.questions.map((question) => {
      const result = state.examState!.results.get(question.id);
      const answer = state.examState!.answers.get(question.id);
      
      if (result) {
        return {
          questionId: question.id,
          answer: result.answer,
          score: result.score
        };
      }
      
      if (answer !== undefined) {
        const { score } = checkAnswer(question, answer);
        return {
          questionId: question.id,
          answer,
          score
        };
      }
      
      return {
        questionId: question.id,
        answer: '',
        score: 0
      };
    });
    
    set((state) => ({
      examState: state.examState
        ? { ...state.examState, isFinished: true }
        : null
    }));
    
    return userAnswers;
  },
  
  resetExam: () => {
    set({ examState: null });
  },
  
  getCurrentQuestion: () => {
    const state = get();
    if (!state.examState) return undefined;
    return state.examState.questions[state.examState.currentIndex];
  },
  
  getProgress: () => {
    const state = get();
    if (!state.examState) return { answered: 0, total: 0 };
    return {
      answered: state.examState.results.size,
      total: state.examState.questions.length
    };
  },
  
  getStatistics: () => {
    const state = get();
    if (!state.examState) return { correct: 0, incorrect: 0, totalScore: 0, maxScore: 0 };
    
    let correct = 0;
    let incorrect = 0;
    let totalScore = 0;
    
    state.examState.results.forEach((result) => {
      if (result.isConfirmed) {
        if (result.isCorrect) {
          correct++;
        } else {
          incorrect++;
        }
        totalScore += result.score;
      }
    });
    
    const maxScore = state.examState.questions.reduce((sum, q) => sum + q.score, 0);
    
    return { correct, incorrect, totalScore, maxScore };
  },
  
  isAllConfirmed: () => {
    const state = get();
    if (!state.examState) return false;
    return state.examState.results.size === state.examState.questions.length;
  }
}));
