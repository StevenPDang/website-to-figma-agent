import type { Artifact, ArtifactValidationIssue } from './artifacts.js';
export function validateReferences(
  artifact: Artifact,
): ArtifactValidationIssue[] {
  switch (artifact.artifactKind) {
    case 'raw-capture':
      return validateRawCapture(artifact);
    case 'website-ir':
      return validateWebsiteIr(artifact);
    case 'inference':
      return validateInference(artifact);
    case 'figma-scene':
      return validateFigmaScene(artifact);
    case 'import-result':
      return validateImportResult(artifact);
    case 'qa-report':
      return validateQaReport(artifact);
  }
}

function validateRawCapture(
  artifact: Extract<Artifact, { artifactKind: 'raw-capture' }>,
): ArtifactValidationIssue[] {
  const issues: ArtifactValidationIssue[] = [];
  const ids = collectUniqueIds(
    artifact.payload.nodes.map((node) => node.sourceNodeId),
    '/payload/nodes',
    'sourceNodeId',
    'source node',
    issues,
  );
  requireReference(
    artifact.payload.rootNodeId,
    ids,
    '/payload/rootNodeId',
    `Root node ${artifact.payload.rootNodeId} does not exist`,
    issues,
  );
  artifact.payload.nodes.forEach((node, index) => {
    if (node.parentSourceNodeId !== null) {
      requireReference(
        node.parentSourceNodeId,
        ids,
        `/payload/nodes/${index}/parentSourceNodeId`,
        `Parent source node ${node.parentSourceNodeId} does not exist`,
        issues,
      );
    }
    node.childSourceNodeIds.forEach((id, childIndex) => {
      requireReference(
        id,
        ids,
        `/payload/nodes/${index}/childSourceNodeIds/${childIndex}`,
        `Child source node ${id} does not exist`,
        issues,
      );
    });
  });
  validateAssetSources(artifact.payload.assets, ids, issues);
  return issues;
}

function validateWebsiteIr(
  artifact: Extract<Artifact, { artifactKind: 'website-ir' }>,
): ArtifactValidationIssue[] {
  const issues: ArtifactValidationIssue[] = [];
  const sourceIds = collectUniqueIds(
    artifact.payload.sourceNodeIds,
    '/payload/sourceNodeIds',
    null,
    'source node',
    issues,
  );
  const nodeIds = collectUniqueIds(
    artifact.payload.nodes.map((node) => node.nodeId),
    '/payload/nodes',
    'nodeId',
    'Website IR node',
    issues,
  );
  requireReference(
    artifact.payload.rootNodeId,
    nodeIds,
    '/payload/rootNodeId',
    `Root node ${artifact.payload.rootNodeId} does not exist`,
    issues,
  );
  artifact.payload.nodes.forEach((node, index) => {
    requireReference(
      node.sourceNodeId,
      sourceIds,
      `/payload/nodes/${index}/sourceNodeId`,
      `Source node ${node.sourceNodeId} does not exist`,
      issues,
    );
    validateTreeReferences(
      node.parentNodeId,
      node.childNodeIds,
      nodeIds,
      `/payload/nodes/${index}`,
      issues,
    );
  });
  validateAssetSources(artifact.payload.assets, sourceIds, issues);
  return issues;
}

