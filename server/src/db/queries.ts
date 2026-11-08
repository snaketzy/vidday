/**
 * 内容侧只读查询：直连 MySQL 写 SQL 装配对外 DTO。
 *
 * 与内容管理端「整库载入内存」的实现不同，这里按请求所需的最小集合取数：
 * 卡片只取展示列，详情再补演职员与所属专题，避免把整库塞进进程内存。
 * 图片地址一律按 R2 约定推导（见 ./assets.ts），不改动库内原始列。
 *
 * 影片与剧集共用同一整数 ID 序列，故涉及 titleId 的场景一律「先试影片再试剧集」。
 */
import type { RowDataPacket } from 'mysql2/promise'

import type {
  ContentType,
  PublicCarousel,
  PublicCarouselCard,
  PublicCollectionDetail,
  PublicCreditEntry,
  PublicGenre,
  PublicPersonCredit,
  PublicPersonDetail,
  PublicTitleCredits,
  PublicTitleDetail,
} from '../contract.ts'
import { movieBackdrop, moviePoster, personAvatar, seriesBackdrop, seriesPoster } from './assets.ts'
import { getPool } from './pool.ts'

/** 题材字典分组标识。 */
const GENRE_GROUP = 'genre'

/** 详情页主演署名条数上限（前台只展示主要阵容）。 */
const PUBLIC_CAST_LIMIT = 8

/** 专题封面拼条最多展示张数。 */
const COVER_STRIP_LIMIT = 4

/** 「最新上架」默认统计窗口（天）与上限。 */
export const DEFAULT_LATEST_DAYS = 7

/* ------------------------------------------------------------------ *
 * 基础取值 / 时间转换（与内容管理端同口径）
 * ------------------------------------------------------------------ */

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value)
  return s.length > 0 ? s : null
}

/** 非空整数，缺省回落 fallback。 */
function intOr(value: unknown, fallback = 0): number {
  return num(value) ?? fallback
}

/** MySQL DATETIME(3) → UTC ISO 字符串。 */
function fromDbDateTime(value: unknown): string {
  const s = str(value) ?? ''
  if (!s) return new Date(0).toISOString()
  if (s.includes('T')) return s
  return `${s.slice(0, 10)}T${s.slice(11, 23).padEnd(12, '0')}Z`
}

/** MySQL DATE → ISO 日期串（仅日期部分）。 */
function fromDbDate(value: unknown): string | null {
  const s = str(value)
  return s ? s.slice(0, 10) : null
}

/** 生成 `?, ?, ?` 占位串，供 IN 子句使用。 */
function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ')
}

function unique(ids: number[]): number[] {
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))]
}

/* ------------------------------------------------------------------ *
 * 行类型
 * ------------------------------------------------------------------ */

interface MovieRow extends RowDataPacket {
  id: number
  imdb_id: string | null
  tmdb_id: number | null
  title: string
  english_title: string | null
  original_title: string
  chinese_title: string | null
  tagline: string | null
  overview_en: string | null
  overview_zh: string | null
  release_year: number | null
  runtime: number | null
  us_rating: string | null
  poster_url: string | null
  backdrop_url: string | null
  play_url: string | null
  rating_imdb: string | null
  rating_tmdb: string | null
  status: string
  created_at: string | null
  updated_at: string | null
}

interface SeriesRow extends RowDataPacket {
  id: number
  imdb_id: string | null
  tmdb_id: number | null
  title: string
  english_title: string | null
  original_title: string
  chinese_title: string | null
  tagline: string | null
  overview_en: string | null
  overview_zh: string | null
  release_year: number | null
  runtime: number | null
  us_rating: string | null
  poster_url: string | null
  backdrop_url: string | null
  rating_imdb: string | null
  rating_tmdb: string | null
  status: string
  created_at: string | null
  updated_at: string | null
}

interface CollectionRow extends RowDataPacket {
  id: number
  name: string
  description: string | null
  cover_url: string | null
}

interface CreditRow extends RowDataPacket {
  person_id: number | null
  person_name: string
  person_name_en: string | null
  profile_url: string | null
  department: string
  job: string
  char_name: string | null
  /** LEFT JOIN people 带出的列，前缀 p_ 避免与署名冗余列重名 */
  p_imdb_id: string | null
  p_tmdb_id: number | null
  p_profile_url: string | null
}

