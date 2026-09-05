import { validateReferences } from './reference-validation.js';
import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import addFormatsModule, { type FormatsPlugin } from 'ajv-formats';

import artifactSchema from '../schemas/artifacts.schema.json' with { type: 'json' };
import {
  type Artifact,
  type ArtifactKind,
  type ArtifactValidationIssue,
  type ArtifactValidationResult,
  SCHEMA_VERSION,
} from './artifacts.js';

const ajv = new Ajv2020({ allErrors: true, strict: true });
const addFormats = addFormatsModule as unknown as FormatsPlugin;
addFormats(ajv);
ajv.addSchema(artifactSchema);
const validateStructure = ajv.compile<Artifact>(artifactSchema);
const artifactValidators = Object.fromEntries(
  [
    'raw-capture',
    'website-ir',
    'inference',
    'figma-scene',
    'import-result',
    'qa-report',
  ].map((kind) => [
    kind,
    ajv.compile<Artifact>({
      $ref: `${artifactSchema.$id}#/$defs/${artifactDefinitionName(kind)}`,
    }),
  ]),
) as Record<ArtifactKind, ValidateFunction<Artifact>>;

export function validateArtifact(input: unknown): ArtifactValidationResult {
  const suppliedVersion = readProperty(input, 'schemaVersion');
  if (suppliedVersion !== undefined && suppliedVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      issues: [
        {
          code: 'SCHEMA_VALIDATION',
          path: '/schemaVersion',
          message: `must be equal to constant ${SCHEMA_VERSION}`,
        },
      ],
    };
  }

  const artifactKind = readArtifactKind(input);
  const validator =
    artifactKind === undefined
      ? validateStructure
      : artifactValidators[artifactKind];
  if (!validator(input)) {
    return {
      ok: false,
      issues: deduplicateSchemaIssues(validator.errors ?? []),
    };
  }

  const issues = validateReferences(input);
  return issues.length === 0
    ? { ok: true, value: input }
    : { ok: false, issues };
}

function readArtifactKind(input: unknown): ArtifactKind | undefined {
  const kind = readProperty(input, 'artifactKind');
  switch (kind) {
    case 'raw-capture':
    case 'website-ir':
    case 'inference':
    case 'figma-scene':
    case 'import-result':
    case 'qa-report':
      return kind;
    default:
      return undefined;
  }
}

function artifactDefinitionName(kind: string): string {
  return `${kind.replace(/-([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  )}Artifact`;
}

function readProperty(input: unknown, property: string): unknown {
  return typeof input === 'object' && input !== null
    ? Reflect.get(input, property)
    : undefined;
}

function deduplicateSchemaIssues(
  errors: ErrorObject[],
): ArtifactValidationIssue[] {
  const issues = errors.map(schemaIssue);
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

function schemaIssue(error: ErrorObject): ArtifactValidationIssue {
  return {
    code: 'SCHEMA_VALIDATION',
    path: error.instancePath || '/',
    message: error.message ?? 'Artifact does not match its schema',
  };
}
