import type { ProtocolMessage } from './protocol.js';

export type ProtocolState =
  'awaiting-auth' | 'ready' | 'importing' | 'completed' | 'failed';

export interface ProtocolStateIssue {
  code: 'INVALID_STATE_TRANSITION';
  message: string;
}

export type ProtocolTransitionResult =
  | { state: Exclude<ProtocolState, 'failed'>; sceneId?: string }
  | { state: 'failed'; issue: ProtocolStateIssue };

export function transitionProtocolState(
  state: ProtocolState,
  message: ProtocolMessage,
): ProtocolTransitionResult {
  if (state === 'awaiting-auth' && message.type === 'hello') {
    return { state: 'ready' };
  }

  if (state === 'ready' && message.type === 'hello-ack') {
    return message.accepted
      ? { state: 'ready' }
      : invalidTransition(state, message.type);
  }

  if (state === 'ready' && message.type === 'scene-begin') {
    return { state: 'importing', sceneId: message.sceneId };
  }

  if (state === 'importing' && message.type === 'scene-complete') {
    return { state: 'completed' };
  }

  if (state === 'importing' && message.type === 'import-complete') {
    return message.status === 'failed'
      ? invalidTransition(state, message.type)
      : { state: 'completed' };
  }

  if (
    (state === 'ready' || state === 'importing') &&
    (message.type === 'progress' ||
      message.type === 'operation-ack' ||
      message.type === 'scene-chunk')
  ) {
    return { state };
  }

  return invalidTransition(state, message.type);
}

function invalidTransition(
  state: ProtocolState,
  messageType: ProtocolMessage['type'],
): { state: 'failed'; issue: ProtocolStateIssue } {
  return {
    state: 'failed',
    issue: {
      code: 'INVALID_STATE_TRANSITION',
      message: `${messageType} is not valid while ${state}`,
    },
  };
}
