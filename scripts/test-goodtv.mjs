#!/usr/bin/env node
import assert from 'node:assert/strict'

import goodtv from '../extractors/goodtv/index.js'
import {
  CHANNELS,
  GOODTV_ORIGIN,
  buildChannels,
  claimsRef,
  officialAssetUrl,
  resolveChannel,
  upstreamHeadersFor,
} from '../extractors/goodtv/api.js'
import { getModule, resolverFor } from '../extractors/registry.js'

let passed = 0
const check = (name, fn) => { fn(); passed++; console.log(`  ✅ ${name}`) }
const checkAsync = async (name, fn) => { await fn(); passed++; console.log(`  ✅ ${name}`) }

console.log('GOOD TV 模块测试')

check('模块注册为免账号的台湾全代理模块', () => {
  assert.equal(getModule('goodtv'), goodtv)
  assert.equal(goodtv.name, 'GOOD TV')
  assert.equal(goodtv.outputGroupName, '台湾')
  assert.equal(goodtv.channelHlsMode, 'proxy')
  assert.equal(goodtv.capabilities.catchup, false)
  assert.equal(goodtv.catalogVersion, 1)
  assert.deepEqual(goodtv.configSchema, [])
  assert.equal(resolverFor('goodtv-main'), goodtv)
  assert.equal(resolverFor('goodtv-main/extra'), null)
})

await checkAsync('综合台与真理台归入台湾分组且不继承回看', async () => {
  assert.deepEqual(CHANNELS.map(channel => [channel.ref, channel.name]), [
    ['goodtv-main', 'GOODTV'],
    ['goodtv-truth', 'GOODTV2'],
  ])
  const channels = buildChannels()
  assert.deepEqual(channels.map(channel => channel.deferredRef), CHANNELS.map(channel => channel.ref))
  // 台标留空交给公共台标库按名兜底：官网只有一张站点 logo，两台共用分不出来；
  // 库里恰好收了 GOODTV / GOODTV2 两张，频道名按台名写才能命中
  assert.ok(channels.every(channel => channel.logo === '' && channel.groupTitle === '台湾'))
  assert.ok(channels.every(channel => channel.catchup === 'none'))
  assert.deepEqual(await goodtv.fetch(), {
    groups: [{ name: '台湾', dataList: channels }],
    meta: { skipped: [], warnings: [] },
  })
  assert.equal(claimsRef('goodtv-truth'), true)
  assert.equal(claimsRef('goodtv-radio'), false)
})

check('媒体白名单只放行官方分发目录，含分片的相对回跳', () => {
  // 清单里的分片是 ../../../../hls-live/streams/... ，解析后仍在同一前缀下
  const manifestUrl = CHANNELS[0].url
  const segment = new URL('../../../../hls-live/streams/goodtv/events/_definst_/liveevent/live-ch1-2Num1.ts', manifestUrl).href
  assert.equal(officialAssetUrl(segment),
    'https://dqhxk7sbp7xog.cloudfront.net/hls-live/streams/goodtv/events/_definst_/liveevent/live-ch1-2Num1.ts')
  for (const bad of [
    'http://dqhxk7sbp7xog.cloudfront.net/hls-live/goodtv/_definst_/liveevent/live-ch1-2.m3u8',
    'https://dqhxk7sbp7xog.cloudfront.net.evil.test/hls-live/live-ch1-2.m3u8',
    'https://cloudfront.net/hls-live/live-ch1-2.m3u8',
    'https://127.0.0.1/hls-live/live-ch1-2.m3u8',
    'https://user:pass@dqhxk7sbp7xog.cloudfront.net/hls-live/live-ch1-2.m3u8',
    'https://dqhxk7sbp7xog.cloudfront.net:444/hls-live/live-ch1-2.m3u8',
    'https://dqhxk7sbp7xog.cloudfront.net/private/live-ch1-2.m3u8',
    'https://dqhxk7sbp7xog.cloudfront.net/hls-live/..%2fprivate/live.m3u8',
    'https://dqhxk7sbp7xog.cloudfront.net/hls-live/live-ch1-2.m3u8#frag',
    'not a url',
  ]) assert.throws(() => officialAssetUrl(bad), /GOOD TV/)
})

check('回源请求头只带官网 Referer，UA 交给代理层', () => {
  assert.deepEqual(upstreamHeadersFor(CHANNELS[1].url), { Referer: `${GOODTV_ORIGIN}/` })
  // 真正决定 CloudFront 放行的是 UA；固定对象里声明的 UA 不会生效，所以不声明
  assert.equal('User-Agent' in upstreamHeadersFor(CHANNELS[0].url), false)
  assert.throws(() => upstreamHeadersFor('https://evil.test/hls-live/live.m3u8'), /非官方媒体地址/)
})

await checkAsync('解析直接给出固定官方地址，不打任何网络', async () => {
  const fetchImpl = async () => { throw new Error('不应请求') }
  for (const channel of CHANNELS) {
    const resolved = await resolveChannel(channel.ref, { fetchImpl })
    assert.equal(resolved.url, channel.url)
    assert.match(resolved.desc, new RegExp(channel.name))
    assert.equal(typeof resolved.upstreamHeaders, 'function')
    assert.equal(resolved.upstreamUrlTransform(channel.url), channel.url)
    assert.equal('manifestText' in resolved, false)
    assert.equal('manifestUrl' in resolved, false)
  }
})

await checkAsync('非法引用只返回说明，不向请求处理器抛错', async () => {
  const malformed = await resolveChannel('goodtv-radio')
  assert.equal(malformed.url, '')
  assert.match(malformed.desc, /引用格式错误/)
  assert.equal((await resolveChannel('')).url, '')
})

console.log(`\n全部通过：${passed} ✅`)
