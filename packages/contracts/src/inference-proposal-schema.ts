const stableId = {
  type: 'string',
  minLength: 1,
  maxLength: 512,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$',
} as const;

const baseProperties = {
  decisionId: { $ref: '#/$defs/stableId' },
  sourceNodeIds: {
    type: 'array',
    minItems: 1,
    items: { $ref: '#/$defs/stableId' },
  },
  confidence: { type: 'number', minimum: 0, maximum: 1 },
  evidence: {
    type: 'array',
    minItems: 1,
    items: { type: 'string', minLength: 1, maxLength: 4096 },
  },
  fallback: { enum: ['geometry', 'independent-nodes', 'unsupported'] },
  origin: { const: 'agent' },
} as const;

const baseRequired = [
  'decisionId',
  'sourceNodeIds',
  'kind',
  'confidence',
  'evidence',
  'fallback',
  'origin',
  'payload',
] as const;

function decision(
  kind: string,
  payloadProperties: Record<string, unknown>,
  payloadRequired: string[],
): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      ...baseProperties,
      kind: { const: kind },
      payload: {
        type: 'object',
        additionalProperties: false,
        properties: payloadProperties,
        required: payloadRequired,
      },
    },
    required: [...baseRequired],
  };
}

export function createAgentInferenceProposalSchema(): Record<string, unknown> {
  const number = { type: 'number' };
  const nonNegative = { type: 'number', minimum: 0 };
  const sourceIds = {
    type: 'array',
    items: { $ref: '#/$defs/stableId' },
  };
  const decisions = [
    decision(
      'section',
      {
        role: {
          enum: ['navigation', 'hero', 'content', 'gallery', 'footer', 'other'],
        },
      },
      ['role'],
    ),
    decision(
      'layout',
      {
        mode: {
          enum: [
            'horizontal',
            'vertical',
            'wrap',
            'grid',
            'freeform',
            'overlay',
          ],
        },
        gap: nonNegative,
        padding: {
          type: 'object',
          additionalProperties: false,
          properties: {
            top: nonNegative,
            right: nonNegative,
            bottom: nonNegative,
            left: nonNegative,
          },
          required: ['top', 'right', 'bottom', 'left'],
        },
        align: { enum: ['start', 'center', 'end', 'stretch'] },
        justify: { enum: ['start', 'center', 'end', 'space-between'] },
      },
      ['mode', 'gap', 'padding', 'align', 'justify'],
    ),
    decision(
      'component',
      {
        name: { type: 'string', minLength: 1, maxLength: 512 },
        instanceSourceNodeIds: sourceIds,
        overrideSourceNodeIds: sourceIds,
      },
      ['name', 'instanceSourceNodeIds', 'overrideSourceNodeIds'],
    ),
    decision(
      'carousel',
      {
        viewportSourceNodeId: { $ref: '#/$defs/stableId' },
        panelSourceNodeIds: { ...sourceIds, minItems: 1 },
        cloneSourceNodeIds: sourceIds,
        clipContent: { type: 'boolean' },
      },
      [
        'viewportSourceNodeId',
        'panelSourceNodeIds',
        'cloneSourceNodeIds',
        'clipContent',
      ],
    ),
    decision(
      'typography',
      {
        requestedFamily: { type: 'string', minLength: 1, maxLength: 512 },
        substituteFamily: { type: 'string', minLength: 1, maxLength: 512 },
        weight: { type: 'number', minimum: 1, maximum: 1000 },
        style: { enum: ['normal', 'italic'] },
        lineHeight: { type: 'number', exclusiveMinimum: 0 },
        letterSpacing: number,
        preserveLineCount: { type: 'boolean' },
      },
      [
        'requestedFamily',
        'substituteFamily',
        'weight',
        'style',
        'lineHeight',
        'letterSpacing',
        'preserveLineCount',
      ],
    ),
    decision(
      'semantic-name',
      { name: { type: 'string', minLength: 1, maxLength: 512 } },
      ['name'],
    ),
    decision(
      'responsive',
      {
        horizontal: { enum: ['fixed', 'fill', 'hug', 'left-right'] },
        vertical: { enum: ['fixed', 'fill', 'hug', 'top-bottom'] },
        minWidth: nonNegative,
        maxWidth: nonNegative,
      },
      ['horizontal', 'vertical', 'minWidth', 'maxWidth'],
    ),
    decision(
      'fallback',
      {
        representation: { enum: ['editable', 'raster'] },
        reason: { type: 'string', minLength: 1, maxLength: 4096 },
      },
      ['representation', 'reason'],
    ),
    decision(
      'qa-priority',
      {
        category: {
          enum: [
            'missing-content',
            'overlap',
            'clipping',
            'ordering',
            'geometry',
            'rendering-noise',
          ],
        },
        priority: { enum: ['high', 'medium', 'low'] },
      },
      ['category', 'priority'],
    ),
    decision(
      'token',
      {
        tokenType: {
          enum: ['color', 'typography', 'spacing', 'radius', 'effect'],
        },
        name: { type: 'string', minLength: 1, maxLength: 512 },
        value: { type: 'string', minLength: 1, maxLength: 4096 },
      },
      ['tokenType', 'name', 'value'],
    ),
  ];
  return addScalarTypes({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    properties: {
      decisions: { type: 'array', items: { anyOf: decisions } },
    },
    required: ['decisions'],
    $defs: { stableId },
  });
}

function addScalarTypes(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Proposal schema root must be an object.');
  }
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (Array.isArray(nested)) {
      const items: unknown[] = nested;
      result[key] = items.map((item): unknown =>
        typeof item === 'object' && item !== null ? addScalarTypes(item) : item,
      );
    } else {
      result[key] =
        typeof nested === 'object' && nested !== null
          ? addScalarTypes(nested)
          : nested;
    }
  }
  if (result.type === undefined && typeof result.const === 'string') {
    result.type = 'string';
  }
  if (
    result.type === undefined &&
    Array.isArray(result.enum) &&
    result.enum.every((item) => typeof item === 'string')
  ) {
    result.type = 'string';
  }
  return result;
}