/** 影片 / 剧集的展示列（卡片、详情共用）。 */
const MOVIE_COLUMNS = `id, imdb_id, tmdb_id, title, english_title, original_title, chinese_title,
  tagline, overview_en, overview_zh, release_year, runtime, us_rating,
  poster_url, backdrop_url, play_url, rating_imdb, rating_tmdb, status, created_at, updated_at`

const SERIES_COLUMNS = `id, imdb_id, tmdb_id, title, english_title, original_title, chinese_title,
  tagline, overview_en, overview_zh, release_year, runtime, us_rating,
  poster_url, backdrop_url, rating_imdb, rating_tmdb, status, created_at, updated_at`

/* ------------------------------------------------------------------ *
 * 卡片装配上下文
 * ------------------------------------------------------------------ */

interface CardContext {
  genreMap: Map<number, string>
  movies: Map<number, MovieRow>
  movieGenres: Map<number, string[]>
  series: Map<number, SeriesRow>
  seriesGenres: Map<number, string[]>
  /** 剧集级起播地址（首个已封装集的 playUrl） */
  seriesPlay: Map<number, string | null>
  collections: Map<number, CollectionRow>
  collectionCovers: Map<number, string[]>
}

interface Need {
  movieIds?: number[]
  seriesIds?: number[]
  collectionIds?: number[]
}

/** 题材字典：id → 中文名。 */
async function loadGenreLabelMap(): Promise<Map<number, string>> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT id, label_zh FROM \`dict\` WHERE group_code = ? ORDER BY sort_order, id`,
    [GENRE_GROUP]
  )
  return new Map(rows.map((row) => [intOr(row.id), str(row.label_zh) ?? '']))
}

/** 实体属性表中的题材 ID → 中文标签（按 sort_order 保序、去重）。 */
async function loadGenreLabels(
  table: 'movie_attrs' | 'series_attrs',
  column: 'movie_id' | 'series_id',
  ids: number[],
  genreMap: Map<number, string>
): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>()
  if (!ids.length) return result
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT ${column} AS owner_id, dict_id FROM \`${table}\`
     WHERE ${column} IN (${placeholders(ids.length)})
     ORDER BY ${column}, sort_order, id`,
    ids
  )
  for (const row of rows) {
    const label = genreMap.get(intOr(row.dict_id))
    if (!label) continue
    const ownerId = intOr(row.owner_id)
    const list = result.get(ownerId) ?? []
    if (!list.includes(label)) list.push(label)
    result.set(ownerId, list)
  }
  return result
}

/** 批量取剧集的首个可播放集地址。 */
async function loadSeriesPlay(ids: number[]): Promise<Map<number, string | null>> {
  const result = new Map<number, string | null>()
  if (!ids.length) return result
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT series_id, play_url FROM \`series_episodes\`
     WHERE series_id IN (${placeholders(ids.length)}) AND play_url IS NOT NULL AND play_url <> ''
     ORDER BY series_id, season_id, sort_order, id`,
    ids
  )
  for (const row of rows) {
    const seriesId = intOr(row.series_id)
    if (!result.has(seriesId)) result.set(seriesId, str(row.play_url))
  }
  return result
}

/** 专题封面拼条：先按影片顺序取剧照（缺失回退海报），不足时用剧集补足。 */
async function loadCollectionCovers(ids: number[]): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>()
  if (!ids.length) return result
  const coversFor = (id: number): string[] => {
    const list = result.get(id) ?? []
    result.set(id, list)
    return list
  }

  const [movieRows] = await getPool().query<RowDataPacket[]>(
    `SELECT cm.collection_id, m.imdb_id, m.poster_url, m.backdrop_url
     FROM \`collection_movies\` cm JOIN \`movies\` m ON m.id = cm.movie_id
     WHERE cm.collection_id IN (${placeholders(ids.length)})
     ORDER BY cm.collection_id, cm.sort_order, cm.id`,
    ids
  )
  for (const row of movieRows) {
    const list = coversFor(intOr(row.collection_id))
    if (list.length >= COVER_STRIP_LIMIT) continue
    const url = movieBackdrop({
      imdb_id: str(row.imdb_id),
      poster_url: str(row.poster_url),
      backdrop_url: str(row.backdrop_url),
    })
    if (url) list.push(url)
  }

  const [seriesRows] = await getPool().query<RowDataPacket[]>(
    `SELECT cs.collection_id, s.backdrop_url, s.poster_url
     FROM \`collection_series\` cs JOIN \`series\` s ON s.id = cs.series_id
     WHERE cs.collection_id IN (${placeholders(ids.length)})
     ORDER BY cs.collection_id, cs.sort_order, cs.id`,
    ids
  )
  for (const row of seriesRows) {
    const list = coversFor(intOr(row.collection_id))
    if (list.length >= COVER_STRIP_LIMIT) continue
    const url = str(row.backdrop_url) ?? str(row.poster_url)
    if (url) list.push(url)
  }
  return result
}

