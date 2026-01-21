import { NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import { DoubanItem, DoubanResult } from '@/lib/types';

interface MaoyanFilmItem {
  id: string;
  name: string;
  posterUrl: string;
  score: string;
  releaseDate: string;
}

async function fetchMaoyanData(url: string): Promise<MaoyanFilmItem[]> {
  // 添加超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

  // 设置请求选项，包括信号和头部
  const fetchOptions = {
    signal: controller.signal,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      Referer: 'https://www.maoyan.com/',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  };

  try {
    // 尝试直接访问猫眼网页
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const html = await response.text();
    const films: MaoyanFilmItem[] = [];

    // 使用正则表达式提取电影数据
    // 提取电影卡片容器
    const filmListRegex = /<dl class="movie-list">([\s\S]*?)<\/dl>/;
    const filmListMatch = filmListRegex.exec(html);
    if (!filmListMatch) return films;

    const filmListHtml = filmListMatch[1];

    // 提取每个电影卡片
    const filmCardRegex = /<dd>([\s\S]*?)<\/dd>/g;
    let filmCardMatch;

    while ((filmCardMatch = filmCardRegex.exec(filmListHtml)) !== null) {
      const cardHtml = filmCardMatch[1];
      
      // 提取电影ID和标题
      const idTitleRegex = /<a[^>]*href="\/films\/(\d+)"[^>]*>([^<]*)<\/a>/;
      const idTitleMatch = idTitleRegex.exec(cardHtml);
      if (!idTitleMatch) continue;

      const id = idTitleMatch[1];
      const title = idTitleMatch[2].trim();

      // 提取海报URL
      const posterRegex = /<img[^>]*src="([^"]*)"[^>]*>/;
      const posterMatch = posterRegex.exec(cardHtml);
      if (!posterMatch) continue;

      const posterUrl = posterMatch[1];

      // 提取评分
      const scoreRegex = /<div class="channel-detail channel-detail-orange">([^<]*)<\/div>/;
      const scoreMatch = scoreRegex.exec(cardHtml);
      const score = scoreMatch ? scoreMatch[1].trim() : '';

      // 提取年份
      const yearRegex = /<div class="channel-detail movie-item-subtitle">[^<]*?(\d{4})[^<]*?<\/div>/;
      const yearMatch = yearRegex.exec(cardHtml);
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
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // 获取参数
  const kind = searchParams.get('kind') || 'movie';
  const category = searchParams.get('category');
  const type = searchParams.get('type');
  const pageLimit = parseInt(searchParams.get('limit') || '20');
  const pageStart = parseInt(searchParams.get('start') || '0');

  // 验证参数
  if (!kind || !category || !type) {
    return NextResponse.json(
      { error: '缺少必要参数: kind 或 category 或 type' },
      { status: 400 }
    );
  }

  if (!['tv', 'movie'].includes(kind)) {
    return NextResponse.json(
      { error: 'kind 参数必须是 tv 或 movie' },
      { status: 400 }
    );
  }

  if (pageLimit < 1 || pageLimit > 100) {
    return NextResponse.json(
      { error: 'pageSize 必须在 1-100 之间' },
      { status: 400 }
    );
  }

  if (pageStart < 0) {
    return NextResponse.json(
      { error: 'pageStart 不能小于 0' },
      { status: 400 }
    );
  }

  // 猫眼电影的URL格式 - 无论参数如何，都返回热映电影
  const offset = pageStart;
  const target = `https://www.maoyan.com/films?showType=1&offset=${offset}`;

  try {
    // 调用猫眼 API
    const maoyanData = await fetchMaoyanData(target);

    // 转换数据格式为DoubanItem
    const list: DoubanItem[] = maoyanData.map((film) => ({
      id: film.id,
      title: film.name,
      poster: film.posterUrl,
      rate: film.score,
      year: film.releaseDate,
    }));

    const response: DoubanResult = {
      code: 200,
      message: '获取成功',
      list: list,
    };

    const cacheTime = await getCacheTime();
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: '获取猫眼数据失败', details: (error as Error).message },
      { status: 500 }
    );
  }
}
