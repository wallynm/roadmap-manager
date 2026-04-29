export function systemPrompt(context) {
  return `You are writing a resolution note for a work item that's about to be marked done.

Context:
- Item: ${context.itemId || ''} — ${context.title || ''}
- Started: ${context.startedDate || 'unknown'}

Use read_item to see full body if needed, and run_git_log to see what was actually shipped.

Then call propose_note with a 1-3 sentence summary of what was done.
Focus on the resolution, not what the bug/improvement was about.

Style:
- Past tense, factual
- Mention the actual fix
- Don't describe the symptom, describe the fix`;
}
