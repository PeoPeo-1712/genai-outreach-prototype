import { GoogleGenAI, Type } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { z } from 'zod';
import { OutreachTone } from '../types';

const X_BASE_URL = 'https://' + 'x.com';

// 1. Zod Schema chuẩn hóa cấu trúc đầu ra bắt buộc
export const CandidateEvaluationSchema = z.object({
    isRelevantBuilder: z.boolean().describe('True if the person is an AI/Robotics founder, builder, or researcher connected to Southeast Asia'),
    fitScore: z.number().int().min(1).max(10).describe('Score from 1-10 indicating alignment with GenAI Fund'),
    roleCategory: z.string().describe('Role category, e.g., "Embodied AI / Robotics Founder", "LLM Infra Engineer", "Agentic AI Builder"'),
    seaConnection: z.string().describe('Connection to the Southeast Asia ecosystem (location, market served, or community contribution)'),
    whyTheyFit: z.string().describe('Concise 1-2 sentence explanation of why GenAI Fund should connect with this person'),
    evidenceQuote: z.string().describe('Exact verbatim quote from the bio or a specific tweet serving as real evidence'),
    evidenceUrl: z.string().describe('Direct URL to the supporting tweet or the X profile URL if evidence is from the bio'),
    draftMessage: z.string().max(450).describe('Personalized DM under 450 characters referencing the real evidence'),
});

export type CandidateEvaluation = z.infer<typeof CandidateEvaluationSchema>;

export interface RawProfileInput {
    username: string;
    name: string;
    bio?: string | null;
    location?: string | null;
    tweets: Array<{
        id: string;
        text: string;
        url?: string;
    }>;
}

export interface ScoringOptions {
    tone?: OutreachTone;
    valueProp?: string;
}

export type LLMProviderType = 'gemini' | 'anthropic' | 'xai' | 'openai';

const DEFAULT_VALUE_PROP =
    'At GenAI Fund, we back ambitious AI & robotics builders and founders across Southeast Asia with early capital, compute access, and global ecosystem support.';

const TONE_INSTRUCTIONS: Record<OutreachTone, string> = {
    warm: 'Warm, collaborative, peer-to-peer. Write like an AI engineer reaching out to another respected builder.',
    direct: 'Direct, concise, founder-focused. Highlight the concrete technical achievement and invite a quick sync.',
    formal: 'Polished, institutional, highly respectful. Well-suited for senior academic researchers and experienced founders.',
};

export class AIScoringService {
    private provider: LLMProviderType;
    private geminiClient?: GoogleGenAI;
    private anthropicClient?: Anthropic;
    private openaiClient?: OpenAI;
    private modelName: string;

    constructor(customProvider?: LLMProviderType) {
        this.provider = customProvider || this.resolveProvider();

        switch (this.provider) {
            case 'gemini': {
                const apiKey =
                    process.env.GEMINI_API_KEY ||
                    process.env.GOOGLE_API_KEY ||
                    process.env.GOOGLE_GENAI_API_KEY;
                if (!apiKey) {
                    throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) is not set in environment variables.');
                }
                this.geminiClient = new GoogleGenAI({
                    apiKey,
                    apiVersion: 'v1beta',
                });
                this.modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
                break;
            }
            case 'anthropic': {
                const apiKey = process.env.ANTHROPIC_API_KEY;
                if (!apiKey) {
                    throw new Error('ANTHROPIC_API_KEY is not set in environment variables.');
                }
                this.anthropicClient = new Anthropic({ apiKey });
                this.modelName = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
                break;
            }
            case 'xai': {
                const apiKey = process.env.XAI_API_KEY;
                if (!apiKey) {
                    throw new Error('XAI_API_KEY is not set in environment variables.');
                }
                this.openaiClient = new OpenAI({
                    apiKey,
                    baseURL: 'https://api.x.ai/v1',
                });
                this.modelName = process.env.XAI_MODEL || 'grok-2-latest';
                break;
            }
            case 'openai':
            default: {
                const apiKey = process.env.OPENAI_API_KEY;
                if (!apiKey) {
                    throw new Error('OPENAI_API_KEY is not set in environment variables.');
                }
                this.openaiClient = new OpenAI({ apiKey });
                this.modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
                break;
            }
        }

