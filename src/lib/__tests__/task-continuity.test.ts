import { describe, expect, it } from 'vitest'
import { resumePathForTask } from '../task-continuity'

describe('resumePathForTask', () => {
  it('resumes normal bearings on recommendation results', () => {
    expect(resumePathForTask({
      id: 'task-1',
      taskType: 'research',
      hasPipeline: false,
    })).toBe('/recommend/task-1/results')
  })

  it('resumes single-stage embedding bearings on embedding results', () => {
    expect(resumePathForTask({
      id: 'task-2',
      taskType: 'embedding',
      hasPipeline: false,
    })).toBe('/embedding/task-2/results')
  })

  it('keeps embedding-led pipelines on recommendation results', () => {
    expect(resumePathForTask({
      id: 'task-3',
      taskType: 'embedding',
      hasPipeline: true,
    })).toBe('/recommend/task-3/results')
  })
})
