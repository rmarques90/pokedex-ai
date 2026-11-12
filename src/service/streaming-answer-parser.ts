import { JsonOutputParser } from '@langchain/core/output_parsers';

export type AnswerTextUpdate =
  | { type: 'delta'; text: string }
  | { type: 'replace'; text: string };

export async function parseStreamingAnswer(
  chunks: AsyncIterable<string>,
  onUpdate: (update: AnswerTextUpdate) => void,
): Promise<unknown> {
  const parser = new JsonOutputParser<Record<string, unknown>>();
  let raw = '';
  let emittedAnswer = '';

  for await (const chunk of chunks) {
    raw += chunk;
    const partial = await parser.parsePartialResult([{ text: raw }]);
    const partialAnswer = partial?.answer;
    if (typeof partialAnswer !== 'string' || partialAnswer === emittedAnswer) continue;
    let answer: string = partialAnswer;

    const pendingUnicodeEscapeLength = getPendingUnicodeEscapeLength(raw);
    if (pendingUnicodeEscapeLength > 0) {
      const unfinishedValue = raw.slice(-pendingUnicodeEscapeLength);
      if (answer.endsWith(unfinishedValue)) answer = answer.slice(0, -unfinishedValue.length);
    }
    if (answer === emittedAnswer) continue;

    if (answer.startsWith(emittedAnswer)) {
      const text = answer.slice(emittedAnswer.length);
      if (text.length > 0) onUpdate({ type: 'delta', text });
    } else {
      onUpdate({ type: 'replace', text: answer });
    }
    emittedAnswer = answer;
  }

  return parser.parse(raw);
}

function getPendingUnicodeEscapeLength(raw: string): number {
  const answerStart = /"answer"\s*:\s*"/.exec(raw);
  if (!answerStart) return 0;

  let escaped = false;
  for (let index = answerStart.index + answerStart[0].length; index < raw.length; index += 1) {
    const character = raw[index];
    if (escaped) {
      if (character === 'u') {
        const remaining = raw.slice(index + 1);
        if (remaining.length < 4 && /^[0-9a-f]*$/i.test(remaining)) return remaining.length + 1;
      }
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"') return 0;
  }
  return 0;
}
