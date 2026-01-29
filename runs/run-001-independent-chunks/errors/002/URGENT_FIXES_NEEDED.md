# URGENT FIX REQUIRED: State Continuity

## The Problem

Generated story contains **3 different stories mashed together:**
1. Museum of Closets (chunks 1-2)
2. Cabin horror (chunks 3-5)  
3. Apartment containment (chunks 6-11)

Each chunk is generating independently without story continuity.

---

## Root Cause

**Chunk prompts don't include continuity constraints.**

Current prompt probably looks like:
```
Generate chunk 3 of the horror story.
Continue the narrative.
Word count: 2000 words.
```

Missing:
```
CONTINUITY CONSTRAINTS:
- Setting: Museum of Closets, 1847 Holloway Street
- Protagonist: Curator (Martin's nephew)  
- Rules: [actual text of rules 1-7]
- Current situation: Reeves rental #23 expired, young man warned about breaking rules
- DO NOT change setting
- DO NOT introduce new rule system
```

---

## Fix #1: Inject State into Chunk Prompts (CRITICAL)

### Location
Probably in: `src/generators/storyGenerator.js` or wherever chunk prompts are built

### Change Required

```javascript
function buildChunkPrompt(chunkNumber, targetWords, canonicalState) {
  // Base instructions
  let prompt = `Generate chunk ${chunkNumber} of a horror story.
Target word count: ${targetWords} words.
`;

  // CRITICAL: Add continuity constraints for chunks 2+
  if (chunkNumber > 1 && canonicalState) {
    prompt += `

CRITICAL CONTINUITY CONSTRAINTS:
You are continuing an existing story. DO NOT start a new story.

Setting: ${canonicalState.setting || 'Unknown'}
Protagonist: ${canonicalState.protagonist || 'Unknown'}

Active Rules (maintain these exactly):
${canonicalState.rules.map((r, i) => `${i + 1}. ${r.text || r.rule_id}`).join('\n')}

Current plot state:
${canonicalState.narrative_delta_log?.[canonicalState.narrative_delta_log.length - 1]?.changes?.join(', ') || 'Story beginning'}

ABSOLUTE REQUIREMENTS:
- MUST maintain the same setting (${canonicalState.setting})
- MUST maintain the same protagonist
- MUST maintain the same rule numbering system
- DO NOT introduce a new location
- DO NOT create new rules with different numbering
- DO NOT switch protagonists
- DO NOT reset the scenario

This is a CONTINUATION, not a new beginning.
`;
  }

  return prompt;
}
```

### Test
After this fix, generate 10k words and verify:
- All chunks stay in same setting
- Same protagonist throughout
- Same rule system throughout

---

## Fix #2: Honor Skip Flags

### Location
`src/generators/stageOrchestrator.js` or similar

### Problem
User set `skipAudit: true` and `skipRefinement: true` but audit still ran.

### Change Required

```javascript
function determineStages(config) {
  const stages = ['init', 'draft_generation', 'assembly'];
  
  // Only add audit if NOT skipped
  if (!config.skipAudit) {
    stages.push('audit');
  }
  
  // Only add refinement if NOT skipped AND audit ran
  if (!config.skipRefinement && !config.skipAudit) {
    stages.push('refinement');
  }
  
  stages.push('packaging', 'complete');
  
  return stages;
}
```

### Test
Set `skipAudit: true`, verify these files DON'T exist:
- 02_revision_audit_report.md
- 03_revised_story.txt
- 05_error_identification_log.md

---

## Fix #3: Populate Canonical State (Important but not urgent)

### Location
After each chunk is generated

### Change Required

```javascript
async function generateChunk(chunkNumber, targetWords, state) {
  // Generate the chunk
  const chunk = await claudeAPI.call(prompt);
  
  // Extract basic info (lightweight - NO extra API call)
  const delta = {
    chunkNumber,
    setting: chunkNumber === 1 ? extractSetting(chunk) : state.setting,
    protagonist: chunkNumber === 1 ? extractProtagonist(chunk) : state.protagonist,
    rulesIntroduced: extractRules(chunk)
  };
  
  // Update state
  if (chunkNumber === 1) {
    state.setting = delta.setting;
    state.protagonist = delta.protagonist;
  }
  
  delta.rulesIntroduced.forEach(rule => {
    if (!state.rules.find(r => r.text === rule)) {
      state.rules.push({
        rule_id: `rule_${state.rules.length + 1}`,
        text: rule,
        active: true
      });
    }
  });
  
  state.narrative_delta_log.push({
    scene: chunkNumber,
    changes: [delta]
  });
  
  return {chunk, state};
}

function extractSetting(text) {
  // Simple regex to find setting mentions
  const settingPatterns = [
    /at (?:the )?([A-Z][a-zA-Z\s]+(?:Museum|Diner|Cabin|Building|House))/,
    /(?:the|a) ([A-Z][a-zA-Z\s]+(?:of [A-Z][a-zA-Z]+))/
  ];
  
  for (const pattern of settingPatterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  
  return "Unknown";
}

function extractProtagonist(text) {
  // Look for "I am [name]" or "My name is [name]"
  const namePattern = /(?:I am|My name is|I'm) ([A-Z][a-z]+)/;
  const match = text.match(namePattern);
  
  if (match) return match[1];
  
  // Default to role if found
  if (text.includes("curator")) return "curator";
  if (text.includes("cook")) return "cook";
  if (text.includes("ranger")) return "ranger";
  
  return "narrator";
}

function extractRules(text) {
  // Find numbered rules
  const rules = [];
  const rulePatterns = [
    /RULE (?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|\d+):\s*([^\n]+)/g,
    /Rule #?\d+:\s*([^\n]+)/g
  ];
  
  for (const pattern of rulePatterns) {
    const matches = [...text.matchAll(pattern)];
    matches.forEach(m => rules.push(m[0]));
  }
  
  return rules;
}
```

---

## Priority Order

1. **Fix #1** (State injection) - CRITICAL, blocks everything
2. **Fix #2** (Skip flags) - High priority, user experience issue
3. **Fix #3** (State extraction) - Important for long-term, not urgent

---

## Test Plan

### Test 1: Continuity
```bash
Request: 10,000 words, desert_diner
Expected: All chunks maintain "desert diner" setting
Verify: grep -i "cabin|apartment|museum|forest" story.txt → 0 results
```

### Test 2: Skip Flags
```bash
Request: skipAudit=true
Expected files: 01_initial_generation.txt, README.txt, 06_metadata.json
NOT expected: 02_audit_report.md, 03_revised_story.txt
```

### Test 3: State Population
```bash
After generation, check session_state.json:
- setting should NOT be null
- protagonist should NOT be null  
- rules array should be populated
- narrative_delta_log should have entries
```

---

## Estimated Time

- Fix #1: 1-2 hours
- Fix #2: 30 minutes
- Fix #3: 2-3 hours
- Testing: 1 hour

**Total: 5-7 hours**

---

## Success Criteria

**After these fixes:**
1. Generate 10k-word story → single coherent narrative, no setting shifts
2. Set skipAudit=true → no audit files created
3. Check session_state.json → populated with actual values

**Current status:** Mechanical success, narrative failure  
**Target status:** Both mechanical AND narrative success
