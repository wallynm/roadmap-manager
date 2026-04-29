import Anthropic from '@anthropic-ai/sdk';
import { readMessages, send, dispatchMessage } from './ipc.mjs';
import { getTools, executeTool } from './tools.mjs';
import { systemPrompt as createPrompt } from './prompts/create.mjs';
import { systemPrompt as completePrompt } from './prompts/complete.mjs';
import { systemPrompt as triagePrompt } from './prompts/triage.mjs';
import { systemPrompt as digestPrompt } from './prompts/digest.mjs';

const messageReader = readMessages();

async function readFirstMessage() {
  const { value } = await messageReader.next();
  return value;
}

async function main() {
  const init = await readFirstMessage();
  if (!init || init.kind !== 'init') {
    send({ kind: 'error', message: 'Expected init message' });
    process.exit(1);
  }

  const { trigger, model, context } = init;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    send({ kind: 'error', message: 'ANTHROPIC_API_KEY not set' });
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  let sysPrompt;
  switch (trigger) {
    case 'create': sysPrompt = createPrompt(context); break;
    case 'complete': sysPrompt = completePrompt(context); break;
    case 'triage': sysPrompt = triagePrompt(context); break;
    case 'digest': sysPrompt = digestPrompt(context); break;
    default:
      send({ kind: 'error', message: `Unknown trigger: ${trigger}` });
      process.exit(1);
  }

  const tools = getTools(context);
  const messages = [{ role: 'user', content: context.title || context.description || 'Start' }];

  try {
    let finished = false;
    while (!finished) {
      const response = await client.messages.create({
        model: model || 'claude-sonnet-4-6-20250514',
        max_tokens: 4096,
        system: sysPrompt,
        tools,
        messages,
      });

      for (const block of response.content) {
        if (block.type === 'text') {
          send({ kind: 'delta', text: block.text });
          messages.push({ role: 'assistant', content: response.content });
        }
        if (block.type === 'tool_use') {
          messages.push({ role: 'assistant', content: response.content });

          const toolResult = await executeTool(block.name, block.input);

          if (block.name === 'propose_item' || block.name === 'propose_note') {
            finished = true;
            break;
          }

          if (block.name === 'ask_user') {
            messages.push({
              role: 'user',
              content: [{ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(toolResult) }]
            });
            const userAnswer = toolResult.answer;
            messages.push({ role: 'user', content: userAnswer });
          } else {
            messages.push({
              role: 'user',
              content: [{ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(toolResult) }]
            });
          }
          break;
        }
      }

      if (response.stop_reason === 'end_turn' && !finished) {
        finished = true;
        send({ kind: 'finished', result: { text: response.content.map(b => b.type === 'text' ? b.text : '').join('') }, model: model || 'claude-sonnet-4-6', tokensIn: response.usage?.input_tokens, tokensOut: response.usage?.output_tokens, costUsd: 0 });
      }
    }
  } catch (error) {
    send({ kind: 'error', message: error.message || 'Unknown error' });
    process.exit(1);
  }
}

(async () => {
  for await (const msg of readMessages()) {
    if (!dispatchMessage(msg)) {
      if (msg.kind === 'abort') {
        process.exit(0);
      }
    }
  }
})();

main().catch((err) => {
  send({ kind: 'error', message: err.message });
  process.exit(1);
});
