import { DoubanItem, DoubanResult } from './types';

interface MaoyanCategoriesParams {
  kind: 'tv' | 'movie';
  category: string;
  type: string;
  pageLimit?: number;
  pageStart?: number;
}

interface MaoyanFilmItem {
  id: string;
  name: string;
  posterUrl: string;
  score: string;
  releaseDate: string;
}

interface MaoyanApiResponse {
  films: MaoyanFilmItem[];
}

/**
 * 带超时的 fetch 请求
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

  const fetchOptions: RequestInit = {
    ...options,
    signal: controller.signal,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      Referer: 'https://www.maoyan.com/',
      Accept: 'application/json, text/plain, */*',
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * 从猫眼电影网页中提取电影数据
 */
async function scrapeMaoyanFilms(url: string): Promise<MaoyanFilmItem[]> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const html = await response.text();
  const films: MaoyanFilmItem[] = [];

  // 使用正则表达式提取电影数据
  // 提取电影卡片
  const filmCardRegex = /<div class="channel-detail movie-item-title"[^>]*>.*?<div>.*?<div class="channel-detail channel-detail-orange">([^<]*)<\/div>/gs;
  let match;

  while ((match = filmCardRegex.exec(html)) !== null) {
    const cardHtml = match[0];
    const score = match[1];

    // 提取电影ID和标题
    const idTitleRegex = /<a[^>]*href="\/films\/(\d+)"[^>]*>([^<]*)<\/a>/;
    const idTitleMatch = idTitleRegex.exec(cardHtml);
    if (!idTitleMatch) continue;

    const id = idTitleMatch[1];
    const title = idTitleMatch[2].trim();

    // 提取海报URL
    const posterRegex = /<img[^>]*src="([^"]*)"[^>]*alt="[^"]*">/;
    const posterMatch = posterRegex.exec(cardHtml);
    if (!posterMatch) continue;

    const posterUrl = posterMatch[1];

    // 提取年份
    const yearRegex = /<div class="channel-detail movie-item-subtitle">[^<]*?(\d{4})[^<]*?<\/div>/;
    const yearMatch = yearRegex.exec(html);
    const releaseDate = yearMatch ? yearMatch[1] : '';

    films.push({
      id,
      name: title,
      posterUrl,
      score: score === '暂无评分' ? '' : score,
      releaseDate,
    });
  }

  return films;
}

/**
 * 浏览器端猫眼分类数据获取函数
 */
export async function fetchMaoyanCategories(
  params: MaoyanCategoriesParams
): Promise<DoubanResult> {
  const { kind, category, type, pageLimit = 20, pageStart = 0 } = params;

  // 验证参数
  if (!['tv', 'movie'].includes(kind)) {
    throw new Error('kind 参数必须是 tv 或 movie');
  }

  if (!category || !type) {
    throw new Error('category 和 type 参数不能为空');
  }

  if (pageLimit < 1 || pageLimit > 100) {
    throw new Error('pageLimit 必须在 1-100 之间');
  }

  if (pageStart < 0) {
    throw new Error('pageStart 不能小于 0');
  }

  // 猫眼电影的URL格式
  const offset = pageStart;
  const target = `https://www.maoyan.com/films?showType=1&offset=${offset}`;

  try {
    const maoyanFilms = await scrapeMaoyanFilms(target);

    // 转换数据格式为DoubanItem
    const list: DoubanItem[] = maoyanFilms.map((film) => ({
      id: film.id,
      title: film.name,
      poster: film.posterUrl,
      rate: film.score,
      year: film.releaseDate,
    }));

    return {
      code: 200,
      message: '获取成功',
      list: list,
    };
  } catch (error) {
    // 触发全局错误提示
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('globalError', {
          detail: { message: '获取猫眼分类数据失败' },
        })
      );
    }
    throw new Error(`获取猫眼分类数据失败: ${(error as Error).message}`);
  }
}

/**
 * 统一的猫眼分类数据获取函数
 */
export async function getMaoyanCategories(
  params: MaoyanCategoriesParams
): Promise<DoubanResult> {
  // 目前只使用客户端方式获取
  return fetchMaoyanCategories(params);
}