/** 按需取数，装配一次性卡片上下文（空集合跳过查询）。 */
async function loadCardContext(need: Need): Promise<CardContext> {
  const movieIds = unique(need.movieIds ?? [])
  const seriesIds = unique(need.seriesIds ?? [])
  const collectionIds = unique(need.collectionIds ?? [])

  const genreMap = await loadGenreLabelMap()
  const [movies, movieGenres, series, seriesGenres, seriesPlay, collections, collectionCovers] =
    await Promise.all([
      loadMovieRows(movieIds),
      loadGenreLabels('movie_attrs', 'movie_id', movieIds, genreMap),
      loadSeriesRows(seriesIds),
      loadGenreLabels('series_attrs', 'series_id', seriesIds, genreMap),
      loadSeriesPlay(seriesIds),
      loadCollectionRows(collectionIds),
      loadCollectionCovers(collectionIds),
    ])

  return { genreMap, movies, movieGenres, series, seriesGenres, seriesPlay, collections, collectionCovers }
}

async function loadMovieRows(ids: number[]): Promise<Map<number, MovieRow>> {
  if (!ids.length) return new Map()
  const [rows] = await getPool().query<MovieRow[]>(
    `SELECT ${MOVIE_COLUMNS} FROM \`movies\` WHERE id IN (${placeholders(ids.length)})`,
    ids
  )
  return new Map(rows.map((row) => [intOr(row.id), row]))
}

async function loadSeriesRows(ids: number[]): Promise<Map<number, SeriesRow>> {
  if (!ids.length) return new Map()
  const [rows] = await getPool().query<SeriesRow[]>(
    `SELECT ${SERIES_COLUMNS} FROM \`series\` WHERE id IN (${placeholders(ids.length)})`,
    ids
  )
  return new Map(rows.map((row) => [intOr(row.id), row]))
}

async function loadCollectionRows(ids: number[]): Promise<Map<number, CollectionRow>> {
  if (!ids.length) return new Map()
  const [rows] = await getPool().query<CollectionRow[]>(
    `SELECT id, name, description, cover_url FROM \`collections\` WHERE id IN (${placeholders(ids.length)})`,
    ids
  )
  return new Map(rows.map((row) => [intOr(row.id), row]))
}

/* ------------------------------------------------------------------ *
 * 轮播项覆盖值
 * ------------------------------------------------------------------ */

interface CardOverrides {
  title?: string | null
  subtitle?: string | null
  imageUrl?: string | null
  linkUrl?: string | null
}

function movieCard(row: MovieRow, genres: string[], id: number, overrides: CardOverrides = {}): PublicCarouselCard {
  const movieId = intOr(row.id)
  return {
    id,
    targetType: 'movie',
    targetId: movieId,
    href: overrides.linkUrl ?? `/watch/${movieId}`,
    title: overrides.title ?? str(row.chinese_title) ?? str(row.english_title) ?? String(row.title),
    chineseTitle: str(row.chinese_title),
    englishTitle: str(row.english_title),
    subtitle: overrides.subtitle ?? str(row.overview_zh) ?? str(row.overview_en),
    backdropUrl:
      overrides.imageUrl ??
      movieBackdrop({
        imdb_id: str(row.imdb_id),
        poster_url: str(row.poster_url),
        backdrop_url: str(row.backdrop_url),
      }),
    posterUrl: moviePoster({ imdb_id: str(row.imdb_id), poster_url: str(row.poster_url) }),
    playUrl: str(row.play_url),
    covers: [],
    releaseYear: num(row.release_year),
    runtime: num(row.runtime),
    maturity: str(row.us_rating),
    rating: num(row.rating_imdb) ?? num(row.rating_tmdb),
    genres,
  }
}

