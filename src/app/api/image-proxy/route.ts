import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  
  if (!url) {
    return new NextResponse('Missing URL parameter', { status: 400 });
  }

  try {
    const targetUrl = new URL(url);
    
    // 构造请求头，伪装成正常浏览器访问
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Referer': 'https://movie.douban.com/', // 默认 Referer
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site',
    };

    // 如果是猫眼/美团图片，修改 Referer
    if (targetUrl.hostname.includes('maoyan.com') || targetUrl.hostname.includes('meituan.net')) {
      headers['Referer'] = 'https://www.maoyan.com/';
    }

    const response = await fetch(url, {
      headers: headers,
      // 关键：跟踪重定向，很多图片会有 CDN 跳转
      redirect: 'follow',
    });

    if (!response.ok) {
      console.error(`Failed to fetch image: ${url}, status: ${response.status}`);
      return new NextResponse('Image not found', { status: 404 });
    }

    // 获取原始 Content-Type
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    // 读取图片数据
    const imageBuffer = await response.arrayBuffer();

    // 返回图片，设置强缓存
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        // Cloudflare CDN 缓存控制：缓存 1 年
        'Cache-Control': 'public, max-age=31536000, immutable',
        // 允许跨域
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
