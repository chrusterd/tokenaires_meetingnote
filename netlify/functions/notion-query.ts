import type { Config } from '@netlify/functions'
import { notionFetch } from './_lib/notion'

type PropertyReference = {
  id?: string
}

type NotionPage = {
  id?: string
  properties?: Record<string, PropertyReference>
}

type NotionQueryResult = {
  results?: NotionPage[]
}

type NotionPropertyResult = {
  results?: NotionPropertyResult[]
  title?: Array<{ plain_text?: string }>
  multi_select?: Array<{ name?: string }>
  date?: { start?: string | null } | null
  checkbox?: boolean
}

type DashboardItem = {
  id: string
  할일: string
  담당자: string[]
  기한: string | null
  완료: boolean
}

const propertyItems = (value: NotionPropertyResult): NotionPropertyResult[] => value.results ?? [value]

const propertyId = (page: NotionPage, name: string) => {
  const id = page.properties?.[name]?.id
  if (!id) throw new Error(`Notion 응답에 '${name}' 속성 ID가 없습니다`)
  return id
}

async function readProperty(page: NotionPage, name: string) {
  if (!page.id) throw new Error('Notion 응답에 페이지 ID가 없습니다')
  const id = encodeURIComponent(propertyId(page, name))
  return await notionFetch(`/pages/${page.id}/properties/${id}`) as NotionPropertyResult
}

async function dashboardItemFromPage(page: NotionPage): Promise<DashboardItem> {
  if (!page.id) throw new Error('Notion 응답에 페이지 ID가 없습니다')

  // API version 2022-06-28 returns only property IDs from a database query.
  // Retrieve each property item so the dashboard gets real values, not IDs.
  const [titleValue, assigneesValue, dueDateValue, completedValue] = await Promise.all([
    readProperty(page, '할 일'),
    readProperty(page, '담당자'),
    readProperty(page, '기한'),
    readProperty(page, '완료'),
  ])
  const title = propertyItems(titleValue)
    .flatMap((item) => item.title ?? [])
    .map((item) => item.plain_text ?? '')
    .join('')
  const assignees = propertyItems(assigneesValue)
    .flatMap((item) => item.multi_select ?? [])
    .map((item) => item.name)
    .filter((name): name is string => Boolean(name))
  const dueDate = propertyItems(dueDateValue).find((item) => item.date !== undefined)?.date?.start ?? null
  const completed = propertyItems(completedValue).some((item) => item.checkbox === true)

  return { id: page.id, 할일: title, 담당자: assignees, 기한: dueDate, 완료: completed }
}

export default async (request: Request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })

  const actionsDatabaseId = process.env.NOTION_ACTIONS_DB?.trim()
  if (!actionsDatabaseId) {
    return Response.json({ error: 'NOTION_ACTIONS_DB 환경 변수가 설정되지 않았습니다' }, { status: 502 })
  }

  try {
    const body = await notionFetch(`/databases/${actionsDatabaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        filter: { property: '완료', checkbox: { equals: false } },
        sorts: [{ property: '기한', direction: 'ascending' }],
        // One dashboard fetch remains within the serverless execution budget even
        // though this API version requires property-item reads per row.
        page_size: 20,
      }),
    }) as NotionQueryResult
    const items = await Promise.all((body.results ?? []).map(dashboardItemFromPage))
    return Response.json({ items })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 })
  }
}

export const config: Config = { path: '/api/notion-query' }