function seriesCard(
  row: SeriesRow,
  genres: string[],
  id: number,
  playUrl: string | null,
  overrides: CardOverrides = {}
): PublicCarouselCard {
  const seriesId = intOr(row.id)
  return {
    id,
    targetType: 'series',
    targetId: seriesId,
    href: overrides.linkUrl ?? `/title/${seriesId}`,
    title: overrides.title ?? str(row.chinese_title) ?? str(row.english_title) ?? String(row.title),
    chineseTitle: str(row.chinese_title),
    englishTitle: str(row.english_title),
    subtitle: overrides.subtitle ?? str(row.overview_zh) ?? str(row.overview_en),
    backdropUrl:
      overrides.imageUrl ??
      seriesBackdrop({
        imdb_id: str(row.imdb_id),
        tmdb_id: num(row.tmdb_id),
        poster_url: str(row.poster_url),
        backdrop_url: str(row.backdrop_url),
      }),
    posterUrl: seriesPoster({
      imdb_id: str(row.imdb_id),
      tmdb_id: num(row.tmdb_id),
      poster_url: str(row.poster_url),
    }),
    playUrl,
    covers: [],
    releaseYear: num(row.release_year),
    runtime: num(row.runtime),
    maturity: str(row.us_rating),
    rating: num(row.rating_imdb) ?? num(row.rating_tmdb),
    genres,
  }
}

function collectionCard(
  row: CollectionRow,
  covers: string[],
  id: number,
  overrides: CardOverrides = {}
): PublicCarouselCard {
  const collectionId = intOr(row.id)
  return {
    id,
    targetType: 'collection',
    targetId: collectionId,
    href: overrides.linkUrl ?? `/collection/${collectionId}`,
    title: overrides.title ?? String(row.name),
    chineseTitle: null,
    englishTitle: null,
    subtitle: overrides.subtitle ?? str(row.description),
    backdropUrl: overrides.imageUrl ?? covers[0] ?? null,
    posterUrl: null,
    playUrl: null,
    covers,
    releaseYear: null,
    runtime: null,
    maturity: null,
    rating: null,
    genres: [],
  }
}

/** 按目标类型装配单张卡片；目标已删除时返回 null。 */
function cardFromContext(
  ctx: CardContext,
  targetType: 'movie' | 'series' | 'collection',
  targetId: number,
  id: number = targetId,
  overrides: CardOverrides = {}
): PublicCarouselCard | null {
  if (targetType === 'movie') {
    const row = ctx.movies.get(targetId)
    return row ? movieCard(row, ctx.movieGenres.get(targetId) ?? [], id, overrides) : null
  }
  if (targetType === 'series') {
    const row = ctx.series.get(targetId)
    return row
      ? seriesCard(row, ctx.seriesGenres.get(targetId) ?? [], id, ctx.seriesPlay.get(targetId) ?? null, overrides)
      : null
  }
  const row = ctx.collections.get(targetId)
  return row ? collectionCard(row, ctx.collectionCovers.get(targetId) ?? [], id, overrides) : null
}

/* ------------------------------------------------------------------ *
 * 对外接口实现
 * ------------------------------------------------------------------ */

/** 按目标 ID 取单张卡片（影片优先，其次剧集）。 */
export async function cardForTitleId(titleId: number): Promise<PublicCarouselCard | null> {
  const ctx = await loadCardContext({ movieIds: [titleId], seriesIds: [titleId] })
  if (ctx.movies.has(titleId)) return cardFromContext(ctx, 'movie', titleId)
  if (ctx.series.has(titleId)) return cardFromContext(ctx, 'series', titleId)
  return null
}

/** 批量取卡片摘要，键为 titleId；不存在的目标不出现在结果中。 */
export async function cardsForTitleIds(titleIds: number[]): Promise<Map<number, PublicCarouselCard>> {
  const ids = unique(titleIds)
  const result = new Map<number, PublicCarouselCard>()
  if (!ids.length) return result

  const ctx = await loadCardContext({ movieIds: ids, seriesIds: ids })
  for (const id of ids) {
    const card = ctx.movies.has(id)
      ? cardFromContext(ctx, 'movie', id)
      : ctx.series.has(id)
        ? cardFromContext(ctx, 'series', id)
        : null
    if (card) result.set(id, card)
  }
  return result
}

