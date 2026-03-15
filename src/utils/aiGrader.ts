import { AiGradingConfig } from '../store/settingsStore';
import { Capacitor } from '@capacitor/core';
import { ConfigBridge } from '../native/configBridge';

function normalize(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]+/gu, '').trim().toLowerCase();
}

function isZhipuConfig(baseUrl: string, model?: string): boolean {
  const base = (baseUrl || '').toLowerCase();
  const modelLower = (model || '').toLowerCase();
  return base.includes('open.bigmodel.cn') || modelLower.startsWith('glm-') || modelLower.startsWith('glm_');
}

function buildUrl(baseUrl: string, model?: string): string {
  const clean = baseUrl.replace(/\/$/, '');
  if (clean.endsWith('/chat/completions')) return clean;
  if (isZhipuConfig(clean, model)) {
    if (clean.includes('/api/paas/v4')) {
      return `${clean}/chat/completions`;
    }
    return `${clean}/api/paas/v4/chat/completions`;
  }
  return `${clean}/chat/completions`;
}

function prepareRequestBody(
  body: Record<string, unknown>,
  aiConfig: AiGradingConfig,
  options?: { mode?: 'default' | 'test' | 'json' | 'plain'; forceNoStream?: boolean }
): { body: Record<string, unknown>; expectStream: boolean } {
  if (options?.forceNoStream) {
    return { body: { ...body, stream: false }, expectStream: false };
  }
  if (!isZhipuConfig(aiConfig.baseUrl, aiConfig.model)) {
    return { body, expectStream: false };
  }
  if (options?.mode === 'test') {
    return {
      body: {
        ...body,
        stream: false
      },
      expectStream: false
    };
  }
  if (options?.mode === 'json' || options?.mode === 'plain') {
    const extra: Record<string, unknown> =
      options?.mode === 'json'
        ? {
            response_format: { type: 'json_object' },
            thinking: { type: 'disabled' }
          }
        : {};
    return {
      body: {
        ...body,
        stream: false,
        ...extra
      },
      expectStream: false
    };
  }
  return {
    body: {
      ...body,
      stream: true,
      thinking: {
        type: 'enabled'
      }
    },
    expectStream: true
  };
}

async function readStreamContent(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.replace(/^data:\s*/, '');
      if (data === '[DONE]') return content;
      try {
        const json = JSON.parse(data);
        const delta =
          json?.choices?.[0]?.delta?.content ??
          json?.choices?.[0]?.message?.content ??
          '';
        if (delta) content += String(delta);
      } catch {
        continue;
      }
    }
  }
  return content;
}

async function readChatResponse(res: Response, expectStream: boolean): Promise<{ content: string; data?: unknown }> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    const content = await readStreamContent(res);
    return { content };
  }
  if (expectStream) {
    try {
      const data: any = await res.json();
      const raw = data?.choices?.[0]?.message?.content ?? '';
      const content = typeof raw === 'string' ? raw : JSON.stringify(raw);
      return { content, data };
    } catch {
      const content = await readStreamContent(res);
      return { content };
    }
  }
  const data: any = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? '';
  const content = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return { content, data };
}

function parseChatResponseText(responseText: string): { content: string; data?: unknown } {
  const data: any = JSON.parse(responseText);
  const raw = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.delta?.content ?? '';
  const content = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return { content, data };
}

function buildErrorMessage(params: {
  url: string;
  status: number;
  statusText: string;
  durationMs: number;
  responseText: string;
  model: string;
  baseUrl: string;
  requestId?: string | null;
  retryAfter?: string | null;
}): string {
  const {
    url,
    status,
    statusText,
    durationMs,
    responseText,
    model,
    baseUrl,
    requestId,
    retryAfter
  } = params;
  const trimmed = (responseText || '').trim();
  const snippet = trimmed.length > 800 ? `${trimmed.slice(0, 800)}...` : trimmed;
  const parts = [
    `HTTP ${status} ${statusText}`.trim(),
    `durationMs=${durationMs}`,
    `model=${model || '(empty)'}`,
    `baseUrl=${baseUrl || '(empty)'}`,
    `url=${url}`
  ];
  if (requestId) parts.push(`requestId=${requestId}`);
  if (retryAfter) parts.push(`retryAfter=${retryAfter}`);
  if (snippet) parts.push(`response=${snippet}`);
  return parts.join(' | ');
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : '';
}

