import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuestionBankStore } from '../store/questionBankStore';
import { useRecordStore } from '../store/recordStore';
import { useStudyStore } from '../store/studyStore';

const DAILY_GOAL = 100;

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { banks } = useQuestionBankStore();
  const { records } = useRecordStore();
  const { favorites, wrongs, lastSession } = useStudyStore();

  const [quote, setQuote] = useState<string | null>(null);
  const [quoteSize, setQuoteSize] = useState(0.85);
  const [greetingSize, setGreetingSize] = useState(1.4);
  const quoteRef = useRef<HTMLDivElement | null>(null);
  const greetingRef = useRef<HTMLDivElement | null>(null);

  const todayCount = useMemo(() => {
    const today = new Date();
    return records
      .filter((r) => {
        const finished = new Date(r.finishedAt);
        return (
          finished.getFullYear() === today.getFullYear() &&
          finished.getMonth() === today.getMonth() &&
          finished.getDate() === today.getDate()
        );
      })
      .reduce((sum, r) => sum + r.answers.length, 0);
  }, [records]);

  const progressPercent = Math.min(100, Math.round((todayCount / DAILY_GOAL) * 100));
  const latestRecord = records[0];
  const totalQuestions = banks.reduce((sum, b) => sum + b.questions.length, 0);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return '早上好！新的一天开始啦';
    if (hour >= 11 && hour < 14) return '中午好！来一会儿练习吧';
    if (hour >= 14 && hour < 18) return '下午好！继续加油';
    if (hour >= 18 && hour < 22) return '晚上好！放松一下再刷题';
    return '夜深了，早点休息哦';
  }, []);

  useEffect(() => {
    const quotes = [
      '日日精进，终成大器。',
      '每一题，都是一次成长。',
      '坚持，比聪明更重要。',
      '把小事做细，把细事做透。',
      '学会思考，答案自然出现。',
      '稳扎稳打，步步为营。',
      '今天的努力，是明天的底气。',
      '一次专注，胜过十次走神。',
      '错题是进步的起点。',
      '行动是最好的计划。'
    ];
    if (Math.random() < 0.3) {
      const picked = quotes[Math.floor(Math.random() * quotes.length)];
      setQuote(picked);
    } else {
      setQuote(null);
    }
  }, []);

  useEffect(() => {
    if (!quote || !quoteRef.current) return;
    const el = quoteRef.current;
    let size = 0.9;
    el.style.fontSize = `${size}rem`;
    const minSize = 0.7;
    const step = 0.05;
    const fit = () => {
      while (el.scrollWidth > el.clientWidth && size > minSize) {
        size = Math.max(minSize, size - step);
        el.style.fontSize = `${size}rem`;
      }
      setQuoteSize(size);
    };
    requestAnimationFrame(fit);
  }, [quote]);

  useEffect(() => {
    if (!greetingRef.current) return;
    const el = greetingRef.current;
    let size = 1.4;
    el.style.fontSize = `${size}rem`;
    const minSize = 0.9;
    const step = 0.05;
    const fit = () => {
      while (el.scrollWidth > el.clientWidth && size > minSize) {
        size = Math.max(minSize, size - step);
        el.style.fontSize = `${size}rem`;
      }
      setGreetingSize(size);
    };
    requestAnimationFrame(fit);
    const handleResize = () => {
      size = 1.4;
      el.style.fontSize = `${size}rem`;
      requestAnimationFrame(fit);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [greeting]);

  const continueTarget = useMemo(() => {
    if (!lastSession) return null;
    if (lastSession.bankId) {
      return { path: `/exam/${lastSession.bankId}`, label: lastSession.bankName || '继续学习' };
    }
    return null;
  }, [lastSession]);

  return (
    <div className="page-container home-page">
      <div className="w-full max-w-4xl mx-auto box-border px-1 sm:px-0">
        <div className="home-greeting">
          <div>
            <div className="home-hello" ref={greetingRef} style={{ fontSize: `${greetingSize}rem` }}>
              {greeting}
            </div>
            <div className="home-sub">今日目标：已学 {todayCount}/{DAILY_GOAL} 题</div>
            {quote && (
              <div className="home-quote" ref={quoteRef} style={{ fontSize: `${quoteSize}rem` }}>
                {quote}
              </div>
            )}
          </div>
          <div className="home-progress-value">{progressPercent}%</div>
        </div>

        <div className="progress-track" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="home-stats">
          <div className="stat-pill">题库 {banks.length} 个</div>
          <div className="stat-pill">题目 {totalQuestions} 道</div>
          <button className="stat-link" onClick={() => navigate('/records')}>测试记录</button>
        </div>

        <div className="home-card-grid">
          <button className="home-card" onClick={() => navigate('/chapter/view')}>
            <div className="home-card-icon">
              <svg className="w-6 h-6" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M639.2832 947.2 947.2 947.2c28.2624 0 51.2-22.9376 51.2-51.2L998.4 128c0-28.2624-22.9376-51.2-51.2-51.2L575.8464 76.8 499.2 153.4464 422.5536 76.8 51.2 76.8C22.9376 76.8 0 99.7376 0 128l0 768c0 28.2624 22.9376 51.2 51.2 51.2l307.9168 0c29.5936 46.1568 81.2032 76.8 140.0832 76.8S609.6896 993.3568 639.2832 947.2zM499.2 947.2c-45.1072 0-82.048-33.4592-88.32-76.8L76.8 870.4 76.8 153.6l319.7696 0L460.8 217.8304 460.8 627.2c0 21.1968 17.1776 38.4 38.4 38.4 21.1968 0 38.4-17.2032 38.4-38.4L537.6 217.8304 601.856 153.6 921.6 153.6l0 716.8L587.4944 870.4C581.248 913.7408 544.3328 947.2 499.2 947.2z" fill="currentColor" />
              </svg>
            </div>
            <div className="home-card-title">看题模式</div>
            <div className="home-card-sub">全库浏览 不限章节</div>
          </button>
          <button className="home-card" onClick={() => navigate('/chapter/sequence')}>
            <div className="home-card-icon">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5h10M9 12h10M9 19h10M5 5h.01M5 12h.01M5 19h.01" />
              </svg>
            </div>
            <div className="home-card-title">顺序练题</div>
            <div className="home-card-sub">按题库顺序做题</div>
          </button>
          <button className="home-card" onClick={() => navigate('/practice/wrong')}>
            <div className="home-card-icon">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div className="home-card-title">错题本</div>
            <div className="home-card-sub">待巩固 {wrongs.length} 题</div>
          </button>
          <button className="home-card" onClick={() => navigate('/practice/favorites')}>
            <div className="home-card-icon">
              <svg className="w-6 h-6" viewBox="0 0 1105 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M1071.543358 476.241493c17.008625-17.008625 25.512937-34.017249 25.512937-51.025875 8.504312-51.025874-25.512937-93.547436-76.538811-102.051748l-246.625059-42.521562H765.388113L663.336365 51.025874C654.832052 34.017249 637.823428 17.008625 620.814803 8.504312 578.293241-8.504312 527.267367 8.504312 510.258742 51.025874L399.702681 280.642308h-8.504312l-238.120746 42.521562c-17.008625 0-34.017249 8.504312-51.025875 25.512937-34.017249 34.017249-34.017249 93.547436 0 127.564686l178.59056 178.590559v8.504313l-42.521562 255.129371c0 17.008625 0 42.521562 8.504313 59.530186 25.512937 42.521562 76.538811 59.530187 119.060373 34.01725l221.112121-119.060373H595.301866l221.112121 119.060373c8.504312 8.504312 25.512937 8.504312 42.521562 8.504312 51.025874-8.504312 76.538811-51.025874 68.034499-102.051748l-42.521562-255.129371v-8.504313l187.094872-178.590559zM833.422612 595.301866c-25.512937 17.008625-34.017249 51.025874-25.512937 76.538811l42.521562 255.129371-221.112122-110.556061c-25.512937-17.008625-59.530187-17.008625-85.043123 0L323.16387 935.47436v-8.504312l42.521562-255.129371c0-25.512937-8.504312-59.530187-25.512937-76.538811L170.086247 416.711306v-8.504312l238.120747-34.01725h-8.504313c34.017249 0 68.034499-25.512937 85.043124-51.025874L586.797553 85.043124l110.556061 229.616434 8.504312 8.504312c8.504312 25.512937 34.017249 42.521562 59.530187 42.521562l238.120746 34.017249v17.008625L833.422612 595.301866z" fill="currentColor" />
              </svg>
            </div>
            <div className="home-card-title">我的收藏</div>
            <div className="home-card-sub">已收藏 {favorites.length} 题</div>
          </button>
        </div>

        <div className="home-continue">
          <div>
            <div className="home-continue-title">继续学习</div>
            <div className="home-continue-sub">
              {continueTarget
                ? `上次进度：${continueTarget.label}`
                : latestRecord
                ? `最近练习：${latestRecord.bankName}`
                : '还没有练习记录，开始你的第一题吧'}
            </div>
          </div>
          <button
            className="btn-primary flex-shrink-0"
            onClick={() =>
              continueTarget
                ? navigate(continueTarget.path)
                : latestRecord
                ? navigate(`/exam/${latestRecord.bankId}`)
                : navigate('/chapter/sequence')
            }
          >
            开始
          </button>
        </div>
      </div>
    </div>
  );
};

export default Home;
