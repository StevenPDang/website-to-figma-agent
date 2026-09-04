import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';

import protocolSchema from '../schemas/protocol.schema.json' with { type: 'json' };

export const PROTOCOL_VERSION = '1.0.0' as const;

interface ProtocolMessageBase {
  protocolVersion: typeof PROTOCOL_VERSION;
  runId: string;
}

export interface HelloMessage extends ProtocolMessageBase {
  type: 'hello';
  authToken: string;
}

export interface HelloAckMessage extends ProtocolMessageBase {
  type: 'hello-ack';
  accepted: boolean;
  schemaVersion: '1.0.0';
  capabilities: string[];
}

export interface SceneBeginMessage extends ProtocolMessageBase {
  type: 'scene-begin';
  sceneId: string;
  totalOperations: number;
}

export interface CreateNodeOperation {
  type: 'create-node';
  operationId: string;
  sceneNodeId: string;
  nodeKind: string;
}

export interface SetPropertyOperation {
  type: 'set-property';
  operationId: string;
  sceneNodeId: string;
  property: string;
  value: unknown;
}

export type SceneOperation = CreateNodeOperation | SetPropertyOperation;

export interface SceneChunkMessage extends ProtocolMessageBase {
  type: 'scene-chunk';
  sceneId: string;
  chunkIndex: number;
  operations: SceneOperation[];
}

export interface OperationAckMessage extends ProtocolMessageBase {
  type: 'operation-ack';
  operationId: string;
  status: 'applied' | 'already-applied';
}

export interface ProgressMessage extends ProtocolMessageBase {
  type: 'progress';
  completedOperations: number;
  totalOperations: number;
}

export interface SceneCompleteMessage extends ProtocolMessageBase {
  type: 'scene-complete';
  sceneId: string;
}

export interface ImportCompleteMessage extends ProtocolMessageBase {
  type: 'import-complete';
  status: 'success' | 'partial' | 'failed';
}

export interface ProtocolErrorMessage extends ProtocolMessageBase {
  type: 'error';
  code: string;
  message: string;
  retryable: boolean;
}

export type ProtocolMessage =
  | HelloMessage
  | HelloAckMessage
  | SceneBeginMessage
  | SceneChunkMessage
  | OperationAckMessage
  | ProgressMessage
  | SceneCompleteMessage
  | ImportCompleteMessage
  | ProtocolErrorMessage;

export interface ProtocolValidationIssue {
  code: 'SCHEMA_VALIDATION' | 'PROTOCOL_VERSION_MISMATCH';
  path: string;
  message: string;
}

export type ProtocolValidationResult =
  | { ok: true; value: ProtocolMessage }
  | { ok: false; issues: ProtocolValidationIssue[] };

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addSchema(protocolSchema);
const validateStructure = ajv.compile<ProtocolMessage>(protocolSchema);
const protocolValidators: Record<
  ProtocolMessage['type'],
  ValidateFunction<ProtocolMessage>
> = {
  hello: compileMessage('hello'),
  'hello-ack': compileMessage('helloAck'),
  'scene-begin': compileMessage('sceneBegin'),
  'scene-chunk': compileMessage('sceneChunk'),
  'operation-ack': compileMessage('operationAck'),
  progress: compileMessage('progress'),
  'scene-complete': compileMessage('sceneComplete'),
  'import-complete': compileMessage('importComplete'),
  error: compileMessage('error'),
};

export function validateProtocolMessage(
  input: unknown,
): ProtocolValidationResult {
  const suppliedVersion = readProperty(input, 'protocolVersion');
  if (suppliedVersion !== undefined && suppliedVersion !== PROTOCOL_VERSION) {
    return {
      ok: false,
      issues: [
        {
          code: 'PROTOCOL_VERSION_MISMATCH',
          path: '/protocolVersion',
          message: `Unsupported protocol version ${describeValue(suppliedVersion)}`,
        },
      ],
    };
  }

  const messageType = readMessageType(input);
  const validator =
    messageType === undefined
      ? validateStructure
      : protocolValidators[messageType];
  if (!validator(input)) {
    const issues = (validator.errors ?? []).map((error) => ({
      code: 'SCHEMA_VALIDATION' as const,
      path: error.instancePath || '/',
      message: error.message ?? 'Protocol message does not match its schema',
    }));
    return { ok: false, issues: deduplicateIssues(issues) };
  }

  return { ok: true, value: input };
}

function compileMessage(
  definitionName: string,
): ValidateFunction<ProtocolMessage> {
  return ajv.compile<ProtocolMessage>({
    $ref: `${protocolSchema.$id}#/$defs/${definitionName}`,
  });
}

function readMessageType(input: unknown): ProtocolMessage['type'] | undefined {
  const type = readProperty(input, 'type');
  switch (type) {
    case 'hello':
    case 'hello-ack':
    case 'scene-begin':
    case 'scene-chunk':
    case 'operation-ack':
    case 'progress':
    case 'scene-complete':
    case 'import-complete':
    case 'error':
      return type;
    default:
      return undefined;
  }
}

function readProperty(input: unknown, property: string): unknown {
  return typeof input === 'object' && input !== null
    ? Reflect.get(input, property)
    : undefined;
}

function describeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  return typeof value;
}

function deduplicateIssues(
  issues: ProtocolValidationIssue[],
): ProtocolValidationIssue[] {
  return issues.filter(
    (issue, index) =>
      issues.findIndex(
        (candidate) =>
          candidate.code === issue.code &&
          candidate.path === issue.path &&
          candidate.message === issue.message,
      ) === index,
  );
}