/** 页面轮播：仅返回启用中的轮播，剔除目标已删除的项，空轮播不下发。 */
export async function listPublicCarousels(params: {
  placement: 'home' | 'collection'
  pageId: number | null
}): Promise<PublicCarousel[]> {
  const [carouselRows] = await getPool().query<RowDataPacket[]>(
    `SELECT id, title, variant, autoplay, interval_ms FROM \`carousel\`
     WHERE placement = ? AND is_active = 1 AND page_id <=> ?
     ORDER BY sort_order, id`,
    [params.placement, params.pageId]
  )
  if (!carouselRows.length) return []

  const carouselIds = carouselRows.map((row) => intOr(row.id))
  const [itemRows] = await getPool().query<RowDataPacket[]>(
    `SELECT id, carousel_id, target_type, target_id, title_override, subtitle_override, image_url, link_url
     FROM \`carousel_item\`
     WHERE carousel_id IN (${placeholders(carouselIds.length)})
     ORDER BY carousel_id, sort_order, id`,
    carouselIds
  )

  const need: Need = { movieIds: [], seriesIds: [], collectionIds: [] }
  for (const row of itemRows) {
    const targetId = intOr(row.target_id)
    if (row.target_type === 'movie') need.movieIds?.push(targetId)
    else if (row.target_type === 'series') need.seriesIds?.push(targetId)
    else if (row.target_type === 'collection') need.collectionIds?.push(targetId)
  }
  const ctx = await loadCardContext(need)

  const itemsByCarousel = new Map<number, PublicCarouselCard[]>()
  for (const row of itemRows) {
    const targetType = String(row.target_type)
    if (targetType !== 'movie' && targetType !== 'series' && targetType !== 'collection') continue
    const card = cardFromContext(ctx, targetType, intOr(row.target_id), intOr(row.id), {
      title: str(row.title_override),
      subtitle: str(row.subtitle_override),
      imageUrl: str(row.image_url),
      linkUrl: str(row.link_url),
    })
    if (!card) continue
    const carouselId = intOr(row.carousel_id)
    const list = itemsByCarousel.get(carouselId) ?? []
    list.push(card)
    itemsByCarousel.set(carouselId, list)
  }

  return carouselRows
    .map<PublicCarousel>((row) => ({
      id: intOr(row.id),
      title: String(row.title ?? ''),
      variant: row.variant === 'hero' ? 'hero' : 'rail',
      autoplay: Number(row.autoplay) === 1,
      intervalMs: intOr(row.interval_ms, 6000),
      items: itemsByCarousel.get(intOr(row.id)) ?? [],
    }))
    .filter((carousel) => carousel.items.length > 0)
}

/** 影片 / 剧集详情（影片优先）。目标不存在返回 null。 */
export async function getTitleDetail(id: number): Promise<PublicTitleDetail | null> {
  const movie = (await loadMovieRows([id])).get(id)
  if (movie) return movieDetail(movie)
  const series = (await loadSeriesRows([id])).get(id)
  if (series) return seriesDetail(series)
  return null
}

async function creditsOf(
  table: 'movie_credits' | 'series_credits',
  column: 'movie_id' | 'series_id',
  id: number
): Promise<CreditRow[]> {
  const [rows] = await getPool().query<CreditRow[]>(
    `SELECT c.person_id, c.person_name, c.person_name_en, c.profile_url, c.department, c.job, c.char_name,
            p.imdb_id AS p_imdb_id, p.tmdb_id AS p_tmdb_id, p.profile_url AS p_profile_url
     FROM \`${table}\` c LEFT JOIN \`people\` p ON p.id = c.person_id
     WHERE c.${column} = ?
     ORDER BY c.sort_order, c.id`,
    [id]
  )
  return rows
}

