/**
 * GOOD TV（好消息电视台）官网：两路固定公开 HLS。
 *
 * 地址是官网播放页写死的 CloudFront 分发，没有签名也没有 Referer 门。真正
 * 挡人的是 CloudFront 的 WAF：它按 User-Agent 放行，浏览器 / VLC /
 * ExoPlayer / AppleCoreMedia 都过，ffmpeg 的 Lavf 和 okhttp 一律 403。
 * 播放器用什么 UA 不是本项目能决定的，所以清单和分片统一走本机全代理——
 * 代理层回源时用的是自己那个 Chrome UA，实测清单与 .ts 均 200。
 *
 * 走 deferredRef + resolve 而不是直链，也是因为只有 resolve() 能返回
 * upstreamHeaders / upstreamUrlTransform，把回源锁在官方分发目录内。
 */

export const GOODTV_ORIGIN = 'https://www.goodtv.tv'

const MEDIA_HOST = 'dqhxk7sbp7xog.cloudfront.net'
// 清单在 /hls-live/goodtv/...，分片用 ../../../../ 回到 /hls-live/streams/...，同属一个前缀
const MEDIA_PATH_PREFIX = '/hls-live/'

export const CHANNELS = Object.freeze([
  Object.freeze({
    ref: 'goodtv-main',
    name: 'GOODTV',
    page: `${GOODTV_ORIGIN}/tv-channel?ch=1`,
    url: `https://${MEDIA_HOST}/hls-live/goodtv/_definst_/liveevent/live-ch1-2.m3u8`,
  }),
  Object.freeze({
    ref: 'goodtv-truth',
    name: 'GOODTV2',
    page: `${GOODTV_ORIGIN}/tv-channel?ch=2`,
    url: `https://${MEDIA_HOST}/hls-live/goodtv/_definst_/liveevent/live-ch2-2.m3u8`,
  }),
])

const CHANNEL_BY_REF = new Map(CHANNELS.map(channel => [channel.ref, channel]))

/** 全代理登记清单与分片前统一校验；分片是 ../ 相对路径，解析后仍必须落在官方目录下。 */
export function officialAssetUrl(raw) {
  let url
  try {
    url = new URL(String(raw || '').trim())
  } catch {
    throw new Error('GOOD TV 返回了无效媒体地址')
  }
  if (url.protocol !== 'https:' || url.username || url.password || !['', '443'].includes(url.port)
      || url.hostname !== MEDIA_HOST || !url.pathname.startsWith(MEDIA_PATH_PREFIX)
      || /%2f|%5c/i.test(url.pathname) || url.hash) {
    throw new Error('GOOD TV 返回了非官方媒体地址')
  }
  return url.href
}

/**
 * 本机代取清单或分片时补齐的请求头。
 *
 * Referer 并不是这家的门（实测缺了照样 200），跟着官网播放器发一份而已；
 * 真正决定放行的 User-Agent 由代理层统一给出，这里声明也不会生效。
 */
export function upstreamHeadersFor(raw) {
  officialAssetUrl(raw)
  return { Referer: `${GOODTV_ORIGIN}/` }
}

export function buildChannels() {
  return CHANNELS.map(channel => ({
    name: channel.name,
    deferredRef: channel.ref,
    logo: '',
    groupTitle: '台湾',
    opts: ['network-caching=3000'],
    catchup: 'none',
  }))
}

export function claimsRef(ref) {
  return CHANNEL_BY_REF.has(String(ref || ''))
}

/** 地址是常量，这里不打网络；上游是否健在由代理层回源时暴露。 */
export async function resolveChannel(ref) {
  const channel = CHANNEL_BY_REF.get(String(ref || ''))
  if (!channel) return { url: '', desc: 'GOOD TV 频道引用格式错误' }
  return {
    url: channel.url,
    desc: `${channel.name}官方直播地址`,
    upstreamHeaders: upstreamHeadersFor,
    upstreamUrlTransform: officialAssetUrl,
  }
}