function validateInference(
  artifact: Extract<Artifact, { artifactKind: 'inference' }>,
): ArtifactValidationIssue[] {
  const issues: ArtifactValidationIssue[] = [];
  const sourceIds = collectUniqueIds(
    artifact.payload.sourceNodeIds,
    '/payload/sourceNodeIds',
    null,
    'source node',
    issues,
  );
  validateInferenceDecisions(
    artifact.payload.decisions,
    sourceIds,
    '/payload/decisions',
    issues,
  );
  if (artifact.schemaVersion === '1.1.0') {
    validateInferenceDecisions(
      artifact.payload.deterministicDecisions,
      sourceIds,
      '/payload/deterministicDecisions',
      issues,
    );
    validateInferenceDecisions(
      artifact.payload.proposedDecisions,
      sourceIds,
      '/payload/proposedDecisions',
      issues,
    );
    const knownDecisionIds = new Set(
      [
        ...artifact.payload.decisions,
        ...artifact.payload.deterministicDecisions,
        ...artifact.payload.proposedDecisions,
      ].map((decision) => decision.decisionId),
    );
    collectUniqueIds(
      artifact.payload.rejectedDecisions.map((decision) => decision.decisionId),
      '/payload/rejectedDecisions',
      'decisionId',
      'rejected decision',
      issues,
    ).forEach((id) => knownDecisionIds.add(id));
    artifact.payload.mergeOutcomes.forEach((outcome, index) => {
      requireReference(
        outcome.decisionId,
        knownDecisionIds,
        `/payload/mergeOutcomes/${index}/decisionId`,
        `Decision ${outcome.decisionId} does not exist`,
        issues,
      );
      if (outcome.supersedesDecisionId !== undefined) {
        requireReference(
          outcome.supersedesDecisionId,
          knownDecisionIds,
          `/payload/mergeOutcomes/${index}/supersedesDecisionId`,
          `Superseded decision ${outcome.supersedesDecisionId} does not exist`,
          issues,
        );
      }
    });
  }
  return issues;
}

function validateInferenceDecisions(
  decisions: Extract<
    Artifact,
    { artifactKind: 'inference' }
  >['payload']['decisions'],
  sourceIds: ReadonlySet<string>,
  basePath: string,
  issues: ArtifactValidationIssue[],
): void {
  collectUniqueIds(
    decisions.map((decision) => decision.decisionId),
    basePath,
    'decisionId',
    'decision',
    issues,
  );
  decisions.forEach((decision, index) => {
    decision.sourceNodeIds.forEach((id, sourceIndex) => {
      requireReference(
        id,
        sourceIds,
        `${basePath}/${index}/sourceNodeIds/${sourceIndex}`,
        `Source node ${id} does not exist`,
        issues,
      );
    });
    if (!('payload' in decision)) return;
    const references = embeddedDecisionReferences(decision);
    references.forEach(({ id, path }) => {
      requireReference(
        id,
        sourceIds,
        `${basePath}/${index}/payload/${path}`,
        `Source node ${id} does not exist`,
        issues,
      );
    });
  });
}

function embeddedDecisionReferences(
  decision: Extract<
    Extract<
      Artifact,
      { artifactKind: 'inference' }
    >['payload']['decisions'][number],
    { payload: object }
  >,
): Array<{ id: string; path: string }> {
  if (decision.kind === 'component') {
    return [
      ...decision.payload.instanceSourceNodeIds.map((id, index) => ({
        id,
        path: `instanceSourceNodeIds/${index}`,
      })),
      ...decision.payload.overrideSourceNodeIds.map((id, index) => ({
        id,
        path: `overrideSourceNodeIds/${index}`,
      })),
    ];
  }
  if (decision.kind === 'carousel') {
    return [
      {
        id: decision.payload.viewportSourceNodeId,
        path: 'viewportSourceNodeId',
      },
      ...decision.payload.panelSourceNodeIds.map((id, index) => ({
        id,
        path: `panelSourceNodeIds/${index}`,
      })),
      ...decision.payload.cloneSourceNodeIds.map((id, index) => ({
        id,
        path: `cloneSourceNodeIds/${index}`,
      })),
    ];
  }
  return [];
}