async function movieDetail(movie: MovieRow): Promise<PublicTitleDetail> {
  const id = intOr(movie.id)
  const [genreMap, credits, collectionRows] = await Promise.all([
    loadGenreLabelMap(),
    creditsOf('movie_credits', 'movie_id', id),
    getPool().query<RowDataPacket[]>(
      `SELECT c.id, c.name FROM \`collection_movies\` cm JOIN \`collections\` c ON c.id = cm.collection_id
       WHERE cm.movie_id = ? ORDER BY c.id`,
      [id]
    ),
  ])

  const acting = credits.filter((credit) => credit.department === 'Acting')
  const director = credits.find((credit) => credit.job === 'Director')
  const genres = await genresFor('movie_attrs', 'movie_id', id, genreMap)
  const [collectionResult] = collectionRows

  return {
    id,
    contentType: 'movie',
    title: str(movie.chinese_title) ?? str(movie.english_title) ?? String(movie.title),
    chineseTitle: str(movie.chinese_title),
    englishTitle: str(movie.english_title),
    originalTitle: str(movie.original_title),
    year: num(movie.release_year),
    runtime: num(movie.runtime),
    rating: num(movie.rating_imdb) ?? num(movie.rating_tmdb),
    maturity: str(movie.us_rating),
    genres,
    logline: str(movie.tagline),
    synopsis: str(movie.overview_zh) ?? str(movie.overview_en),
    director: director ? String(director.person_name) : null,
    cast: acting.slice(0, PUBLIC_CAST_LIMIT).map((credit) => String(credit.person_name)),
    backdropUrl: movieBackdrop({
      imdb_id: str(movie.imdb_id),
      poster_url: str(movie.poster_url),
      backdrop_url: str(movie.backdrop_url),
    }),
    posterUrl: moviePoster({ imdb_id: str(movie.imdb_id), poster_url: str(movie.poster_url) }),
    playUrl: str(movie.play_url),
    collections: collectionResult.map((row) => ({ id: intOr(row.id), name: String(row.name) })),
    updatedAt: fromDbDateTime(movie.updated_at),
  }
}

async function seriesDetail(series: SeriesRow): Promise<PublicTitleDetail> {
  const id = intOr(series.id)
  const [genreMap, credits, collectionRows] = await Promise.all([
    loadGenreLabelMap(),
    creditsOf('series_credits', 'series_id', id),
    getPool().query<RowDataPacket[]>(
      `SELECT c.id, c.name FROM \`collection_series\` cs JOIN \`collections\` c ON c.id = cs.collection_id
       WHERE cs.series_id = ? ORDER BY c.id`,
      [id]
    ),
  ])

  const acting = credits.filter((credit) => credit.department === 'Acting')
  const director = credits.find((credit) => credit.job === 'Director')
  const genres = await genresFor('series_attrs', 'series_id', id, genreMap)
  const [collectionResult] = collectionRows
  const playUrl = (await loadSeriesPlay([id])).get(id) ?? null

  return {
    id,
    contentType: 'series',
    title: str(series.chinese_title) ?? str(series.english_title) ?? String(series.title),
    chineseTitle: str(series.chinese_title),
    englishTitle: str(series.english_title),
    originalTitle: str(series.original_title),
    year: num(series.release_year),
    runtime: num(series.runtime),
    rating: num(series.rating_imdb) ?? num(series.rating_tmdb),
    maturity: str(series.us_rating),
    genres,
    logline: str(series.tagline),
    synopsis: str(series.overview_zh) ?? str(series.overview_en),
    director: director ? String(director.person_name) : null,
    cast: acting.slice(0, PUBLIC_CAST_LIMIT).map((credit) => String(credit.person_name)),
    backdropUrl: seriesBackdrop({
      imdb_id: str(series.imdb_id),
      tmdb_id: num(series.tmdb_id),
      poster_url: str(series.poster_url),
      backdrop_url: str(series.backdrop_url),
    }),
    posterUrl: seriesPoster({
      imdb_id: str(series.imdb_id),
      tmdb_id: num(series.tmdb_id),
      poster_url: str(series.poster_url),
    }),
    playUrl,
    collections: collectionResult.map((row) => ({ id: intOr(row.id), name: String(row.name) })),
    updatedAt: fromDbDateTime(series.updated_at),
  }
}

/** 单个实体的题材标签（按 sort_order 保序）。 */
async function genresFor(
  table: 'movie_attrs' | 'series_attrs',
  column: 'movie_id' | 'series_id',
  id: number,
  genreMap: Map<number, string>
): Promise<string[]> {
  const map = await loadGenreLabels(table, column, [id], genreMap)
  return map.get(id) ?? []
}

