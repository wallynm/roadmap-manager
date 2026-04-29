export function systemPrompt(context) {
  return `Generate a weekly changelog narrative for items completed in ${context.repoName || 'this repo'} since ${context.since || 'last week'}.

Group by theme (not by date). For each item:
- One-line summary of what shipped
- Optional: significance (if Urgent fix or milestone)

Use list_existing_items (status=done, since date) and read_item for each completed item.
Use run_git_log to ground in actual commits.

Output: markdown ready to paste into release notes via propose_item.`;
}
