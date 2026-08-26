import videoChapters from '../../../../public/training/video-chapters.json'

const chapters = videoChapters as Record<string, number[]>

export function getVideoChapters(moduleId: string): number[] | undefined {
  return chapters[moduleId]
}
