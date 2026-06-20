// ==UserScript==
// @name         Anyflip PDF LD
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Auto Fetch Anyflip To PDF
// @author       DEVg0d
// @match        https://online.anyflip.com/*/*
// @exclude      https://anyflip.com/*
// @icon         https://anyflip.com/favicon.ico
// @grant        GM_xmlhttpRequest
// @connect      online.anyflip.com
// @connect      anyflip.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
// ==/UserScript==

(function() {
    'use strict';

    const currentUrl = window.location.href;
    const match = currentUrl.match(/anyflip\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/);
    if (!match) return;

    const DOMAIN_URL = "https://online.anyflip.com";
    const cleanPath = `/${match[1]}/${match[2]}/`;

    let sharedCanvas = null;

    function getSharedCanvas() {
        if (!sharedCanvas) {
            sharedCanvas = document.createElement('canvas');
        }
        return sharedCanvas;
    }

    let currentPct = 0;
    let isDownloading = false;
    let cancelDownload = false;

    // Animations UI
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);

    // Controls UI
    const container = document.createElement('div');
    container.id = 'af-dl-container';
    container.style = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        background: rgba(15, 20, 30, 0.75);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        padding: 20px;
        box-shadow: 0 12px 40px 0 rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1);
        display: flex;
        flex-direction: column;
        width: 240px;
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        color: #f3f4f6;
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    // Window Title Bar Decorator
    const windowHeader = document.createElement('div');
    windowHeader.style = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding-bottom: 10px;
        cursor: pointer;
        user-select: none;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    windowHeader.title = "คลิกเพื่อ ย่อ/ขยาย หน้าต่าง";

    const dotsContainer = document.createElement('div');
    dotsContainer.style = 'display: flex; gap: 6px; align-items: center;';
    ['#ff5f56', '#ffbd2e', '#27c93f'].forEach(color => {
        const dot = document.createElement('span');
        dot.style = `
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background-color: ${color};
            display: inline-block;
            opacity: 0.8;
        `;
        dotsContainer.appendChild(dot);
    });

    const headerTitle = document.createElement('span');
    headerTitle.innerHTML = 'DEVg0d-dl';
    headerTitle.style = `
        font-size: 11px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.4);
        text-transform: uppercase;
        letter-spacing: 1.5px;
        white-space: nowrap;
        overflow: hidden;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    windowHeader.appendChild(dotsContainer);
    windowHeader.appendChild(headerTitle);

    const labelContainer = document.createElement('div');
    labelContainer.style = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.85);
        font-weight: 500;
    `;
    const labelText = document.createElement('span');
    labelText.innerHTML = 'คุณภาพ PDF:';
    const labelVal = document.createElement('span');
    labelVal.innerHTML = '80% (แนะนำ)';
    labelVal.style.color = '#00f2fe';
    labelVal.style.fontWeight = '700';
    labelVal.style.textShadow = '0 0 8px rgba(0, 242, 254, 0.3)';
    labelContainer.appendChild(labelText);
    labelContainer.appendChild(labelVal);

    // Slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '30';
    slider.max = '100';
    slider.value = '80';
    slider.style = `
        width: 100%;
        margin-bottom: 16px;
        cursor: pointer;
        accent-color: #00f2fe;
    `;

    // Slider Real-time
    slider.addEventListener('input', () => {
        const val = slider.value;
        let advice = '';
        if (val >= 90) {
            advice = ' (ไฟล์ใหญ่มาก)';
            labelVal.style.color = '#ff4757';
            labelVal.style.textShadow = '0 0 8px rgba(255, 71, 87, 0.3)';
        } else if (val >= 70) {
            advice = ' (แนะนำ)';
            labelVal.style.color = '#00f2fe';
            labelVal.style.textShadow = '0 0 8px rgba(0, 242, 254, 0.3)';
        } else {
            advice = ' (ประหยัดแรม)';
            labelVal.style.color = '#ffa502';
            labelVal.style.textShadow = '0 0 8px rgba(255, 165, 2, 0.3)';
        }
        labelVal.innerHTML = `${val}%${advice}`;
    });

    // ────────────────────────────────────────────────────────
    // Progress Bar OS Style
    const progressContainer = document.createElement('div');
    progressContainer.id = 'af-progress-container';
    progressContainer.style = `
        display: none;
        margin-bottom: 16px;
        animation: slideInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    const progressHeader = document.createElement('div');
    progressHeader.style = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
    `;

    const progressStatus = document.createElement('span');
    progressStatus.innerHTML = 'กำลังดาวน์โหลดรูปหน้ากระดาษ...';

    const progressPercent = document.createElement('span');
    progressPercent.innerHTML = '0%';
    progressPercent.style.fontWeight = '700';
    progressPercent.style.color = '#00f2fe';
    progressPercent.style.textShadow = '0 0 8px rgba(0, 242, 254, 0.4)';

    progressHeader.appendChild(progressStatus);
    progressHeader.appendChild(progressPercent);

    const progressTrack = document.createElement('div');
    progressTrack.style = `
        height: 8px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 10px;
        overflow: hidden;
        position: relative;
    `;

    const progressFill = document.createElement('div');
    progressFill.style = `
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #00f2fe 0%, #4facfe 100%);
        box-shadow: 0 0 10px rgba(0, 242, 254, 0.5);
        border-radius: 10px;
        transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    `;
    progressTrack.appendChild(progressFill);

    progressContainer.appendChild(progressHeader);
    progressContainer.appendChild(progressTrack);
    // ────────────────────────────────────────────────────────

    // Modern OS Glow Button
    const button = document.createElement('button');
    button.innerHTML = '📚 ดาวน์โหลด PDF';
    button.style = `
        width: 100%;
        padding: 12px 0;
        background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
        color: #080c14;
        border: none;
        border-radius: 30px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(0, 242, 254, 0.35);
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        letter-spacing: 0.5px;
    `;

    button.onmouseover = () => { if (!button.disabled) button.style.transform = 'scale(1.03) translateY(-1px)'; };
    button.onmouseout = () => { if (!button.disabled) button.style.transform = 'scale(1)'; };

    // Status Alert
    const infoAlert = document.createElement('div');
    infoAlert.style = `
        font-size: 11px;
        color: #ff4757;
        text-align: center;
        margin-top: 10px;
        display: none;
        word-break: break-word;
        background: rgba(255, 71, 87, 0.1);
        border: 1px solid rgba(255, 71, 87, 0.25);
        border-radius: 8px;
        padding: 8px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1);
    `;

    container.appendChild(windowHeader);
    container.appendChild(labelContainer);
    container.appendChild(slider);
    container.appendChild(progressContainer);
    container.appendChild(button);
    container.appendChild(infoAlert);
    document.body.appendChild(container);

    let isMinimized = false;
    windowHeader.addEventListener('click', () => {
        isMinimized = !isMinimized;
        if (isMinimized) {

            slider.style.display = 'none';
            labelContainer.style.display = 'none';
            progressContainer.style.display = 'none';
            button.style.display = 'none';
            infoAlert.style.display = 'none';

            container.style.width = '142px';
            container.style.padding = '8px 14px';
            container.style.borderRadius = '30px';

            windowHeader.style.borderBottom = 'none';
            windowHeader.style.marginBottom = '0';
            windowHeader.style.paddingBottom = '0';

            headerTitle.style.fontSize = '11px';
            headerTitle.style.letterSpacing = '0.5px';
            headerTitle.innerHTML = isDownloading ? `${currentPct}% 🌀` : 'AF-DL 💤';
        } else {
            if (!isDownloading) {
                slider.style.display = 'block';
                labelContainer.style.display = 'flex';
                progressContainer.style.display = 'none';
            } else {
                slider.style.display = 'none';
                labelContainer.style.display = 'none';
                progressContainer.style.display = 'block';
            }
            button.style.display = 'block';
            if (infoAlert.innerHTML !== '') infoAlert.style.display = 'block';

            container.style.width = '240px';
            container.style.padding = '20px';
            container.style.borderRadius = '20px';

            windowHeader.style.borderBottom = '1px solid rgba(255, 255, 255, 0.08)';
            windowHeader.style.marginBottom = '14px';
            windowHeader.style.paddingBottom = '10px';

            headerTitle.style.fontSize = '11px';
            headerTitle.style.letterSpacing = '1.5px';
            headerTitle.innerHTML = 'DEVg0d-dl';
        }
    });

    // Bypass CORS
    function fetchBlob(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'blob',
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response.response);
                    } else {
                        reject(new Error(`โหลดล้มเหลว: ${response.status}`));
                    }
                },
                onerror: (err) => reject(err)
            });
        });
    }

    function processImage(blob, quality) {
        return new Promise((resolve, reject) => {
            let img = new Image();
            img.onload = () => {
                try {
                    const canvas = getSharedCanvas();
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');

                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);

                    const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);

                    resolve({ dataUrl: compressedDataUrl, width: img.width, height: img.height });
                } catch (e) {
                    reject(e);
                } finally {
                    URL.revokeObjectURL(img.src);
                    img.onload = null;
                    img.onerror = null;
                    img = null;
                }
            };
            img.onerror = () => {
                URL.revokeObjectURL(img.src);
                img.onload = null;
                img.onerror = null;
                img = null;
                reject(new Error("ไม่สามารถประมวลผลรูปภาพได้"));
            };
            img.src = URL.createObjectURL(blob);
        });
    }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function resetUI() {
        button.disabled = false;
        slider.disabled = false;
        button.style.background = 'linear-gradient(135deg, #00f2fe, #4facfe)';
        button.style.color = '#080c14';
        button.style.boxShadow = '0 4px 20px rgba(0, 242, 254, 0.35)';
        button.innerHTML = '📚 ดาวน์โหลด PDF';

        isDownloading = false;
        cancelDownload = false;
        progressContainer.style.display = 'none';

        if (!isMinimized) {
            slider.style.display = 'block';
            labelContainer.style.display = 'flex';
        } else {
            headerTitle.innerHTML = 'AF-DL 💤';
        }
    }

    button.addEventListener('click', async () => {
        if (isDownloading) {
            cancelDownload = true;
            button.disabled = true;
            button.style.background = 'rgba(255, 255, 255, 0.08)';
            button.style.color = 'rgba(255, 255, 255, 0.3)';
            button.innerHTML = '🌀 กำลังยกเลิก...';
            progressStatus.innerHTML = '🛑 กำลังหยุดงานและเคลียร์ข้อมูล...';
            return;
        }

        try {
            const qualityValue = parseFloat(slider.value) / 100;

            infoAlert.style.display = 'none';
            infoAlert.innerHTML = '';

            isDownloading = true;
            cancelDownload = false;
            currentPct = 0;

            button.disabled = false;
            slider.disabled = true;
            button.style.background = 'linear-gradient(135deg, #ff4757 0%, #ff6b81 100%)';
            button.style.color = '#ffffff';
            button.style.boxShadow = '0 4px 20px rgba(255, 71, 87, 0.4)';
            button.innerHTML = '🛑 ยกเลิกดาวน์โหลด';

            slider.style.display = 'none';
            labelContainer.style.display = 'none';
            if (!isMinimized) {
                progressContainer.style.display = 'block';
            }

            progressFill.style.width = '0%';
            progressPercent.innerHTML = '0%';
            progressStatus.innerHTML = 'กำลังดึงโครงสร้างหนังสือ...';

            const configJsUrl = `${DOMAIN_URL}${cleanPath}mobile/javascript/config.js`;
            const configResponse = await fetchBlob(configJsUrl);
            const jsText = await configResponse.text();

            const start = jsText.indexOf('{');
            const end = jsText.lastIndexOf('}') + 1;
            if (start === -1 || end === 0) {
                throw new Error("ไม่พบโครงสร้างข้อมูลหนังสือ");
            }

            if (cancelDownload) throw new Error("CANCELLED");

            const config = JSON.parse(jsText.substring(start, end));

            let title = config.meta?.title || config.title;
            if (!title && config.bookConfig) title = config.bookConfig.bookTitle;
            if (!title) title = "Anyflip_Document";
            title = title.replace(/[<>:"/\\|?*]/g, "").trim();

            let count = config.totalPageCount || config.pageCount;
            if (count == null && config.meta) count = config.meta.pageCount || config.meta.totalPageCount;
            if (count == null && config.bookConfig) count = config.bookConfig.totalPageCount || config.bookConfig.pageCount;
            if (count == null && config.fliphtml5_pages) count = config.fliphtml5_pages.length;
            count = parseInt(count);

            if (!count) throw new Error("ไม่สามารถอ่านจำนวนหน้าได้");
            if (cancelDownload) throw new Error("CANCELLED");

            let pagesList = config.fliphtml5_pages || [];
            let urls = [];
            for (let i = 0; i < count; i++) {
                let downloadPath = "";
                if (i < pagesList.length) {
                    let pageData = pagesList[i];
                    let rawFilenames = pageData.n || [];
                    if (rawFilenames.length > 0) {
                        downloadPath = rawFilenames[0].replace(/\\/g, "").replace(/\.\.\//g, "");
                    }
                }
                if (!downloadPath) {
                    downloadPath = `files/large/${i + 1}.webp`;
                } else if (!downloadPath.startsWith("files/")) {
                    downloadPath = `files/large/${downloadPath}`;
                }
                urls.push(`${DOMAIN_URL}${cleanPath}${downloadPath}`);
            }

            const { jsPDF } = window.jspdf;
            let pdf = null;

            for (let i = 0; i < count; i++) {

                if (cancelDownload) throw new Error("CANCELLED");

                currentPct = Math.round(((i + 1) / count) * 100);

                progressFill.style.width = `${currentPct}%`;
                progressPercent.innerHTML = `${currentPct}%`;
                progressStatus.innerHTML = `⏳ กำลังโหลด ${i + 1}/${count}...`;

                if (isMinimized) {
                    headerTitle.innerHTML = `${currentPct}% 🌀`;
                } else {
                    headerTitle.innerHTML = 'DEVg0d-dl';
                }

                if (i > 0 && i % 10 === 0) {
                    await sleep(150);
                }

                try {
                    const blob = await fetchBlob(urls[i]);
                    const { dataUrl, width, height } = await processImage(blob, qualityValue);

                    if (i === 0) {
                        pdf = new jsPDF({
                            orientation: width > height ? 'l' : 'p',
                            unit: 'px',
                            format: [width, height]
                        });
                    } else {
                        pdf.addPage([width, height], width > height ? 'l' : 'p');
                    }

                    pdf.addImage(dataUrl, 'JPEG', 0, 0, width, height);

                    await sleep(10);
                } catch (err) {
                    console.error(`ข้ามหน้า ${i + 1} เนื่องจากเกิดข้อผิดพลาด:`, err);
                }
            }

            if (cancelDownload) throw new Error("CANCELLED");
            if (!pdf) throw new Error("ไม่สามารถสร้าง PDF ได้เนื่องจากดาวน์โหลดล้มเหลวทุกหน้า");

            button.disabled = true;
            button.style.background = 'rgba(255, 255, 255, 0.08)';
            button.style.color = 'rgba(255,255,255,0.4)';
            button.style.boxShadow = 'none';
            button.innerHTML = '💾 กำลังบันทึกไฟล์...';
            progressStatus.innerHTML = '💾 กำลังสร้างไฟล์ PDF...';
            await sleep(50);

            pdf.save(`${title}.pdf`);

            button.style.background = 'linear-gradient(135deg, #2ecc71, #27ae60)';
            button.style.color = '#ffffff';
            button.style.boxShadow = '0 4px 20px rgba(46, 204, 113, 0.4)';
            button.innerHTML = '✅ สำเร็จแล้ว!';
            progressStatus.innerHTML = '✅ บันทึก PDF เรียบร้อย!';

            setTimeout(() => {
                resetUI();
            }, 3000);

        } catch (error) {
            if (error.message === "CANCELLED") {
                progressStatus.innerHTML = '⚠️ ยกเลิกการดาวน์โหลดแล้ว';
                progressFill.style.width = '0%';
                progressPercent.innerHTML = '0%';

                setTimeout(() => {
                    resetUI();
                }, 1500);
            } else {
                // หากเกิดเอ็กเซปชั่นอื่นๆ ให้แสดงข้อความแจ้งเตือนภายในกล่อง UI
                infoAlert.innerHTML = `❌ เกิดข้อผิดพลาด: ${error.message}`;
                infoAlert.style.display = 'block';
                resetUI();
            }
        }
    });
})();