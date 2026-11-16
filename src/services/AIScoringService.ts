import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';

const X_BASE_URL = 'https://' + 'x.com';

// 1. Zod Schema chuẩn hóa cấu trúc đầu ra bắt buộc của LLM 
export const CandidateEvaluationSchema = z.object({ 
    isRelevantBuilder: z.boolean().describe('True if the person is an AI/Robotics founder, builder, or researcher connected to Southeast Asia'), 
    fitScore: z.number().int().min(1).max(10).describe('Score from 1-10 indicating alignment with GenAI Fund'), 
    roleCategory: z.string().describe('Role category, e.g., "Embodied AI / Robotics Founder", "LLM Infra Engineer", "Agentic AI Builder"'), 
    seaConnection: z.string().describe('Connection to the Southeast Asia ecosystem (location, market served, or community contribution)'), 
    whyTheyFit: z.string().describe('Concise 1-2 sentence explanation of why GenAI Fund should connect with this person'), 
    evidenceQuote: z.string().describe('Exact verbatim quote from the bio or a specific tweet serving as real evidence'), 
    evidenceUrl: z.string().describe('Direct URL to the supporting tweet or the X profile URL if evidence is from the bio'), 
    draftMessage: z.string().max(450).describe('Warm, concise personalized DM under 450 characters referencing the real evidence'), 
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

export class AIScoringService {
    private ai: GoogleGenAI;
    private modelName: string;

    constructor() {
        const apiKey =
            process.env.GEMINI_API_KEY ||
            process.env.GOOGLE_API_KEY ||
            process.env.GOOGLE_GENAI_API_KEY;

        if (!apiKey) {
            throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) is not set in environment variables.');
        }

        this.ai = new GoogleGenAI({ apiKey });
        this.modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    }

    async evaluateProfile(profile: RawProfileInput): Promise<CandidateEvaluation> {
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

        const systemPrompt = `You are a Technical Talent Scout for GenAI Fund, an AI-focused venture fund and ecosystem builder in Southeast Asia (SEA). 
MISSION: Identify and connect with builders, founders, and researchers working on AI models, applications, developer tools, infrastructure, robotics, or embodied AI in or relevant to Southeast Asia. 
STRICT GROUNDING RULES: 
    1. NEVER invent familiarity (no "great to reconnect", "been following you for years", etc.). 
    2. "evidenceQuote" MUST be a verbatim excerpt from the provided bio or tweets. If no relevant evidence exists, set isRelevantBuilder = false and fitScore < 4. 
    3. "evidenceUrl" must point to the exact tweet URL containing the quote, or ${profileUrl} if taken from the bio. 
    4. "draftMessage" must be under 450 characters, warm, peer-to-peer, reference the concrete evidence, and end with a light open question.`;

        const userPrompt = `Evaluate the following candidate profile: 
- Name: ${profile.name} (@${profile.username}) 
- Location: ${profile.location || 'Unknown'} 
- Bio: ${profile.bio || 'Empty'} 
- Recent Tweets: ${tweetsContext}`;

        try {
            const response = await this.ai.models.generateContent({
                model: this.modelName,
                contents: userPrompt,
                config: {
                    systemInstruction: systemPrompt,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            isRelevantBuilder: {
                                type: Type.BOOLEAN,
                                description: 'True if the person is an AI/Robotics founder, builder, or researcher connected to Southeast Asia',
                            },
                            fitScore: {
                                type: Type.INTEGER,
                                description: 'Score from 1-10 indicating alignment with GenAI Fund',
                            },
                            roleCategory: {
                                type: Type.STRING,
                                description: 'Role category, e.g., "Embodied AI / Robotics Founder", "LLM Infra Engineer", "Agentic AI Builder"',
                            },
                            seaConnection: {
                                type: Type.STRING,
                                description: 'Connection to the Southeast Asia ecosystem (location, market served, or community contribution)',
                            },
                            whyTheyFit: {
                                type: Type.STRING,
                                description: 'Concise 1-2 sentence explanation of why GenAI Fund should connect with this person',
                            },
                            evidenceQuote: {
                                type: Type.STRING,
                                description: 'Exact verbatim quote from the bio or a specific tweet serving as real evidence',
                            },
                            evidenceUrl: {
                                type: Type.STRING,
                                description: 'Direct URL to the supporting tweet or the X profile URL if evidence is from the bio',
                            },
                            draftMessage: {
                                type: Type.STRING,
                                description: 'Warm, concise personalized DM under 450 characters referencing the real evidence',
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
                },
            });

            const text = response.text;
            if (!text) {
                throw new Error('Gemini API returned an empty response.');
            }

            const parsed = JSON.parse(text);
            return CandidateEvaluationSchema.parse(parsed);
        } catch (error) {
            console.error(`[AIScoringService] Error evaluating profile for @${profile.username}:`, error);
            throw error;
        }
    }
}
