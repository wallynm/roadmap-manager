import { send, waitForMessage } from './ipc.mjs';

let callCounter = 0;

async function callTool(name, args) {
  const id = `call_${++callCounter}`;
  send({ kind: 'tool_call', id, name, args });
  const result = await waitForMessage('tool_result');
  return result.result;
}

export function getTools(context) {
  return [
    {
      name: 'read_repo_files',
      description: 'Read files matching a glob pattern in the repo.',
      input_schema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern relative to repo root' },
          maxFiles: { type: 'number', description: 'Max files to return (default 10)' }
        },
        required: ['pattern']
      }
    },
    {
      name: 'list_existing_items',
      description: 'List existing work items in this repo.',
      input_schema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Filter by type' },
          status: { type: 'string', description: 'Filter by status' },
          limit: { type: 'number', description: 'Max items (default 50)' }
        }
      }
    },
    {
      name: 'run_git_log',
      description: 'Get recent commits.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path filter' },
          limit: { type: 'number', description: 'Max commits (default 10)' },
          sinceDate: { type: 'string', description: 'YYYY-MM-DD' }
        }
      }
    },
    {
      name: 'read_item',
      description: 'Read full item by external_id.',
      input_schema: {
        type: 'object',
        properties: {
          externalId: { type: 'string' }
        },
        required: ['externalId']
      }
    },
    {
      name: 'ask_user',
      description: 'Ask the user a clarifying question. Use sparingly (max 2 per run).',
      input_schema: {
        type: 'object',
        properties: {
          question: { type: 'string' }
        },
        required: ['question']
      }
    },
    {
      name: 'propose_item',
      description: 'Submit final item proposal for user review.',
      input_schema: {
        type: 'object',
        properties: {
          frontmatter: { type: 'object' },
          body: { type: 'string' }
        },
        required: ['frontmatter', 'body']
      }
    },
    {
      name: 'propose_note',
      description: 'Submit a resolution note for a completed item.',
      input_schema: {
        type: 'object',
        properties: {
          note: { type: 'string' }
        },
        required: ['note']
      }
    }
  ];
}

export async function executeTool(name, args) {
  if (name === 'ask_user') {
    send({ kind: 'question', text: args.question });
    const response = await waitForMessage('user_response');
    return { answer: response.text };
  }

  if (name === 'propose_item') {
    send({ kind: 'finished', result: { frontmatter: args.frontmatter, body: args.body }, model: '', tokensIn: 0, tokensOut: 0, costUsd: 0 });
    return { ok: true };
  }

  if (name === 'propose_note') {
    send({ kind: 'finished', result: { note: args.note }, model: '', tokensIn: 0, tokensOut: 0, costUsd: 0 });
    return { ok: true };
  }

  return await callTool(name, args);
}
