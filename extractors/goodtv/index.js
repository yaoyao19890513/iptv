/** GOOD TV：官网两路公开电视直播，归入台湾分组，清单与分片全代理。 */
import { buildChannels, claimsRef, resolveChannel } from './api.js'

export default {
  id: 'goodtv',
  name: 'GOOD TV',
  description: 'GOOD TV 好消息电视台官网公开的综合台、真理台，归入台湾分组；无需登录，上游 CDN 按播放器标识放行，清单和媒体全代理。',
  capabilities: { cache: 'disk', resolve: true, epg: false, catchup: false },
  catalogVersion: 1,
  outputGroupName: '台湾',
  channelHlsMode: 'proxy',
  defaultRefreshMinutes: 1440,
  refreshConfigurable: false,
  refreshDescription: '自动管理：两路固定频道表随模块版本更新；官方地址不带签名，上游 CDN 只放行常见播放器标识，清单与分片一律经本机全代理回源。',

  configSchema: [],

  async fetch() {
    return {
      groups: [{ name: '台湾', dataList: buildChannels() }],
      meta: { skipped: [], warnings: [] },
    }
  },

  claimsRef,
  resolve: resolveChannel,
}
