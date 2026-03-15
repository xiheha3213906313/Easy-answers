import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useExamStore } from '../store/examStore';
import { useQuestionBankStore } from '../store/questionBankStore';
import { useRecordStore } from '../store/recordStore';
import { Question, AnswerWithImages } from '../types';
import { useStudyStore } from '../store/studyStore';
import { useSettingsStore } from '../store/settingsStore';
import { gradeSubjectiveAnswer, gradeFillBlankAnswer, generateAiExplanation } from '../utils/aiGrader';
import { useLogStore } from '../store/logStore';
import { alertDialog } from '../store/confirmStore';

function isAnswerWithImages(answer: unknown): answer is AnswerWithImages {
  return typeof answer === 'object' && answer !== null && 'text' in answer;
}

function getAnswerText(correctAnswer: string | string[] | AnswerWithImages): string {
  if (isAnswerWithImages(correctAnswer)) {
    return correctAnswer.text;
  }
  if (Array.isArray(correctAnswer)) {
    return correctAnswer.join(', ');
  }
  return String(correctAnswer);
}

function getAnswerImages(correctAnswer: string | string[] | AnswerWithImages): string[] | undefined {
  if (isAnswerWithImages(correctAnswer)) {
    return correctAnswer.images;
  }
  return undefined;
}

