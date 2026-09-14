export interface ContinuityTaskRef {
  id: string
  taskType: string
  hasPipeline: boolean
}

/**
 * Resume completed bearings on the surface that can faithfully render them.
 * Single-stage embeddings have a dedicated results page; embedding-led
 * pipelines stay on the normal recommendation results page.
 */
export function resumePathForTask(task: ContinuityTaskRef): string {
  if (task.taskType === 'embedding' && !task.hasPipeline) {
    return `/embedding/${task.id}/results`
  }
  return `/recommend/${task.id}/results`
}