function truncateText(text: string, maxLen = 800): string {
  const trimmed = (text || '').trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}...`;
}

async function proxyRequest(params: {
  url: string;
  body: Record<string, unknown>;
  aiConfig: AiGradingConfig;
}): Promise<{ status: number; statusText: string; bodyText: string; contentType?: string; requestId?: string | null; retryAfter?: string | null }> {
  const res = await ConfigBridge.aiProxyChat({
    url: params.url,
    body: JSON.stringify(params.body),
    headers: { 'Content-Type': 'application/json' }
  });
  return {
    status: res.status,
    statusText: res.statusText || '',
    bodyText: res.bodyText || '',
    contentType: res.contentType,
    requestId: res.requestId ?? null,
    retryAfter: res.retryAfter ?? null
  };
}

function shouldUseNativeProxy(useNativeProxy?: boolean): boolean {
  return Boolean(useNativeProxy && Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('ConfigBridge'));
}

export async function testAiConnection(
  aiConfig: AiGradingConfig,
  options?: { useNativeProxy?: boolean }
): Promise<void> {
  const url = buildUrl(aiConfig.baseUrl, aiConfig.model);
  const started = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  const prepared = prepareRequestBody(
    {
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
    },
    aiConfig,
    { mode: 'test', forceNoStream: shouldUseNativeProxy(options?.useNativeProxy) }
  );
  let content = '';
  if (shouldUseNativeProxy(options?.useNativeProxy)) {
    const proxyRes = await proxyRequest({ url, body: prepared.body, aiConfig }).finally(() => clearTimeout(timeoutId));
    if (proxyRes.status < 200 || proxyRes.status >= 300) {
      const durationMs = Date.now() - started;
      throw new Error(
        buildErrorMessage({
          url,
          status: proxyRes.status,
          statusText: proxyRes.statusText,
          durationMs,
          responseText: proxyRes.bodyText,
          model: aiConfig.model,
          baseUrl: aiConfig.baseUrl,
          requestId: proxyRes.requestId,
          retryAfter: proxyRes.retryAfter
        })
      );
    }
    content = parseChatResponseText(proxyRes.bodyText).content;
  } else {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify(prepared.body)
    }).finally(() => clearTimeout(timeoutId));
    if (!res.ok) {
      const text = await res.text();
      const durationMs = Date.now() - started;
      throw new Error(
        buildErrorMessage({
          url,
          status: res.status,
          statusText: res.statusText,
          durationMs,
          responseText: text,
          model: aiConfig.model,
          baseUrl: aiConfig.baseUrl,
          requestId: res.headers.get('x-request-id') || res.headers.get('x-requestid'),
          retryAfter: res.headers.get('retry-after')
        })
      );
    }
    content = (await readChatResponse(res, prepared.expectStream)).content;
  }
  const trimmed = content?.trim();
  if (!trimmed) {
    throw new Error('Invalid response');
  }
  if (!isZhipuConfig(aiConfig.baseUrl, aiConfig.model) && !trimmed.toUpperCase().includes('OK')) {
    throw new Error('Invalid response');
  }
}

export async function gradeSubjectiveAnswer(params: {
  userAnswer: string;
  correctAnswer: string;
  maxScore: number;
  aiConfig: AiGradingConfig;
  useNativeProxy?: boolean;
}): Promise<{ score: number; isCorrect: boolean; similarity: number; perBlankCorrect?: boolean[] }> {
  const { userAnswer, correctAnswer, maxScore, aiConfig, useNativeProxy } = params;

  if (normalize(userAnswer) === normalize(correctAnswer)) {
    return { score: maxScore, isCorrect: true, similarity: 1 };
  }

  const url = buildUrl(aiConfig.baseUrl, aiConfig.model);
  const started = Date.now();
  const prepared = prepareRequestBody({
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
  }, aiConfig, { mode: 'json', forceNoStream: shouldUseNativeProxy(useNativeProxy) });
  let content = '';
  if (shouldUseNativeProxy(useNativeProxy)) {
    const proxyRes = await proxyRequest({ url, body: prepared.body, aiConfig });
    if (proxyRes.status < 200 || proxyRes.status >= 300) {
      const durationMs = Date.now() - started;
      throw new Error(
        buildErrorMessage({
          url,
          status: proxyRes.status,
          statusText: proxyRes.statusText,
          durationMs,
          responseText: proxyRes.bodyText,
          model: aiConfig.model,
          baseUrl: aiConfig.baseUrl,
          requestId: proxyRes.requestId,
          retryAfter: proxyRes.retryAfter
        })
      );
    }
    content = parseChatResponseText(proxyRes.bodyText).content;
  } else {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.apiKey}`
      },
      body: JSON.stringify(prepared.body)
    });

    if (!res.ok) {
      const text = await res.text();
      const durationMs = Date.now() - started;
      throw new Error(
        buildErrorMessage({
          url,
          status: res.status,
          statusText: res.statusText,
          durationMs,
          responseText: text,
          model: aiConfig.model,
          baseUrl: aiConfig.baseUrl,
          requestId: res.headers.get('x-request-id') || res.headers.get('x-requestid'),
          retryAfter: res.headers.get('retry-after')
        })
      );
    }

    content = (await readChatResponse(res, prepared.expectStream)).content;
  }
  const jsonText = extractJson(content);
  if (!jsonText) {
    throw new Error(`Invalid response | content=${truncateText(content)}`);
  }
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
  useNativeProxy?: boolean;
}): Promise<{ score: number; isCorrect: boolean; similarity: number; perBlankCorrect?: boolean[] }> {
  const { userAnswers, correctAnswers, allowDisorder, maxScore, aiConfig, useNativeProxy } = params;
  const normalizedUser = userAnswers.map((a) => normalize(a));
  const normalizedCorrect = correctAnswers.map((a) => normalize(a));

  if (normalizedUser.join('|') === normalizedCorrect.join('|')) {
    return { score: maxScore, isCorrect: true, similarity: 1 };
  }

  const url = buildUrl(aiConfig.baseUrl, aiConfig.model);
  const started = Date.now();
  const prepared = prepareRequestBody({
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
  }, aiConfig, { mode: 'json', forceNoStream: shouldUseNativeProxy(useNativeProxy) });
  let content = '';
  if (shouldUseNativeProxy(useNativeProxy)) {
    const proxyRes = await proxyRequest({ url, body: prepared.body, aiConfig });
    if (proxyRes.status < 200 || proxyRes.status >= 300) {
      const durationMs = Date.now() - started;
      throw new Error(
        buildErrorMessage({
          url,
          status: proxyRes.status,
          statusText: proxyRes.statusText,
          durationMs,
          responseText: proxyRes.bodyText,
          model: aiConfig.model,
          baseUrl: aiConfig.baseUrl,
          requestId: proxyRes.requestId,
          retryAfter: proxyRes.retryAfter
        })
      );
    }
    content = parseChatResponseText(proxyRes.bodyText).content;
  } else {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.apiKey}`
      },
      body: JSON.stringify(prepared.body)
    });

    if (!res.ok) {
      const text = await res.text();
      const durationMs = Date.now() - started;
      throw new Error(
        buildErrorMessage({
          url,
          status: res.status,
          statusText: res.statusText,
          durationMs,
          responseText: text,
          model: aiConfig.model,
          baseUrl: aiConfig.baseUrl,
          requestId: res.headers.get('x-request-id') || res.headers.get('x-requestid'),
          retryAfter: res.headers.get('retry-after')
        })
      );
    }

    content = (await readChatResponse(res, prepared.expectStream)).content;
  }
  const jsonText = extractJson(content);
  if (!jsonText) {
    throw new Error(`Invalid response | content=${truncateText(content)}`);
  }
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
  useNativeProxy?: boolean;
}): Promise<string> {
  const { question, correctAnswer, userAnswer, aiConfig, useNativeProxy } = params;
  const url = buildUrl(aiConfig.baseUrl, aiConfig.model);
  const started = Date.now();
  const prepared = prepareRequestBody({
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
  }, aiConfig, { mode: 'plain', forceNoStream: shouldUseNativeProxy(useNativeProxy) });
  let content = '';
  if (shouldUseNativeProxy(useNativeProxy)) {
    const proxyRes = await proxyRequest({ url, body: prepared.body, aiConfig });
    if (proxyRes.status < 200 || proxyRes.status >= 300) {
      const durationMs = Date.now() - started;
      throw new Error(
        buildErrorMessage({
          url,
          status: proxyRes.status,
          statusText: proxyRes.statusText,
          durationMs,
          responseText: proxyRes.bodyText,
          model: aiConfig.model,
          baseUrl: aiConfig.baseUrl,
          requestId: proxyRes.requestId,
          retryAfter: proxyRes.retryAfter
        })
      );
    }
    content = parseChatResponseText(proxyRes.bodyText).content;
  } else {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.apiKey}`
      },
      body: JSON.stringify(prepared.body)
    });

    if (!res.ok) {
      const text = await res.text();
      const durationMs = Date.now() - started;
      throw new Error(
        buildErrorMessage({
          url,
          status: res.status,
          statusText: res.statusText,
          durationMs,
          responseText: text,
          model: aiConfig.model,
          baseUrl: aiConfig.baseUrl,
          requestId: res.headers.get('x-request-id') || res.headers.get('x-requestid'),
          retryAfter: res.headers.get('retry-after')
        })
      );
    }

    content = (await readChatResponse(res, prepared.expectStream)).content;
  }
  const trimmed = content?.trim();
  if (!trimmed) throw new Error('Invalid response');
  return trimmed;
}
