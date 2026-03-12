import { AiGradingConfig } from '../store/settingsStore';

function normalize(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]+/gu, '').trim().toLowerCase();
}

function buildUrl(baseUrl: string): string {
  const clean = baseUrl.replace(/\/$/, '');
  if (clean.endsWith('/chat/completions')) return clean;
  return `${clean}/chat/completions`;
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : '';
}

export async function testAiConnection(aiConfig: AiGradingConfig): Promise<void> {
  const url = buildUrl(aiConfig.baseUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aiConfig.apiKey}`
    },
    body: JSON.stringify({
      model: aiConfig.model,
      temperature: 0,
      max_tokens: 16,
      messages: [
        {
          role: 'system',
          content: 'Do not think. Reply with OK only.'
        },
        {
          role: 'user',
          content: 'Reply with OK.'
        }
      ]
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content || !content.toUpperCase().includes('OK')) {
    throw new Error('Invalid response');
  }
}

export async function gradeSubjectiveAnswer(params: {
  userAnswer: string;
  correctAnswer: string;
  maxScore: number;
  aiConfig: AiGradingConfig;
}): Promise<{ score: number; isCorrect: boolean; similarity: number; perBlankCorrect?: boolean[] }> {
  const { userAnswer, correctAnswer, maxScore, aiConfig } = params;

  if (normalize(userAnswer) === normalize(correctAnswer)) {
    return { score: maxScore, isCorrect: true, similarity: 1 };
  }

  const url = buildUrl(aiConfig.baseUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aiConfig.apiKey}`
    },
    body: JSON.stringify({
      model: aiConfig.model,
      temperature: aiConfig.temperature,
      max_tokens: aiConfig.maxTokens,
      messages: [
        {
          role: 'system',
          content:
            'You are a lenient grader. No markdown. No chain-of-thought. Judge by meaning and intent, not exact wording. Ignore punctuation, spacing, casing, full-width/half-width, and minor typos. Extra punctuation or filler words must not reduce the score. If all key points are present, give full score; otherwise give partial score proportionally. Respond with JSON only: {"score": number, "is_correct": boolean, "similarity": number}.'
        },
        {
          role: 'user',
          content: `Question reference answer:\n${correctAnswer}\n\nUser answer:\n${userAnswer}\n\nMax score: ${maxScore}\nReturn JSON only.`
        }
      ]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const jsonText = extractJson(content);
  if (!jsonText) throw new Error('Invalid response');
  const parsed = JSON.parse(jsonText);
  const score = Math.max(0, Math.min(maxScore, Number(parsed.score ?? 0)));
  const similarity = Math.max(0, Math.min(1, Number(parsed.similarity ?? (score / maxScore))));
  const isCorrect = Boolean(parsed.is_correct ?? score >= maxScore);
  return { score, isCorrect, similarity };
}

export async function gradeFillBlankAnswer(params: {
  userAnswers: string[];
  correctAnswers: string[];
  allowDisorder: boolean;
  maxScore: number;
  aiConfig: AiGradingConfig;
}): Promise<{ score: number; isCorrect: boolean; similarity: number; perBlankCorrect?: boolean[] }> {
  const { userAnswers, correctAnswers, allowDisorder, maxScore, aiConfig } = params;
  const normalizedUser = userAnswers.map((a) => normalize(a));
  const normalizedCorrect = correctAnswers.map((a) => normalize(a));

  if (normalizedUser.join('|') === normalizedCorrect.join('|')) {
    return { score: maxScore, isCorrect: true, similarity: 1 };
  }

  const url = buildUrl(aiConfig.baseUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aiConfig.apiKey}`
    },
    body: JSON.stringify({
      model: aiConfig.model,
      temperature: aiConfig.temperature,
      max_tokens: aiConfig.maxTokens,
      messages: [
        {
          role: 'system',
          content:
            'You are a lenient grader for fill-in-the-blank. No markdown. No chain-of-thought. Judge by meaning and intent, not exact wording. Ignore punctuation, spacing, casing, full-width/half-width, and minor typos. Accept common synonyms/abbreviations if meaning matches. Extra punctuation must not reduce the score. Score proportionally by blanks. Return JSON only: {"score": number, "is_correct": boolean, "similarity": number, "per_blank": boolean[]}.'
        },
        {
          role: 'user',
          content: `Correct answers:\n${JSON.stringify(correctAnswers)}\n\nUser answers:\n${JSON.stringify(userAnswers)}\n\nAllow disorder: ${allowDisorder}\nMax score: ${maxScore}\nReturn JSON only. Include per_blank array aligned to user answers.`
        }
      ]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const jsonText = extractJson(content);
  if (!jsonText) throw new Error('Invalid response');
  const parsed = JSON.parse(jsonText);
  const score = Math.max(0, Math.min(maxScore, Number(parsed.score ?? 0)));
  const similarity = Math.max(0, Math.min(1, Number(parsed.similarity ?? (score / maxScore || 0))));
  const isCorrect = Boolean(parsed.is_correct ?? score >= maxScore);
  const perBlank = Array.isArray(parsed.per_blank)
    ? parsed.per_blank.map((v: unknown) => Boolean(v)).slice(0, userAnswers.length)
    : undefined;
  return { score, isCorrect, similarity, perBlankCorrect: perBlank };
}


export async function generateAiExplanation(params: {
  question: string;
  correctAnswer: string;
  userAnswer?: string;
  aiConfig: AiGradingConfig;
}): Promise<string> {
  const { question, correctAnswer, userAnswer, aiConfig } = params;
  const url = buildUrl(aiConfig.baseUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aiConfig.apiKey}`
    },
    body: JSON.stringify({
      model: aiConfig.model,
      temperature: Math.max(0, Math.min(1, aiConfig.temperature ?? 0.6)),
      max_tokens: Math.min(512, aiConfig.maxTokens || 512),
      messages: [
        {
          role: 'system',
          content:
            'You are a concise study coach. No markdown. No chain-of-thought. Output plain text only. Use multiple short lines. Keep tips concise and explain why the answer is correct. Limit within 120 Chinese characters.'
        },
        {
          role: 'user',
          content: `题目:
${question}

参考答案:
${correctAnswer}

用户答案:
${userAnswer || '（未作答）'}

请按以下格式输出，每项一行：
1) 答题技巧：简短精炼
2) 解析：说明为什么答案正确
3) 关键点：一句话总结`
        }
      ]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Invalid response');
  return content;
}