function validateFigmaScene(
  artifact: Extract<Artifact, { artifactKind: 'figma-scene' }>,
): ArtifactValidationIssue[] {
  const issues: ArtifactValidationIssue[] = [];
  const sourceIds = collectUniqueIds(
    artifact.payload.sourceNodeIds,
    '/payload/sourceNodeIds',
    null,
    'source node',
    issues,
  );
  const sceneIds = collectUniqueIds(
    artifact.payload.nodes.map((node) => node.sceneNodeId),
    '/payload/nodes',
    'sceneNodeId',
    'scene node',
    issues,
  );
  artifact.payload.rootNodeIds.forEach((id, index) => {
    requireReference(
      id,
      sceneIds,
      `/payload/rootNodeIds/${index}`,
      `Root scene node ${id} does not exist`,
      issues,
    );
  });
  artifact.payload.nodes.forEach((node, index) => {
    requireReference(
      node.sourceNodeId,
      sourceIds,
      `/payload/nodes/${index}/sourceNodeId`,
      `Source node ${node.sourceNodeId} does not exist`,
      issues,
    );
    validateTreeReferences(
      node.parentNodeId,
      node.childNodeIds,
      sceneIds,
      `/payload/nodes/${index}`,
      issues,
    );
  });
  validateAssetSources(artifact.payload.assets, sourceIds, issues);
  return issues;
}

function validateImportResult(
  artifact: Extract<Artifact, { artifactKind: 'import-result' }>,
): ArtifactValidationIssue[] {
  const issues: ArtifactValidationIssue[] = [];
  const sceneIds = collectUniqueIds(
    artifact.payload.sceneNodeIds,
    '/payload/sceneNodeIds',
    null,
    'scene node',
    issues,
  );
  artifact.payload.nodes.forEach((node, index) => {
    requireReference(
      node.sceneNodeId,
      sceneIds,
      `/payload/nodes/${index}/sceneNodeId`,
      `Scene node ${node.sceneNodeId} does not exist`,
      issues,
    );
  });
  return issues;
}

function validateQaReport(
  artifact: Extract<Artifact, { artifactKind: 'qa-report' }>,
): ArtifactValidationIssue[] {
  const issues: ArtifactValidationIssue[] = [];
  const sourceIds = collectUniqueIds(
    artifact.payload.sourceNodeIds,
    '/payload/sourceNodeIds',
    null,
    'source node',
    issues,
  );
  artifact.payload.discrepancyRegions.forEach((region, index) => {
    if (region.sourceNodeId !== undefined) {
      requireReference(
        region.sourceNodeId,
        sourceIds,
        `/payload/discrepancyRegions/${index}/sourceNodeId`,
        `Source node ${region.sourceNodeId} does not exist`,
        issues,
      );
    }
  });
  return issues;
}

function collectUniqueIds(
  values: string[],
  basePath: string,
  field: string | null,
  label: string,
  issues: ArtifactValidationIssue[],
): Set<string> {
  const ids = new Set<string>();
  values.forEach((id, index) => {
    if (ids.has(id)) {
      const suffix = field === null ? '' : `/${field}`;
      issues.push({
        code: 'DUPLICATE_ID',
        path: `${basePath}/${index}${suffix}`,
        message: `Duplicate ${label} ID ${id}`,
      });
    }
    ids.add(id);
  });
  return ids;
}

function requireReference(
  id: string,
  ids: ReadonlySet<string>,
  path: string,
  message: string,
  issues: ArtifactValidationIssue[],
): void {
  if (!ids.has(id)) {
    issues.push({ code: 'DANGLING_REFERENCE', path, message });
  }
}

function validateTreeReferences(
  parentId: string | null,
  childIds: string[],
  ids: ReadonlySet<string>,
  basePath: string,
  issues: ArtifactValidationIssue[],
): void {
  if (parentId !== null) {
    requireReference(
      parentId,
      ids,
      `${basePath}/parentNodeId`,
      `Parent node ${parentId} does not exist`,
      issues,
    );
  }
  childIds.forEach((id, index) => {
    requireReference(
      id,
      ids,
      `${basePath}/childNodeIds/${index}`,
      `Child node ${id} does not exist`,
      issues,
    );
  });
}

function validateAssetSources(
  assets: { sourceNodeId: string }[],
  sourceIds: ReadonlySet<string>,
  issues: ArtifactValidationIssue[],
): void {
  assets.forEach((asset, index) => {
    requireReference(
      asset.sourceNodeId,
      sourceIds,
      `/payload/assets/${index}/sourceNodeId`,
      `Asset source node ${asset.sourceNodeId} does not exist`,
      issues,
    );
  });
}