/** 完整演职员表：演员与职员分开，便于前台分组展示。 */
export async function getTitleCredits(id: number): Promise<PublicTitleCredits | null> {
  let contentType: ContentType
  let rows: CreditRow[]
  if ((await loadMovieRows([id])).has(id)) {
    contentType = 'movie'
    rows = await creditsOf('movie_credits', 'movie_id', id)
  } else if ((await loadSeriesRows([id])).has(id)) {
    contentType = 'series'
    rows = await creditsOf('series_credits', 'series_id', id)
  } else {
    return null
  }

  const cast: PublicCreditEntry[] = []
  const crew: PublicCreditEntry[] = []
  for (const row of rows) {
    const entry: PublicCreditEntry = {
      personId: num(row.person_id),
      name: String(row.person_name),
      englishName: str(row.person_name_en),
      avatarUrl: creditAvatar(row),
      department: String(row.department),
      job: String(row.job),
      character: str(row.char_name),
    }
    if (entry.department === 'Acting') cast.push(entry)
    else crew.push(entry)
  }

  return { id, contentType, cast, crew }
}

/** 署名头像：影人档案优先（推导 R2 地址），缺失回退署名冗余地址。 */
function creditAvatar(row: CreditRow): string | null {
  const personId = num(row.person_id)
  if (personId !== null) {
    const derived = personAvatar({
      imdb_id: str(row.p_imdb_id),
      tmdb_id: num(row.p_tmdb_id),
      profile_url: str(row.p_profile_url),
    })
    return derived ?? str(row.profile_url)
  }
  return str(row.profile_url)
}

/** 专题详情：名称 / 简介 / 封面包 + 按序影片卡片。目标不存在返回 null。 */
export async function getCollectionDetail(id: number): Promise<PublicCollectionDetail | null> {
  const collection = (await loadCollectionRows([id])).get(id)
  if (!collection) return null

  const [movieRows] = await getPool().query<RowDataPacket[]>(
    `SELECT movie_id FROM \`collection_movies\` WHERE collection_id = ? ORDER BY sort_order, id`,
    [id]
  )
  const movieIds = movieRows.map((row) => intOr(row.movie_id))
  const ctx = await loadCardContext({ movieIds, collectionIds: [id] })

  const items: PublicCarouselCard[] = []
  for (const movieId of movieIds) {
    const card = cardFromContext(ctx, 'movie', movieId)
    if (card) items.push(card)
  }

  return {
    id,
    name: String(collection.name),
    description: str(collection.description),
    coverUrl: str(collection.cover_url),
    covers: ctx.collectionCovers.get(id) ?? [],
    items,
  }
}

/** 题材清单：仅返回实际被影片使用的题材，与后台过滤器同源。 */
export async function listGenres(): Promise<PublicGenre[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT d.code, d.label_zh FROM \`dict\` d
     WHERE d.group_code = ? AND EXISTS (SELECT 1 FROM \`movie_attrs\` a WHERE a.dict_id = d.id)
     ORDER BY d.sort_order, d.id`,
    [GENRE_GROUP]
  )
  return rows.map((row) => ({ code: String(row.code ?? ''), name: String(row.label_zh ?? '') }))
}

/** 近 N 天内「已上架」的影片与剧集，按入库时间倒序。 */
export async function listLatest(params: {
  days: number
  limit?: number
}): Promise<{ items: PublicCarouselCard[]; total: number }> {
  const since = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 23)

  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT 'movie' AS target_type, id, created_at FROM \`movies\`
       WHERE status = 'published' AND created_at >= ?
     UNION ALL
     SELECT 'series' AS target_type, id, created_at FROM \`series\`
       WHERE status = 'published' AND created_at >= ?
     ORDER BY created_at DESC`,
    [since, since]
  )

  const total = rows.length
  const limited = params.limit ? rows.slice(0, params.limit) : rows

  const movieIds: number[] = []
  const seriesIds: number[] = []
  for (const row of limited) {
    if (row.target_type === 'movie') movieIds.push(intOr(row.id))
    else seriesIds.push(intOr(row.id))
  }
  const ctx = await loadCardContext({ movieIds, seriesIds })

  const items: PublicCarouselCard[] = []
  for (const row of limited) {
    const card =
      row.target_type === 'movie'
        ? cardFromContext(ctx, 'movie', intOr(row.id))
        : cardFromContext(ctx, 'series', intOr(row.id))
    if (card) items.push(card)
  }
  return { items, total }
}