function formatReferenceAnswer(text: string): React.ReactNode {
  const lines: React.ReactNode[] = [];
  let key = 0;
  
  const segments = text.split(/\n/).filter(Boolean);
  
  if (segments.length <= 1 && !text.match(/[；;]/)) {
    return text;
  }
  
  segments.forEach((segment) => {
    const trimmed = segment.trim();
    if (!trimmed) return;
    
    const isChineseHeader = /^[一二三四五六七八九十]+、/.test(trimmed);
    
    if (isChineseHeader) {
      lines.push(<div key={key++} className="font-medium mt-2">{trimmed}</div>);
    } else {
      const parts = trimmed.split(/(?<![（(])(?=[；;])/g).filter(Boolean);
      
      if (parts.length > 1) {
        const items: React.ReactNode[] = [];
        parts.forEach((part) => {
          const content = part.replace(/^[；;]/, '').trim();
          if (content) {
            items.push(<li key={key++}>{content}</li>);
          }
        });
        if (items.length > 0) {
          lines.push(
            <ul key={key++} className="list-disc list-inside ml-4 my-1">
              {items}
            </ul>
          );
        }
      } else {
        lines.push(<div key={key++} className="my-1">{trimmed}</div>);
      }
    }
  });
  
  if (lines.length === 0) {
    return text;
  }
  
  return <>{lines}</>;
}

function normalizeLoose(value: string): string {
  return (value ?? '').toString().replace(/[\s\p{P}\p{S}]+/gu, '').toLowerCase().trim();
}

function computeDuplicateFlags(userAnswers: string[], correctAnswers: string[], allowDisorder: boolean): boolean[] {
  const normalizedUser = userAnswers.map((a) => normalizeLoose(a));
  if (allowDisorder) {
    const counts = new Map<string, number>();
    normalizedUser.forEach((value) => {
      if (!value) return;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    });
    return normalizedUser.map((value) => Boolean(value) && (counts.get(value) ?? 0) > 1);
  }
  const normalizedCorrect = correctAnswers.map((a) => normalizeLoose(a));
  const isPositionCorrect = normalizedUser.map(
    (value, idx) => Boolean(value) && value === normalizedCorrect[idx]
  );
  const counts = new Map<string, number>();
  normalizedUser.forEach((value, idx) => {
    if (!value || isPositionCorrect[idx]) return;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return normalizedUser.map((value, idx) => {
    if (!value || isPositionCorrect[idx]) return false;
    return (counts.get(value) ?? 0) > 1;
  });
}

const Exam: React.FC = () => {
  const { bankId, mode } = useParams<{ bankId?: string; mode?: string }>();
  const navigate = useNavigate();
  const { getBank } = useQuestionBankStore();
  const { 
    examState, 
    startExam, 
    setAnswer, 
    getAnswer, 
    confirmAnswer, 
    setResult,
    getResult,
    nextQuestion, 
    prevQuestion, 
    goToQuestion,
    finishExam, 
    resetExam,
    getStatistics,
    isAllConfirmed
  } = useExamStore();
  const { addRecord } = useRecordStore();
  const {
    favorites,
    wrongs,
    toggleFavorite,
    recordProgress,
    markWrong,
    saveLastSession
  } = useStudyStore();
  const { aiSmartEnabled, aiGradingEnabled, aiExplainEnabled, aiConfig, aiNativeReady, realtimeCheckEnabled } = useSettingsStore();
  const { addLog } = useLogStore();
  const [fillTouched, setFillTouched] = useState<Record<string, Set<number>>>({});
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [judgingById, setJudgingById] = useState<Record<string, boolean>>({});
  const [judgingMessageById, setJudgingMessageById] = useState<Record<string, string>>({});
  const [aiExplainById, setAiExplainById] = useState<Record<string, { loading: boolean; text?: string }>>({});
  const [explainMessageById, setExplainMessageById] = useState<Record<string, string>>({});
  const [explainUsedById, setExplainUsedById] = useState<Record<string, boolean>>({});
  const [showQuestionPicker, setShowQuestionPicker] = useState(false);

  const examMode: 'bank' | 'favorites' | 'wrong' =
    mode === 'favorites' ? 'favorites' : mode === 'wrong' ? 'wrong' : 'bank';
  const bank = examMode === 'bank' && bankId ? getBank(bankId) : undefined;
  const modeLabel = examMode === 'favorites' ? '我的收藏' : examMode === 'wrong' ? '错题本' : bank?.name || '题库';

  const questionKeysFromRefs = useMemo(() => {
    const refs = examMode === 'favorites' ? favorites : wrongs;
    return refs.map((r) => `${r.bankId}::${r.questionId}`);
  }, [examMode, favorites, wrongs]);

  const questionsFromKeys = useMemo(() => {
    const keyList = questionKeysFromRefs;
    return keyList
      .map((key) => {
        const [bId, qId] = key.split('::');
        const b = getBank(bId);
        const q = b?.questions.find((item) => item.id === qId);
        return q ? { key, question: q } : null;
      })
      .filter((item): item is { key: string; question: Question } => !!item);
  }, [questionKeysFromRefs, getBank, examMode]);

  const resolvedQuestions = useMemo(() => {
    if (examMode === 'bank') {
      return bank ? bank.questions.map((q) => ({ key: `${bank.id}::${q.id}`, question: q })) : [];
    }
    return questionsFromKeys;
  }, [examMode, bank, getBank, questionsFromKeys]);

  const questionKeys = resolvedQuestions.map((q) => q.key);
  const questions = resolvedQuestions.map((q) => q.question);

  const questionIdToKey = useMemo(() => {
    const map = new Map<string, string>();
    resolvedQuestions.forEach((item) => {
      map.set(item.question.id, item.key);
    });
    return map;
  }, [resolvedQuestions]);

  useEffect(() => {
    if (questions.length > 0 && !examState) {
      startExam(examMode, bank?.id || '', modeLabel, questions, questionKeys);
    }
  }, [questions, examState, startExam, examMode, bank?.id, modeLabel, questionKeys]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (examState && !examState.isFinished) {
        setTimeElapsed(Math.floor((Date.now() - examState.startTime) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [examState]);

  const handleFinish = useCallback(() => {
    const answers = finishExam();
    if (!bank) return;
    const maxScore = bank.questions.reduce((sum, q) => sum + q.score, 0);
    const recordId = addRecord(bank.id, bank.name, answers, timeElapsed, maxScore);
    saveLastSession(null);
    navigate(`/result/${recordId}`);
  }, [finishExam, bank, timeElapsed, addRecord, navigate, saveLastSession]);

  useEffect(() => {
    if (examState && isAllConfirmed() && !examState.isFinished && examState.mode === 'bank') {
      const timer = setTimeout(() => {
        handleFinish();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [examState, isAllConfirmed, handleFinish]);

  useEffect(() => {
    return () => {
      resetExam();
    };
  }, [resetExam]);

  useEffect(() => {
    if (!examState || examState.mode !== 'bank' || !examState.bankId) return;
    saveLastSession({
      bankId: examState.bankId,
      bankName: examState.bankName || undefined,
      updatedAt: new Date().toISOString()
    });
  }, [examState, saveLastSession]);

  const currentQuestion = examState ? examState.questions[examState.currentIndex] : undefined;
  const currentKey = examState ? examState.questionKeys[examState.currentIndex] : undefined;
  const [currentBankId] = currentKey ? currentKey.split('::') : [''];
  const isFav = currentKey ? favorites.some((f) => `${f.bankId}::${f.questionId}` === currentKey) : false;
  const currentAnswer = currentQuestion ? getAnswer(currentQuestion.id) : undefined;
  const currentResult = currentQuestion ? getResult(currentQuestion.id) : undefined;
  const hasDuplicateFillAnswers = useMemo(() => {
    if (!currentQuestion || currentQuestion.type !== 'fill-in-blank') return false;
    const answers = Array.isArray(currentAnswer) ? currentAnswer : [];
    const rawCorrect = currentQuestion.correctAnswer;
    const correctAnswers: string[] = Array.isArray(rawCorrect)
      ? rawCorrect.filter((a): a is string => typeof a === 'string')
      : typeof rawCorrect === 'string'
      ? [rawCorrect]
      : [];
    const duplicateFlags = computeDuplicateFlags(
      answers.map((a) => String(a ?? '')),
      correctAnswers,
      currentQuestion.allowDisorder ?? false
    );
    return duplicateFlags.some(Boolean);
  }, [currentQuestion, currentAnswer]);

  if (examMode === 'bank' && !bank) {
    return (
      <div className="page-container exam-page">
        <div className="w-full max-w-4xl mx-auto box-border px-1 sm:px-0">
          <div className="card text-center py-8">
            <p className="text-gray-500">题库不存在</p>
            <Link to="/" className="btn-primary mt-4 inline-block">返回首页</Link>
          </div>
        </div>
      </div>
    );
  }

  if (examMode === 'bank' && bank && bank.questions.length === 0) {
    return (
      <div className="page-container exam-page">
        <div className="w-full max-w-4xl mx-auto box-border px-1 sm:px-0">
          <div className="card text-center py-8">
            <p className="text-gray-500">题库中没有题目</p>
            <Link to={`/bank/${bank.id}`} className="btn-primary mt-4 inline-block">添加题目</Link>
          </div>
        </div>
      </div>
    );
  }

  if (examMode !== 'bank' && questions.length === 0) {
    return (
      <div className="page-container exam-page">
        <div className="w-full max-w-4xl mx-auto box-border px-1 sm:px-0">
          <div className="card text-center py-8">
            <p className="text-gray-500">{examMode === 'favorites' ? '暂无收藏题目' : '暂无错题'}</p>
            <Link to="/" className="btn-primary mt-4 inline-block">返回首页</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!examState) {
    return (
      <div className="page-container exam-page">
        <div className="w-full max-w-4xl mx-auto box-border px-1 sm:px-0">
          <div className="card text-center py-8">
            <div className="page-loading-spinner mx-auto"></div>
            <p className="text-gray-500 mt-4">加载中...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="page-container exam-page">
        <div className="w-full max-w-4xl mx-auto box-border px-1 sm:px-0">
          <div className="card text-center py-8">
            <div className="page-loading-spinner mx-auto"></div>
            <p className="text-gray-500 mt-4">加载中...</p>
          </div>
        </div>
      </div>
    );
  }
  const canConfirmCurrent =
    currentQuestion &&
    !currentResult?.isConfirmed &&
    ((currentQuestion.type === 'single-choice' && typeof currentAnswer === 'string' && currentAnswer !== '') ||
      (currentQuestion.type === 'multiple-choice' && Array.isArray(currentAnswer) && currentAnswer.length > 0) ||
      (currentQuestion.type === 'fill-in-blank' &&
        Array.isArray(currentAnswer) &&
        currentAnswer.some((a) => String(a ?? '').trim()) &&
        !hasDuplicateFillAnswers) ||
      (currentQuestion.type === 'subjective' && typeof currentAnswer === 'string' && currentAnswer.trim() !== ''));

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePostConfirm = (questionId: string) => {
    const key = questionIdToKey.get(questionId);
    if (!key) return;
    const [bId] = key.split('::');
    const result = getResult(questionId);
    if (!result) return;
    recordProgress(bId, questionId);
    markWrong(bId, questionId, result.isCorrect);
  };


  const encouragements = [
    '别急，马上就好',
    '快完成了',
    '再等一下下',
    '正在认真判断',
    '结果快出来了'
  ];

  const startJudging = (questionId: string) => {
    setJudgingById((prev) => ({ ...prev, [questionId]: true }));
    setJudgingMessageById((prev) => ({
      ...prev,
      [questionId]: encouragements[Math.floor(Math.random() * encouragements.length)]
    }));
  };

  const stopJudging = (questionId: string) => {
    setJudgingById((prev) => ({ ...prev, [questionId]: false }));
  };

  const handleAiExplain = async (question: Question) => {
    if (!aiSmartEnabled || !aiExplainEnabled) {
      void alertDialog('请先开启 AI智能中的 AI解析');
      return;
    }
    if (!aiNativeReady && (!aiConfig.apiKey || !aiConfig.baseUrl || !aiConfig.model)) {
      void alertDialog('AI 判题配置不完整，请先填写 API Key / Base URL / 模型');
      return;
    }
    const existing = aiExplainById[question.id];
    if (existing?.loading || explainUsedById[question.id]) return;
    setExplainUsedById((prev) => ({ ...prev, [question.id]: true }));
    setExplainMessageById((prev) => ({
      ...prev,
      [question.id]: encouragements[Math.floor(Math.random() * encouragements.length)]
    }));
    setAiExplainById((prev) => ({ ...prev, [question.id]: { loading: true, text: prev[question.id]?.text } }));
    const started = Date.now();
    try {
      addLog({
        level: 'info',
        message: `AI 解析请求已发起 | model=${aiConfig.model || '(empty)'} | baseUrl=${aiConfig.baseUrl || '(empty)'}`,
        source: 'ai-grader'
      });
      const rawAnswer = getAnswer(question.id);
      const userAnswer = Array.isArray(rawAnswer)
        ? rawAnswer.map((a) => String(a ?? '')).join(' / ')
        : typeof rawAnswer === 'string'
        ? rawAnswer
        : undefined;
      const content = await generateAiExplanation({
        question: question.content,
        correctAnswer: getAnswerText(question.correctAnswer),
        userAnswer,
        aiConfig,
        useNativeProxy: aiNativeReady
      });
      addLog({
        level: 'info',
        message: `AI 解析完成 | durationMs=${Date.now() - started} | length=${content.length}`,
        source: 'ai-grader'
      });
      setAiExplainById((prev) => ({ ...prev, [question.id]: { loading: false, text: content } }));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'AI 解析失败';
      addLog({
        level: 'error',
        message: `AI 解析失败 | durationMs=${Date.now() - started} | ${errMsg}`,
        stack: err instanceof Error ? err.stack : undefined,
        source: 'ai-grader'
      });
      setAiExplainById((prev) => ({ ...prev, [question.id]: { loading: false, text: prev[question.id]?.text } }));
      void alertDialog('AI 解析失败，请检查网络或配置后重试。', { title: '解析失败' });
    }
  };

  const handleSingleChoiceSelect = (questionId: string, optionId: string) => {
    const result = getResult(questionId);
    if (result?.isConfirmed) return;
    setAnswer(questionId, optionId);
  };

  const handleMultipleChoiceConfirm = (questionId: string) => {
    const result = getResult(questionId);
    if (result?.isConfirmed) return;
    confirmAnswer(questionId);
    setTimeout(() => handlePostConfirm(questionId), 0);
  };


  const computePerBlankMatches = (userAnswers: string[], correctAnswers: string[], allowDisorder: boolean) => {
    const normalizedUser = userAnswers.map((a) => normalizeLoose(a));
    const normalizedCorrect = correctAnswers.map((a) => normalizeLoose(a));
    const result = new Array(userAnswers.length).fill(false);
    if (allowDisorder) {
      const usedCorrect = new Set<number>();
      normalizedUser.forEach((user, uIdx) => {
        for (let cIdx = 0; cIdx < normalizedCorrect.length; cIdx++) {
          if (!usedCorrect.has(cIdx) && user && user === normalizedCorrect[cIdx]) {
            result[uIdx] = true;
            usedCorrect.add(cIdx);
            break;
          }
        }
      });
      return result;
    }
    for (let i = 0; i < Math.min(normalizedUser.length, normalizedCorrect.length); i++) {
      if (normalizedUser[i] && normalizedUser[i] === normalizedCorrect[i]) {
        result[i] = true;
      }
    }
    return result;
  };

  const handleFillBlankConfirm = async (questionId: string) => {
    const result = getResult(questionId);
    if (result?.isConfirmed) return;
    confirmAnswer(questionId);
    const confirmed = getResult(questionId);
    if (!confirmed) return;
    if (confirmed.isCorrect || !aiSmartEnabled || !aiGradingEnabled) {
      setTimeout(() => handlePostConfirm(questionId), 0);
      return;
    }
    if (!aiNativeReady && (!aiConfig.apiKey || !aiConfig.baseUrl || !aiConfig.model)) {
      void alertDialog('AI 判题配置不完整，请先填写 API Key / Base URL / 模型');
      return;
    }
    const question = examState.questions.find((q) => q.id === questionId);
    if (!question) return;
    const rawCorrect = question.correctAnswer;
    const correctAnswers: string[] = Array.isArray(rawCorrect)
      ? rawCorrect.filter((a): a is string => typeof a === 'string')
      : typeof rawCorrect === 'string'
      ? [rawCorrect]
      : [];
    const userAnswers = Array.isArray(getAnswer(questionId))
      ? (getAnswer(questionId) as string[])
      : [String(getAnswer(questionId) ?? '')];
    const started = Date.now();
    try {
      addLog({
        level: 'info',
        message: `AI 填空判题请求已发起 | model=${aiConfig.model || '(empty)'} | baseUrl=${aiConfig.baseUrl || '(empty)'} | blanks=${userAnswers.length} | allowDisorder=${String(question.allowDisorder ?? false)}`,
        source: 'ai-grader'
      });
      const grading = await gradeFillBlankAnswer({
        userAnswers,
        correctAnswers,
        allowDisorder: question.allowDisorder ?? false,
        maxScore: question.score,
        aiConfig,
        useNativeProxy: aiNativeReady
      });
      const fallbackPerBlank = computePerBlankMatches(
        userAnswers,
        correctAnswers,
        question.allowDisorder ?? false
      );
      const perBlank = grading.perBlankCorrect ?? fallbackPerBlank;
      addLog({
        level: 'info',
        message: `AI 填空判题完成 | durationMs=${Date.now() - started} | score=${grading.score} | isCorrect=${grading.isCorrect} | perBlank=${JSON.stringify(perBlank)}`,
        source: 'ai-grader'
      });
      if (grading.score > confirmed.score) {
        setResult(questionId, {
          answer: confirmed.answer,
          isConfirmed: true,
          isCorrect: grading.isCorrect,
          score: grading.score,
          perBlankCorrect: perBlank
        });
      } else {
        setResult(questionId, {
          answer: confirmed.answer,
          isConfirmed: true,
          isCorrect: confirmed.isCorrect,
          score: confirmed.score,
          perBlankCorrect: perBlank
        });
      }
      setTimeout(() => handlePostConfirm(questionId), 0);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'AI 填空判题失败';
      addLog({
        level: 'error',
        message: `AI 填空判题失败 | durationMs=${Date.now() - started} | ${errMsg}`,
        stack: err instanceof Error ? err.stack : undefined,
        source: 'ai-grader'
      });
      void alertDialog('AI 判题失败，请检查网络或配置后重试。', { title: '判题失败' });
    }
  };

  const handleSubjectiveConfirm = async (questionId: string) => {
    const result = getResult(questionId);
    if (result?.isConfirmed) return;
    const question = examState.questions.find((q) => q.id === questionId);
    const answer = getAnswer(questionId);
    if (!question || typeof answer !== 'string') return;

    if (aiSmartEnabled && aiGradingEnabled) {
      if (!aiNativeReady && (!aiConfig.apiKey || !aiConfig.baseUrl || !aiConfig.model)) {
        void alertDialog('AI 判题配置不完整，请先填写 API Key / Base URL / 模型');
        return;
      }
      const started = Date.now();
      try {
        addLog({
          level: 'info',
          message: `AI 判题请求已发起 | model=${aiConfig.model || '(empty)'} | baseUrl=${aiConfig.baseUrl || '(empty)'} | maxScore=${question.score}`,
          source: 'ai-grader'
        });
        const grading = await gradeSubjectiveAnswer({
          userAnswer: answer,
          correctAnswer: getAnswerText(question.correctAnswer),
          maxScore: question.score,
          aiConfig,
          useNativeProxy: aiNativeReady
        });
        addLog({
          level: 'info',
          message: `AI 判题完成 | durationMs=${Date.now() - started} | score=${grading.score} | isCorrect=${grading.isCorrect} | similarity=${grading.similarity}`,
          source: 'ai-grader'
        });
        const aiResult = {
          answer,
          isConfirmed: true,
          isCorrect: grading.isCorrect,
          score: grading.score
        };
        setResult(questionId, aiResult);
        setTimeout(() => handlePostConfirm(questionId), 0);
        return;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'AI 判题失败';
        addLog({
          level: 'error',
          message: `AI 判题失败 | durationMs=${Date.now() - started} | ${errMsg}`,
          stack: err instanceof Error ? err.stack : undefined,
          source: 'ai-grader'
        });
        void alertDialog('AI 判题失败，请检查网络或配置后重试。', { title: '判题失败' });
        return;
      }
    }

    confirmAnswer(questionId);
    setTimeout(() => handlePostConfirm(questionId), 0);
  };

  const handleHeaderConfirm = async () => {
    if (!currentQuestion) return;
    const result = getResult(currentQuestion.id);
    if (result?.isConfirmed) return;
    startJudging(currentQuestion.id);

    if (currentQuestion.type === 'single-choice') {
      confirmAnswer(currentQuestion.id);
      setTimeout(() => handlePostConfirm(currentQuestion.id), 0);
      stopJudging(currentQuestion.id);
      return;
    }
    if (currentQuestion.type === 'multiple-choice') {
      handleMultipleChoiceConfirm(currentQuestion.id);
      stopJudging(currentQuestion.id);
      return;
    }
    if (currentQuestion.type === 'fill-in-blank') {
      if (hasDuplicateFillAnswers) {
        void alertDialog('填空答案不能重复，请修改后再判断。', { title: '答案重复' });
        stopJudging(currentQuestion.id);
        return;
      }
      await handleFillBlankConfirm(currentQuestion.id);
      stopJudging(currentQuestion.id);
      return;
    }
    if (currentQuestion.type === 'subjective') {
      await handleSubjectiveConfirm(currentQuestion.id);
      stopJudging(currentQuestion.id);
    }
  };

  const renderJudgingBox = (title: string, message: string) => (
    <div className="exam-judging-box">
      <div className="exam-judging-title">{title}</div>
      <div className="exam-judging-bar"><span /></div>
      <div className="exam-judging-sub">{message}</div>
    </div>
  );

  const renderQuestion = (question: Question) => {
    const answer = getAnswer(question.id);
    const result = getResult(question.id);
    const isConfirmed = result?.isConfirmed || false;
    const isJudging = Boolean(judgingById[question.id]);
    const explainState = aiExplainById[question.id];

    switch (question.type) {
      case 'single-choice':
        return (
          <div className="space-y-2">
            {question.options?.map((option) => {
              const isSelected = answer === option.id;
              const isCorrectOption = question.correctAnswer === option.id;
              
              let optionClassName = 'option-label';
              if (isConfirmed) {
                if (isCorrectOption) {
                  optionClassName += ' border-green-500 bg-green-50';
                } else if (isSelected && !isCorrectOption) {
                  optionClassName += ' border-red-500 bg-red-50';
                }
              } else if (isSelected) {
                optionClassName += ' option-label-selected';
              } else {
                optionClassName += ' option-label-unselected';
              }
              
              return (
                <label
                  key={option.id}
                  className={optionClassName}
                >
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={option.id}
                    checked={isSelected}
                    onChange={() => handleSingleChoiceSelect(question.id, option.id)}
                    disabled={isConfirmed}
                    className="radio-styled"
                  />
                  <span className="font-medium text-gray-700">{option.id}.</span>
                  <span className="ml-1 text-gray-800">{option.content}</span>
                  {isConfirmed && isCorrectOption && null}
                </label>
              );
            })}
            {(isConfirmed || isJudging) && (
              isJudging ? (
                renderJudgingBox('AI智能判断中', judgingMessageById[question.id] || '快了，马上就好')
              ) : (
                <div className={`mt-4 p-3 rounded-lg ${result?.isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  <p className="font-medium">
                    {result?.isCorrect ? '回答正确' : '回答错误'}
                  </p>
                  {!result?.isCorrect && (
                    <div className="text-sm mt-2">
                      <div className="text-xs text-gray-500">正确答案</div>
                      <div className="font-medium text-green-700">{getAnswerText(question.correctAnswer)}</div>
                    </div>
                  )}
                  {question.explanation && (
                    <p className="text-sm mt-2 text-gray-700">解析: {question.explanation}</p>
                  )}
                  {explainState?.loading && renderJudgingBox('生成解析中', explainMessageById[question.id] || '马上就好') || (
                    explainState?.text && (
                      <div className="mt-3 text-sm text-gray-700">
                        <div className="text-xs text-gray-500 mb-1">AI解析</div>
                        <div className="whitespace-pre-line">{explainState.text}</div>
                      </div>
                    )
                  )}
                </div>
              )
            )}
          </div>
        );

      case 'multiple-choice':
        const selectedOptions = (answer as string[]) || [];
        const correctOptions = question.correctAnswer as string[];
        
        return (
          <div className="space-y-2">
            {question.options?.map((option) => {
              const isSelected = selectedOptions.includes(option.id);
              const isCorrectOption = correctOptions.includes(option.id);
              
              let optionClassName = 'option-label';
              if (isConfirmed) {
                if (isCorrectOption) {
                  optionClassName += ' border-green-500 bg-green-50';
                }
                if (isSelected && !isCorrectOption) {
                  optionClassName += ' border-red-500 bg-red-50';
                }
              } else if (isSelected) {
                optionClassName += ' option-label-selected';
              } else {
                optionClassName += ' option-label-unselected';
              }
              
              return (
                <label
                  key={option.id}
                  className={optionClassName}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      if (isConfirmed) return;
                      const newSelection = e.target.checked
                        ? [...selectedOptions, option.id]
                        : selectedOptions.filter(id => id !== option.id);
                      setAnswer(question.id, newSelection);
                    }}
                    disabled={isConfirmed}
                    className="checkbox-styled"
                  />
                  <span className="font-medium text-gray-700">{option.id}.</span>
                  <span className="ml-1 text-gray-800">{option.content}</span>
                  {isConfirmed && isCorrectOption && null}
                </label>
              );
            })}
            
            {!isConfirmed && selectedOptions.length > 0 && null}
            
            {(isConfirmed || isJudging) && (
              isJudging ? (
                renderJudgingBox('AI智能判断中', judgingMessageById[question.id] || '快了，马上就好')
              ) : (
                <div className={`mt-4 p-3 rounded-lg ${result?.isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  <p className="font-medium">
                    {result?.isCorrect ? '回答正确' : '回答错误'}
                  </p>
                  {!result?.isCorrect && (
                    <div className="text-sm mt-2">
                      <div className="text-xs text-gray-500">正确答案</div>
                      <div className="font-medium text-green-700">{(question.correctAnswer as string[]).join(', ')}</div>
                    </div>
                  )}
                  {question.explanation && (
                    <p className="text-sm mt-2 text-gray-700">解析: {question.explanation}</p>
                  )}
                  {explainState?.loading && renderJudgingBox('生成解析中', explainMessageById[question.id] || '马上就好') || (
                    explainState?.text && (
                      <div className="mt-3 text-sm text-gray-700">
                        <div className="text-xs text-gray-500 mb-1">AI解析</div>
                        <div className="whitespace-pre-line">{explainState.text}</div>
                      </div>
                    )
                  )}
                </div>
              )
            )}
          </div>
        );

      case 'fill-in-blank':
        const rawCorrectAnswers = question.correctAnswer;
        const correctAnswers: string[] = Array.isArray(rawCorrectAnswers) 
          ? rawCorrectAnswers.filter((a): a is string => typeof a === 'string')
          : (typeof rawCorrectAnswers === 'string' ? [rawCorrectAnswers] : []);
        const blankAnswers = Array.isArray(answer) ? answer : [];
        const allowDisorder = question.allowDisorder ?? false;
        const touchedSet = fillTouched[question.id] || new Set<number>();
        const normalizedCorrect = correctAnswers.map(a => normalizeLoose(a));
        const duplicateFlags = computeDuplicateFlags(
          blankAnswers.map((a) => String(a ?? '')),
          correctAnswers,
          allowDisorder
        );
        const isRealtimeMatch = (value: string, idx: number) => {
          const normalized = normalizeLoose(value);
          if (!normalized) return false;
          if (allowDisorder) return normalizedCorrect.includes(normalized);
          return normalizedCorrect[idx] === normalized;
        };
        
        
        return (
          <div className="space-y-3">
            {correctAnswers.map((_, idx) => {
              return (
                <div key={idx} className="flex flex-col gap-1">
                  <input
                    type="text"
                    value={(blankAnswers[idx] as string) || ''}
                    onChange={(e) => {
                      if (isConfirmed) return;
                      const newAnswers = [...blankAnswers];
                      newAnswers[idx] = e.target.value;
                      setAnswer(question.id, newAnswers);
                    }}
                    onBlur={() => {
                      if (!realtimeCheckEnabled) return;
                      const value = (blankAnswers[idx] as string) || '';
                      if (!value.trim()) return;
                      setFillTouched(prev => {
                        const next = new Set(prev[question.id] || []);
                        next.add(idx);
                        return { ...prev, [question.id]: next };
                      });
                    }}
                    disabled={isConfirmed}
                    className={`input-styled py-3 ${isConfirmed ? 'input-disabled' : ''} ${
                      duplicateFlags[idx]
                        ? 'input-error'
                        : realtimeCheckEnabled && touchedSet.has(idx) && !isConfirmed
                        ? isRealtimeMatch((blankAnswers[idx] as string) || '', idx)
                          ? 'input-correct'
                          : 'input-warn'
                        : isConfirmed && !isJudging
                        ? result?.perBlankCorrect
                          ? result.perBlankCorrect[idx]
                            ? 'input-correct'
                            : 'input-error'
                          : isRealtimeMatch((blankAnswers[idx] as string) || '', idx)
                          ? 'input-correct'
                          : 'input-error'
                        : ''
                    }`}
                    placeholder={`答案 ${idx + 1}`}
                  />
                </div>
              );
            })}

            {isConfirmed && !isJudging && (
              <div className="mt-2 space-y-1">
                <div className="text-xs text-gray-500">正确答案</div>
                <div className="text-sm font-medium text-green-600">
                  {correctAnswers.join('，')}
                </div>
              </div>
            )}
            
            {!isConfirmed && blankAnswers.some(a => a && (a as string).trim()) && null}
            
            {(isConfirmed || isJudging) && (
              isJudging ? (
                renderJudgingBox('AI智能判断中', judgingMessageById[question.id] || '快了，马上就好')
              ) : (
                <div className={`mt-4 p-3 rounded-lg ${result?.isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  <p className="font-medium">
                    {result?.isCorrect ? '回答正确' : '回答错误'}
                  </p>
                  {question.explanation && (
                    <p className="text-sm mt-2 text-gray-700">解析: {question.explanation}</p>
                  )}
                  {explainState?.loading && renderJudgingBox('生成解析中', explainMessageById[question.id] || '马上就好') || (
                    explainState?.text && (
                      <div className="mt-3 text-sm text-gray-700">
                        <div className="text-xs text-gray-500 mb-1">AI解析</div>
                        <div className="whitespace-pre-line">{explainState.text}</div>
                      </div>
                    )
                  )}
                </div>
              )
            )}
          </div>
        );

      case 'subjective':
        const answerImages = getAnswerImages(question.correctAnswer);
        const answerText = getAnswerText(question.correctAnswer);
        
        return (
          <div>
            <textarea
              value={(answer as string) || ''}
              onChange={(e) => {
                if (isConfirmed) return;
                setAnswer(question.id, e.target.value);
              }}
              disabled={isConfirmed}
              className={`input-styled py-3 ${isConfirmed ? 'input-disabled' : ''}`}
              rows={6}
              placeholder="请输入答案"
            />
            
            {!isConfirmed && (answer as string)?.trim() && null}
            
            {(isConfirmed || isJudging) && (
              isJudging ? (
                renderJudgingBox('AI智能判断中', judgingMessageById[question.id] || '快了，马上就好')
              ) : (
                <div className={`mt-4 p-3 rounded-lg ${result?.score === question.score ? 'bg-green-50 text-green-800' : 'bg-yellow-50 text-yellow-800'}`}>
                  <p className="font-medium mb-2">正确答案</p>
                  <div className="text-sm">{formatReferenceAnswer(answerText)}</div>
                  {answerImages && answerImages.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {answerImages.map((img, idx) => (
                        <img 
                          key={idx} 
                          src={img} 
                          alt={`参考图${idx + 1}`} 
                          className="max-w-full rounded border border-blue-200"
                        />
                      ))}
                    </div>
                  )}
                  {question.explanation && (
                    <p className="text-sm mt-2 text-gray-700">解析: {question.explanation}</p>
                  )}
                  {explainState?.loading && renderJudgingBox('生成解析中', explainMessageById[question.id] || '马上就好') || (
                    explainState?.text && (
                      <div className="mt-3 text-sm text-gray-700">
                        <div className="text-xs text-gray-500 mb-1">AI解析</div>
                        <div className="whitespace-pre-line">{explainState.text}</div>
                      </div>
                    )
                  )}
                  <div className="mt-3 pt-3 border-t border-blue-200">
                    <p className="text-sm">
                      得分: <span className="font-bold">{result?.score}</span> / {question.score} 分
                    </p>
                  </div>
                </div>
              )
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const getQuestionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'fill-in-blank': '填空题',
      'single-choice': '单选题',
      'multiple-choice': '多选题',
      'subjective': '主观题'
    };
    return labels[type];
  };

  const statistics = getStatistics();

  return (
    <div className="page-container exam-page">
      <div className="w-full max-w-4xl mx-auto box-border px-1 sm:px-0">
        <div className="exam-header">
          <Link to={examState.mode === 'bank' ? '/chapter/sequence' : '/'} className="icon-button" onClick={resetExam}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="exam-title">{examState.mode === 'bank' ? `${getQuestionTypeLabel(currentQuestion.type)}练习` : examState.bankName}</div>
          <div className="exam-header-actions">
            <button
              className={`icon-button exam-fav-button ${isFav ? 'is-active' : ''}`}
              aria-label="收藏"
              onClick={() => {
                if (!currentKey) return;
                toggleFavorite(currentBankId, currentQuestion.id);
              }}
            >
              <svg className="w-5 h-5" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path
                  d="M536.9344 860.3136c-26.8288-14.7968-70.5024-14.6944-97.1776 0L251.2384 964.096c-53.6064 29.5424-88.7808 2.56-78.5408-59.8016l35.9936-219.8016c5.12-31.3344-8.448-74.752-30.0544-96.768L26.1632 431.9744c-43.4176-44.288-29.696-87.6544 30.0032-96.768l210.7392-32c30.0032-4.608 65.28-31.5392 78.6432-59.8528L439.808 43.4176c26.8288-56.8832 70.4512-56.6784 97.1264 0l94.208 199.9872c13.4656 28.4672 48.896 55.296 78.6944 59.8528l210.7392 32.0512c60.0064 9.1136 73.216 52.5824 30.0544 96.7168l-152.5248 155.648c-21.7088 22.1696-35.1232 65.6896-30.0544 96.8192l35.9936 219.8016c10.24 62.5664-25.1392 89.1904-78.5408 59.8016l-188.5696-103.7824z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="exam-progress-row">
          <button className="exam-progress-pill" onClick={() => setShowQuestionPicker((v) => !v)}>
          {examState.currentIndex + 1} / {examState.questions.length}
        </button>
          {examState.mode === 'bank' && (
            <button className="exam-submit-inline" onClick={() => setShowConfirmFinish(true)}>交卷</button>
          )}
        </div>

        {showQuestionPicker && (
          <div className="exam-question-picker">
            <div className="exam-question-picker-grid">
              {examState.questions.map((q, idx) => {
                const result = examState.results.get(q.id);
                const hasAnswer = examState.answers.has(q.id) || examState.results.has(q.id);
                return (
                  <button
                    key={q.id}
                    className={`exam-question-picker-item ${result?.isConfirmed ? (result.isCorrect ? 'correct' : 'incorrect') : hasAnswer ? 'answered' : ''} ${idx === examState.currentIndex ? 'active' : ''}`}
                    onClick={() => {
                      setShowQuestionPicker(false);
                      goToQuestion(idx);
                    }}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}


        <div className="card exam-question-card">
          <div className="exam-question-meta-row">
            <div className="exam-question-meta">题目 {examState.currentIndex + 1}：{getQuestionTypeLabel(currentQuestion.type)}</div>
            <button
              className={`exam-confirm-btn ${judgingById[currentQuestion.id] || (!currentResult?.isConfirmed && !canConfirmCurrent) || (currentResult?.isConfirmed && (!aiSmartEnabled || !aiExplainEnabled || aiExplainById[currentQuestion.id]?.loading || explainUsedById[currentQuestion.id])) ? 'disabled' : ''}`}
              onClick={() => {
                if (currentResult?.isConfirmed && !judgingById[currentQuestion.id] && aiSmartEnabled && aiExplainEnabled) {
                  handleAiExplain(currentQuestion);
                } else {
                  handleHeaderConfirm();
                }
              }}
              disabled={judgingById[currentQuestion.id] || (!currentResult?.isConfirmed && !canConfirmCurrent) || (currentResult?.isConfirmed && (!aiSmartEnabled || !aiExplainEnabled || aiExplainById[currentQuestion.id]?.loading || explainUsedById[currentQuestion.id]))}
            >
              {currentResult?.isConfirmed && !judgingById[currentQuestion.id] && aiSmartEnabled && aiExplainEnabled
                ? (aiExplainById[currentQuestion.id]?.loading ? '解析中...' : '解析')
                : '判断'}
            </button>
          </div>
          <div className="exam-question-content">{currentQuestion.content}</div>
          <div className="exam-answer-area">{renderQuestion(currentQuestion)}</div>
        </div>

        <div className="exam-nav">
          <button
            onClick={prevQuestion}
            disabled={examState.currentIndex === 0}
            className="exam-nav-btn"
          >
            上一题
          </button>
          <button
            onClick={nextQuestion}
            disabled={examState.currentIndex === examState.questions.length - 1}
            className="exam-nav-btn exam-nav-primary"
          >
            下一题
          </button>
        </div>

        <div className="exam-time-text">已用时 {formatTime(timeElapsed)}</div>

        {showConfirmFinish && examState.mode === 'bank' && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3">
            <div className="bg-white rounded-lg p-3 sm:p-4 w-full max-w-md">
              <h2 className="text-base sm:text-lg font-semibold mb-1.5 sm:mb-2">确认交卷</h2>
              <p className="text-gray-600 mb-1.5 text-xs sm:text-sm">
                您已完成 {statistics.correct + statistics.incorrect} / {examState.questions.length} 题
              </p>
              {statistics.correct + statistics.incorrect < examState.questions.length && (
                <p className="text-orange-500 text-xs mb-2 sm:mb-3">
                  还有 {examState.questions.length - statistics.correct - statistics.incorrect} 题未作答
                </p>
              )}
              <div className="flex justify-end gap-1.5 sm:gap-2">
                <button
                  onClick={() => setShowConfirmFinish(false)}
                  className="btn-secondary"
                >
                  继续答题
                </button>
                <button
                  onClick={handleFinish}
                  className="btn-primary"
                >
                  确认交卷
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Exam;
