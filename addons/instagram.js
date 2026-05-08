// DEV/g0d - Instagram Addon

(function () {

  // ─── Content Downloader (posts, reels, profile pic) ───────────────────────
  function initIgContentDownloader() {
    (function () {
      const postFilenameTemplate = '%id%-%datetime%-%medianame%';
      const datetimeTemplate = '%y%%m%%d%_%H%%M%%S%';
      const postIdPattern = /^\/(p|reel)\/([^/]+)\//;
      const postUrlPattern = /instagram\.com\/(p|reel)\/[\w-]+\//;
      const svgDL = `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 0 477.867 477.867" style="fill:%color;"><path d="M443.733,307.2c-9.426,0-17.067,7.641-17.067,17.067v102.4c0,9.426-7.641,17.067-17.067,17.067H68.267c-9.426,0-17.067-7.641-17.067-17.067v-102.4c0-9.426-7.641-17.067-17.067-17.067s-17.067,7.641-17.067,17.067v102.4c0,28.277,22.923,51.2,51.2,51.2H409.6c28.277,0,51.2-22.923,51.2-51.2v-102.4C460.8,314.841,453.159,307.2,443.733,307.2z"/><path d="M335.947,295.134c-6.614-6.387-17.099-6.387-23.712,0L256,351.334V17.067C256,7.641,248.359,0,238.933,0s-17.067,7.641-17.067,17.067v334.268l-56.201-56.201c-6.78-6.548-17.584-6.36-24.132,0.419c-6.388,6.614-6.388,17.099,0,23.713l85.333,85.333c6.657,6.673,17.463,6.687,24.136,0.031c0.01-0.01,0.02-0.02,0.031-0.031l85.333-85.333C342.915,312.486,342.727,301.682,335.947,295.134z"/></svg>`;

      let preUrl = '';
      const infoCache = {}, mediaIdCache = {};

      const getIconColor = () => { try { const rgb = getComputedStyle(document.body).backgroundColor.match(/[.?\d]+/g); if (rgb?.length >= 3) return (rgb[0]*0.299+rgb[1]*0.587+rgb[2]*0.114)<=150?'white':'black'; } catch(e){} return 'white'; };
      const isPostPage = () => Boolean(window.location.href.match(postUrlPattern));
      const isReelPage = () => /instagram\.com\/reels?\//.test(window.location.href);
      const fillZero = s => s.length===1?'0'+s:s;
      const datetimeFormat = (t,d) => t.replace(/%y%/g,d.getFullYear()).replace(/%m%/g,fillZero((d.getMonth()+1).toString())).replace(/%d%/g,fillZero(d.getDate().toString())).replace(/%H%/g,fillZero(d.getHours().toString())).replace(/%M%/g,fillZero(d.getMinutes().toString())).replace(/%S%/g,fillZero(d.getSeconds().toString()));
      const filenameFormat = (t,id,dt,mn,pId=+new Date(),mIdx='0') => t.replace(/%id%/g,id).replace(/%datetime%/g,datetimeFormat(datetimeTemplate,dt)).replace(/%medianame%/g,mn).replace(/%postId%/g,pId).replace(/%mediaIndex%/g,mIdx);

      function forceDownload(blob, filename, ext) {
        const a = document.createElement('a'); a.download = filename+'.'+ext; a.href = blob; document.body.appendChild(a); a.click(); a.remove();
      }
      function downloadResource(url, filename) {
        if (!url) return;
        if (url.startsWith('blob:')) { forceDownload(url, filename, 'mp4'); return; }
        fetch(url, { headers: new Headers({'User-Agent':navigator.userAgent,Origin:location.origin}), mode:'cors' })
          .then(r=>r.blob()).then(b=>forceDownload(URL.createObjectURL(b),filename,b.type.split('/').pop())).catch(console.error);
      }

      function findPostId(articleNode) {
        const urlMatch = window.location.pathname.match(/\/(p|reel)\/([^/]+)/);
        if (urlMatch) return urlMatch[2];
        for (const a of articleNode.querySelectorAll('a')) { const m = a.getAttribute('href')?.match(postIdPattern); if (m) return m[2]; }
        return null;
      }

      function postGetArticleNode(target) {
        let n = target;
        while (n && n.tagName!=='ARTICLE' && n.tagName!=='MAIN' && n.tagName!=='BODY') n = n.parentNode;
        if (n?.tagName==='BODY') return document.querySelector('main')||document.querySelector('article')||document.body;
        return n||document.body;
      }

      function findPostName(articleNode) {
        const headerLink = articleNode.querySelector('header a');
        if (headerLink) return headerLink.getAttribute('href').replace(/\//g,'');
        const urlMatch = window.location.pathname.match(/\/(reel|p)\/([^/]+)/);
        if (urlMatch) { const h2 = document.querySelector('h2[dir]'); if (h2) return h2.innerText; }
        return 'unknown';
      }

      async function getUrlFromInfoApi(articleNode, mediaIdx=0) {
        try {
          const appIdPattern = /"X-IG-App-ID":"([\d]+)"/;
          const mediaIdPattern = /instagram:\/\/media\?id=(\d+)|["' ]media_id["' ]:["' ](\d+)["' ]/;
          const findAppId = () => { for (const s of document.querySelectorAll('body > script')) { const m = s.text.match(appIdPattern); if (m) return m[1]; } return '936619743392459'; };
          const getImgOrVideoUrl = item => 'video_versions' in item ? item.video_versions[0].url : item.image_versions2.candidates[0].url;

          async function findMediaId() {
            const postId = findPostId(articleNode);
            if (!postId) return null;
            if (!(postId in mediaIdCache)) {
              try {
                let resp = await fetch(`https://www.instagram.com/p/${postId}/`);
                if (!resp.ok) resp = await fetch(`https://www.instagram.com/reel/${postId}/`);
                const text = await resp.text(), idMatch = text?.match(mediaIdPattern)||[];
                let mediaId = null;
                for (let i=0;i<idMatch.length;++i) if (idMatch[i]) mediaId=idMatch[i];
                if (!mediaId) return null;
                mediaIdCache[postId] = mediaId;
              } catch(e) { return null; }
            }
            return mediaIdCache[postId];
          }

          const appId = findAppId(), mediaId = await findMediaId();
          if (!mediaId) return null;
          if (!(mediaId in infoCache)) {
            const resp = await fetch('https://i.instagram.com/api/v1/media/'+mediaId+'/info/', { method:'GET', headers:{Accept:'*/*','X-IG-App-ID':appId}, credentials:'include', mode:'cors' });
            if (resp.status!==200) return null;
            infoCache[mediaId] = await resp.json();
          }
          const info = infoCache[mediaId];
          return 'carousel_media' in info.items[0] ? getImgOrVideoUrl(info.items[0].carousel_media[mediaIdx]) : getImgOrVideoUrl(info.items[0]);
        } catch(e) { return null; }
      }

      async function fetchVideoURL(articleNode, videoElem) {
        try {
          const poster = videoElem.getAttribute('poster'), timeNodes = articleNode.querySelectorAll('time');
          if (!timeNodes.length) return null;
          const posterUrl = timeNodes[timeNodes.length-1].parentNode?.parentNode?.href;
          if (!posterUrl) return null;
          const posterMatch = poster?.match(/\/([^\/?]*)\?/);
          if (!posterMatch) return null;
          const resp = await fetch(posterUrl), content = await resp.text();
          const match = content.match(new RegExp(`${posterMatch[1]}.*?video_versions.*?url":("[^"]*")`,'s'));
          if (!match) return null;
          return JSON.parse(match[1]).replace(/^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/?\n]+)/g,'https://scontent.cdninstagram.com');
        } catch(e) { return null; }
      }

      async function postGetUrl(articleNode) {
        let url=null, mediaIndex=0;
        const list = articleNode.querySelectorAll('li[style][class]');
        if (list.length===0) {
          url = await getUrlFromInfoApi(articleNode);
          if (!url) {
            const videoElem = articleNode.querySelector('video');
            if (videoElem) {
              url = videoElem.getAttribute('src');
              if (!url||url.includes('blob')) url = await fetchVideoURL(articleNode,videoElem)||await getUrlFromInfoApi(articleNode);
            } else {
              url = articleNode.querySelector('article div[role] div > img')?.getAttribute('src') || articleNode.querySelector('img[src*="instagram"]')?.getAttribute('src');
            }
          }
        } else {
          const dots = [...articleNode.querySelectorAll('div._acnb')];
          mediaIndex = dots.reduce((r,el,i)=>el.classList.length===2?i:r,null)||0;
          url = await getUrlFromInfoApi(articleNode,mediaIndex);
          if (!url) {
            const postView = location.pathname.startsWith('/p/')||location.pathname.startsWith('/reel/');
            const listEls = [...articleNode.querySelectorAll(`:scope > div > div:nth-child(${postView?1:2}) > div > div:nth-child(1) ul li[style*="translateX"]`)];
            const w = Math.max(...listEls.map(el=>el.clientWidth));
            const posMap = listEls.reduce((r,el)=>({...r,[Math.round(Number(el.style.transform.match(/-?(\d+)/)?.[1]||0)/w)]:el}),{});
            const node = posMap[mediaIndex];
            if (node) {
              const v = node.querySelector('video');
              if (v) { url=v.getAttribute('src'); if (!url||url.includes('blob')) url=await fetchVideoURL(articleNode,v); }
              else url = node.querySelector('img')?.getAttribute('src');
            }
          }
        }
        return {url,mediaIndex};
      }

      function profileOnClicked() {
        const username = window.location.href.match(/instagram\.com\/([A-Za-z0-9_.]+)/)?.[1];
        if (!username||['p','reel','stories','explore','direct','accounts','reels'].includes(username)) return;
        GM_xmlhttpRequest({
          method:'GET', url:`https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
          headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 12_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 105.0.0.11.118','X-IG-App-ID':'936619743392459'},
          onload: res => {
            try {
              const userId = JSON.parse(res.responseText)?.data?.user?.id;
              if (!userId) return;
              GM_xmlhttpRequest({
                method:'GET', url:`https://i.instagram.com/api/v1/users/${userId}/info/`,
                headers:{'User-Agent':'Mozilla/5.0 (Linux; Android 9; GM1903 Build/PKQ1.190110.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/75.0.3770.143 Mobile Safari/537.36 Instagram 103.1.0.15.119','X-IG-App-ID':'936619743392459'},
                onload: r2 => {
                  try {
                    const info = JSON.parse(r2.responseText);
                    const hdUrl = info?.user?.hd_profile_pic_url_info?.url;
                    if (hdUrl) downloadResource(hdUrl, info?.user?.username||'profile');
                  } catch(e) {}
                }
              });
            } catch(e) {}
          }
        });
      }

      async function postOnClicked(target) {
        try {
          const articleNode = postGetArticleNode(target);
          const {url,mediaIndex} = await postGetUrl(articleNode);
          if (url?.length>0) {
            let mediaName = url.split('?')[0].split('/').pop();
            mediaName = mediaName.substring(0,mediaName.lastIndexOf('.'));
            const datetime = new Date(articleNode.querySelector('time')?.getAttribute('datetime')||Date.now());
            downloadResource(url, filenameFormat(postFilenameTemplate,findPostName(articleNode),datetime,mediaName,findPostId(articleNode)||'post',mediaIndex));
          }
        } catch(e) { console.error('[DEV/g0d] IG download error:',e); }
      }

      function createBtn(iconColor) {
        const btn = document.createElement('a');
        btn.innerHTML = svgDL.replace('%color',iconColor);
        btn.className = 'ig-custom-btn';
        btn.style.cssText = 'cursor:pointer;margin-left:14px;margin-top:8px;z-index:999';
        btn.title = 'Download';
        btn.onclick = e => {
          e.stopPropagation(); e.preventDefault();
          const inHeader = document.querySelector('header')?.contains(e.currentTarget);
          inHeader ? profileOnClicked() : postOnClicked(e.currentTarget);
        };
        return btn;
      }

      function addDownloadButton(result, iconColor) {
        const btn = createBtn(iconColor);
        if (result.section&&result.span) result.section.insertBefore(btn,result.span.nextSibling);
        else { const ps=result.svg.closest('span'); if (ps?.parentNode) ps.parentNode.insertBefore(btn,ps.nextSibling); else result.svg.parentNode?.parentNode?.append(btn); }
      }

      function addButtonsToPage() {
        const curUrl = window.location.href;
        const iconColor = getIconColor();
        if (preUrl!==curUrl) { document.querySelectorAll('.ig-custom-btn').forEach(b=>b.remove()); preUrl=curUrl; }

        for (const saveBtn of document.querySelectorAll('svg[aria-label="Save"]')) {
          const section = saveBtn.closest('section');
          if (!section||!section.querySelector('svg[aria-label="Like"]')||section.getElementsByClassName('ig-custom-btn').length>0) continue;
          const span = saveBtn.closest('span');
          addDownloadButton({svg:saveBtn,section,span:span?.parentNode===section?span:null},iconColor);
        }

        if ((isPostPage()||isReelPage())&&document.getElementsByClassName('ig-custom-btn').length===0) {
          const saveSvg = document.querySelector('svg[aria-label="Save"]');
          if (saveSvg) addDownloadButton({svg:saveSvg},iconColor);
        }

        const isProfilePage = !isPostPage()&&!isReelPage()&&!curUrl.includes('stor')&&!curUrl.includes('/p/')&&!curUrl.includes('/reel');
        if (isProfilePage&&document.getElementsByClassName('ig-custom-btn').length===0) {
          const optionsBtn = document.querySelector('svg[aria-label="Options"]');
          if (optionsBtn) {
            const container = optionsBtn.closest('div[role="button"]');
            if (container?.parentNode) {
              const btn = createBtn(iconColor);
              btn.style.cssText = 'cursor:pointer;margin-left:8px;display:inline-flex;align-items:center;z-index:999';
              container.parentNode.insertBefore(btn,container.nextSibling);
            }
          }
        }
      }

      setInterval(addButtonsToPage,800);
      let debounce=null;
      new MutationObserver(()=>{ clearTimeout(debounce); debounce=setTimeout(addButtonsToPage,150); })
        .observe(document.body,{childList:true,subtree:true});
      setTimeout(addButtonsToPage,500);
    })();
  }

  // ─── Story Saver ──────────────────────────────────────────────────────────
  function initIgStorySaver() {
    (function() {
      class IgStoryDownloader {
        constructor() { this.mediaUrl=null; this.detectedVideo=null; this.setupMutationObserver(); }

        setupMutationObserver() {
          new MutationObserver(()=>this.checkPageStructure()).observe(document.body,{childList:true,subtree:true});
        }

        checkPageStructure() {
          const btn = document.getElementById('igStoryDlBtn');
          if (/(\/stories\/)/.test(window.location.href)) { this.injectStyles(); this.pollCreateButton(); }
          else if (btn) btn.remove();
        }

        injectStyles() {
          if (document.getElementById('igStoryDlStyles')) return;
          const s = document.createElement('style'); s.id='igStoryDlStyles';
          s.textContent='#igStoryDlBtn{border:none;background:transparent;color:white;cursor:pointer;z-index:9999;width:48px;height:48px;padding:0;display:flex;align-items:center;justify-content:center;transition:opacity .2s}#igStoryDlBtn:hover{opacity:.7}#igStoryDlBtn svg{width:24px;height:24px}';
          document.head.appendChild(s);
        }

        pollCreateButton() {
          let attempts=0;
          const iv = setInterval(()=>{ if (document.getElementById('igStoryDlBtn')||this.createButton()||++attempts>=10) clearInterval(iv); },500);
        }

        createButton() {
          if (document.getElementById('igStoryDlBtn')) return null;
          const topBar = Array.from(document.querySelectorAll('div.x1xmf6yo')).find(b=>b instanceof HTMLElement&&b.offsetHeight>0);
          if (!topBar) return null;
          const btn = document.createElement('button'); btn.id='igStoryDlBtn'; btn.title='Download';
          btn.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
          btn.addEventListener('click',()=>this.handleDownload());
          topBar.appendChild(btn); return btn;
        }

        async handleDownload() {
          try { await this.detectMedia(); if (!this.mediaUrl) throw new Error('No media'); await this.downloadMedia(this.mediaUrl,this.generateFileName()); } catch(e) { console.error('[DEV/g0d] IG story download failed:',e); }
        }

        async detectMedia() {
          const video=this.findVideo(), image=this.findImage();
          if (video) { this.mediaUrl=video; this.detectedVideo=true; }
          else if (image) { this.mediaUrl=image.src; this.detectedVideo=false; }
        }

        findVideo() {
          for (const v of document.querySelectorAll('video')) if (v.offsetHeight>0) { const url=this.searchVideoSource(v); if (url) return url; } return null;
        }

        searchVideoSource(video) {
          const key = Object.keys(video).find(k=>k.startsWith('__reactFiber')); if (!key) return null;
          const rk = key.replace('__reactFiber','');
          const parent = video.parentElement?.parentElement?.parentElement?.parentElement;
          const props = parent?.[`__reactProps${rk}`];
          const impl = props?.children?.[0]?.props?.children?.props?.implementations??props?.children?.props?.children?.props?.implementations;
          if (impl) for (const i of [1,0,2]) { const s=impl[i]?.data; const u=s?.hdSrc||s?.sdSrc||s?.hd_src||s?.sd_src; if (u) return u; }
          const vd = video[key]?.return?.stateNode?.props?.videoData?.$1;
          return vd?.hd_src||vd?.sd_src||null;
        }

        findImage() {
          return Array.from(document.querySelectorAll('img')).filter(img=>img.offsetHeight>0&&img.src.includes('cdn')).find(img=>img.height>400)||null;
        }

        generateFileName() {
          const ts = new Date().toISOString().split('T')[0];
          const user = Array.from(document.querySelectorAll('.x1i10hfl')).find(u=>u instanceof HTMLAnchorElement&&u.offsetHeight>0&&u.offsetHeight<35);
          return `${user?.pathname.replace(/\//g,'')||'unknown'}-${ts}.${this.detectedVideo?'mp4':'jpg'}`;
        }

        async downloadMedia(url, filename) {
          try { const r=await fetch(url),b=await r.blob(),l=document.createElement('a'); l.href=URL.createObjectURL(b); l.download=filename; document.body.appendChild(l); l.click(); document.body.removeChild(l); URL.revokeObjectURL(l.href); } catch(e) { console.error('[DEV/g0d] IG story error:',e); }
        }
      }
      new IgStoryDownloader();
    })();
  }

  // ─── Allow Save ───────────────────────────────────────────────────────────
  function initIgAllowSave() {
    (function() {
      function allowSave() {
        document.querySelectorAll('img').forEach(img => {
          img.removeAttribute('srcset'); img.removeAttribute('sizes');
          const parent=img.parentElement;
          if (!parent||parent.tagName!=='DIV') return;
          const next=parent.nextElementSibling;
          if (!next||next.tagName!=='DIV') return;
          if (next.nextElementSibling?.className) return;
          next.style.display = next.children.length===0?'none':'';
        });
      }
      const obs = new MutationObserver(()=>{ obs.disconnect(); allowSave(); obs.observe(document,{attributes:true,childList:true,subtree:true}); });
      obs.observe(document,{attributes:true,childList:true,subtree:true});
      allowSave();
    })();
  }

  // ─── Register Plugins ─────────────────────────────────────────────────────
  const icon = (d) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px">${d}</svg>`;

  window.DEVg0d_PLUGINS = [
    {
      name: icon('<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#8b949e"/>') + 'ContentDownloader',
      type: 'toggle',
      key: 'devg0d-ig-content',
      init: initIgContentDownloader,
    },
    {
      name: icon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>') + 'StorySaver',
      type: 'toggle',
      key: 'devg0d-ig-story',
      init: initIgStorySaver,
    },
    {
      name: icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>') + 'AllowSave',
      type: 'toggle',
      key: 'devg0d-ig-allowsave',
      init: initIgAllowSave,
    },
  ];

})();
