// DEV/g0d - Twitch Sub Bypass (patch_amazonworker)
// Injected into Twitch's Amazon worker via importScripts()

async function fetchTwitchDataGQL(vodID) {
  const resp = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    body: JSON.stringify({ query: `query { video(id: "${vodID}") { broadcastType, createdAt, seekPreviewsURL, owner { login } }}` }),
    headers: { 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Accept': 'application/json', 'Content-Type': 'application/json' }
  });
  return resp.json();
}

function createServingID() {
  const w = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');
  let id = '';
  for (let i = 0; i < 32; i++) id += w[Math.floor(Math.random() * w.length)];
  return id;
}

const defaultResolutions = (() => {
  const r = {
    'chunked':  { name: 'chunked', resolution: 'chunked',    frameRate: 60 },
    '1440p60':  { name: '1440p60', resolution: '2560x1440',  frameRate: 60 },
    '1080p60':  { name: '1080p60', resolution: '1920x1080',  frameRate: 60 },
    '720p60':   { name: '720p60',  resolution: '1280x720',   frameRate: 60 },
    '480p30':   { name: '480p',    resolution: '854x480',    frameRate: 30 },
    '360p30':   { name: '360p',    resolution: '640x360',    frameRate: 30 },
    '160p30':   { name: '160p',    resolution: '284x160',    frameRate: 30 },
  };
  return r;
})();

async function isValidQuality(url) {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) return null;
  const data = await response.text();
  if (data.includes('.ts')) return { codec: 'avc1.4D001E' };
  if (data.includes('.mp4')) {
    const mp4 = await fetch(url.replace('index-dvr.m3u8', 'init-0.mp4'), { cache: 'force-cache' });
    if (mp4.ok) { const c = await mp4.text(); return { codec: c.includes('hev1') ? 'hev1.1.6.L93.B0' : 'avc1.4D001E' }; }
    return { codec: 'hev1.1.6.L93.B0' };
  }
  return null;
}

const oldFetch = self.fetch;
self.fetch = async function (input, opt) {
  const url = input instanceof Request ? input.url : input.toString();
  let response = await oldFetch(input, opt);

  // Patch unmuted → muted segments
  if (url.includes('cloudfront') && url.includes('.m3u8')) {
    const body = await response.text();
    return new Response(body.replace(/-unmuted/g, '-muted'), { status: 200 });
  }

  if (url.startsWith('https://usher.ttvnw.net/vod/')) {
    if (response.status !== 200) {
      const isUsherV2 = url.includes('/vod/v2');
      const vodId = url.split('.m3u8')[0].split('/').at(-1);
      const data = await fetchTwitchDataGQL(vodId);

      if (!data?.data?.video) {
        console.log('[DEV/g0d Twitch] Unable to fetch VOD data');
        return new Response('Unable to fetch twitch data API', { status: 403 });
      }

      const vodData = data.data.video;
      const currentURL = new URL(vodData.seekPreviewsURL);
      const domain = currentURL.host;
      const paths = currentURL.pathname.split('/');
      const vodSpecialID = paths[paths.findIndex(el => el.includes('storyboards')) - 1];
      const broadcastType = vodData.broadcastType.toLowerCase();
      const daysDiff = (new Date('2023-02-10') - new Date(vodData.createdAt)) / (1000 * 3600 * 24);

      let fakePlaylist = `#EXTM3U\n#EXT-X-TWITCH-INFO:ORIGIN="s3",B="false",REGION="EU",USER-IP="127.0.0.1",SERVING-ID="${createServingID()}",CLUSTER="cloudfront_vod",USER-COUNTRY="BE",MANIFEST-CLUSTER="cloudfront_vod"`;
      let startQuality = 8534030;

      for (const [resKey, resValue] of Object.entries(defaultResolutions)) {
        let playlistUrl;
        if (broadcastType === 'highlight')
          playlistUrl = `https://${domain}/${vodSpecialID}/${resKey}/highlight-${vodId}.m3u8`;
        else if (broadcastType === 'upload' && daysDiff > 7)
          playlistUrl = `https://${domain}/${vodData.owner.login}/${vodId}/${vodSpecialID}/${resKey}/index-dvr.m3u8`;
        else
          playlistUrl = `https://${domain}/${vodSpecialID}/${resKey}/index-dvr.m3u8`;

        const result = await isValidQuality(playlistUrl);
        if (!result) continue;

        if (isUsherV2) {
          fakePlaylist += `\n#EXT-X-STREAM-INF:BANDWIDTH=${startQuality},CODECS="${result.codec},mp4a.40.2",RESOLUTION=${resValue.resolution},FRAME-RATE=${resValue.frameRate},STABLE-VARIANT-ID="${resKey}",IVS-NAME="${resValue.name}",IVS-VARIANT-SOURCE="${resKey==='chunked'?'source':'transcode'}"\n${playlistUrl}`;
        } else {
          const enabled = resKey === 'chunked' ? 'YES' : 'NO';
          fakePlaylist += `\n#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="${resKey}",NAME="${resKey}",AUTOSELECT=${enabled},DEFAULT=${enabled}\n#EXT-X-STREAM-INF:BANDWIDTH=${startQuality},CODECS="${result.codec},mp4a.40.2",RESOLUTION=${resValue.resolution},VIDEO="${resValue.name}",FRAME-RATE=${resValue.frameRate}\n${playlistUrl}`;
        }
        startQuality -= 100;
      }

      const headers = new Headers({ 'Content-Type': 'application/vnd.apple.mpegurl' });
      return new Response(fakePlaylist, { status: 200, headers });
    }
  }

  return response;
};
