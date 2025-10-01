
type StoryNode = {
  text: string
  image?: string
  audio?: string
  choices?: { text: string, next: string }[]
}

type StoryData = {
  [pageId: string]: StoryNode
}

export async function loadStory(): Promise<StoryData> {
  const res = await fetch('/global.json')
  return res.json()
}
