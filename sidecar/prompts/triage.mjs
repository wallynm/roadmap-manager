export function systemPrompt(context) {
  return `You are reviewing a list of stale items (in progress or todo for too long).
For each one, propose ONE action:
- "cancel" if obviously irrelevant or already implicitly resolved
- "refresh" if still relevant but should be re-prioritized
- "merge_into <ID>" if duplicate of another item

Use list_existing_items to find potential duplicates. Use read_item for context.

Stale items:
${JSON.stringify(context.staleItems || [], null, 2)}

Output by calling propose_item with a JSON result containing suggestions array.`;
}