/** 影人详情：基础资料 + 参演 / 参与制作的影片与剧集（按年份倒序）。 */
export async function getPersonDetail(id: number): Promise<PublicPersonDetail | null> {
  const [personRows] = await getPool().query<RowDataPacket[]>(
    `SELECT id, tmdb_id, imdb_id, name, english_name, gender, profile_url, birthday, deathday,
            place_of_birth, nationality, school, biography, biography_zh, known_for
     FROM \`people\` WHERE id = ?`,
    [id]
  )
  const person = personRows[0]
  if (!person) return null

  const [movieCreditRows] = await getPool().query<RowDataPacket[]>(
    `SELECT m.id, m.imdb_id, m.tmdb_id, m.title, m.chinese_title, m.english_title, m.release_year,
            m.poster_url, m.play_url, m.rating_imdb, m.rating_tmdb,
            c.job, c.department, c.char_name
     FROM \`movie_credits\` c JOIN \`movies\` m ON m.id = c.movie_id
     WHERE c.person_id = ?`,
    [id]
  )
  const [seriesCreditRows] = await getPool().query<RowDataPacket[]>(
    `SELECT s.id, s.imdb_id, s.tmdb_id, s.title, s.chinese_title, s.english_title, s.release_year,
            s.poster_url, s.rating_imdb, s.rating_tmdb,
            c.job, c.department, c.char_name
     FROM \`series_credits\` c JOIN \`series\` s ON s.id = c.series_id
     WHERE c.person_id = ?`,
    [id]
  )

  const seriesIds = seriesCreditRows.map((row) => intOr(row.id))
  const seriesPlay = await loadSeriesPlay(seriesIds)

  const credits: PublicPersonCredit[] = []
  for (const row of movieCreditRows) {
    credits.push({
      titleId: intOr(row.id),
      contentType: 'movie',
      title: str(row.chinese_title) ?? str(row.english_title) ?? String(row.title),
      chineseTitle: str(row.chinese_title),
      englishTitle: str(row.english_title),
      releaseYear: num(row.release_year),
      posterUrl: moviePoster({ imdb_id: str(row.imdb_id), poster_url: str(row.poster_url) }),
      playUrl: str(row.play_url),
      rating: num(row.rating_imdb) ?? num(row.rating_tmdb),
      job: String(row.job),
      department: String(row.department),
      character: str(row.char_name),
    })
  }
  for (const row of seriesCreditRows) {
    const seriesId = intOr(row.id)
    credits.push({
      titleId: seriesId,
      contentType: 'series',
      title: str(row.chinese_title) ?? str(row.english_title) ?? String(row.title),
      chineseTitle: str(row.chinese_title),
      englishTitle: str(row.english_title),
      releaseYear: num(row.release_year),
      posterUrl: seriesPoster({
        imdb_id: str(row.imdb_id),
        tmdb_id: num(row.tmdb_id),
        poster_url: str(row.poster_url),
      }),
      playUrl: seriesPlay.get(seriesId) ?? null,
      rating: num(row.rating_imdb) ?? num(row.rating_tmdb),
      job: String(row.job),
      department: String(row.department),
      character: str(row.char_name),
    })
  }
  credits.sort((a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0) || a.titleId - b.titleId)

  return {
    id: intOr(person.id),
    name: String(person.name),
    englishName: str(person.english_name),
    gender: str(person.gender) ?? 'unknown',
    avatarUrl: personAvatar({
      imdb_id: str(person.imdb_id),
      tmdb_id: num(person.tmdb_id),
      profile_url: str(person.profile_url),
    }),
    birthday: fromDbDate(person.birthday),
    deathday: fromDbDate(person.deathday),
    placeOfBirth: str(person.place_of_birth),
    nationality: str(person.nationality),
    school: str(person.school),
    knownFor: str(person.known_for) ?? 'Acting',
    biography: str(person.biography_zh) ?? str(person.biography),
    credits,
  }
}
