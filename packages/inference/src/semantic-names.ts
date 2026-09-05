import type {
  AgenticInferenceDecision,
  WebsiteIrNode,
} from '@website-to-figma/contracts';

const UNSAFE_NAME =
  /(?:ignore\s+(?:all\s+)?instructions?|bearer\s+|cookie\s*=|token\s*=|system\s+prompt|model\s+(?:says?|output))/i;

export function resolveSemanticName(
  node: WebsiteIrNode,
  decisions: AgenticInferenceDecision[],
): { name: string; decisionId?: string } {
  const named = decisions.find(
    (decision) =>
      decision.kind === 'semantic-name' &&
      decision.sourceNodeIds[0] === node.sourceNodeId,
  );
  if (named?.kind === 'semantic-name') {
    const name = cleanName(named.payload.name);
    if (name.length > 0 && !UNSAFE_NAME.test(name)) {
      return { name, decisionId: named.decisionId };
    }
  }
  const section = decisions.find(
    (decision) =>
      decision.kind === 'section' &&
      decision.sourceNodeIds[0] === node.sourceNodeId,
  );
  if (section?.kind === 'section' && section.payload.role !== 'other') {
    return {
      name: titleCase(section.payload.role),
      decisionId: section.decisionId,
    };
  }
  const text = cleanName(node.text ?? '');
  if (text.length > 0 && !UNSAFE_NAME.test(text))
    return { name: text.slice(0, 40) };
  return { name: `${titleCase(node.kind)} ${node.nodeId.replace(/^ir:/, '')}` };
}

function cleanName(value: string): string {
  return Array.from(value)
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127 ? ' ' : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value: string): string {
  return value
    .split(/[-_]/)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