        console.log(`[AIScoringService] Initialized with provider="${this.provider}", model="${this.modelName}"`);
    }

    private resolveProvider(): LLMProviderType {
        const envChoice = process.env.LLM_PROVIDER?.trim().toLowerCase();
        if (envChoice === 'gemini' || envChoice === 'anthropic' || envChoice === 'xai' || envChoice === 'openai') {
            return envChoice;
        }

        // Auto-detect by checking available API keys in priority order: gemini -> anthropic -> xai -> openai
        if (
            (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('your_')) ||
            (process.env.GOOGLE_API_KEY && !process.env.GOOGLE_API_KEY.startsWith('your_')) ||
            (process.env.GOOGLE_GENAI_API_KEY && !process.env.GOOGLE_GENAI_API_KEY.startsWith('your_'))
        ) {
            return 'gemini';
        }

        if (process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith('your_')) {
            return 'anthropic';
        }

        if (process.env.XAI_API_KEY && !process.env.XAI_API_KEY.startsWith('your_')) {
            return 'xai';
        }

        if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith('your_')) {
            return 'openai';
        }

        // Default to gemini if no keys are set yet
        return 'gemini';
    }

    getProvider(): LLMProviderType {
        return this.provider;
    }

    private buildPrompts(profile: RawProfileInput, options?: ScoringOptions) {
        const profileUrl = `${X_BASE_URL}/${profile.username}`;
        const tweetsContext =
            profile.tweets.length > 0
                ? profile.tweets
                      .map(
                          (t, i) =>
                              `[Tweet ${i + 1}] (ID: ${t.id}, URL: ${t.url || `${X_BASE_URL}/${profile.username}/status/${t.id}`}):\n"${t.text}"`
                      )
                      .join('\n\n')
                : 'No tweets available.';

        const tone = options?.tone || 'warm';
        const valueProp = options?.valueProp || DEFAULT_VALUE_PROP;
        const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.warm;

        const systemPrompt = `You are a Technical Talent Scout for GenAI Fund, an AI-focused venture fund and ecosystem builder in Southeast Asia (SEA).
MISSION: Identify and connect with builders, founders, and researchers working on AI models, applications, developer tools, infrastructure, robotics, or embodied AI in or relevant to Southeast Asia.
FUND VALUE PROPOSITION: "${valueProp}"
OUTREACH TONE: ${toneInstruction}

STRICT GROUNDING RULES:
1. NEVER invent familiarity (no "great to reconnect", "been following you for years", etc.).
2. "evidenceQuote" MUST be a verbatim excerpt from the provided bio or tweets. If no relevant evidence exists, set isRelevantBuilder = false and fitScore < 4.
3. "evidenceUrl" must point to the exact tweet URL containing the quote, or ${profileUrl} if taken from the bio.
4. "draftMessage" must be under 450 characters, reference the concrete evidence verbatim quote, weave in GenAI Fund context, and end with a light open question.`;

        const userPrompt = `Evaluate the following candidate profile and return valid JSON:
- Name: ${profile.name} (@${profile.username})
- Location: ${profile.location || 'Unknown'}
- Bio: ${profile.bio || 'Empty'}
- Recent Tweets:
${tweetsContext}`;

        return { systemPrompt, userPrompt, profileUrl };
    }

    private sanitizeAndValidate(raw: Record<string, unknown>, profileUrl: string): CandidateEvaluation {
        const isRelevantBuilder = Boolean(raw.isRelevantBuilder);
        const fitScore = Math.min(Math.max(Math.round(Number(raw.fitScore) || 5), 1), 10);
        const roleCategory = String(raw.roleCategory || 'AI & Robotics Builder').trim();
        const seaConnection = String(raw.seaConnection || 'Southeast Asia').trim();
        const whyTheyFit = String(raw.whyTheyFit || 'Active builder in SEA ecosystem.').trim();
        const evidenceQuote = String(raw.evidenceQuote || raw.whyTheyFit || 'Builder in AI/Robotics').trim();
        let evidenceUrl = String(raw.evidenceUrl || '').trim();
        if (!evidenceUrl.startsWith('http')) {
            evidenceUrl = profileUrl;
        }

        let draftMessage = String(raw.draftMessage || '').trim();
        if (draftMessage.length > 450) {
            draftMessage = draftMessage.slice(0, 447) + '...';
        }

        return CandidateEvaluationSchema.parse({
            isRelevantBuilder,
            fitScore,
            roleCategory,
            seaConnection,
            whyTheyFit,
            evidenceQuote,
            evidenceUrl,
            draftMessage,
        });
    }

    private handleQuotaOrRateLimitError(err: unknown): never {
        const anyErr = err as Record<string, unknown> | undefined;
        const msg = (err as Error)?.message || '';
        const status = anyErr?.status;
        const code = anyErr?.code;

        const isQuota =
            status === 429 ||
            code === 'insufficient_quota' ||
            code === 'credit_balance_exhausted' ||
            msg.includes('429') ||
            msg.includes('quota') ||
            msg.includes('credit_balance_exhausted') ||
            msg.includes('insufficient_quota') ||
            msg.includes('RESOURCE_EXHAUSTED');

        if (isQuota) {
            const quotaErr = new Error(
                `LLM Provider (${this.provider.toUpperCase()}) quota exhausted or credits depleted: ${msg}`
            );
            Object.assign(quotaErr, {
                code: 'LLM_QUOTA_EXHAUSTED',
                provider: this.provider,
            });
            throw quotaErr;
        }

        throw err;
    }

    async evaluateProfile(profile: RawProfileInput, options?: ScoringOptions): Promise<CandidateEvaluation> {
        const { systemPrompt, userPrompt, profileUrl } = this.buildPrompts(profile, options);

        try {
            switch (this.provider) {
                case 'gemini': {
                    if (!this.geminiClient) throw new Error('Gemini client not initialized');

                    const geminiConfig = {
                        systemInstruction: systemPrompt,
                        responseMimeType: 'application/json',
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                isRelevantBuilder: {
                                    type: Type.BOOLEAN,
                                    description: 'True if the person is an AI/Robotics founder/builder/researcher',
                                },
                                fitScore: {
                                    type: Type.INTEGER,
                                    description: 'Score from 1 to 10',
                                },
                                roleCategory: {
                                    type: Type.STRING,
                                    description: 'Role category',
                                },
                                seaConnection: {
                                    type: Type.STRING,
                                    description: 'Connection to Southeast Asia',
                                },
                                whyTheyFit: {
                                    type: Type.STRING,
                                    description: '1-2 sentence reason',
                                },
                                evidenceQuote: {
                                    type: Type.STRING,
                                    description: 'Verbatim quote',
                                },
                                evidenceUrl: {
                                    type: Type.STRING,
                                    description: 'URL to tweet or profile',
                                },
                                draftMessage: {
                                    type: Type.STRING,
                                    description: 'DM under 450 characters',
                                },
                            },
                            required: [
                                'isRelevantBuilder',
                                'fitScore',
                                'roleCategory',
                                'seaConnection',
                                'whyTheyFit',
                                'evidenceQuote',
                                'evidenceUrl',
                                'draftMessage',
                            ],
                        },
                        temperature: 0.2,
                    };

                    let response;
                    try {
                        response = await this.geminiClient.models.generateContent({
                            model: this.modelName,
                            contents: userPrompt,
                            config: geminiConfig,
                        });
                    } catch (genErr: unknown) {
                        const errMsg = (genErr as Error)?.message || '';
                        const is429 =
                            (genErr as Record<string, unknown>)?.status === 429 ||
                            errMsg.includes('429') ||
                            errMsg.includes('RESOURCE_EXHAUSTED');

                        if (is429) {
                            if (this.modelName !== 'gemini-3.5-flash-lite') {
                                console.warn(`[AIScoringService] ${this.modelName} quota reached (429). Retrying with "gemini-3.5-flash-lite"...`);
                                try {
                                    response = await this.geminiClient.models.generateContent({
                                        model: 'gemini-3.5-flash-lite',
                                        contents: userPrompt,
                                        config: geminiConfig,
                                    });
                                } catch {
                                    await new Promise((r) => setTimeout(r, 2000));
                                    response = await this.geminiClient.models.generateContent({
                                        model: this.modelName,
                                        contents: userPrompt,
                                        config: geminiConfig,
                                    });
                                }
                            } else {
                                await new Promise((r) => setTimeout(r, 2000));
                                response = await this.geminiClient.models.generateContent({
                                    model: this.modelName,
                                    contents: userPrompt,
                                    config: geminiConfig,
                                });
                            }
                        } else {
                            throw genErr;
                        }
                    }

                    const text = response.text;
                    if (!text) throw new Error('Gemini API returned an empty response.');
                    const parsed = JSON.parse(text);
                    return this.sanitizeAndValidate(parsed, profileUrl);
                }

                case 'anthropic': {
                    if (!this.anthropicClient) throw new Error('Anthropic client not initialized');
                    // Tool Calling without minimum/maximum/minLength/maxLength
                    const response = await this.anthropicClient.messages.create({
                        model: this.modelName,
                        max_tokens: 1024,
                        system: systemPrompt,
                        messages: [{ role: 'user', content: userPrompt }],
                        tools: [
                            {
                                name: 'candidate_evaluation',
                                description: 'Structured technical evaluation for AI/Robotics candidate',
                                input_schema: {
                                    type: 'object',
                                    properties: {
                                        isRelevantBuilder: { type: 'boolean' },
                                        fitScore: { type: 'integer' },
                                        roleCategory: { type: 'string' },
                                        seaConnection: { type: 'string' },
                                        whyTheyFit: { type: 'string' },
                                        evidenceQuote: { type: 'string' },
                                        evidenceUrl: { type: 'string' },
                                        draftMessage: { type: 'string' },
                                    },
                                    required: [
                                        'isRelevantBuilder',
                                        'fitScore',
                                        'roleCategory',
                                        'seaConnection',
                                        'whyTheyFit',
                                        'evidenceQuote',
                                        'evidenceUrl',
                                        'draftMessage',
                                    ],
                                    additionalProperties: false,
                                },
                            },
                        ],
                        tool_choice: { type: 'tool', name: 'candidate_evaluation' },
                    });

                    const toolUseBlock = response.content.find((c) => c.type === 'tool_use');
                    if (!toolUseBlock || typeof toolUseBlock.input !== 'object') {
                        throw new Error('Anthropic response did not contain expected tool output.');
                    }

                    return this.sanitizeAndValidate(toolUseBlock.input as Record<string, unknown>, profileUrl);
                }

                case 'xai':
                case 'openai':
                default: {
                    if (!this.openaiClient) throw new Error(`${this.provider} client not initialized`);
                    const completion = await this.openaiClient.chat.completions.create({
                        model: this.modelName,
                        messages: [
                            {
                                role: 'system',
                                content: `${systemPrompt}\nOutput MUST be valid JSON with keys: isRelevantBuilder, fitScore, roleCategory, seaConnection, whyTheyFit, evidenceQuote, evidenceUrl, draftMessage.`,
                            },
                            { role: 'user', content: userPrompt },
                        ],
                        response_format: { type: 'json_object' },
                        temperature: 0.2,
                    });

                    const content = completion.choices[0]?.message?.content;
                    if (!content) throw new Error(`${this.provider} returned an empty response.`);
                    const parsed = JSON.parse(content);
                    return this.sanitizeAndValidate(parsed, profileUrl);
                }
            }
        } catch (error) {
            console.error(`[AIScoringService] Error evaluating profile @${profile.username} with ${this.provider}:`, error);
            this.handleQuotaOrRateLimitError(error);
        }
    }

    async regenerateDraft(
        candidate: {
            name: string;
            username: string;
            evidenceQuote?: string | null;
            evidenceUrl?: string | null;
            whyTheyFit?: string | null;
        },
        options?: ScoringOptions
    ): Promise<string> {
        const tone = options?.tone || 'warm';
        const valueProp = options?.valueProp || DEFAULT_VALUE_PROP;
        const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.warm;

        const systemPrompt = `You are a Technical Talent Scout for GenAI Fund in Southeast Asia.
FUND VALUE PROPOSITION: "${valueProp}"
OUTREACH TONE: ${toneInstruction}

Write a personalized peer-to-peer direct message (DM) under 450 characters to this candidate:
- Recipient: ${candidate.name} (@${candidate.username})
- Evidence Quote: "${candidate.evidenceQuote || 'AI & Robotics work'}"
- Why they fit: ${candidate.whyTheyFit || 'Builder in SEA'}

RULES:
1. STRICTLY under 450 characters.
2. Directly reference their concrete work/evidence.
3. Light, friendly open-ended question at the end.
4. Output ONLY the draft message text (no quotes, no preamble).`;

        try {
            switch (this.provider) {
                case 'gemini': {
                    if (!this.geminiClient) throw new Error('Gemini client not initialized');
                    const res = await this.geminiClient.models.generateContent({
                        model: this.modelName,
                        contents: 'Generate outreach DM draft text.',
                        config: { systemInstruction: systemPrompt, temperature: 0.3 },
                    });
                    const text = res.text?.trim() || '';
                    return text.slice(0, 450);
                }
                case 'anthropic': {
                    if (!this.anthropicClient) throw new Error('Anthropic client not initialized');
                    const res = await this.anthropicClient.messages.create({
                        model: this.modelName,
                        max_tokens: 300,
                        system: systemPrompt,
                        messages: [{ role: 'user', content: 'Generate draft DM.' }],
                    });
                    const textBlock = res.content.find((c) => c.type === 'text');
                    return (textBlock ? textBlock.text.trim() : '').slice(0, 450);
                }
                case 'xai':
                case 'openai':
                default: {
                    if (!this.openaiClient) throw new Error(`${this.provider} client not initialized`);
                    const completion = await this.openaiClient.chat.completions.create({
                        model: this.modelName,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: 'Generate draft DM.' },
                        ],
                        temperature: 0.3,
                    });
                    const text = completion.choices[0]?.message?.content?.trim() || '';
                    return text.slice(0, 450);
                }
            }
        } catch (error) {
            console.error(`[AIScoringService] Error regenerating draft for @${candidate.username}:`, error);
            this.handleQuotaOrRateLimitError(error);
        }
    }
}
