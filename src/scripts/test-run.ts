import fs from 'node:fs'; 
import path from 'node:path'; 
import assert from 'node:assert/strict'; 
import { prisma } from '../lib/prisma'; 
import { 
    AIScoringService, 
    type CandidateEvaluation, 
    type RawProfileInput, 
} from '../services/AIScoringService'; 
import { OutreachService } from '../services/OutreachService';

const X_BASE_URL = 'https://' + 'x.com'; 
/** 
 * Lightweight .env loader (avoids requiring the external \`dotenv\` package) 
 */ 
function loadEnvIfPresent(): void { 
    const envPath = path.resolve(process.cwd(), '.env'); 
    if (!fs.existsSync(envPath)) return;

    const lines = fs.readFileSync(envPath, 'utf8').split(/\\r?\\n/); 
    for (const rawLine of lines) { 
        const line = rawLine.trim(); 
        if (!line || line.startsWith('#')) continue; 
        
        const eqIdx = line.indexOf('='); 
        if (eqIdx === -1) continue; 
        
        const key = line.slice(0, eqIdx).trim(); 
        let value = line.slice(eqIdx + 1).trim();

        if ( 
            (value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'")) ) { 
                value = value.slice(1, -1); 
            } 
        if (key && process.env[key] === undefined) { process.env[key] = value; } 
    } 
}

function isRealSecret(val: string | undefined, placeholderPrefix: string): boolean { 
    if (!val) return false; 
    const trimmed = val.trim(); 
    if (!trimmed) return false; 
    if (trimmed === 'sk-...' || trimmed.startsWith('your\_')) return false; 
    if (placeholderPrefix && trimmed === placeholderPrefix) return false; 
    return true; 
} 

function getMockEvaluation(): CandidateEvaluation { 
    return { 
        isRelevantBuilder: true, 
        fitScore: 9, 
        roleCategory: 'Embodied AI / Robotics Founder', 
        seaConnection: 'Based in Ho Chi Minh City, Vietnam', 
        whyTheyFit: 'Building VLA policies and open-sourcing manipulation datasets in SEA.', 
        evidenceQuote: 'Just open-sourced our tactile teleoperation dataset for bimanual manipulation trained in HCMC.', 
        evidenceUrl: `${X_BASE_URL}/sea_robotics_test/status/1855000000000000001`, 
        draftMessage: 'Hi Minh — saw your post open-sourcing the tactile teleoperation dataset for bimanual manipulation in HCMC. Really practical work for low-cost robotics. At GenAI Fund, we back AI &amp; robotics builders across SEA—would love to hear what you are exploring next.', 
    }; 
}

async function main() { 
    loadEnvIfPresent();
    const args = new Set(process.argv.slice(2)); 
    const isLiveMode = args.has('--live'); 
    const keepTestRecords = args.has('--keep'); 
    
    console.log('=========================================================='); 
    console.log('[TestRun] Starting GenAI Fund Outreach Prototype Smoke Test'); 
    console.log(`[TestRun] Mode: ${isLiveMode ? 'LIVE X API' : 'DRY-RUN (Local DB &amp; Safety Gates)'}`); 
    console.log('==========================================================\\n'); 
    const testUserIds: string[] = []; 
    try { 
        // --------------------------------------------------------- 
        // // TEST 1: Evidence-Grounded AI Scoring (AIScoringService) 
        // // --------------------------------------------------------- 
        console.log('--- [Test 1] AIScoringService: Evidence-Grounded Scoring ---');

        const sampleProfile: RawProfileInput = { 
            username: 'sea_robotics_test', 
            name: 'Minh Tran', 
            location: 'Ho Chi Minh City, Vietnam', 
            bio: 'Co-founder building vision-language-action (VLA) policies for low-cost robotic arms in SEA.', 
            tweets: [ 
                { 
                    id: '1855000000000000001', 
                    text: 'Just open-sourced our tactile teleoperation dataset for bimanual manipulation trained in HCMC.', 
                    url: `${X_BASE_URL}/sea_robotics_test/status/1855000000000000001`, 
                }, 
            ], 
        };

        const useMockAi = args.has('--mock-ai'); 
        let evaluation: CandidateEvaluation;
        
        const geminiApiKey =
            process.env.GEMINI_API_KEY ||
            process.env.GOOGLE_API_KEY ||
            process.env.GOOGLE_GENAI_API_KEY;

        if (!useMockAi && isRealSecret(geminiApiKey, 'your_gemini_api_key')) { 
            try { 
                const scorer = new AIScoringService();
                evaluation = await scorer.evaluateProfile(sampleProfile);
                assert.ok(evaluation.evidenceQuote.length > 0, 'evidenceQuote must not be empty'); 
                assert.ok(evaluation.evidenceUrl.startsWith('http'), 'evidenceUrl must be a valid URL'); 
                assert.ok(evaluation.draftMessage.length <= 450, 'draftMessage must stay under 450 chars'); 
                console.log('[Test 1] PASSED (Live Gemini AI evaluation verified)'); 
            } catch (err: any) { 
                if (err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('quota')) {
                    console.warn('[Test 1] Gemini quota exhausted (429). Falling back to mock evaluation to run remaining tests.'); 
                    evaluation = getMockEvaluation(); 
                } else { 
                    throw err; 
                } 
            }
        } else {
            console.warn('[Test 1] SKIPPED live Gemini call (GEMINI_API_KEY missing or placeholder). Using mock evaluation.'); 
            evaluation = { 
                isRelevantBuilder: true, 
                fitScore: 9, 
                roleCategory: 'Embodied AI / Robotics Founder', 
                seaConnection: 'Based in Ho Chi Minh City, Vietnam', 
                whyTheyFit: 'Building VLA policies and open-sourcing manipulation datasets in SEA.', 
                evidenceQuote: 'Just open-sourced our tactile teleoperation dataset for bimanual manipulation trained in HCMC.', 
                evidenceUrl: `${X_BASE_URL}/sea_robotics_test/status/1855000000000000001`, 
                draftMessage: 'Hi Minh — saw your post open-sourcing the tactile teleoperation dataset for bimanual manipulation in HCMC. Really practical work for low-cost robotics. At GenAI Fund, we back AI &amp; robotics builders across SEA—would love to hear what you are exploring next.', 
            };
        }

        console.log('Evaluation summary:', { 
            fitScore: evaluation.fitScore, 
            roleCategory: evaluation.roleCategory, 
            evidenceQuote: evaluation.evidenceQuote, 
            evidenceUrl: evaluation.evidenceUrl, 
            draftLength: evaluation.draftMessage.length, 
        }); 
        console.log('');

        // --------------------------------------------------------- 
        // // Setup OutreachService (use dummy token in dry-run if missing) 
        // // --------------------------------------------------------- 
        if (!isLiveMode && !isRealSecret(process.env.X_USER_ACCESS_TOKEN, 'your_oauth2_user_access_token')) { 
            process.env.X_USER_ACCESS_TOKEN = 'dry_run_placeholder_token'; 
        } 
        
        // Ensure test mode safety gate is active during dry-run 
        if (!isLiveMode && !process.env.ALLOWED_TEST_HANDLES) { 
            process.env.ALLOWED_TEST_HANDLES = 'authorized_test_handle'; 
        } 
        
        const outreach = new OutreachService(prisma);

        // --------------------------------------------------------- 
        // // TEST 2: Sandbox Safety Gate (Block non-whitelisted handles) 
        // // --------------------------------------------------------- 
        console.log('--- [Test 2] OutreachService: Sandbox Safety Gate ---'); 
        const unapprovedXId = 'test_x_user_unapproved_001'; 
        testUserIds.push(unapprovedXId); 
        const candidateA = await prisma.candidate.upsert({ 
            where: { xUserId: unapprovedXId }, 
            update: { 
                username: sampleProfile.username, 
                name: sampleProfile.name, 
                bio: sampleProfile.bio, 
                location: sampleProfile.location, 
                fitScore: evaluation.fitScore, 
                whyTheyFit: evaluation.whyTheyFit, 
                evidenceQuote: evaluation.evidenceQuote, 
                evidenceUrl: evaluation.evidenceUrl, 
                status: 'PENDING', 
            },
            create: { 
                xUserId: unapprovedXId, 
                username: sampleProfile.username, 
                name: sampleProfile.name, 
                bio: sampleProfile.bio, 
                location: sampleProfile.location, 
                fitScore: evaluation.fitScore, 
                whyTheyFit: evaluation.whyTheyFit, 
                evidenceQuote: evaluation.evidenceQuote, 
                evidenceUrl: evaluation.evidenceUrl, 
                status: 'PENDING', 
            }, 
        });

        const dupBeforeSend = await outreach.checkDuplicate(candidateA.xUserId); 
        assert.equal(dupBeforeSend, false, 'New PENDING candidate should not be flagged as duplicate'); 
        const sandboxResult = await outreach.sendSafeDM(candidateA.id, evaluation.draftMessage); 
        assert.equal(sandboxResult.success, false, 'Non-whitelisted candidate must be blocked in non-production'); 
        assert.equal(sandboxResult.status, 'SANDBOX_BLOCKED'); 
        console.log('[Test 2] PASSED ->', sandboxResult.error); 
        console.log('');

        // --------------------------------------------------------- 
        // // TEST 3: Deduplication Gate (Never double-message anyone) 
        // // --------------------------------------------------------- 
        console.log('--- [Test 3] OutreachService: Deduplication Gate ---'); 
        const alreadySentXId = 'test_x_user_sent_002'; 
        testUserIds.push(alreadySentXId); 
        const candidateB = await prisma.candidate.upsert({ 
            where: { xUserId: alreadySentXId }, 
            update: { status: 'SENT' }, 
            create: { 
                xUserId: alreadySentXId, 
                username: 'already_contacted_builder', 
                name: 'Already Contacted', 
                bio: 'AI infra engineer in Singapore', 
                fitScore: 8, 
                whyTheyFit: 'Building open-source inference tooling in SEA.', 
                evidenceQuote: 'AI infra engineer in Singapore', 
                evidenceUrl: `${X_BASE_URL}/already_contacted_builder`, status: 'SENT', 
            }, 
        });

        await prisma.message.create({ 
            data: { 
                candidateId: candidateB.id, 
                draftText: 'Initial approved outreach DM', 
                sentText: 'Initial approved outreach DM', 
                sendStatus: 'SENT', 
                sentAt: new Date(), 
            }, 
        });

        const isDup = await outreach.checkDuplicate(candidateB.xUserId); 
        assert.equal(isDup, true, 'Previously SENT candidate must return true for checkDuplicate'); 
        const dupResult = await outreach.sendSafeDM(candidateB.id, 'Second attempt should be blocked'); 
        assert.equal(dupResult.success, false); 
        assert.equal(dupResult.status, 'DUPLICATE_BLOCKED'); console.log('[Test 3] PASSED ->', dupResult.error); console.log('');

        // --------------------------------------------------------- 
        // // TEST 4: Optional Live X API Send + Reply Sync (--live) 
        // // --------------------------------------------------------- 
        if (isLiveMode) { 
            console.log('--- [Test 4] Live X API DM &amp; Reply Sync ---'); 
            const liveTargetXId = process.env.TEST_TARGET_X_USER_ID; 
            const liveTargetHandle = process.env.TEST_TARGET_X_USERNAME; 
            if (!liveTargetXId || !liveTargetHandle) { 
                console.warn( '[Test 4] SKIPPED live DM send: set TEST_TARGET_X_USER_ID and TEST_TARGET_X_USERNAME in .env (must match ALLOWED_TEST_HANDLES).' ); 
            } else { 
                testUserIds.push(liveTargetXId); 
                const liveCandidate = await prisma.candidate.upsert({ 
                    where: { xUserId: liveTargetXId }, 
                    update: { 
                        username: liveTargetHandle, 
                        status: 'PENDING' 
                    }, 
                    create: { 
                        xUserId: liveTargetXId, 
                        username: liveTargetHandle, 
                        name: liveTargetHandle, 
                        bio: 'Controlled test account for GenAI Fund prototype verification.', 
                        fitScore: 9, 
                        whyTheyFit: 'Authorized test account.', 
                        evidenceQuote: 'Controlled test account', 
                        evidenceUrl: `${X_BASE_URL}/${liveTargetHandle}`, 
                        status: 'PENDING', 
                    }, 
                });

                const liveSendResult = await outreach.sendSafeDM( 
                    liveCandidate.id, `[Prototype Test] Hi @${liveTargetHandle}, verifying GenAI Fund DM outreach flow at ${new Date().toISOString()}` 
                ); 
                console.log('[Test 4] Live sendSafeDM result:', liveSendResult); 
            }

            const syncResult = await outreach.syncReplies(); 
            console.log('[Test 4] Live syncReplies result:', syncResult); 
            console.log(''); 
        } else { 
            console.log('--- [Test 4] Live X API checks skipped (run with \`--live\` to test real X API calls) ---\\n'); 
        }

        console.log('=========================================================='); 
        console.log('[TestRun] All enabled checks completed successfully.'); 
        console.log('=========================================================='); 
    } finally { 
        if (!keepTestRecords && testUserIds.length > 0) { 
            await prisma.message.deleteMany({ 
                where: { 
                    candidate: { 
                        xUserId: { 
                            in: testUserIds 
                        } 
                    } 
                }, 
            }); 
            await prisma.candidate.deleteMany({
                 where: { xUserId: { in: testUserIds } }, 
            }); 
            console.log(`[TestRun] Cleaned up ${testUserIds.length} temporary test candidate record(s).`); 
        } 
        await prisma.$disconnect(); 
    } 
} 

main().catch((err) => { 
    console.error('[TestRun] Fatal test failure:', err); 
    process.exitCode = 1; 
});