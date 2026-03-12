import React, { useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuestionBankStore } from '../store/questionBankStore';
import { BUILT_IN_BANKS, isBuiltInBank } from '../utils/builtInBanks';
import { useStudyStore } from '../store/studyStore';

const ChapterSelect: React.FC = () => {
  const navigate = useNavigate();
  const { mode } = useParams<{ mode: string }>();
  const { banks } = useQuestionBankStore();
  const { markBankViewed } = useStudyStore();

  const builtInMap = useMemo(() => {
    const map = new Map<string, number>();
    BUILT_IN_BANKS.forEach((b, index) => map.set(b.id, index));
    return map;
  }, []);

  const chapters = useMemo(() => {
    return banks
      .filter((b) => isBuiltInBank(b.id))
      .sort((a, b) => (builtInMap.get(a.id) ?? 0) - (builtInMap.get(b.id) ?? 0));
  }, [banks, builtInMap]);

  const modeLabel = mode === 'view' ? '看题模式' : '顺序练题';

  const handleOpenChapter = (bankId: string) => {
    if (mode === 'view') {
      const bank = banks.find((b) => b.id === bankId);
      if (bank) {
        markBankViewed(bankId, bank.questions.map((q) => q.id));
      }
      navigate(`/bank/${bankId}?mode=view`);
    } else {
      navigate(`/exam/${bankId}`);
    }
  };

  return (
    <div className="page-container chapter-page">
      <div className="w-full max-w-4xl mx-auto box-border px-1 sm:px-0">
        <div className="chapter-header">
          <Link to="/" className="icon-button" aria-label="返回首页">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="chapter-title">{modeLabel}</div>
          <div className="chapter-spacer" />
        </div>

        <div className="chapter-subtitle">
          <div className="chapter-heading">章节选择</div>
          <div className="chapter-count">共 {chapters.length} 个章节</div>
        </div>

        <div className="chapter-list">
          {chapters.map((bank, index) => {
            return (
              <button key={bank.id} className="chapter-item" onClick={() => handleOpenChapter(bank.id)}>
                <div className="chapter-index">{index + 1}</div>
                <div className="chapter-main">
                  <div className="chapter-name">第{index + 1}章：{bank.name}</div>
                  <div className="chapter-meta">
                    {bank.questions.length} 题 · {bank.description || '基础练习'}
                  </div>
                </div>
                <div className="chapter-progress">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ChapterSelect;
